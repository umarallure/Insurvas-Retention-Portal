import localAgentMapping from "@/config/vicidial-agent-mapping.local.json";

export type VicidialAgentMapping = {
  campaignId: string;
  listId: string | number;
  vicidialUser?: string;
  webformBaseUrl?: string;
};

// Local mapping for now. Move this to Supabase later.
// Key is portal profiles.id (assignee_profile_id).
const LOCAL_AGENT_MAPPING = localAgentMapping as Record<string, VicidialAgentMapping>;

export function getVicidialAgentMapping(profileId?: string | null): VicidialAgentMapping | null {
  if (!profileId) return null;
  return LOCAL_AGENT_MAPPING[profileId] ?? null;
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
