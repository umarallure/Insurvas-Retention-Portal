import type { SupabaseClient } from "@supabase/supabase-js";

import type { MondayComDeal } from "@/types";

export type DuplicateLeadLite = {
  id: string;
  customer_full_name: string | null;
  social_security: string | null;
  carrier: string | null;
  product_type: string | null;
  phone_number: string | null;
  lead_vendor: string | null;
  created_at: string | null;
};

export type DuplicateLeadFinderResult = {
  ghlName: string;
  ssn: string | null;
  duplicateLeads: DuplicateLeadLite[];
  mondayDealsByGhlName: Record<string, MondayComDeal[]>;
};

type LeadNameMatchRow = {
  social_security: string | null;
};

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function pickFirstNonEmptyString(values: Array<string | null | undefined>) {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length) return v.trim();
  }
  return null;
}

export async function findDuplicateLeadsByGhlName(params: {
  supabase: SupabaseClient;
  ghlName: string;
  excludeLeadId?: string;
  includeMondayDeals?: boolean;
}): Promise<DuplicateLeadFinderResult> {
  const ghlName = normalizeName(params.ghlName);
  const includeMondayDeals = params.includeMondayDeals !== false;

  const { data: nameMatchedLeads, error: nameError } = await params.supabase
    .from("leads")
    .select(
      "id, customer_full_name, social_security, carrier, product_type, phone_number, lead_vendor, created_at"
    )
    .ilike("customer_full_name", ghlName);

  if (nameError) throw nameError;

  const ssn = pickFirstNonEmptyString(
    ((nameMatchedLeads ?? []) as LeadNameMatchRow[]).map((l) => l.social_security)
  );

  let duplicateLeads: DuplicateLeadLite[] = [];

  if (ssn) {
    const { data: ssnLeads, error: ssnError } = await params.supabase
      .from("leads")
      .select(
        "id, customer_full_name, social_security, carrier, product_type, phone_number, lead_vendor, created_at"
      )
      .eq("social_security", ssn)
      .order("created_at", { ascending: false });

    if (ssnError) throw ssnError;

    duplicateLeads = ((ssnLeads ?? []) as DuplicateLeadLite[]).filter(
      (l) => !params.excludeLeadId || l.id !== params.excludeLeadId
    );
  }

  const mondayDealsByGhlName: Record<string, MondayComDeal[]> = {};

  if (includeMondayDeals && duplicateLeads.length) {
    const ghlNames = Array.from(
      new Set(
        duplicateLeads
          .map((l) => (typeof l.customer_full_name === "string" ? normalizeName(l.customer_full_name) : null))
          .filter((v): v is string => !!v)
      )
    );

    if (ghlNames.length) {
      const { data: deals, error: dealsError } = await params.supabase
        .from("monday_com_deals")
        .select("*")
        .in("ghl_name", ghlNames)
        .order("last_updated", { ascending: false, nullsFirst: false });

      if (dealsError) throw dealsError;

      for (const d of (deals ?? []) as MondayComDeal[]) {
        const key = typeof d.ghl_name === "string" ? normalizeName(d.ghl_name) : "Unknown";
        mondayDealsByGhlName[key] = mondayDealsByGhlName[key] ?? [];
        mondayDealsByGhlName[key].push(d);
      }
    }
  }

  return {
    ghlName,
    ssn,
    duplicateLeads,
    mondayDealsByGhlName,
  };
}

export async function findDuplicateLeadsFromMondayGhlNames(params: {
  supabase: SupabaseClient;
  ghlNames: string[];
  excludeLeadId?: string;
  includeMondayDeals?: boolean;
}): Promise<DuplicateLeadFinderResult> {
  const includeMondayDeals = params.includeMondayDeals !== false;

  const normalizedNames = Array.from(
    new Set(
      (params.ghlNames ?? [])
        .map((n) => (typeof n === "string" ? normalizeName(n) : ""))
        .filter((n) => n.length)
    )
  );

  const primaryName = normalizedNames[0] ?? "";

  if (!primaryName) {
    return {
      ghlName: "",
      ssn: null,
      duplicateLeads: [],
      mondayDealsByGhlName: {},
    };
  }

  // Try to find matching leads by the ghl_name variants coming from Monday.
  // We use ilike exact matches (case-insensitive) and OR them together.
  const orFilter = normalizedNames.map((n) => `customer_full_name.ilike.${n}`).join(",");

  const { data: matchedLeads, error: matchError } = await params.supabase
    .from("leads")
    .select("id, customer_full_name, social_security, carrier, product_type, phone_number, lead_vendor, created_at")
    .or(orFilter);

  if (matchError) throw matchError;

  const ssn = pickFirstNonEmptyString(
    ((matchedLeads ?? []) as LeadNameMatchRow[]).map((l) => l.social_security)
  );

  let duplicateLeads: DuplicateLeadLite[] = [];
  if (ssn) {
    const { data: ssnLeads, error: ssnError } = await params.supabase
      .from("leads")
      .select("id, customer_full_name, social_security, carrier, product_type, phone_number, lead_vendor, created_at")
      .eq("social_security", ssn)
      .order("created_at", { ascending: false });

    if (ssnError) throw ssnError;

    duplicateLeads = ((ssnLeads ?? []) as DuplicateLeadLite[]).filter(
      (l) => !params.excludeLeadId || l.id !== params.excludeLeadId
    );
  }

  const mondayDealsByGhlName: Record<string, MondayComDeal[]> = {};

  if (includeMondayDeals) {
    // Fetch Monday deals for BOTH:
    // - original ghl_name variants from Monday
    // - ghl names of duplicate leads (so they can be grouped under Duplicate)
    const ghlNamesFromDuplicates = Array.from(
      new Set(
        duplicateLeads
          .map((l) => (typeof l.customer_full_name === "string" ? normalizeName(l.customer_full_name) : null))
          .filter((v): v is string => !!v)
      )
    );

    const allNames = Array.from(new Set([...normalizedNames, ...ghlNamesFromDuplicates]));

    if (allNames.length) {
      const { data: deals, error: dealsError } = await params.supabase
        .from("monday_com_deals")
        .select("*")
        .in("ghl_name", allNames)
        .order("last_updated", { ascending: false, nullsFirst: false });

      if (dealsError) throw dealsError;

      for (const d of (deals ?? []) as MondayComDeal[]) {
        const key = typeof d.ghl_name === "string" ? normalizeName(d.ghl_name) : "Unknown";
        mondayDealsByGhlName[key] = mondayDealsByGhlName[key] ?? [];
        mondayDealsByGhlName[key].push(d);
      }
    }
  }

  return {
    ghlName: primaryName,
    ssn,
    duplicateLeads,
    mondayDealsByGhlName,
  };
}
