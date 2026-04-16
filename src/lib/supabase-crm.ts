import { createClient } from "@supabase/supabase-js";

const crmUrl = process.env.NEXT_PUBLIC_CRM_SUPABASE_URL ?? "";
const crmPublishableKey =
  process.env.NEXT_PUBLIC_CRM_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_CRM_SUPABASE_ANON_KEY ??
  "";
const crmServiceRoleKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY ?? "";

export const CRM_SUPABASE_CONFIGURED = Boolean(crmUrl) && Boolean(crmPublishableKey);

let browserClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseCrm() {
  if (!CRM_SUPABASE_CONFIGURED) {
    throw new Error(
      "CRM Supabase is not configured. Set NEXT_PUBLIC_CRM_SUPABASE_URL and NEXT_PUBLIC_CRM_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  if (!browserClient) {
    browserClient = createClient(crmUrl, crmPublishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return browserClient;
}

export function getSupabaseCrmAdmin() {
  if (typeof window !== "undefined") {
    throw new Error("supabaseCrmAdmin can only be used server-side");
  }

  if (!crmUrl) {
    throw new Error("NEXT_PUBLIC_CRM_SUPABASE_URL is required for CRM Supabase admin client");
  }

  if (!crmServiceRoleKey) {
    throw new Error("CRM_SUPABASE_SERVICE_ROLE_KEY is required for CRM Supabase admin client");
  }

  return createClient(crmUrl, crmServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
