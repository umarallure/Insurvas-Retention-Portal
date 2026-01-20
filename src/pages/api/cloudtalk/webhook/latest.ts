/**
 * Get Latest CloudTalk Contact
 * Returns the most recent contact number received from CloudTalk webhook
 * Frontend can poll this endpoint to get updates
 * Uses database table for serverless compatibility
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/lib/supabase";

// Export function to update latest contact (used by webhook)
export async function updateLatestContact(phone: string, leadId?: number, dealId?: number) {
  try {
    // Upsert to cloudtalk_webhook_events table
    // This table stores the latest webhook event per agent/user
    const { error } = await supabase
      .from("cloudtalk_webhook_events")
      .upsert(
        {
          id: "latest", // Single row with id='latest' for simplicity
          phone,
          lead_id: leadId ?? null,
          deal_id: dealId ?? null,
          timestamp: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "id",
        }
      );

    if (error) {
      console.error("[CloudTalk Webhook] Error storing latest contact:", error);
    }
  } catch (error) {
    console.error("[CloudTalk Webhook] Error in updateLatestContact:", error);
  }
}

// Export function to get latest contact
export async function getLatestContact() {
  try {
    const { data, error } = await supabase
      .from("cloudtalk_webhook_events")
      .select("phone, lead_id, deal_id, timestamp")
      .eq("id", "latest")
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("[CloudTalk Webhook] Error fetching latest contact:", error);
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      phone: data.phone,
      leadId: data.lead_id ?? undefined,
      dealId: data.deal_id ?? undefined,
      timestamp: data.timestamp,
    };
  } catch (error) {
    console.error("[CloudTalk Webhook] Error in getLatestContact:", error);
    return null;
  }
}

type LatestContactResponse = {
  success: boolean;
  contact?: {
    phone: string;
    leadId?: number;
    dealId?: number;
    timestamp: string;
  };
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LatestContactResponse>
) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Only GET requests are accepted.",
    });
  }

  try {
    const contact = await getLatestContact();
    return res.status(200).json({
      success: true,
      contact: contact || undefined,
    });
  } catch (error) {
    console.error("[CloudTalk Latest Contact] Error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}
