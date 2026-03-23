import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function getArg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1];
  return fallback;
}

function splitLines(content: string): string[] {
  return content
    .split(/\r?\n/g)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

function extractId(line: string): string | null {
  const idx = line.indexOf(",");
  if (idx <= 0) return null;
  return line.slice(0, idx);
}

async function loadCleanIds(
  filePath: string,
): Promise<{ ids: Set<string>; rowCount: number }> {
  const raw = await readFile(filePath, "utf8");
  const lines = splitLines(raw);
  if (lines.length === 0) {
    throw new Error(`CSV file is empty: ${filePath}`);
  }

  const [, ...rows] = lines;
  const ids = new Set<string>();

  for (const row of rows) {
    const id = extractId(row);
    if (!id) continue;
    ids.add(id);
  }

  return { ids, rowCount: rows.length };
}

async function loadFullRows(
  filePath: string,
): Promise<{ header: string; rows: { id: string; line: string }[]; idSet: Set<string> }> {
  const raw = await readFile(filePath, "utf8");
  const lines = splitLines(raw);
  if (lines.length === 0) {
    throw new Error(`CSV file is empty: ${filePath}`);
  }

  const [header, ...rowsRaw] = lines;
  const rows: { id: string; line: string }[] = [];
  const idSet = new Set<string>();

  for (const row of rowsRaw) {
    const id = extractId(row);
    if (!id) continue;
    rows.push({ id, line: row });
    idSet.add(id);
  }

  return { header, rows, idSet };
}

async function main() {
  const fullPathArg = getArg("--full", "monday.com-deals/monday_com_deals_rows.csv")!;
  const cleanPathArg = getArg("--clean", "monday.com-deals/all_clean.csv")!;
  const outputPathArg = getArg("--output", "monday.com-deals/missing_from_all_clean.csv")!;

  const fullPath = path.resolve(process.cwd(), fullPathArg);
  const cleanPath = path.resolve(process.cwd(), cleanPathArg);
  const outputPath = path.resolve(process.cwd(), outputPathArg);

  console.log("[monday-deals-diff] full:", fullPath);
  console.log("[monday-deals-diff] clean:", cleanPath);
  console.log("[monday-deals-diff] output:", outputPath);

  const [{ header: fullHeader, rows: fullRows, idSet: fullIds }, clean] = await Promise.all([
    loadFullRows(fullPath),
    loadCleanIds(cleanPath),
  ]);

  const cleanIds = clean.ids;
  const cleanRowCount = clean.rowCount;

  const missing = fullRows.filter((row) => !cleanIds.has(row.id));
  const missingIds = new Set(missing.map((row) => row.id));

  const lines = [fullHeader, ...missing.map((row) => row.line)];
  const csv = `${lines.join("\n")}\n`;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, csv, "utf8");

  console.log("[monday-deals-diff] total full rows:", fullRows.length);
  console.log("[monday-deals-diff] clean rows:", cleanRowCount);
  console.log("[monday-deals-diff] missing rows:", missing.length);
  console.log("[monday-deals-diff] total full ids:", fullIds.size);
  console.log("[monday-deals-diff] clean ids:", cleanIds.size);
  console.log("[monday-deals-diff] missing ids:", missingIds.size);
  console.log("[monday-deals-diff] wrote", outputPath);
}

main().catch((error) => {
  console.error("[monday-deals-diff] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
