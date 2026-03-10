import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type LocalEntry = {
  assignmentId?: string;
  dealId?: string;
  phoneNumber?: string;
  listId?: string;
  agentProfileId?: string;
  vendorLeadCode?: string;
  vicidialLeadId?: number;
  updatedAt?: string;
};

type LocalShape = {
  entries?: LocalEntry[];
};

type DbRow = {
  assignment_id: string | null;
  deal_id: string | null;
  phone_number: string | null;
  list_id: string | null;
  agent_profile_id: string | null;
  vendor_lead_code: string | null;
  vicidial_lead_id: number;
  composite_key: string;
  updated_at: string;
};

const TABLE_NAME = "vicidial_lead_index";

function assertEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function getArg(name: string, fallback?: string) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function normalizePhone(input?: string | null) {
  const digits = (input ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function normalizeValue(input?: string | number | null) {
  if (input === null || input === undefined) return "";
  return String(input).trim();
}

function normalizeOptionalText(input?: string | number | null) {
  const value = normalizeValue(input);
  return value || null;
}

function toCompositeKey(entry: {
  dealId?: string | null;
  phoneNumber?: string | null;
  listId?: string | null;
  agentProfileId?: string | null;
}) {
  const deal = normalizeValue(entry.dealId);
  const phone = normalizePhone(entry.phoneNumber);
  const listId = normalizeValue(entry.listId);
  const agent = normalizeValue(entry.agentProfileId);
  return `${deal}|${phone}|${listId}|${agent}`;
}

function toDbRow(entry: LocalEntry): DbRow | null {
  const leadIdRaw = entry.vicidialLeadId;
  const leadId = typeof leadIdRaw === "number" ? leadIdRaw : Number(leadIdRaw);
  if (!Number.isFinite(leadId) || leadId <= 0) return null;

  const phone = normalizePhone(entry.phoneNumber);
  const updatedAt = normalizeValue(entry.updatedAt) || new Date().toISOString();

  return {
    assignment_id: normalizeOptionalText(entry.assignmentId),
    deal_id: normalizeOptionalText(entry.dealId),
    phone_number: normalizeOptionalText(phone),
    list_id: normalizeOptionalText(entry.listId),
    agent_profile_id: normalizeOptionalText(entry.agentProfileId),
    vendor_lead_code: normalizeOptionalText(entry.vendorLeadCode),
    vicidial_lead_id: leadId,
    composite_key: toCompositeKey({
      dealId: entry.dealId,
      phoneNumber: phone,
      listId: entry.listId,
      agentProfileId: entry.agentProfileId,
    }),
    updated_at: updatedAt,
  };
}

function dedupeRows(rows: DbRow[]) {
  const seenAssignment = new Set<string>();
  const seenLeadId = new Set<number>();
  const seenComposite = new Set<string>();
  const deduped: DbRow[] = [];

  // Local file is stored newest-first. Keep first seen record for each key.
  for (const row of rows) {
    if (row.assignment_id && seenAssignment.has(row.assignment_id)) continue;
    if (seenLeadId.has(row.vicidial_lead_id)) continue;
    if (row.composite_key !== "|||" && seenComposite.has(row.composite_key)) continue;

    deduped.push(row);
    if (row.assignment_id) seenAssignment.add(row.assignment_id);
    seenLeadId.add(row.vicidial_lead_id);
    if (row.composite_key !== "|||") seenComposite.add(row.composite_key);
  }

  return deduped;
}

async function main() {
  const inputPath = path.resolve(process.cwd(), getArg("--input", "src/config/vicidial-lead-index.local.json")!);
  const dryRun = hasFlag("--dry-run");

  const raw = await readFile(inputPath, "utf8");
  const parsed = JSON.parse(raw) as LocalShape;
  const sourceEntries = Array.isArray(parsed.entries) ? parsed.entries : [];

  const normalizedRows = sourceEntries.map(toDbRow).filter((row): row is DbRow => Boolean(row));
  const rows = dedupeRows(normalizedRows);

  console.log(
    `[vicidial-lead-index:migrate] parsed=${sourceEntries.length} normalized=${normalizedRows.length} deduped=${rows.length}`,
  );

  if (dryRun) {
    console.log("[vicidial-lead-index:migrate] dry-run mode enabled, no database writes performed.");
    return;
  }

  const supabase = createClient(assertEnv("NEXT_PUBLIC_SUPABASE_URL"), assertEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  let written = 0;
  for (const row of rows) {
    if (row.assignment_id) {
      const { error } = await supabase.from(TABLE_NAME).delete().eq("assignment_id", row.assignment_id);
      if (error) throw new Error(`delete by assignment_id failed (${row.assignment_id}): ${error.message}`);
    }

    {
      const { error } = await supabase.from(TABLE_NAME).delete().eq("vicidial_lead_id", row.vicidial_lead_id);
      if (error) throw new Error(`delete by vicidial_lead_id failed (${row.vicidial_lead_id}): ${error.message}`);
    }

    if (row.composite_key !== "|||") {
      const { error } = await supabase.from(TABLE_NAME).delete().eq("composite_key", row.composite_key);
      if (error) throw new Error(`delete by composite_key failed (${row.composite_key}): ${error.message}`);
    }

    const { error } = await supabase.from(TABLE_NAME).insert(row);
    if (error) throw new Error(`insert failed (${row.vicidial_lead_id}): ${error.message}`);

    written += 1;
    if (written % 500 === 0) {
      console.log(`[vicidial-lead-index:migrate] inserted ${written}/${rows.length}`);
    }
  }

  console.log(`[vicidial-lead-index:migrate] completed inserted=${written}`);
}

main().catch((error) => {
  console.error("[vicidial-lead-index:migrate] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
