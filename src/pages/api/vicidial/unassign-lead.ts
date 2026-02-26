import type { NextApiRequest, NextApiResponse } from "next";
import { callVicidialAssignmentApi } from "@/lib/vicidial";
import { getVicidialAgentMapping } from "@/lib/vicidial-agent-mapping";
import { findVicidialLeadIndex, removeVicidialLeadIndex } from "@/lib/vicidial-lead-index";

type UnassignBody = {
  assignment_id?: string | null;
  agent_profile_id?: string | null;
  deal_id?: number | string | null;
  phone_number?: string | null;
  list_id?: number | string | null;
};

type UnassignResponse =
  | {
      ok: true;
      matched: number;
      updated: number;
      lead_ids: number[];
      status_set: string;
      raw?: string[];
    }
  | {
      ok: false;
      error: string;
      details?: string;
      raw?: string[];
    };

function normalizePhone(input?: string | null) {
  const digits = (input ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function parseLeadIds(raw: string): number[] {
  const ids = new Set<number>();
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/^ERROR:/i.test(line)) continue;
    const pipeParts = line.split("|").map((v) => v.trim()).filter(Boolean);
    for (const token of pipeParts) {
      if (/^\d+$/.test(token)) {
        const n = Number(token);
        if (n > 0 && n < 1000000000) ids.add(n);
      }
    }
  }
  return Array.from(ids);
}

async function findLeadIds(dealId: string, phone: string, listId?: string) {
  const raws: string[] = [];
  const candidates = new Set<number>();

  if (dealId) {
    const byVendor = await callVicidialAssignmentApi("lead_search", {
      search_method: "VENDOR_LEAD_CODE",
      search_value: dealId,
      list_id: listId,
    });
    raws.push(byVendor.raw);
    for (const id of parseLeadIds(byVendor.raw)) candidates.add(id);
  }

  if (phone) {
    const byPhone = await callVicidialAssignmentApi("check_phone_number", { phone_number: phone });
    raws.push(byPhone.raw);
    for (const id of parseLeadIds(byPhone.raw)) candidates.add(id);

    const bySearchPhone = await callVicidialAssignmentApi("lead_search", {
      search_method: "PHONE_NUMBER",
      search_value: phone,
      list_id: listId,
    });
    raws.push(bySearchPhone.raw);
    for (const id of parseLeadIds(bySearchPhone.raw)) candidates.add(id);
  }

  return { leadIds: Array.from(candidates), raws };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<UnassignResponse>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = (req.body ?? {}) as UnassignBody;
    const assignmentId = body.assignment_id != null ? String(body.assignment_id).trim() : "";
    const agentProfileId = body.agent_profile_id != null ? String(body.agent_profile_id).trim() : "";
    const mapping = getVicidialAgentMapping(agentProfileId || null);
    const dealId = body.deal_id != null ? String(body.deal_id).trim() : "";
    const phone = normalizePhone(body.phone_number);
    const listId = body.list_id != null ? String(body.list_id).trim() : mapping?.listId ?? "";
    const statusSet = process.env.VICIDIAL_UNASSIGN_STATUS ?? "ERI";

    if (!assignmentId && !dealId && !phone) {
      return res.status(400).json({
        ok: false,
        error: "Missing identifiers",
        details: "assignment_id, deal_id, or phone_number is required",
      });
    }

    const indexed = await findVicidialLeadIndex({
      assignmentId: assignmentId || undefined,
      dealId: dealId || undefined,
      phoneNumber: phone || undefined,
      listId: listId || undefined,
      agentProfileId: agentProfileId || undefined,
    });

    if (indexed?.vicidialLeadId) {
      const direct = await callVicidialAssignmentApi("update_lead", {
        lead_id: indexed.vicidialLeadId,
        status: statusSet,
        comments: "Unassigned from Retention Portal",
      });
      const raws = [direct.raw];
      if (!/\bERROR\b/i.test(direct.raw)) {
        await removeVicidialLeadIndex({
          assignmentId: assignmentId || indexed.assignmentId,
          vicidialLeadId: indexed.vicidialLeadId,
        });
        return res.status(200).json({
          ok: true,
          matched: 1,
          updated: 1,
          lead_ids: [indexed.vicidialLeadId],
          status_set: statusSet,
          raw: raws,
        });
      }
    }

    const { leadIds, raws } = await findLeadIds(dealId, phone, listId || undefined);
    if (leadIds.length === 0) {
      return res.status(200).json({
        ok: true,
        matched: 0,
        updated: 0,
        lead_ids: [],
        status_set: statusSet,
        raw: raws,
      });
    }

    let updated = 0;
    for (const leadId of leadIds) {
      const result = await callVicidialAssignmentApi("update_lead", {
        lead_id: leadId,
        status: statusSet,
        comments: "Unassigned from Retention Portal",
      });
      raws.push(result.raw);
      if (!/\bERROR\b/i.test(result.raw)) {
        updated += 1;
        await removeVicidialLeadIndex({
          assignmentId: assignmentId || undefined,
          vicidialLeadId: leadId,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      matched: leadIds.length,
      updated,
      lead_ids: leadIds,
      status_set: statusSet,
      raw: raws,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "VICIdial unassign cleanup failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
