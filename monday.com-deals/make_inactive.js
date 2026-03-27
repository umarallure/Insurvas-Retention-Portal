/**
 * make_inactive.js
 *
 * Reads missing_from_all_clean.csv (produced by compare_missing.js) and
 * marks every deal in that list as is_active = false via your Supabase REST API.
 *
 * Prerequisites:
 *   npm install @supabase/supabase-js  (or use the built-in fetch below)
 *
 * Environment variables (create a .env file or export them):
 *   SUPABASE_URL      — your project URL, e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY — service-role key (has write access)
 *
 * Usage:
 *   node make_inactive.js              # dry-run (logs what WOULD be updated)
 *   node make_inactive.js --live       # actually sends PATCH requests
 */

const fs = require("fs");
const path = require("path");

// ── config ────────────────────────────────────────────────────────────────────

const TABLE_NAME = "deals"; // adjust to your actual Supabase table name
const DIR = __dirname;
const DEFAULT_INPUT_CSV = fs.existsSync(path.join(DIR, "missing_from_all_clean.csv"))
  ? path.join(DIR, "missing_from_all_clean.csv")
  : path.join(DIR, "tcpa_rows.csv");
const INPUT_CSV = (() => {
  const idx = process.argv.indexOf("--input");
  if (idx !== -1 && process.argv[idx + 1]) return path.resolve(process.argv[idx + 1]);
  return DEFAULT_INPUT_CSV;
})();
const LIVE_MODE = process.argv.includes("--live");

// Load env vars (support a local .env file without extra deps)
loadDotEnv(path.join(DIR, ".env"));
loadDotEnv(path.join(DIR, "../.env")); // also check project root

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ── helpers ───────────────────────────────────────────────────────────────────

function loadDotEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (match) {
      const [, key, val] = match;
      if (!process.env[key]) process.env[key] = val.replace(/^["']|["']$/g, "");
    }
  }
}

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
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { fields.push(field); field = ""; }
      else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        if (ch === "\r") i++;
        fields.push(field);
        field = "";
        if (fields.some((f) => f !== "")) records.push(fields);
        fields = [];
      } else { field += ch; }
    }
  }
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

async function patchDeal(id) {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE_NAME}?id=eq.${id}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": "return=representation",
    },
    body: JSON.stringify({ is_active: false }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── main ─────────────────────────────────────────────────────────────────────

(async () => {
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`❌ Input file not found: ${INPUT_CSV}`);
    console.error("   Provide one with --input <path>, or run compare_missing.js to generate missing_from_all_clean.csv.");
    process.exit(1);
  }

  const rows = parseCSV(INPUT_CSV);

  // Filter to only rows with a valid numeric ID
  const validRows = rows.filter((r) => /^\d+$/.test(String(r.id).trim()));

  console.log(`📂 Loaded ${validRows.length} valid deal(s) from ${path.relative(process.cwd(), INPUT_CSV)}`);
  console.log(`🔧 Mode: ${LIVE_MODE ? "⚡ LIVE — will PATCH Supabase" : "🔍 DRY RUN — no changes made"}`);

  if (LIVE_MODE && (!SUPABASE_URL || !SUPABASE_KEY)) {
    console.error(
      "\n❌ Missing env vars. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)."
    );
    process.exit(1);
  }

  console.log("\nDeals to be marked inactive:\n");
  console.log(
    ["ID".padEnd(10), "Deal Name".padEnd(40), "Policy Status".padEnd(22), "Carrier"].join(" | ")
  );
  console.log("-".repeat(90));

  validRows.forEach((r) => {
    console.log(
      [
        String(r.id).padEnd(10),
        String(r.deal_name ?? "").substring(0, 39).padEnd(40),
        String(r.policy_status ?? "").substring(0, 21).padEnd(22),
        String(r.carrier ?? ""),
      ].join(" | ")
    );
  });

  if (!LIVE_MODE) {
    console.log(`\n🔍 Dry run complete — ${validRows.length} deals would be marked inactive.`);
    console.log('   Re-run with --live flag to apply changes:\n   node make_inactive.js --live');
    return;
  }

  // ── Live mode: PATCH each deal ────────────────────────────────────────────
  console.log("\n⚡ Starting PATCH requests…\n");

  let success = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    const id = String(row.id).trim();
    process.stdout.write(`[${i + 1}/${validRows.length}] Deal ${id} (${row.deal_name ?? ""})… `);

    try {
      await patchDeal(id);
      console.log("✅ done");
      success++;
    } catch (err) {
      console.log(`❌ FAILED — ${err.message}`);
      errors.push({ id, name: row.deal_name, error: err.message });
      failed++;
    }

    // Small delay to avoid hammering the API
    if (i < validRows.length - 1) await sleep(50);
  }

  // ── summary ───────────────────────────────────────────────────────────────
  console.log("\n─────────────────────────────────────");
  console.log(`✅ Success: ${success}`);
  console.log(`❌ Failed:  ${failed}`);

  if (errors.length > 0) {
    const errPath = path.join(DIR, "make_inactive_errors.json");
    fs.writeFileSync(errPath, JSON.stringify(errors, null, 2), "utf8");
    console.log(`\n⚠️  Errors saved to: make_inactive_errors.json`);
  }
})();
