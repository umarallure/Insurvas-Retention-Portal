import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type MondayDeal = {
  id: number;
  phone_number: string | null;
  is_active: boolean;
};

type BulkLookupEntry = {
  Phone?: string;
  ResultCode?: string;
  [key: string]: unknown;
};

type BulkLookupResponse = BulkLookupEntry[] | Record<string, BulkLookupEntry> | null;

function assertEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function getArg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1];
  return fallback;
}

function getFlag(name: string): boolean {
  return process.argv.includes(name);
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  if (digits.length === 10) {
    return digits;
  }
  return null;
}

async function callBulkLookup(
  apiKey: string,
  phones: string[],
  debug: boolean,
  debugLabel?: string,
): Promise<Map<string, BulkLookupEntry>> {
  if (phones.length === 0) return new Map();

  const url = new URL("https://api.blacklistalliance.net/bulklookup");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("ver", "v5");
  url.searchParams.set("resp", "phonecode");

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ phones }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Blacklist Alliance HTTP ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as BulkLookupResponse;

  if (debug) {
    console.log("[monday-tcpa] debug bulklookup response", debugLabel ?? "", JSON.stringify(data, null, 2).slice(0, 4000));
  }

  const map = new Map<string, BulkLookupEntry>();

  if (Array.isArray(data)) {
    for (const entry of data) {
      const rawPhone = (entry as any).Phone as string | undefined;
      if (!rawPhone) continue;
      const normalized = normalizePhone(rawPhone);
      if (!normalized) continue;
      map.set(normalized, entry);
    }
  }

  return map;
}

async function main() {
  const supabase = createClient(
    assertEnv("NEXT_PUBLIC_SUPABASE_URL"),
    assertEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );

  const apiKey = getArg("--api-key", process.env.BLACKLIST_ALLIANCE_KEY ?? "g7fvkbtPjTbhjT7sZXpx")!;
  const batchSize = Number(getArg("--batch-size", "500"));
  const apply = getFlag("--apply");
  const debug = getFlag("--debug");

  if (!Number.isFinite(batchSize) || batchSize < 1) {
    throw new Error("--batch-size must be a positive number");
  }

  console.log("[monday-tcpa] starting");
  console.log("[monday-tcpa] apply mode:", apply ? "APPLY (will update is_active=false)" : "DRY-RUN (no DB updates)");
  if (debug) {
    console.log("[monday-tcpa] DEBUG enabled (first few API responses will be logged)");
  }

  let offset = 0;
  const pageSize = 1000;

  let totalRows = 0;
  let totalChecked = 0;
  let totalFlagged = 0;
  let totalUpdated = 0;
  const allFlaggedIds: number[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("monday_com_deals")
      .select("id, phone_number, is_active")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Failed loading monday_com_deals: ${error.message}`);
    }

    const deals = (data ?? []) as MondayDeal[];

    if (deals.length === 0) {
      break;
    }

    offset += deals.length;
    totalRows += deals.length;

    const phoneToDealIds = new Map<string, number[]>();

    for (const deal of deals) {
      const normalized = normalizePhone(deal.phone_number);
      if (!normalized) continue;

      const arr = phoneToDealIds.get(normalized) ?? [];
      arr.push(deal.id);
      phoneToDealIds.set(normalized, arr);
    }

    const allPhones = Array.from(phoneToDealIds.keys());
    totalChecked += allPhones.length;

    for (let i = 0; i < allPhones.length; i += batchSize) {
      const batchPhones = allPhones.slice(i, i + batchSize);

      const results = await callBulkLookup(apiKey, batchPhones, debug && totalChecked === allPhones.length, `offset=${offset},batch_start=${i}`);

      const flaggedIds: number[] = [];

      for (const phone of batchPhones) {
        const entry = results.get(phone);
        if (!entry) continue;
        const code = (entry.ResultCode ?? (entry as any).resultCode ?? (entry as any).Result) as string | undefined;
        if (!code || code.toUpperCase() !== "D") continue;

        const ids = phoneToDealIds.get(phone) ?? [];
        flaggedIds.push(...ids);
      }

      if (flaggedIds.length > 0) {
        totalFlagged += flaggedIds.length;

        allFlaggedIds.push(...flaggedIds);

        if (apply) {
          const { error: updateError } = await supabase
            .from("monday_com_deals")
            .update({ is_active: false })
            .in("id", flaggedIds);

          if (updateError) {
            throw new Error(`Failed updating monday_com_deals: ${updateError.message}`);
          }

          totalUpdated += flaggedIds.length;
        }
      }
    }

    console.log(
      `[monday-tcpa] processed page, offset=${offset}, rows_in_page=${deals.length}, unique_phones_in_page=${phoneToDealIds.size}, total_rows=${totalRows}, total_checked=${totalChecked}, total_flagged=${totalFlagged}, total_updated=${totalUpdated}`,
    );
  }

  if (allFlaggedIds.length > 0) {
    const uniqueIds = Array.from(new Set(allFlaggedIds));

    const { data: flaggedRows, error: flaggedError } = await supabase
      .from("monday_com_deals")
      .select("id, phone_number, is_active")
      .in("id", uniqueIds)
      .order("id", { ascending: true });

    if (flaggedError) {
      console.error("[monday-tcpa] failed to load flagged rows for export:", flaggedError.message);
    } else if (flaggedRows && flaggedRows.length > 0) {
      const outputArg = getArg("--output");
      const outputPath = path.resolve(
        process.cwd(),
        outputArg || "monday.com-deals/tcpa_inactivated.csv",
      );

      const header = "id,phone_number,is_active";
      const lines = [
        header,
        ...flaggedRows.map((row: any) => `${row.id},${row.phone_number ?? ""},${row.is_active}`),
      ];

      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");

      console.log("[monday-tcpa] exported flagged rows to", outputPath);
    }
  }

  console.log("[monday-tcpa] done", {
    totalRows,
    totalChecked,
    totalFlagged,
    totalUpdated,
    mode: apply ? "apply" : "dry-run",
  });
}

main().catch((error) => {
  console.error("[monday-tcpa] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
