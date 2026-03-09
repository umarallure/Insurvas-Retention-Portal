import localAgentMapping from "@/config/vicidial-agent-mapping.local.json";
import { getSupabaseAdmin, supabase } from "@/lib/supabase";

export type VicidialAgentMapping = {
  campaignId: string;
  listId: string | number;
  vicidialUser?: string;
  phoneLogin?: string;
  webformBaseUrl?: string;
};

type VicidialAgentMappingRow = {
  profile_id: string;
  campaign_id: string | number | null;
  list_id: string | number | null;
  vicidial_user: string | null;
  phone_login: string | null;
  webform_base_url: string | null;
  is_active: boolean | null;
};

// Local mapping for now. Move this to Supabase later.
// Key is portal profiles.id (assignee_profile_id).
const LOCAL_AGENT_MAPPING = localAgentMapping as Record<string, VicidialAgentMapping>;

export function getVicidialAgentMapping(profileId?: string | null): VicidialAgentMapping | null {
  if (!profileId) return null;
  return LOCAL_AGENT_MAPPING[profileId] ?? null;
}

function normalizeMappingFromRow(row: VicidialAgentMappingRow | null | undefined): VicidialAgentMapping | null {
  if (!row) return null;
  if (!row.is_active) return null;
  const campaignId = row.campaign_id != null ? String(row.campaign_id).trim() : "";
  const listIdRaw = row.list_id != null ? String(row.list_id).trim() : "";
  if (!campaignId || !listIdRaw) return null;

  const maybeNumericListId = Number(listIdRaw);
  const listId = Number.isFinite(maybeNumericListId) ? maybeNumericListId : listIdRaw;

  return {
    campaignId,
    listId,
    vicidialUser: row.vicidial_user?.trim() || undefined,
    phoneLogin: row.phone_login?.trim() || undefined,
    webformBaseUrl: row.webform_base_url?.trim() || undefined,
  };
}

export async function getVicidialAgentMappingFromDb(profileId?: string | null): Promise<VicidialAgentMapping | null> {
  if (!profileId) return null;

  let client: ReturnType<typeof getSupabaseAdmin> | typeof supabase;
  try {
    const isServer = typeof window === "undefined";
    client = isServer ? getSupabaseAdmin() : supabase;
  } catch (error) {
    console.warn("[vicidial-agent-mapping] supabase admin unavailable, falling back to local mapping", {
      profileId,
      error: error instanceof Error ? error.message : String(error),
    });
    return getVicidialAgentMapping(profileId);
  }

  const { data, error } = await client
    .from("vicidial_agent_mapping")
    .select("profile_id,campaign_id,list_id,vicidial_user,phone_login,webform_base_url,is_active")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.warn("[vicidial-agent-mapping] lookup failed, falling back to local mapping", {
      profileId,
      error: error.message,
    });
    return getVicidialAgentMapping(profileId);
  }

  return normalizeMappingFromRow((data as VicidialAgentMappingRow | null) ?? null) ?? getVicidialAgentMapping(profileId);
}

export function buildLeadDetailsUrl(dealId?: number | null) {
  if (!dealId || !Number.isFinite(dealId)) return null;
  const base =
    process.env.RETENTION_PORTAL_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_BASE_URL ??
    "https://retention-portal-lyart.vercel.app";
  const cleanBase = base.replace(/\/+$/, "");
  return `${cleanBase}/agent/assigned-lead-details?dealId=${dealId}`;
}
