/**
 * CloudTalk Contact API Integration
 * Adds contacts to CloudTalk campaigns via tag-based routing
 */

import { getSupabaseAdmin } from "@/lib/supabase";

type CloudTalkConfig = {
  agentId: string;
  campaignId: string;
  tagName: string;
};

type CloudTalkMappingRow = {
  retention_id: string;
  campaign_id: string | number | null;
  agent_id: string | number | null;
  tag_name: string | null;
  is_active: boolean | null;
};

interface CloudTalkContactResponse {
  responseData: {
    status: number;
    data?: {
      id: string;
    };
    message?: string;
  };
}

type SaveCloudTalkContactInput = {
  contactId: string;
  dealId?: number;
  leadId?: string;
};

type CloudTalkDeleteResponse = {
  responseData: {
    status: number;
    message?: string;
  };
};

type CloudTalkContactMappingRow = {
  contact_id: string;
  deal_id: number | null;
  lead_id: string | null;
};

function normalizeCloudTalkConfigFromRow(row: CloudTalkMappingRow | null | undefined): CloudTalkConfig | null {
  if (!row || row.is_active === false) return null;

  const campaignId = row.campaign_id != null ? String(row.campaign_id).trim() : "";
  const agentId = row.agent_id != null ? String(row.agent_id).trim() : "";
  const tagName = row.tag_name?.trim() || "";

  if (!campaignId || !agentId || !tagName) return null;

  return {
    campaignId,
    agentId,
    tagName,
  };
}

