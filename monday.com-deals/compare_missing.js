/**
 * compare_missing.js
 *
 * Compares:
 *   all_clean.csv            — the cleaned superset (source of truth going forward)
 *   monday_com_deals_rows.csv — full export from Supabase
 *
 * Logs every row that exists in monday_com_deals_rows but is MISSING from all_clean.
 * These are the candidates to be marked inactive later.
 *
 * Run: node compare_missing.js
 */

const fs = require("fs");
const path = require("path");

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Fully RFC-4180-compliant CSV parser.
 * Scans the raw file character-by-character so multi-line quoted fields
 * (e.g. notes with embedded newlines) are handled correctly.
 */
function parseCSV(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const records = [];
  let field = "";
  let fields = [];
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = raw[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        // escaped quote inside quoted field
        field += '"';
        i++;
      } else if (ch === '"') {
        // closing quote
        inQuotes = false;
      } else {
        // any char including \n inside a quoted field
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(field);
        field = "";
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        // end of record
        if (ch === "\r") i++; // skip \n of \r\n
        fields.push(field);
        field = "";
        if (fields.some((f) => f !== "")) {
          records.push(fields);
        }
        fields = [];
      } else {
        field += ch;
      }
    }
  }

  // flush last record if no trailing newline
  if (field !== "" || fields.length > 0) {
    fields.push(field);
    if (fields.some((f) => f !== "")) records.push(fields);
  }

  if (records.length === 0) return [];
  const headers = records[0];
  return records.slice(1).map((values) =>
    Object.fromEntries(headers.map((h, i) => [h.trim(), values[i] ?? ""]))
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

const DIR = __dirname;
const ALL_CLEAN_PATH = path.join(DIR, "all_clean.csv");
const SUPABASE_PATH = path.join(DIR, "monday_com_deals_rows.csv");

console.log("📂 Loading files…");
const allCleanRows = parseCSV(ALL_CLEAN_PATH);
const supabaseRows = parseCSV(SUPABASE_PATH);

console.log(`   all_clean.csv          → ${allCleanRows.length} rows`);
console.log(`   monday_com_deals_rows  → ${supabaseRows.length} rows`);

// Build a Set of IDs present in all_clean
const cleanIds = new Set(allCleanRows.map((r) => String(r.id).trim()));

// Find rows in supabase that are NOT in all_clean
const missingRows = supabaseRows.filter(
  (r) => !cleanIds.has(String(r.id).trim())
);

// ── output ───────────────────────────────────────────────────────────────────

if (missingRows.length === 0) {
  console.log("\n✅ No missing rows — all_clean contains every ID from Supabase.");
} else {
  console.log(
    `\n⚠️  ${missingRows.length} row(s) in monday_com_deals_rows that are MISSING from all_clean:\n`
  );

  // Table header
  console.log(
    ["ID".padEnd(10), "Deal Name".padEnd(40), "Policy Status".padEnd(22), "Is Active".padEnd(10), "Carrier"].join(" | ")
  );
  console.log("-".repeat(100));

  missingRows.forEach((r) => {
    console.log(
      [
        String(r.id).padEnd(10),
        String(r.deal_name ?? "").substring(0, 39).padEnd(40),
        String(r.policy_status ?? "").substring(0, 21).padEnd(22),
        String(r.is_active ?? "").padEnd(10),
        String(r.carrier ?? ""),
      ].join(" | ")
    );
  });

  // Also save a CSV of missing rows for the next step (making them inactive)
  const outPath = path.join(DIR, "missing_from_all_clean.csv");
  const csvHeader = Object.keys(supabaseRows[0]).join(",");
  const csvLines = missingRows.map((r) =>
    Object.values(r)
      .map((v) => (String(v).includes(",") || String(v).includes('"') ? `"${String(v).replace(/"/g, '""')}"` : v))
      .join(",")
  );
  fs.writeFileSync(outPath, [csvHeader, ...csvLines].join("\n"), "utf8");

  console.log(`\n💾 Missing rows also saved to: missing_from_all_clean.csv`);
  console.log(`   → Use this file as input to the make_inactive.js script.`);
}
