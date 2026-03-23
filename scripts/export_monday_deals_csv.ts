import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

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

function toCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function fetchAllMondayDeals(pageSize = 1000): Promise<Row[]> {
  const supabase = createClient(
    assertEnv("NEXT_PUBLIC_SUPABASE_URL"),
    assertEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );

  const allRows: Row[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("monday_com_deals")
      .select("*")
      .range(from, to);

    if (error) {
      throw new Error(`Failed loading monday_com_deals rows ${from}-${to}: ${error.message}`);
    }

    const rows = (data ?? []) as Row[];
    allRows.push(...rows);

    if (rows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return allRows;
}

function buildCsv(rows: Row[]): string {
  if (rows.length === 0) return "";

  const headerSet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      headerSet.add(key);
    }
  }

  const headers = Array.from(headerSet).sort();
  const lines: string[] = [];
  lines.push(headers.map(escapeCsv).join(","));

  for (const row of rows) {
    const values = headers.map((key) => escapeCsv(toCell(row[key])));
    lines.push(values.join(","));
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const outputPath = path.resolve(process.cwd(), getArg("--output", "csv/monday-com-deals.csv")!);
  const pageSizeRaw = getArg("--page-size", "1000")!;
  const pageSize = Number(pageSizeRaw);

  if (!Number.isFinite(pageSize) || pageSize < 1) {
    throw new Error("--page-size must be a positive number");
  }

  const rows = await fetchAllMondayDeals(pageSize);
  const csv = buildCsv(rows);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, csv, "utf8");

  console.log(`[monday-deals-export] wrote ${outputPath}`);
  console.log(JSON.stringify({ count: rows.length, pageSize }, null, 2));
}

main().catch((error) => {
  console.error("[monday-deals-export] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
