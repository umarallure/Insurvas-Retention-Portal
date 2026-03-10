import fs from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type VicidialLeadIndexEntry = {
  assignmentId?: string;
  dealId?: string;
  phoneNumber?: string;
  listId?: string;
  agentProfileId?: string;
  vendorLeadCode?: string;
  vicidialLeadId: number;
  updatedAt: string;
};

type VicidialLeadIndexFile = {
  entries: VicidialLeadIndexEntry[];
};

type VicidialLeadIndexDbRow = {
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

const INDEX_PATH = path.join(process.cwd(), "src/config/vicidial-lead-index.local.json");
const TABLE_NAME = "vicidial_lead_index";
const SELECT_COLUMNS =
  "assignment_id,deal_id,phone_number,list_id,agent_profile_id,vendor_lead_code,vicidial_lead_id,updated_at";

let cachedSupabaseAdmin: SupabaseClient | null | undefined;

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

function toCompositeKey(entry: Partial<VicidialLeadIndexEntry>) {
  const deal = normalizeValue(entry.dealId);
  const phone = normalizePhone(entry.phoneNumber);
  const listId = normalizeValue(entry.listId);
  const agent = normalizeValue(entry.agentProfileId);
  return `${deal}|${phone}|${listId}|${agent}`;
}

function toDbRow(entry: VicidialLeadIndexEntry): VicidialLeadIndexDbRow {
  return {
    assignment_id: normalizeOptionalText(entry.assignmentId),
    deal_id: normalizeOptionalText(entry.dealId),
    phone_number: normalizeOptionalText(normalizePhone(entry.phoneNumber)),
    list_id: normalizeOptionalText(entry.listId),
    agent_profile_id: normalizeOptionalText(entry.agentProfileId),
    vendor_lead_code: normalizeOptionalText(entry.vendorLeadCode),
    vicidial_lead_id: entry.vicidialLeadId,
    composite_key: toCompositeKey(entry),
    updated_at: entry.updatedAt,
  };
}

function fromDbRow(row: Partial<VicidialLeadIndexDbRow> | null | undefined): VicidialLeadIndexEntry | null {
  if (!row) return null;
  const leadIdRaw = row.vicidial_lead_id;
  const leadId = typeof leadIdRaw === "number" ? leadIdRaw : Number(leadIdRaw);
  if (!Number.isFinite(leadId) || leadId <= 0) return null;

  return {
    assignmentId: normalizeValue(row.assignment_id) || undefined,
    dealId: normalizeValue(row.deal_id) || undefined,
    phoneNumber: normalizePhone(row.phone_number ?? undefined) || undefined,
    listId: normalizeValue(row.list_id) || undefined,
    agentProfileId: normalizeValue(row.agent_profile_id) || undefined,
    vendorLeadCode: normalizeValue(row.vendor_lead_code) || undefined,
    vicidialLeadId: leadId,
    updatedAt: normalizeValue(row.updated_at) || new Date().toISOString(),
  };
}

function getSupabaseAdminSafe() {
  if (typeof window !== "undefined") return null;
  if (cachedSupabaseAdmin !== undefined) return cachedSupabaseAdmin;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    cachedSupabaseAdmin = null;
    return cachedSupabaseAdmin;
  }

  cachedSupabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return cachedSupabaseAdmin;
}

