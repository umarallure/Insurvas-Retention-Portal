import type { NextApiRequest, NextApiResponse } from "next";
import { deleteCloudTalkContactsForAssignment } from "@/lib/cloudtalk/contact";

type CloudTalkDeleteApiResponse =
  | {
      success: true;
      deleted_contact_ids: string[];
      message: string;
    }
  | {
      success: false;
      error: string;
      deleted_contact_ids?: string[];
    };

export default async function handler(req: NextApiRequest, res: NextApiResponse<CloudTalkDeleteApiResponse>) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const dealIdRaw = req.body?.deal_id;
  const leadIdRaw = req.body?.lead_id;

  const dealId =
    typeof dealIdRaw === "number"
      ? dealIdRaw
      : typeof dealIdRaw === "string" && dealIdRaw.trim()
        ? Number(dealIdRaw)
        : undefined;
  const leadId = typeof leadIdRaw === "string" && leadIdRaw.trim() ? leadIdRaw.trim() : undefined;

  if ((dealId == null || !Number.isFinite(dealId)) && !leadId) {
    return res.status(400).json({
      success: false,
      error: "deal_id or lead_id is required",
    });
  }

  const result = await deleteCloudTalkContactsForAssignment({
    dealId: dealId != null && Number.isFinite(dealId) ? dealId : undefined,
    leadId,
  });

  if (!result.success) {
    return res.status(500).json({
      success: false,
      error: result.error || "Failed to delete CloudTalk contact",
      deleted_contact_ids: result.deletedContactIds,
    });
  }

  return res.status(200).json({
    success: true,
    deleted_contact_ids: result.deletedContactIds,
    message:
      result.deletedContactIds.length > 0
        ? "CloudTalk contact deleted successfully"
        : "No CloudTalk contact mapping found for this assignment",
  });
}
