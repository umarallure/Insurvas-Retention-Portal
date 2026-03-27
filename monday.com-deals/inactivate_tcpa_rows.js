/**
 * inactivate_tcpa_rows.js
 *
 * Marks rows in public.monday_com_deals as is_active = false
 * using IDs from a CSV (default: ./tcpa_rows.csv).
 *
 * Usage:
 *   node inactivate_tcpa_rows.js
 *   node inactivate_tcpa_rows.js --live
 *   node inactivate_tcpa_rows.js --input ./tcpa_rows.csv --live
 *
 * Env vars (loaded from ./monday.com-deals/.env and ../.env):
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY
 */

const fs = require("fs");
const path = require("path");

const TABLE_NAME = "monday_com_deals";
const SCHEMA_NAME = "public";
const DIR = __dirname;
const LIVE_MODE = process.argv.includes("--live");

const DEFAULT_INPUT = path.join(DIR, "tcpa_rows.csv");
const INPUT_CSV = (() => {
  const idx = process.argv.indexOf("--input");
  if (idx !== -1 && process.argv[idx + 1]) return path.resolve(process.argv[idx + 1]);
  return DEFAULT_INPUT;
})();

loadDotEnv(path.join(DIR, ".env"));
loadDotEnv(path.join(DIR, "../.env"));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function loadDotEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, val] = match;
    if (!process.env[key]) process.env[key] = val.replace(/^["']|["']$/g, "");
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
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
      if (ch === "\r") i++;
      fields.push(field);
      field = "";
      if (fields.some((f) => f !== "")) records.push(fields);
      fields = [];
    } else {
      field += ch;
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

function getHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Profile": SCHEMA_NAME,
    "Accept-Profile": SCHEMA_NAME,
    Prefer: "return=representation",
  };
}

async function patchDealInactive(id) {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE_NAME}?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ is_active: false }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  const json = await res.json();
  return Array.isArray(json) ? json.length : 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`Input file not found: ${INPUT_CSV}`);
    process.exit(1);
  }

  const rows = parseCSV(INPUT_CSV);
  const validRows = rows.filter((r) => /^\d+$/.test(String(r.id).trim()));

  const byId = new Map();
  for (const row of validRows) {
    byId.set(String(row.id).trim(), row);
  }
  const uniqueRows = [...byId.entries()].map(([id, row]) => ({ ...row, id }));

  console.log(`Loaded ${rows.length} row(s) from ${path.relative(process.cwd(), INPUT_CSV)}`);
  console.log(`Valid numeric ids: ${validRows.length}`);
  console.log(`Unique ids to process: ${uniqueRows.length}`);
  console.log(`Mode: ${LIVE_MODE ? "LIVE" : "DRY RUN"}`);

  if (LIVE_MODE && (!SUPABASE_URL || !SUPABASE_KEY)) {
    console.error("Missing env vars.");
    console.error("Need SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
    console.error("and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY).");
    process.exit(1);
  }

  console.log("\nSample rows to inactivate:");
  console.log(["ID".padEnd(12), "Deal Name".padEnd(40), "Policy Status".padEnd(22)].join(" | "));
  console.log("-".repeat(82));
  uniqueRows.slice(0, 15).forEach((r) => {
    console.log(
      [
        String(r.id).padEnd(12),
        String(r.deal_name || "").slice(0, 39).padEnd(40),
        String(r.policy_status || "").slice(0, 21).padEnd(22),
      ].join(" | ")
    );
  });
  if (uniqueRows.length > 15) console.log(`... and ${uniqueRows.length - 15} more`);

  if (!LIVE_MODE) {
    console.log("\nDry run complete. No changes were made.");
    console.log("Run with --live to apply updates.");
    return;
  }

  let success = 0;
  let notFound = 0;
  let failed = 0;
  const errors = [];

  console.log("\nStarting PATCH requests...\n");
  for (let i = 0; i < uniqueRows.length; i++) {
    const row = uniqueRows[i];
    const id = row.id;
    process.stdout.write(`[${i + 1}/${uniqueRows.length}] id=${id} (${row.deal_name || ""}) ... `);

    try {
      const updatedCount = await patchDealInactive(id);
      if (updatedCount === 0) {
        console.log("not found");
        notFound++;
      } else {
        console.log("done");
        success++;
      }
    } catch (err) {
      console.log(`failed (${err.message})`);
      failed++;
      errors.push({ id, error: err.message });
    }

    if (i < uniqueRows.length - 1) await sleep(40);
  }

  console.log("\n----------------------------------------");
  console.log(`Updated rows: ${success}`);
  console.log(`Not found:    ${notFound}`);
  console.log(`Failed:       ${failed}`);

  if (errors.length > 0) {
    const errPath = path.join(DIR, "inactivate_tcpa_rows.errors.json");
    fs.writeFileSync(errPath, JSON.stringify(errors, null, 2), "utf8");
    console.log(`Errors saved to ${path.relative(process.cwd(), errPath)}`);
  }
})();