export async function getCloudTalkConfigForProfile(profileId: string): Promise<CloudTalkConfig | null> {
  const normalizedProfileId = profileId.trim();
  if (!normalizedProfileId) return null;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("cloudtalk_agent_mapping")
      .select("retention_id,campaign_id,agent_id,tag_name,is_active")
      .eq("retention_id", normalizedProfileId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.warn("[cloudtalk-mapping] lookup failed", {
        profileId: normalizedProfileId,
        error: error.message,
      });
      return null;
    }

    return normalizeCloudTalkConfigFromRow((data as CloudTalkMappingRow | null) ?? null);
  } catch (error) {
    console.warn("[cloudtalk-mapping] lookup failed", {
      profileId: normalizedProfileId,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

// Base URL for the deployed Retention Portal app
const RETENTION_PORTAL_BASE_URL = "https://retention-portal-4d87.vercel.app";

/**
 * Build the external URL for lead details page
 */
function buildLeadDetailUrl(input: { dealId?: number; leadId?: string }): string | null {
  if (input.dealId != null && Number.isFinite(input.dealId)) {
    return `${RETENTION_PORTAL_BASE_URL}/agent/assigned-lead-details?dealId=${input.dealId}`;
  }

  const leadId = input.leadId?.trim() || "";
  if (leadId) {
    return `${RETENTION_PORTAL_BASE_URL}/agent/assigned-lead-details?id=${encodeURIComponent(leadId)}`;
  }

  return null;
}

/**
 * Add a contact to CloudTalk with the agent's tag
 * This automatically adds them to the agent's campaign
 */
export async function addContactToCloudTalk(
  phoneNumber: string,
  firstName: string,
  lastName: string,
  agentProfileId: string,
  dealId?: number,
  leadId?: string,
): Promise<{ success: boolean; error?: string; contactId?: string }> {
  try {
    // Get CloudTalk config for this agent
    const config = await getCloudTalkConfigForProfile(agentProfileId);
    if (!config) {
      console.warn(`[CloudTalk] No config found for agent profile ${agentProfileId}`);
      return { success: false, error: "Agent not configured for CloudTalk" };
    }

    // Get API credentials from environment
    const accountId = process.env.NEXT_PUBLIC_CLOUDTALK_ACCOUNT_ID;
    const apiSecret = process.env.NEXT_PUBLIC_CLOUDTALK_API_SECRET;

    if (!accountId || !apiSecret) {
      console.warn("[CloudTalk] API credentials not configured");
      return { success: false, error: "CloudTalk API credentials not configured" };
    }

    // Format phone number (ensure it starts with +)
    let formattedPhone = phoneNumber.trim();
    if (!formattedPhone.startsWith("+")) {
      // If it doesn't start with +, assume US number and add +1
      formattedPhone = formattedPhone.replace(/\D/g, ""); // Remove non-digits
      if (formattedPhone.length === 10) {
        formattedPhone = `+1${formattedPhone}`;
      } else if (formattedPhone.length === 11 && formattedPhone.startsWith("1")) {
        formattedPhone = `+${formattedPhone}`;
      } else {
        formattedPhone = `+${formattedPhone}`;
      }
    }

    // Create Basic Auth header
    const authString = `${accountId}:${apiSecret}`;
    const base64Auth = Buffer.from(authString).toString("base64");

    // Build full name
    const fullName = `${firstName || "Unknown"} ${lastName || "Contact"}`.trim();

    // Build request body
    const requestBody: Record<string, unknown> = {
        name: fullName,
        ContactNumber: [
          {
            public_number: formattedPhone,
          },
        ],
        ContactsTag: [
          {
            name: config.tagName, // Use tag name (not ID)
          },
        ],
    };

    // Add ExternalUrl when either dealId or leadId is available.
    const leadDetailUrl = buildLeadDetailUrl({ dealId, leadId });
    if (leadDetailUrl) {
      requestBody.ExternalUrl = [
        {
          name: "Lead Details",
          url: leadDetailUrl,
        },
      ];
    }

    console.log("[CloudTalk] add contact request", {
      agentProfileId,
      campaignId: config.campaignId,
      agentId: config.agentId,
      tagName: config.tagName,
      requestBody,
    });

    // Make request to CloudTalk API
    // CloudTalk API format: uses ContactNumber array and ContactsTag array with name
    const response = await fetch("https://my.cloudtalk.io/api/contacts/add.json", {
      method: "PUT",
      headers: {
        Authorization: `Basic ${base64Auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = (await response.json()) as CloudTalkContactResponse;

    console.log("[CloudTalk] add contact response", {
      httpStatus: response.status,
      ok: response.ok,
      phone: formattedPhone,
      data,
    });

    if (data.responseData.status === 201 || data.responseData.status === 200) {
      const contactId = data.responseData.data?.id?.trim() || "";
      if (!contactId) {
        return { success: false, error: "CloudTalk did not return a contact id" };
      }

      const saveResult = await saveCloudTalkContact({
        contactId,
        dealId,
        leadId,
      });
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }

      console.log(`[CloudTalk] Contact added successfully: ${formattedPhone}`, {
        contactId,
        campaignId: config.campaignId,
        agentId: config.agentId,
        tagName: config.tagName,
      });
      return { success: true, contactId };
    } else {
      const errorMessage = data.responseData.message || "Unknown error";
      console.error(`[CloudTalk] Failed to add contact: ${errorMessage}`, {
        status: data.responseData.status,
        phone: formattedPhone,
      });
      return { success: false, error: errorMessage };
    }
  } catch (error) {
    console.error("[CloudTalk] Error adding contact:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function saveCloudTalkContact(input: SaveCloudTalkContactInput): Promise<{ success: boolean; error?: string }> {
  if (!input.dealId && !input.leadId) {
    return { success: true };
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const payload: {
      contact_id: string;
      deal_id?: number;
      lead_id?: string;
      updated_at: string;
    } = {
      contact_id: input.contactId,
      updated_at: new Date().toISOString(),
    };

    if (input.dealId) payload.deal_id = input.dealId;
    if (input.leadId) payload.lead_id = input.leadId;

    const { error } = await supabaseAdmin
      .from("cloudtalk_contacts")
      .upsert(payload, { onConflict: "contact_id" });

    if (error) {
      console.error("[CloudTalk] Failed to save contact mapping", {
        contactId: input.contactId,
        dealId: input.dealId,
        leadId: input.leadId,
        error: error.message,
      });
      return { success: false, error: "Failed to save CloudTalk contact mapping" };
    }

    console.log("[CloudTalk] Saved contact mapping", {
      contactId: input.contactId,
      dealId: input.dealId,
      leadId: input.leadId,
    });
    return { success: true };
  } catch (error) {
    console.error("[CloudTalk] Failed to save contact mapping", {
      contactId: input.contactId,
      dealId: input.dealId,
      leadId: input.leadId,
      error: error instanceof Error ? error.message : error,
    });
    return { success: false, error: "Failed to save CloudTalk contact mapping" };
  }
}

function createCloudTalkAuthHeader(): { success: true; value: string } | { success: false; error: string } {
  const accountId = process.env.NEXT_PUBLIC_CLOUDTALK_ACCOUNT_ID;
  const apiSecret = process.env.NEXT_PUBLIC_CLOUDTALK_API_SECRET;

  if (!accountId || !apiSecret) {
    return { success: false, error: "CloudTalk API credentials not configured" };
  }

  const authString = `${accountId}:${apiSecret}`;
  return {
    success: true,
    value: `Basic ${Buffer.from(authString).toString("base64")}`,
  };
}

export async function deleteCloudTalkContactsForAssignment(input: {
  dealId?: number;
  leadId?: string;
}): Promise<{ success: boolean; deletedContactIds: string[]; error?: string }> {
  if (!input.dealId && !input.leadId) {
    return { success: true, deletedContactIds: [] };
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin.from("cloudtalk_contacts").select("contact_id,deal_id,lead_id");

    if (input.dealId != null && input.leadId) {
      query = query.or(`deal_id.eq.${input.dealId},lead_id.eq.${input.leadId}`);
    } else if (input.dealId != null) {
      query = query.eq("deal_id", input.dealId);
    } else if (input.leadId) {
      query = query.eq("lead_id", input.leadId);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, deletedContactIds: [], error: "Failed to load CloudTalk contact mappings" };
    }

    const mappings = ((data ?? []) as CloudTalkContactMappingRow[]).filter((row) => row.contact_id?.trim());
    if (mappings.length === 0) {
      return { success: true, deletedContactIds: [] };
    }

    const authHeader = createCloudTalkAuthHeader();
    if (!authHeader.success) {
      return { success: false, deletedContactIds: [], error: authHeader.error };
    }

    const deletedContactIds: string[] = [];

    for (const mapping of mappings) {
      const contactId = mapping.contact_id.trim();
      const response = await fetch(`https://my.cloudtalk.io/api/contacts/delete/${encodeURIComponent(contactId)}.json`, {
        method: "DELETE",
        headers: {
          Authorization: authHeader.value,
        },
      });

      const payload = (await response.json()) as CloudTalkDeleteResponse;
      console.log("[CloudTalk] delete contact response", {
        contactId,
        httpStatus: response.status,
        ok: response.ok,
        payload,
      });

      const status = payload.responseData?.status;
      if (!(response.ok && status === 200)) {
        return {
          success: false,
          deletedContactIds,
          error: payload.responseData?.message || `Failed to delete CloudTalk contact ${contactId}`,
        };
      }

      const { error: deleteMappingError } = await supabaseAdmin
        .from("cloudtalk_contacts")
        .delete()
        .eq("contact_id", contactId);

      if (deleteMappingError) {
        return {
          success: false,
          deletedContactIds,
          error: "CloudTalk contact deleted but failed to remove local mapping",
        };
      }

      deletedContactIds.push(contactId);
    }

    return { success: true, deletedContactIds };
  } catch (error) {
    return {
      success: false,
      deletedContactIds: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Parse name into first and last name
 */
export function parseName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  if (!fullName || !fullName.trim()) {
    return { firstName: "Unknown", lastName: "Contact" };
  }

  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");
  return { firstName, lastName };
}
