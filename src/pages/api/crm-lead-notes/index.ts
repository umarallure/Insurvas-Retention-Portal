import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseCrmAdmin } from "@/lib/supabase-crm";

type CrmLeadNoteRow = {
  id: string;
  lead_id: string;
  body: string;
  created_at: string;
  created_by: string | null;
};

type LeadNoteResponse = {
  notes: CrmLeadNoteRow[];
  lead_id: string | null;
  error?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<LeadNoteResponse>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ notes: [], lead_id: null, error: "Method not allowed" });
  }

  const policyId = typeof req.query.policyId === "string" ? req.query.policyId.trim() : "";
  if (!policyId) {
    return res.status(400).json({ notes: [], lead_id: null, error: "policyId is required" });
  }

  try {
    const crm = getSupabaseCrmAdmin();

    const { data: lead, error: leadError } = await crm
      .from("leads")
      .select("id")
      .eq("policy_id", policyId)
      .maybeSingle();

    if (leadError) {
      console.error("[crm-lead-notes] lead lookup error", leadError);
      return res.status(500).json({ notes: [], lead_id: null, error: "Failed to lookup lead by policy ID" });
    }

    if (!lead) {
      return res.status(404).json({ notes: [], lead_id: null, error: "Lead not found for this policy ID" });
    }

    const leadId = (lead as { id: string }).id;

    const { data: notes, error: notesError } = await crm
      .from("lead_notes")
      .select("id, lead_id, body, created_at, created_by")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    if (notesError) {
      console.error("[crm-lead-notes] notes lookup error", notesError);
      return res.status(500).json({ notes: [], lead_id: leadId, error: "Failed to load lead notes" });
    }

    return res.status(200).json({
      notes: (notes ?? []) as CrmLeadNoteRow[],
      lead_id: leadId,
    });
  } catch (error) {
    console.error("[crm-lead-notes] unexpected error", error);
    return res.status(500).json({ notes: [], lead_id: null, error: "Failed to load lead notes" });
  }
}