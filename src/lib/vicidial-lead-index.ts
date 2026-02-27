import fs from "node:fs/promises";
import path from "node:path";

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

const INDEX_PATH = path.join(process.cwd(), "src/config/vicidial-lead-index.local.json");

function normalizePhone(input?: string | null) {
  const digits = (input ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function normalizeValue(input?: string | number | null) {
  if (input === null || input === undefined) return "";
  return String(input).trim();
}

function toCompositeKey(entry: Partial<VicidialLeadIndexEntry>) {
  const deal = normalizeValue(entry.dealId);
  const phone = normalizePhone(entry.phoneNumber);
  const listId = normalizeValue(entry.listId);
  const agent = normalizeValue(entry.agentProfileId);
  return `${deal}|${phone}|${listId}|${agent}`;
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

export async function upsertVicidialLeadIndex(entry: Omit<VicidialLeadIndexEntry, "updatedAt">) {
  const file = await readIndex();
  const now = new Date().toISOString();
  const incoming: VicidialLeadIndexEntry = {
    ...entry,
    phoneNumber: normalizePhone(entry.phoneNumber),
    updatedAt: now,
  };
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
