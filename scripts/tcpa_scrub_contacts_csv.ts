import "dotenv/config";

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type BulkLookupEntry = {
  Phone?: string;
  ResultCode?: string;
  [key: string]: unknown;
};

type BulkLookupResponse = BulkLookupEntry[] | Record<string, BulkLookupEntry> | null;

function getArg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1];
  return fallback;
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

async function callBulkLookup(apiKey: string, phones: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (phones.length === 0) return result;

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

  if (Array.isArray(data)) {
    for (const entry of data) {
      const rawPhone = (entry as any).Phone as string | undefined;
      if (!rawPhone) continue;
      const normalized = normalizePhone(rawPhone);
      if (!normalized) continue;
      const code = (entry as any).ResultCode as string | undefined;
      if (!code) continue;
      result.set(normalized, code.toUpperCase());
    }
  }

  return result;
}

async function main() {
  const inputPath = path.resolve(
    process.cwd(),
    getArg("--input", "monday.com-deals/master_contacts_before_TCPA_Checker.csv")!,
  );
  const outputPath = path.resolve(
    process.cwd(),
    getArg("--output", "monday.com-deals/master_contacts_tcpa_only.csv")!,
  );

  const apiKey = getArg("--api-key", process.env.BLACKLIST_ALLIANCE_KEY ?? "g7fvkbtPjTbhjT7sZXpx")!;
  const batchSize = Number(getArg("--batch-size", "500"));

  if (!Number.isFinite(batchSize) || batchSize < 1) {
    throw new Error("--batch-size must be a positive number");
  }

  console.log("[contacts-tcpa] input:", inputPath);
  console.log("[contacts-tcpa] output:", outputPath);

  const raw = await readFile(inputPath, "utf8");
  const lines = raw.split(/\r?\n/g).filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new Error("input CSV is empty");
  }

  const [header, ...rows] = lines;

  const phoneIndex = header.split(",").findIndex((h) => h.trim().toLowerCase() === "phone");
  if (phoneIndex === -1) {
    throw new Error("Could not find 'Phone' column in header");
  }

  const phoneToRows = new Map<string, string[]>();

  for (const row of rows) {
    const cols = row.split(",");
    const rawPhone = cols[phoneIndex] ?? "";
    const normalized = normalizePhone(rawPhone);
    if (!normalized) continue;

    const list = phoneToRows.get(normalized) ?? [];
    list.push(row);
    phoneToRows.set(normalized, list);
  }

  const allPhones = Array.from(phoneToRows.keys());
  console.log("[contacts-tcpa] unique phones:", allPhones.length);

  const flaggedRows: string[] = [];

  for (let i = 0; i < allPhones.length; i += batchSize) {
    const batchPhones = allPhones.slice(i, i + batchSize);
    const resultCodes = await callBulkLookup(apiKey, batchPhones);

    for (const phone of batchPhones) {
      const code = resultCodes.get(phone);
      if (code !== "D") continue;
      const rowsForPhone = phoneToRows.get(phone) ?? [];
      flaggedRows.push(...rowsForPhone);
    }

    console.log(
      `[contacts-tcpa] processed batch ${i}-${i + batchPhones.length - 1}, total_flagged_rows=${flaggedRows.length}`,
    );
  }

  const outputLines = [header, ...flaggedRows];
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${outputLines.join("\n")}\n`, "utf8");

  console.log("[contacts-tcpa] wrote", outputPath, "rows=", flaggedRows.length);
}

main().catch((error) => {
  console.error("[contacts-tcpa] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
