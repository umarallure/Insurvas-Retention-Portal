/**
 * CloudTalk Contact API Proxy
 * Server-side proxy to add contacts to CloudTalk (avoids CORS and exposes credentials securely)
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { addContactToCloudTalk, parseName } from "@/lib/cloudtalk/contact";

type CloudTalkContactResponse = {
  success: boolean;
  error?: string;
  message?: string;
  contact_id?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<CloudTalkContactResponse>) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // Get request body
  const { phone_number, first_name, last_name, full_name, agent_profile_id, deal_id, lead_id } = req.body;

  if (!phone_number) {
    return res.status(400).json({
      success: false,
      error: "Missing required field",
      message: "phone_number is required",
    });
  }

  if (!agent_profile_id) {
    return res.status(400).json({
      success: false,
      error: "Missing required field",
      message: "agent_profile_id is required",
    });
  }

  // Parse name
  let firstName = first_name || "";
  let lastName = last_name || "";

  if (full_name && (!firstName || !lastName)) {
    const parsed = parseName(full_name);
    firstName = firstName || parsed.firstName;
    lastName = lastName || parsed.lastName;
  }

  if (!firstName) {
    firstName = "Unknown";
  }
  if (!lastName) {
    lastName = "Contact";
  }

  // Parse deal_id if provided
  const parsedDealId = deal_id ? Number(deal_id) : undefined;
  const dealIdNum = parsedDealId && Number.isFinite(parsedDealId) ? parsedDealId : undefined;

  try {
    const parsedLeadId = typeof lead_id === "string" && lead_id.trim() ? lead_id.trim() : undefined;
    const result = await addContactToCloudTalk(phone_number, firstName, lastName, agent_profile_id, dealIdNum, parsedLeadId);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: "Contact added to CloudTalk campaign successfully",
        contact_id: result.contactId,
      });
    } else {
      const statusCode =
        result.error === "Agent not configured for CloudTalk"
          ? 404
          : result.error === "CloudTalk API credentials not configured"
            ? 500
            : 500;

      return res.status(statusCode).json({
        success: false,
        error: result.error || "Failed to add contact to CloudTalk",
      });
    }
  } catch (error) {
    console.error("[CloudTalk Contact API] Error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
