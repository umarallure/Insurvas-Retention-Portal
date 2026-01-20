/**
 * CloudTalk Webhook Endpoint
 * Receives call events from CloudTalk automation workflow
 * When a call is answered, CloudTalk posts the contact number here
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/lib/supabase";
import { updateLatestContact } from "./latest";

type CloudTalkWebhookRequest = {
  contact: string;
};

type CloudTalkWebhookResponse = {
  success: boolean;
  message?: string;
  error?: string;
  leadId?: number;
  dealId?: number;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CloudTalkWebhookResponse>
) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Only POST requests are accepted.",
    });
  }

  try {
    // Extract contact number from request body
    const { contact } = req.body as CloudTalkWebhookRequest;

    if (!contact || typeof contact !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid 'contact' field in request body",
      });
    }

    const phoneNumber = contact.trim();

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "Contact number cannot be empty",
      });
    }

    console.log(`[CloudTalk Webhook] Received call event for contact: ${phoneNumber}`);

    // Normalize phone number for searching (remove non-digits, get last 10 digits)
    const normalizedPhone = phoneNumber.replace(/\D/g, "");
    const last10 = normalizedPhone.slice(-10);

    if (last10.length < 10) {
      return res.status(400).json({
        success: false,
        error: "Invalid phone number format",
      });
    }

    // Try to find lead/deal by phone number
    let leadId: number | undefined;
    let dealId: number | undefined;

    // Search in leads table
    const phonePatterns = [
      last10, // Last 10 digits
      `1${last10}`, // With country code
      `+1${last10}`, // With + country code
      phoneNumber, // Original format
      normalizedPhone, // Normalized format
    ];

    // Try to find in monday_com_deals table first (more likely for assigned leads)
    for (const pattern of phonePatterns) {
      const { data: dealData, error: dealError } = await supabase
        .from("monday_com_deals")
        .select("id, phone_number")
        .or(`phone_number.ilike.%${pattern}%,phone_number.ilike.%${last10}%`)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!dealError && dealData) {
        dealId = dealData.id;
        console.log(`[CloudTalk Webhook] Found deal: ${dealId} for phone: ${phoneNumber}`);
        break;
      }
    }

    // Also try to find in leads table
    if (!leadId) {
      for (const pattern of phonePatterns) {
        const { data: leadData, error: leadError } = await supabase
          .from("leads")
          .select("id, phone_number")
          .or(`phone_number.ilike.%${pattern}%,phone_number.ilike.%${last10}%`)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!leadError && leadData) {
          leadId = leadData.id;
          console.log(`[CloudTalk Webhook] Found lead: ${leadId} for phone: ${phoneNumber}`);
          break;
        }
      }
    }

    // Store the contact in a simple cache/state that frontend can access
    // You can extend this to:
    // - Store in database table for persistence
    // - Use Redis for distributed systems
    // - Use Supabase real-time subscriptions
    
    // For now, we'll store it in a way that can be accessed via API
    // The frontend can poll /api/cloudtalk/webhook/latest or use real-time subscriptions
    
    // Store the latest contact for frontend access (async, don't await to avoid blocking)
    void updateLatestContact(phoneNumber, leadId, dealId);

    console.log(`[CloudTalk Webhook] Call answered for: ${phoneNumber}`, {
      leadId,
      dealId,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: "Webhook received successfully",
      leadId,
      dealId,
    });
  } catch (error) {
    console.error("[CloudTalk Webhook] Error processing webhook:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
