import type { NextApiRequest, NextApiResponse } from "next";

import { getSupabaseAdmin } from "@/lib/supabase";

type ApiResponse =
  | { row: Record<string, unknown> | null }
  | { error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const mondayItemId = typeof req.query.mondayItemId === "string" ? req.query.mondayItemId.trim() : "";
  if (!mondayItemId) {
    return res.status(400).json({ error: "mondayItemId is required" });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("monday_deal_contact_notes")
      .select(
        [
          "monday_item_id",
          "ghl_name",
          "call_center",
          "status",
          "subagent_match_mode",
          "subagent_name",
          "subagent_account_id",
          "contact_name",
          "contact_id",
          "notes_count",
          "latest_note_id",
          "latest_note_summary",
          "notes",
          "notes_payload",
          "notes_error",
          "fetched_at",
          "updated_at",
        ].join(","),
      )
      .eq("monday_item_id", mondayItemId)
      .maybeSingle();

    if (error) {
      console.error("[monday-deal-contact-notes] query error", error);
      return res.status(500).json({ error: "Failed to load contact notes" });
    }

    if (!data) {
      return res.status(404).json({ row: null });
    }

    return res.status(200).json({ row: data as unknown as Record<string, unknown> });
  } catch (error) {
    console.error("[monday-deal-contact-notes] unexpected error", error);
    return res.status(500).json({ error: "Failed to load contact notes" });
  }
}