async function readIndex(): Promise<VicidialLeadIndexFile> {
  try {
    const raw = await fs.readFile(INDEX_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<VicidialLeadIndexFile>;
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {
    return { entries: [] };
  }
}

async function writeIndex(data: VicidialLeadIndexFile) {
  try {
    await fs.mkdir(path.dirname(INDEX_PATH), { recursive: true });
    await fs.writeFile(INDEX_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    // Vercel/Serverless file systems are read-only at runtime. The local index is best-effort only.
    if (code === "EROFS" || code === "EPERM" || code === "EACCES") {
      console.warn("[vicidial-lead-index] Skipping local index write in read-only runtime:", code);
      return;
    }
    throw error;
  }
}

async function upsertIndexInDb(entry: VicidialLeadIndexEntry) {
  const db = getSupabaseAdminSafe();
  if (!db) return false;

  const dbRow = toDbRow(entry);

  try {
    if (dbRow.assignment_id) {
      const { error } = await db.from(TABLE_NAME).delete().eq("assignment_id", dbRow.assignment_id);
      if (error) throw error;
    }

    {
      const { error } = await db.from(TABLE_NAME).delete().eq("vicidial_lead_id", dbRow.vicidial_lead_id);
      if (error) throw error;
    }

    if (dbRow.composite_key !== "|||") {
      const { error } = await db.from(TABLE_NAME).delete().eq("composite_key", dbRow.composite_key);
      if (error) throw error;
    }

    const { error } = await db.from(TABLE_NAME).insert(dbRow);
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn("[vicidial-lead-index] db upsert failed, using local fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function findIndexInDb(input: {
  assignmentId?: string | null;
  dealId?: string | number | null;
  phoneNumber?: string | null;
  listId?: string | number | null;
  agentProfileId?: string | null;
}) {
  const db = getSupabaseAdminSafe();
  if (!db) return undefined;

  const assignmentId = normalizeValue(input.assignmentId);
  const targetComposite = toCompositeKey({
    dealId: normalizeValue(input.dealId),
    phoneNumber: input.phoneNumber ?? undefined,
    listId: normalizeValue(input.listId),
    agentProfileId: normalizeValue(input.agentProfileId),
  });
  const dealId = normalizeValue(input.dealId);
  const phone = normalizePhone(input.phoneNumber);

  try {
    if (assignmentId) {
      const { data, error } = await db
        .from(TABLE_NAME)
        .select(SELECT_COLUMNS)
        .eq("assignment_id", assignmentId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const mapped = fromDbRow(data as Partial<VicidialLeadIndexDbRow> | null);
      if (mapped) return mapped;
    }

    if (targetComposite !== "|||") {
      const { data, error } = await db
        .from(TABLE_NAME)
        .select(SELECT_COLUMNS)
        .eq("composite_key", targetComposite)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const mapped = fromDbRow(data as Partial<VicidialLeadIndexDbRow> | null);
      if (mapped) return mapped;
    }

    if (dealId) {
      const { data, error } = await db
        .from(TABLE_NAME)
        .select(SELECT_COLUMNS)
        .eq("deal_id", dealId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const mapped = fromDbRow(data as Partial<VicidialLeadIndexDbRow> | null);
      if (mapped) return mapped;
    }

    if (phone) {
      const { data, error } = await db
        .from(TABLE_NAME)
        .select(SELECT_COLUMNS)
        .eq("phone_number", phone)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const mapped = fromDbRow(data as Partial<VicidialLeadIndexDbRow> | null);
      if (mapped) return mapped;
    }

    return null;
  } catch (error) {
    console.warn("[vicidial-lead-index] db lookup failed, using local fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

async function removeIndexInDb(input: { assignmentId?: string | null; vicidialLeadId?: number | null }) {
  const db = getSupabaseAdminSafe();
  if (!db) return false;

  const assignmentId = normalizeValue(input.assignmentId);
  const leadId = typeof input.vicidialLeadId === "number" && input.vicidialLeadId > 0 ? input.vicidialLeadId : null;

  try {
    if (assignmentId) {
      const { error } = await db.from(TABLE_NAME).delete().eq("assignment_id", assignmentId);
      if (error) throw error;
    }
    if (leadId) {
      const { error } = await db.from(TABLE_NAME).delete().eq("vicidial_lead_id", leadId);
      if (error) throw error;
    }
    return true;
  } catch (error) {
    console.warn("[vicidial-lead-index] db delete failed, using local fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function upsertVicidialLeadIndex(entry: Omit<VicidialLeadIndexEntry, "updatedAt">) {
  const now = new Date().toISOString();
  const incoming: VicidialLeadIndexEntry = {
    ...entry,
    phoneNumber: normalizePhone(entry.phoneNumber),
    updatedAt: now,
  };

  const wroteToDb = await upsertIndexInDb(incoming);
  if (wroteToDb) return;

  const file = await readIndex();
  const incomingComposite = toCompositeKey(incoming);
  const next = file.entries.filter((e) => {
    if (incoming.assignmentId && e.assignmentId && e.assignmentId === incoming.assignmentId) return false;
    if (e.vicidialLeadId === incoming.vicidialLeadId) return false;
    return toCompositeKey(e) !== incomingComposite;
  });
  next.unshift(incoming);
  await writeIndex({ entries: next });
}

export async function findVicidialLeadIndex(input: {
  assignmentId?: string | null;
  dealId?: string | number | null;
  phoneNumber?: string | null;
  listId?: string | number | null;
  agentProfileId?: string | null;
}) {
  const fromDb = await findIndexInDb(input);
  if (fromDb !== undefined) return fromDb;

  const file = await readIndex();
  const assignmentId = normalizeValue(input.assignmentId);
  if (assignmentId) {
    const byAssignment = file.entries.find((e) => e.assignmentId && e.assignmentId === assignmentId);
    if (byAssignment) return byAssignment;
  }

  const targetComposite = toCompositeKey({
    dealId: normalizeValue(input.dealId),
    phoneNumber: input.phoneNumber ?? undefined,
    listId: normalizeValue(input.listId),
    agentProfileId: normalizeValue(input.agentProfileId),
  });

  if (targetComposite !== "|||") {
    const byComposite = file.entries.find((e) => toCompositeKey(e) === targetComposite);
    if (byComposite) return byComposite;
  }

  const dealId = normalizeValue(input.dealId);
  if (dealId) {
    const byDeal = file.entries.find((e) => normalizeValue(e.dealId) === dealId);
    if (byDeal) return byDeal;
  }

  const phone = normalizePhone(input.phoneNumber);
  if (phone) {
    const byPhone = file.entries.find((e) => normalizePhone(e.phoneNumber) === phone);
    if (byPhone) return byPhone;
  }

  return null;
}

export async function removeVicidialLeadIndex(input: {
  assignmentId?: string | null;
  vicidialLeadId?: number | null;
}) {
  const removedFromDb = await removeIndexInDb(input);
  if (removedFromDb) return;

  const file = await readIndex();
  const assignmentId = normalizeValue(input.assignmentId);
  const leadId = typeof input.vicidialLeadId === "number" && input.vicidialLeadId > 0 ? input.vicidialLeadId : null;
  const next = file.entries.filter((e) => {
    if (assignmentId && e.assignmentId && e.assignmentId === assignmentId) return false;
    if (leadId && e.vicidialLeadId === leadId) return false;
    return true;
  });
  await writeIndex({ entries: next });
}
