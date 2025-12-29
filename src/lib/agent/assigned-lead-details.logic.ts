"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import { supabase } from "@/lib/supabase";
import {
  findDuplicateLeadsFromMondayGhlNames,
  type DuplicateLeadFinderResult,
} from "@/lib/duplicate-leads";
import type { MondayComDeal } from "@/types";

 type RetentionType = "new_sale" | "fixed_payment" | "carrier_requirements";

type RetentionModalStep = "select" | "carrier_alert" | "banking_form";

 type RetentionAgentOption = {
   profile_id: string;
   display_name: string;
 };

export type LeadRecord = Record<string, unknown>;

export function normalizePhoneDigits(phone: string) {
  return phone.replace(/\D/g, "");
}

export function buildDigitWildcardPattern(digits: string) {
  const clean = digits.replace(/\D/g, "");
  if (!clean.length) return null;
  return `%${clean.split("").join("%")}%`;
}

 function normalizeVendorForMatch(vendor: string) {
   const s = vendor
     .trim()
     .toLowerCase()
     .replace(/[\u2018\u2019]/g, "'")
     .replace(/[\u201C\u201D]/g, '"')
     .replace(/[^a-z0-9\s]/g, " ")
     .replace(/\s+/g, " ")
     .trim();

   // Remove common legal suffixes so "Ambition" can match "Ambition BPO".
   const suffixes = new Set([
     "bpo",
     "llc",
     "inc",
     "ltd",
     "corp",
     "corporation",
     "company",
     "co",
     "limited",
     "pllc",
     "pc",
   ]);

   const parts = s.split(" ").filter(Boolean);
   while (parts.length > 1 && suffixes.has(parts[parts.length - 1] ?? "")) {
     parts.pop();
   }
   return parts.join(" ");
 }

 function buildLeadVendorOrFilter(leadVendorRaw: string) {
   const raw = leadVendorRaw.trim();
   if (!raw.length) return null;

   // Remove LIKE wildcards to avoid accidental broad matches.
   const cleanedRaw = raw.replace(/[%_]/g, " ").replace(/\s+/g, " ").trim();
   const normalizedCore = normalizeVendorForMatch(cleanedRaw);
   const coreTitle = normalizedCore
     .split(" ")
     .map((p) => (p.length ? p[0]!.toUpperCase() + p.slice(1) : p))
     .join(" ");

   const patterns = Array.from(
     new Set(
       [
         cleanedRaw,
         cleanedRaw.toLowerCase(),
         normalizedCore,
         coreTitle,
         `${normalizedCore} %`,
         `${coreTitle} %`,
       ]
         .map((p) => p.trim())
         .filter((p) => p.length)
     )
   );

   return patterns.map((p) => `lead_vendor.ilike.${p}`).join(",");
 }

export function getString(row: LeadRecord | null, key: string): string | null {
  if (!row) return null;
  const v = row[key];
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

export function scoreCanonicalLeadCandidate(row: LeadRecord) {
  const phone = getString(row, "phone_number") ?? "";
  const looksFormatted = /[()\-\s]/.test(phone);
  const hasPlusOrCountry = /^\+?1\b/.test(phone);

  const fieldKeys = [
    "email",
    "street_address",
    "city",
    "state",
    "zip_code",
    "date_of_birth",
    "social_security",
    "carrier",
    "product_type",
    "policy_number",
    "monthly_premium",
  ];

  let filled = 0;
  for (const k of fieldKeys) {
    if (getString(row, k)) filled += 1;
  }

  const updatedAt = getString(row, "updated_at") ?? "";
  const createdAt = getString(row, "created_at") ?? "";
  const t = Date.parse(updatedAt || createdAt);
  const recency = Number.isFinite(t) ? t : 0;

  return {
    score: (looksFormatted ? 1000 : 0) + (hasPlusOrCountry ? 50 : 0) + filled * 10,
    recency,
  };
}

export function titleizeKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    const t = value.trim();
    return t.length ? t : "—";
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "—";
}

export function pickRowValue(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && !(typeof v === "string" && v.trim().length === 0)) return v;
  }
  return null;
}

export function formatCurrency(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (!t.length) return "—";
    const numeric = Number(t.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(numeric)) {
      return numeric.toLocaleString(undefined, { style: "currency", currency: "USD" });
    }
    return t;
  }
  return "—";
}

export function useAssignedLeadDetails() {
  const router = useRouter();
  const idParam = router.query.id;
  const dealIdParam = router.query.dealId;

  const [lead, setLead] = useState<LeadRecord | null>(null);
  const [personalLead, setPersonalLead] = useState<LeadRecord | null>(null);
  const [personalLeadLoading, setPersonalLeadLoading] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<MondayComDeal | null>(null);
  const [mondayDeals, setMondayDeals] = useState<MondayComDeal[]>([]);
  const [mondayLoading, setMondayLoading] = useState(false);
  const [mondayError, setMondayError] = useState<string | null>(null);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateLeadFinderResult | null>(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [dailyFlowRows, setDailyFlowRows] = useState<Array<Record<string, unknown>>>([]);
  const [dailyFlowLoading, setDailyFlowLoading] = useState(false);
  const [dailyFlowError, setDailyFlowError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPolicyKey, setSelectedPolicyKey] = useState<string | null>(null);

  const [verificationSessionId, setVerificationSessionId] = useState<string | null>(null);
  const [verificationItems, setVerificationItems] = useState<Array<Record<string, unknown>>>([]);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationInputValues, setVerificationInputValues] = useState<Record<string, string>>({});

  const [retentionModalOpen, setRetentionModalOpen] = useState(false);
  const [retentionAgent, setRetentionAgent] = useState<string>("");
  const [retentionType, setRetentionType] = useState<RetentionType | "">("");
  const [retentionAgentLocked, setRetentionAgentLocked] = useState(false);
  const [retentionAgentOptions, setRetentionAgentOptions] = useState<RetentionAgentOption[]>([]);

  const [retentionStep, setRetentionStep] = useState<RetentionModalStep>("select");
  const [bankingPolicyStatus, setBankingPolicyStatus] = useState<"issued" | "pending">("issued");
  const [bankingAccountHolderName, setBankingAccountHolderName] = useState("");
  const [bankingBankName, setBankingBankName] = useState("");
  const [bankingRoutingNumber, setBankingRoutingNumber] = useState("");
  const [bankingAccountNumber, setBankingAccountNumber] = useState("");
  const [bankingAccountType, setBankingAccountType] = useState<"Checking" | "Savings" | "">("");
  const [bankingDraftDate, setBankingDraftDate] = useState("");
  const [bankingSaving, setBankingSaving] = useState(false);
  const [bankingSaveError, setBankingSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadLoggedInAgent = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        if (!session?.user) return;

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        const name = (profile?.display_name as string | null) ?? null;
        if (!cancelled && name && name.trim().length) {
          setRetentionAgent(name);
          setRetentionAgentLocked(true);
        }
      } catch {
        if (!cancelled) setRetentionAgentLocked(false);
      }
    };

    void loadLoggedInAgent();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRetentionAgents = async () => {
      try {
        const { data: raRows, error: raError } = await supabase
          .from("retention_agents")
          .select("profile_id")
          .eq("active", true);

        if (raError) throw raError;

        const profileIds = (raRows ?? [])
          .map((row) => (row?.profile_id as string | null) ?? null)
          .filter((v): v is string => !!v && v.length > 0);

        if (profileIds.length === 0) {
          if (!cancelled) setRetentionAgentOptions([]);
          return;
        }

        const { data: profileRows, error: profilesError } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", profileIds);

        if (profilesError) throw profilesError;

        const mapped: RetentionAgentOption[] = (profileRows ?? [])
          .map((p) => {
            const id = (p?.id as string | null) ?? null;
            const name = (p?.display_name as string | null) ?? null;
            if (!id || !name || !name.trim().length) return null;
            return { profile_id: id, display_name: name };
          })
          .filter((v): v is RetentionAgentOption => !!v);

        mapped.sort((a, b) => a.display_name.localeCompare(b.display_name));

        if (!cancelled) setRetentionAgentOptions(mapped);
      } catch (e) {
        console.error("[assigned-lead-details] load retention agents error", e);
        if (!cancelled) setRetentionAgentOptions([]);
      }
    };

    void loadRetentionAgents();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!router.isReady) return;

    const rawDealId =
      typeof dealIdParam === "string" ? dealIdParam : Array.isArray(dealIdParam) ? dealIdParam[0] : undefined;
    const parsedDealId = rawDealId ? Number(rawDealId) : null;
    const dealId = parsedDealId != null && Number.isFinite(parsedDealId) ? parsedDealId : null;

    const id = typeof idParam === "string" ? idParam : Array.isArray(idParam) ? idParam[0] : undefined;
    const leadId = id && id.trim().length ? id : null;

    if (!dealId && !leadId) {
      setError("Missing deal id in URL.");
      setSelectedDeal(null);
      setMondayDeals([]);
      setLead(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (dealId) {
          setMondayLoading(true);
          setMondayError(null);

          const { data: dealRow, error: dealErr } = await supabase
            .from("monday_com_deals")
            .select("*")
            .eq("id", dealId)
            .maybeSingle();

          if (dealErr) throw dealErr;
          const deal = (dealRow ?? null) as MondayComDeal | null;

          // If we navigated via a specific deal id, still load all other Monday deals
          // for the same customer so multiple policies render as separate cards.
          if (deal) {
            const orParts: string[] = [];

            const ghlName = typeof deal.ghl_name === "string" ? deal.ghl_name.trim() : "";
            const dealName = typeof deal.deal_name === "string" ? deal.deal_name.trim() : "";
            const phone = typeof deal.phone_number === "string" ? deal.phone_number.trim() : "";
            const policyNo = typeof deal.policy_number === "string" ? deal.policy_number.trim() : "";

            if (ghlName) orParts.push(`ghl_name.ilike.%${ghlName.replace(/,/g, "")}%`);
            if (dealName) orParts.push(`deal_name.ilike.%${dealName.replace(/,/g, "")}%`);
            if (phone) orParts.push(`phone_number.eq.${phone.replace(/,/g, "")}`);
            if (policyNo) orParts.push(`policy_number.eq.${policyNo.replace(/,/g, "")}`);

            let relatedDeals: MondayComDeal[] = [deal];

            if (orParts.length) {
              const { data: relatedRows, error: relatedErr } = await supabase
                .from("monday_com_deals")
                .select("*")
                .or(orParts.join(","))
                .order("last_updated", { ascending: false, nullsFirst: false });

              if (relatedErr) throw relatedErr;
              relatedDeals = ((relatedRows ?? []) as MondayComDeal[]) ?? [];
            }

            if (!cancelled) {
              setSelectedDeal(deal);
              setMondayDeals(relatedDeals);
            }
          } else if (!cancelled) {
            setSelectedDeal(null);
            setMondayDeals([]);
          }

          const submissionId = deal && typeof deal.monday_item_id === "string" ? deal.monday_item_id.trim() : "";
          if (submissionId) {
            const { data: leadRow, error: leadErr } = await supabase
              .from("leads")
              .select("*")
              .eq("submission_id", submissionId)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (leadErr) throw leadErr;
            if (!cancelled) setLead((leadRow ?? null) as LeadRecord | null);
          } else if (!cancelled) {
            setLead(null);
          }

          if (!cancelled) {
            setMondayLoading(false);
            setMondayError(null);
          }
          return;
        }

        if (leadId) {
          const { data, error: leadsError } = await supabase
            .from("leads")
            .select("*")
            .eq("id", leadId)
            .maybeSingle();

          if (leadsError) throw leadsError;

          if (!cancelled) {
            setLead((data ?? null) as LeadRecord | null);
          }
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to load lead.";
          setError(msg);
          setSelectedDeal(null);
          setMondayDeals([]);
          setLead(null);
          setMondayLoading(false);
          setMondayError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [router.isReady, dealIdParam, idParam]);

  useEffect(() => {
    if (selectedDeal) {
      setPersonalLead(null);
      setPersonalLeadLoading(false);
      setDuplicateResult(null);
      setDuplicateError(null);
      setDuplicateLoading(false);
      return;
    }

    if (!lead) {
      setPersonalLead(null);
      setPersonalLeadLoading(false);
      setMondayDeals([]);
      setMondayError(null);
      setMondayLoading(false);
      setDuplicateResult(null);
      setDuplicateError(null);
      setDuplicateLoading(false);
      return;
    }

    const ghlName = getString(lead, "customer_full_name");
    if (!ghlName) {
      setMondayDeals([]);
      setMondayError(null);
      setMondayLoading(false);
      setDuplicateResult(null);
      setDuplicateError(null);
      setDuplicateLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setMondayLoading(true);
      setMondayError(null);
      setDuplicateLoading(true);
      setDuplicateError(null);
      try {
        const escaped = ghlName.replace(/,/g, "");
        const { data: mondayRows, error: mondayErr } = await supabase
          .from("monday_com_deals")
          .select("*")
          .or(`ghl_name.ilike.%${escaped}%,deal_name.ilike.%${escaped}%`)
          .order("last_updated", { ascending: false, nullsFirst: false });

        if (mondayErr) throw mondayErr;

        const deals = (mondayRows ?? []) as MondayComDeal[];
        const ghlNames = Array.from(
          new Set(
            deals
              .map((d) => (typeof d.ghl_name === "string" ? d.ghl_name : null))
              .filter((v): v is string => !!v && v.trim().length > 0),
          ),
        );

        const res = await findDuplicateLeadsFromMondayGhlNames({
          supabase,
          ghlNames: ghlNames.length ? ghlNames : [ghlName],
          excludeLeadId: typeof lead["id"] === "string" ? (lead["id"] as string) : undefined,
          includeMondayDeals: true,
        });

        if (!cancelled) {
          setMondayDeals(deals);
          setDuplicateResult(res);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to load duplicate policies.";
          setMondayError(msg);
          setDuplicateError(msg);
          setMondayDeals([]);
          setDuplicateResult(null);
        }
      } finally {
        if (!cancelled) {
          setMondayLoading(false);
          setDuplicateLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [lead, selectedDeal, selectedPolicyKey]);

  const canonicalLeadRecord = personalLead ?? lead ?? (selectedDeal ? (selectedDeal as unknown as LeadRecord) : null);

  useEffect(() => {
    const lookupName =
      getString(lead, "customer_full_name") ??
      getString(selectedDeal ? (selectedDeal as unknown as LeadRecord) : null, "ghl_name") ??
      getString(selectedDeal ? (selectedDeal as unknown as LeadRecord) : null, "deal_name") ??
      null;

    const selectedCallCenter = (() => {
      const keyFor = (d: MondayComDeal) =>
        (d.monday_item_id && d.monday_item_id.trim().length ? `item:${d.monday_item_id.trim()}` : null) ??
        `id:${String(d.id)}`;

      const all: MondayComDeal[] = [];
      all.push(...(mondayDeals ?? []));

      if (duplicateResult?.mondayDealsByGhlName) {
        for (const deals of Object.values(duplicateResult.mondayDealsByGhlName)) {
          all.push(...(deals ?? []));
        }
      }

      const found = selectedPolicyKey ? all.find((d) => keyFor(d) === selectedPolicyKey) : null;
      return found?.call_center ?? null;
    })();

    const leadVendor =
      (selectedCallCenter && selectedCallCenter !== "—" ? selectedCallCenter : null) ??
      getString(selectedDeal ? (selectedDeal as unknown as LeadRecord) : null, "call_center") ??
      null;

    if (!lookupName) {
      setPersonalLead(null);
      setPersonalLeadLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setPersonalLeadLoading(true);
      try {
        // 1) Preferred: search leads by customer_full_name (GHL name)
        const escaped = lookupName.replace(/,/g, "").trim();
        if (!escaped.length) {
          if (!cancelled) setPersonalLead(null);
          return;
        }

        let q = supabase
          .from("leads")
          .select("*")
          .ilike("customer_full_name", `%${escaped}%`)
          .order("updated_at", { ascending: false })
          .order("submission_date", { ascending: false })
          .limit(25);

        if (leadVendor && leadVendor.trim().length) {
          const vendorOr = buildLeadVendorOrFilter(leadVendor);
          if (vendorOr) {
            q = q.or(vendorOr);
          }
        }

        const { data: byNameRows, error: byNameErr } = await q;
        if (byNameErr) throw byNameErr;

        const byName = (byNameRows ?? []) as LeadRecord[];
        const chosenByName = byName.length ? (byName[0] as LeadRecord) : null;

        if (!cancelled) setPersonalLead(chosenByName);
      } finally {
        if (!cancelled) setPersonalLeadLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [duplicateResult, lead, mondayDeals, selectedDeal, selectedPolicyKey]);

  const dealFallback = selectedDeal ? (selectedDeal as unknown as LeadRecord) : null;

  const name =
    getString(canonicalLeadRecord, "customer_full_name") ??
    getString(dealFallback, "ghl_name") ??
    getString(dealFallback, "deal_name") ??
    "Unknown";
  const phone = getString(canonicalLeadRecord, "phone_number") ?? getString(dealFallback, "phone_number") ?? "-";
  const email = getString(canonicalLeadRecord, "email") ?? "-";
  const policyNumber = getString(canonicalLeadRecord, "policy_number") ?? "-";
  const carrier = getString(canonicalLeadRecord, "carrier") ?? getString(dealFallback, "carrier") ?? "-";
  const productType =
    getString(canonicalLeadRecord, "product_type") ?? getString(dealFallback, "policy_type") ?? "-";
  const center = getString(canonicalLeadRecord, "lead_vendor") ?? getString(dealFallback, "call_center") ?? "-";
  const address1 = getString(canonicalLeadRecord, "street_address") ?? "-";
  const city = getString(canonicalLeadRecord, "city") ?? "-";
  const state = getString(canonicalLeadRecord, "state") ?? "-";
  const zip = getString(canonicalLeadRecord, "zip_code") ?? "-";
  const dob = getString(canonicalLeadRecord, "date_of_birth") ?? "-";
  const ssnLast4 = getString(canonicalLeadRecord, "social_security") ?? "-";
  const monthlyPremium = getString(canonicalLeadRecord, "monthly_premium") ?? "-";
  const agent = getString(canonicalLeadRecord, "agent") ?? "-";

  const personalLeadRecord = canonicalLeadRecord;

  const personalName = getString(personalLeadRecord, "customer_full_name") ?? name;
  const personalPhone = getString(personalLeadRecord, "phone_number") ?? phone;
  const personalEmail = getString(personalLeadRecord, "email") ?? email;
  const personalPolicyNumber = getString(personalLeadRecord, "policy_number") ?? policyNumber;
  const personalCarrier = getString(personalLeadRecord, "carrier") ?? carrier;
  const personalProductType = getString(personalLeadRecord, "product_type") ?? productType;
  const personalCenter = getString(personalLeadRecord, "lead_vendor") ?? center;
  const personalAddress1 = getString(personalLeadRecord, "street_address") ?? address1;
  const personalCity = getString(personalLeadRecord, "city") ?? city;
  const personalState = getString(personalLeadRecord, "state") ?? state;
  const personalZip = getString(personalLeadRecord, "zip_code") ?? zip;
  const personalDob = getString(personalLeadRecord, "date_of_birth") ?? dob;
  const personalSsnLast4 = getString(personalLeadRecord, "social_security") ?? ssnLast4;
  const personalMonthlyPremium = getString(personalLeadRecord, "monthly_premium") ?? monthlyPremium;
  const personalAgent = getString(personalLeadRecord, "agent") ?? agent;

  const personalAdditionalEntries = useMemo(() => {
    if (!personalLeadRecord) return [] as Array<[string, unknown]>;

    const exclude = new Set([
      "id",
      "created_at",
      "updated_at",
      "customer_full_name",
      "phone_number",
      "email",
      "policy_number",
      "carrier",
      "product_type",
      "lead_vendor",
      "street_address",
      "city",
      "state",
      "zip_code",
      "date_of_birth",
      "social_security",
      "monthly_premium",
      "agent",
    ]);

    return Object.entries(personalLeadRecord).filter(([key, value]) => !exclude.has(key) && value != null);
  }, [personalLeadRecord]);

  useEffect(() => {
    if (!lead) {
      setDailyFlowRows([]);
      setDailyFlowError(null);
      setDailyFlowLoading(false);
      return;
    }

    const p = getString(canonicalLeadRecord, "phone_number");
    const insuredName = getString(canonicalLeadRecord, "customer_full_name");

    const insuredNameEscaped = (insuredName ?? "").replace(/,/g, "").trim();

    const phoneDigits = normalizePhoneDigits(p ?? "");
    const last10 = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits;
    const phonePattern = last10 ? buildDigitWildcardPattern(last10) : null;

    const hasAnyFilter =
      (!!p && p.trim().length > 0) || (!!insuredNameEscaped && insuredNameEscaped.length > 0);

    if (!hasAnyFilter) {
      setDailyFlowRows([]);
      setDailyFlowError(null);
      setDailyFlowLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setDailyFlowLoading(true);
      setDailyFlowError(null);
      try {
        let q = supabase.from("daily_deal_flow").select("*");

        // Fetch broadly for the insured: by phone and/or name.
        // IMPORTANT: use OR so we don't accidentally filter out a different vendor's row.
        const orParts: string[] = [];
        if (insuredNameEscaped.length) {
          orParts.push(`insured_name.ilike.%${insuredNameEscaped}%`);
        }
        if (phonePattern) {
          orParts.push(`client_phone_number.ilike.${phonePattern}`);
        }

        if (orParts.length) {
          q = q.or(orParts.join(","));
        }

        q = q.order("date", { ascending: false }).limit(250);

        const { data, error: dfError } = await q;

        if (dfError) throw dfError;

        const exactRows = (data ?? []) as Array<Record<string, unknown>>;
        if (exactRows.length > 0) {
          if (!cancelled) setDailyFlowRows(exactRows);
          return;
        }

        const digits = normalizePhoneDigits(p ?? "");
        const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
        if (!last10) {
          if (!cancelled) setDailyFlowRows([]);
          return;
        }

        const pattern = buildDigitWildcardPattern(last10);
        if (!pattern) {
          if (!cancelled) setDailyFlowRows([]);
          return;
        }

        let fq = supabase.from("daily_deal_flow").select("*").ilike("client_phone_number", pattern);

        if (insuredNameEscaped.length) {
          fq = fq.ilike("insured_name", `%${insuredNameEscaped}%`);
        }

        fq = fq.order("date", { ascending: false }).limit(250);

        const { data: fuzzyData, error: fuzzyErr } = await fq;

        if (fuzzyErr) throw fuzzyErr;
        if (!cancelled) setDailyFlowRows((fuzzyData ?? []) as Array<Record<string, unknown>>);
      } catch (e) {
        if (!cancelled) {
          const err = e as unknown;
          const maybe =
            err && typeof err === "object"
              ? (err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown })
              : null;

          const msg =
            typeof maybe?.message === "string"
              ? [
                  maybe.message,
                  typeof maybe?.code === "string" ? `Code: ${maybe.code}` : null,
                  typeof maybe?.details === "string" ? `Details: ${maybe.details}` : null,
                  typeof maybe?.hint === "string" ? `Hint: ${maybe.hint}` : null,
                ]
                  .filter(Boolean)
                  .join(" • ")
              : "Failed to load Daily Deal Flow.";

          console.error("Daily Deal Flow query failed", {
            leadPhone: p,
            error: err,
          });

          setDailyFlowError(msg);
          setDailyFlowRows([]);
        }
      } finally {
        if (!cancelled) setDailyFlowLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [canonicalLeadRecord, lead]);

  const policyCards = useMemo(() => {
    const all: MondayComDeal[] = [];

    all.push(...(mondayDeals ?? []));

    if (duplicateResult?.mondayDealsByGhlName) {
      for (const deals of Object.values(duplicateResult.mondayDealsByGhlName)) {
        all.push(...(deals ?? []));
      }
    }

    const byKey = new Map<string, MondayComDeal>();
    for (const d of all) {
      const key =
        (d.monday_item_id && d.monday_item_id.trim().length ? `item:${d.monday_item_id.trim()}` : null) ??
        `id:${String(d.id)}`;

      if (!byKey.has(key)) byKey.set(key, d);
    }

    const unique = Array.from(byKey.values());
    unique.sort((a, b) => {
      const at = Date.parse(a.last_updated ?? "") || 0;
      const bt = Date.parse(b.last_updated ?? "") || 0;
      return bt - at;
    });

    return unique;
  }, [duplicateResult, mondayDeals]);

  useEffect(() => {
    if (selectedPolicyKey) return;
    if (!policyCards || policyCards.length === 0) return;

    const first = policyCards[0];
    const key =
      (first.monday_item_id && first.monday_item_id.trim().length ? `item:${first.monday_item_id.trim()}` : null) ??
      `id:${String(first.id)}`;
    setSelectedPolicyKey(key);
  }, [policyCards, selectedPolicyKey]);

  const policyViews = useMemo(() => {
    const ddfRows = (dailyFlowRows ?? []) as Array<Record<string, unknown>>;

    const getPolicyNumber = (policy: MondayComDeal) =>
      (typeof policy.policy_number === "string" ? policy.policy_number.trim() : "") || "";

    const getDdfPolicyNumber = (row: Record<string, unknown>) => {
      const ddfPolicy = pickRowValue(row, ["policy_number", "policy_no", "policy", "policyNumber"]);
      return typeof ddfPolicy === "string" ? ddfPolicy.trim() : "";
    };

    const getPolicyVendorKey = (policy: MondayComDeal) => {
      const v = typeof policy.call_center === "string" ? policy.call_center : "";
      return normalizeVendorForMatch(v);
    };

    const getDdfVendorKey = (row: Record<string, unknown>) => {
      const v = pickRowValue(row, ["lead_vendor", "call_center", "vendor"]); 
      return typeof v === "string" ? normalizeVendorForMatch(v) : "";
    };

    const scoreDdfForPolicy = (policy: MondayComDeal, row: Record<string, unknown>) => {
      const policyCarrier = typeof policy.carrier === "string" ? policy.carrier.trim().toLowerCase() : "";
      const policyProduct = typeof policy.policy_type === "string" ? policy.policy_type.trim().toLowerCase() : "";
      const policyVendorKey = getPolicyVendorKey(policy);

      const ddfCarrier = pickRowValue(row, ["carrier"]);
      const ddfProduct = pickRowValue(row, ["product_type"]);
      const ddfCarrierStr = typeof ddfCarrier === "string" ? ddfCarrier.trim().toLowerCase() : "";
      const ddfProductStr = typeof ddfProduct === "string" ? ddfProduct.trim().toLowerCase() : "";

      const ddfVendorKey = getDdfVendorKey(row);

      let score = 0;
      if (policyVendorKey && ddfVendorKey && policyVendorKey === ddfVendorKey) score += 80;
      if (policyCarrier && ddfCarrierStr && policyCarrier === ddfCarrierStr) score += 50;
      if (policyProduct && ddfProductStr && policyProduct === ddfProductStr) score += 25;

      const tPolicy =
        Date.parse(String(policy.last_updated ?? policy.updated_at ?? policy.deal_creation_date ?? "")) || 0;
      const ddfDate = pickRowValue(row, ["date", "created_at", "updated_at"]);
      const tDdf = typeof ddfDate === "string" ? Date.parse(ddfDate) || 0 : 0;
      if (tPolicy && tDdf) {
        const diffDays = Math.abs(tPolicy - tDdf) / (1000 * 60 * 60 * 24);
        score += Math.max(0, 20 - Math.min(20, diffDays));
      }

      // Prefer rows that actually have the values we want to show.
      const hasPremium = pickRowValue(row, ["monthly_premium", "premium"]) != null;
      const hasCoverage = pickRowValue(row, ["face_amount", "coverage_amount", "coverage"]) != null;
      const hasDraft = pickRowValue(row, ["draft_date", "initial_draft_date"]) != null;
      score += (hasPremium ? 5 : 0) + (hasCoverage ? 5 : 0) + (hasDraft ? 5 : 0);

      return score;
    };

    // Build a one-to-one mapping from policy -> best daily_deal_flow row.
    const policyToDdf = new Map<string, Record<string, unknown>>();
    const usedDdfIds = new Set<string>();

    const ddfKeyFor = (row: Record<string, unknown>) => {
      const id = row["id"];
      if (typeof id === "string" && id.trim().length) return `id:${id.trim()}`;
      const sub = row["submission_id"];
      const dt = row["date"];
      return `fallback:${String(sub ?? "")}|${String(dt ?? "")}`;
    };

    // 1) Exact policy_number matches first (unique)
    for (const policy of policyCards ?? []) {
      const key =
        (policy.monday_item_id && policy.monday_item_id.trim().length ? `item:${policy.monday_item_id.trim()}` : null) ??
        `id:${String(policy.id)}`;
      const policyNo = getPolicyNumber(policy);
      if (!policyNo) continue;

      const match = ddfRows.find((r) => {
        const rNo = getDdfPolicyNumber(r);
        if (!rNo || rNo !== policyNo) return false;
        const dk = ddfKeyFor(r);
        return !usedDdfIds.has(dk);
      });
      if (match) {
        policyToDdf.set(key, match);
        usedDdfIds.add(ddfKeyFor(match));
      }
    }

    // 2) Remaining policies: best-score unused row
    for (const policy of policyCards ?? []) {
      const key =
        (policy.monday_item_id && policy.monday_item_id.trim().length ? `item:${policy.monday_item_id.trim()}` : null) ??
        `id:${String(policy.id)}`;
      if (policyToDdf.has(key)) continue;

      let best: Record<string, unknown> | null = null;
      let bestScore = -1;
      for (const r of ddfRows) {
        const dk = ddfKeyFor(r);
        if (usedDdfIds.has(dk)) continue;
        const s = scoreDdfForPolicy(policy, r);
        if (s > bestScore) {
          bestScore = s;
          best = r;
        }
      }
      if (best) {
        policyToDdf.set(key, best);
        usedDdfIds.add(ddfKeyFor(best));
      }
    }

    const views = (policyCards ?? []).map((d) => {
      const key =
        (d.monday_item_id && d.monday_item_id.trim().length ? `item:${d.monday_item_id.trim()}` : null) ??
        `id:${String(d.id)}`;

      const ddf = policyToDdf.get(key) ?? null;

      const status = d.policy_status ?? d.status ?? "—";
      const statusNotes =
        (typeof d.notes === "string" && d.notes.trim().length ? d.notes.trim() : null) ??
        (ddf ? (pickRowValue(ddf, ["status_notes", "status_note", "failed_payment_reason", "reason"]) as string | null) : null) ??
        "—";

      const coverage = ddf ? pickRowValue(ddf, ["face_amount", "coverage_amount", "coverage", "faceAmount"]) : null;
      const monthlyPremium = ddf
        ? pickRowValue(ddf, ["monthly_premium", "premium", "monthlyPremium"])
        : d.deal_value ?? null;
      const initialDraftDate = ddf ? pickRowValue(ddf, ["draft_date", "initial_draft_date", "initialDraftDate"]) : null;

      return {
        key,
        raw: d,
        clientName: d.ghl_name ?? d.deal_name ?? name,
        carrier: d.carrier ?? carrier,
        policyNumber: d.policy_number ?? "—",
        agentName: d.sales_agent ?? personalAgent ?? agent,
        status,
        statusNotes,
        lastUpdated: d.last_updated ?? d.updated_at ?? null,
        coverage,
        monthlyPremium,
        initialDraftDate,
        callCenter: d.call_center ?? center,
      };
    });

    return views;
  }, [agent, carrier, center, dailyFlowRows, name, personalAgent, policyCards]);

  const selectedPolicyView = useMemo(() => {
    if (!selectedPolicyKey) return null;
    return policyViews.find((p) => p.key === selectedPolicyKey) ?? null;
  }, [policyViews, selectedPolicyKey]);

  const verificationAutofillByFieldName = useMemo(() => {
    const monday = selectedPolicyView?.raw ?? null;
    const map: Record<string, string> = {};

    const fromLead = (key: string) => getString(canonicalLeadRecord, key) ?? "";
    const fromMonday = (key: keyof MondayComDeal) => {
      const v = monday ? (monday[key] as unknown) : null;
      return v == null ? "" : String(v);
    };

    map["lead_vendor"] = fromLead("lead_vendor") || fromMonday("call_center");
    map["customer_full_name"] = fromLead("customer_full_name") || fromMonday("ghl_name") || fromMonday("deal_name");
    map["street_address"] = fromLead("street_address");
    map["beneficiary_information"] = fromLead("beneficiary_information");
    map["billing_and_mailing_address_is_the_same"] = fromLead("billing_and_mailing_address_is_the_same");
    map["date_of_birth"] = fromLead("date_of_birth");
    map["age"] = fromLead("age");
    map["phone_number"] = fromLead("phone_number") || fromMonday("phone_number");
    map["social_security"] = fromLead("social_security");
    map["driver_license"] = fromLead("driver_license");
    map["exp"] = fromLead("exp");
    map["existing_coverage"] = fromLead("existing_coverage");
    map["applied_to_life_insurance_last_two_years"] = fromLead("applied_to_life_insurance_last_two_years");
    map["height"] = fromLead("height");
    map["weight"] = fromLead("weight");
    map["doctors_name"] = fromLead("doctors_name");
    map["tobacco_use"] = fromLead("tobacco_use");
    map["health_conditions"] = fromLead("health_conditions");
    map["medications"] = fromLead("medications");
    map["insurance_application_details"] = fromLead("insurance_application_details");

    map["carrier"] = fromLead("carrier") || fromMonday("carrier");
    // Prefer values mapped per-policy from daily_deal_flow (selectedPolicyView) over lead-wide fields.
    map["monthly_premium"] =
      (selectedPolicyView?.monthlyPremium != null ? String(selectedPolicyView.monthlyPremium) : "") ||
      fromLead("monthly_premium") ||
      fromMonday("deal_value");
    map["coverage_amount"] =
      (selectedPolicyView?.coverage != null ? String(selectedPolicyView.coverage) : "") || fromLead("coverage_amount") || "";
    map["draft_date"] =
      (selectedPolicyView?.initialDraftDate != null ? String(selectedPolicyView.initialDraftDate) : "") ||
      fromLead("draft_date") ||
      "";
    map["first_draft"] = fromLead("first_draft");
    map["institution_name"] = fromLead("institution_name");
    map["beneficiary_routing"] = fromLead("beneficiary_routing");
    map["beneficiary_account"] = fromLead("beneficiary_account");
    map["account_type"] = fromLead("account_type");

    map["city"] = fromLead("city");
    map["state"] = fromLead("state");
    map["zip_code"] = fromLead("zip_code");
    map["birth_state"] = fromLead("birth_state");
    map["call_phone_landline"] = fromLead("call_phone_landline");
    map["additional_notes"] = fromLead("additional_notes") || getString(lead, "notes") || "";

    return map;
  }, [canonicalLeadRecord, lead, selectedPolicyView]);

  useEffect(() => {
    const leadIdForVerification =
      (lead && typeof lead["id"] === "string" ? (lead["id"] as string) : null) ??
      (personalLead && typeof personalLead["id"] === "string" ? (personalLead["id"] as string) : null);

    const dealIdForVerification =
      selectedDeal && typeof selectedDeal.id === "number" && Number.isFinite(selectedDeal.id) ? selectedDeal.id : null;

    if (!leadIdForVerification && dealIdForVerification == null) {
      setVerificationSessionId(null);
      setVerificationItems([]);
      setVerificationLoading(false);
      setVerificationError(null);
      setVerificationInputValues({});
      return;
    }

    let cancelled = false;
    const run = async () => {
      setVerificationLoading(true);
      setVerificationError(null);
      try {
        const leadId = leadIdForVerification;

        if (leadId && !leadId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)) {
          throw new Error("Invalid leadId");
        }
        const { data: { session }, error: sessErr } = await supabase.auth.getSession();

        if (sessErr) throw sessErr;
        const token = session?.access_token;
        if (!token) throw new Error("Not authenticated.");

        const rawPolicyNumber = selectedPolicyView?.policyNumber;
        const policyNumber = rawPolicyNumber && rawPolicyNumber !== "—" ? rawPolicyNumber : null;
        const fallbackPolicyKey = (() => {
          const dealId = selectedPolicyView?.raw?.id;
          if (typeof dealId === "number" && Number.isFinite(dealId)) return `deal:${dealId}`;
          return selectedPolicyKey ? `policy:${selectedPolicyKey}` : "policy:unknown";
        })();

        const policyKeyForSession = policyNumber ?? fallbackPolicyKey;

        const resp = await fetch("/api/verification-items", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            leadId: leadIdForVerification,
            dealId: dealIdForVerification,
            policyKey: policyKeyForSession,
            callCenter: selectedPolicyView?.callCenter ?? null,
            autofill: verificationAutofillByFieldName,
          }),
        });

        const json = (await resp.json().catch(() => null)) as
          | { ok: true; sessionId: string; items: Array<Record<string, unknown>> }
          | { ok: false; error: string }
          | null;

        if (!resp.ok || !json || ("ok" in json && json.ok === false)) {
          const errMsg = json && "error" in json ? json.error : `Failed to load verification items (status ${resp.status}).`;
          throw new Error(errMsg);
        }

        const sessionId = (json as { ok: true; sessionId: string }).sessionId;
        const items = (json as { ok: true; items: Array<Record<string, unknown>> }).items;

        if (cancelled) return;
        setVerificationSessionId(sessionId);
        const rows = (items ?? []) as Array<Record<string, unknown>>;
        setVerificationItems(rows);

        const map: Record<string, string> = {};
        for (const r of rows) {
          const id = typeof r["id"] === "string" ? (r["id"] as string) : null;
          if (!id) continue;
          const vv = typeof r["verified_value"] === "string" ? (r["verified_value"] as string) : null;
          const ov = typeof r["original_value"] === "string" ? (r["original_value"] as string) : null;
          const stored = (vv ?? ov ?? "").toString();
          if (stored.trim().length) {
            map[id] = stored;
            continue;
          }

          const fieldName = typeof r["field_name"] === "string" ? (r["field_name"] as string) : "";
          const autofill = fieldName ? verificationAutofillByFieldName[fieldName] : "";
          map[id] = (autofill ?? "").toString();
        }
        setVerificationInputValues(map);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Failed to load verification panel.";
        setVerificationError(msg);
        setVerificationSessionId(null);
        setVerificationItems([]);
        setVerificationInputValues({});
      } finally {
        if (!cancelled) setVerificationLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [lead, personalLead, selectedDeal, selectedPolicyKey, selectedPolicyView, verificationAutofillByFieldName]);

  const toggleVerificationItem = async (itemId: string, checked: boolean) => {
    setVerificationItems((prev) =>
      prev.map((r) => (r["id"] === itemId ? { ...r, is_verified: checked, verified_at: checked ? new Date().toISOString() : null } : r)),
    );

    const { error: updateErr } = await supabase
      .from("retention_verification_items")
      .update({ is_verified: checked, verified_at: checked ? new Date().toISOString() : null })
      .eq("id", itemId);

    if (updateErr) throw updateErr;
  };

  const openRetentionWorkflowModal = () => {
    setRetentionStep("select");
    setBankingSaveError(null);
    setRetentionModalOpen(true);
  };

  const startRetentionWorkflow = async () => {
    const leadId = typeof lead?.["id"] === "string" ? (lead["id"] as string) : null;
    if (!leadId) return;

    if (!retentionAgent || !retentionType) return;

    if (retentionType === "carrier_requirements") {
      setRetentionStep("carrier_alert");
      return;
    }

    if (retentionType === "fixed_payment") {
      setRetentionStep("banking_form");
      return;
    }

    // For now, route directly to call update for other retention types.
    const policyNumberForRoute = selectedPolicyView?.policyNumber ?? null;
    if (!policyNumberForRoute) return;
    setRetentionModalOpen(false);
    await router.push(
      `/agent/call-update?leadId=${encodeURIComponent(leadId)}&policyNumber=${encodeURIComponent(
        policyNumberForRoute,
      )}&retentionAgent=${encodeURIComponent(retentionAgent)}&retentionType=${encodeURIComponent(retentionType)}`,
    );
  };

  const goToCallUpdate = async () => {
    const leadId = typeof lead?.["id"] === "string" ? (lead["id"] as string) : null;
    if (!leadId) return;

    const policyNumberForRoute = selectedPolicyView?.policyNumber ?? null;
    if (!policyNumberForRoute) return;

    if (!retentionAgent || !retentionType) return;

    setRetentionModalOpen(false);
    await router.push(
      `/agent/call-update?leadId=${encodeURIComponent(leadId)}&policyNumber=${encodeURIComponent(
        policyNumberForRoute,
      )}&retentionAgent=${encodeURIComponent(retentionAgent)}&retentionType=${encodeURIComponent(retentionType)}`,
    );
  };

  const saveBankingInfoToMondayNotes = async () => {
    const policyNumberForSave = selectedPolicyView?.policyNumber ?? null;
    if (!policyNumberForSave) return;

    setBankingSaving(true);
    setBankingSaveError(null);

    try {
      const payload = {
        policy_status: bankingPolicyStatus,
        account_holder_name: bankingAccountHolderName,
        bank_name: bankingBankName,
        routing_number: bankingRoutingNumber,
        account_number: bankingAccountNumber,
        account_type: bankingAccountType,
        draft_date: bankingDraftDate,
      };

      const { data: dealRow, error: dealErr } = await supabase
        .from("monday_com_deals")
        .select("id, notes, last_updated, updated_at")
        .eq("policy_number", policyNumberForSave)
        .order("last_updated", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (dealErr) throw dealErr;
      if (!dealRow?.id) throw new Error("No monday_com_deals row found for this policy number.");

      const existingNotes = typeof dealRow.notes === "string" ? dealRow.notes : "";
      const stamp = new Date().toISOString();
      const block = `\n\n[Retention Banking Update ${stamp}]\n${JSON.stringify(payload)}`;
      const nextNotes = `${existingNotes ?? ""}${block}`.trim();

      const { error: updateErr } = await supabase
        .from("monday_com_deals")
        .update({ notes: nextNotes })
        .eq("id", dealRow.id);

      if (updateErr) throw updateErr;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save banking info.";
      setBankingSaveError(msg);
      throw e;
    } finally {
      setBankingSaving(false);
    }
  };

  const updateVerificationItemValue = async (itemId: string, value: string) => {
    setVerificationInputValues((prev) => ({ ...prev, [itemId]: value }));
    const item = verificationItems.find((r) => r["id"] === itemId) ?? null;
    const original = item && typeof item["original_value"] === "string" ? (item["original_value"] as string) : "";
    const isModified = original !== value;

    setVerificationItems((prev) =>
      prev.map((r) => (r["id"] === itemId ? { ...r, verified_value: value, is_modified: isModified } : r)),
    );

    const { error: updateErr } = await supabase
      .from("retention_verification_items")
      .update({ verified_value: value, is_modified: isModified })
      .eq("id", itemId);

    if (updateErr) throw updateErr;
  };

  const notesItems = useMemo(() => {
    const items: Array<{ source: string; date: string | null; text: string }> = [];

    const leadNotes = getString(lead, "notes");
    if (leadNotes) {
      items.push({
        source: "Lead",
        date: getString(lead, "updated_at") ?? getString(lead, "created_at"),
        text: leadNotes,
      });
    }

    for (const row of dailyFlowRows) {
      const note = pickRowValue(row, ["notes", "note", "lead_notes"]);
      const text = typeof note === "string" ? note.trim() : "";
      if (text.length) {
        const date = typeof row["date"] === "string" ? String(row["date"]) : null;
        items.push({ source: "Daily Deal Flow", date, text });
      }
    }

    for (const d of policyCards) {
      const text = typeof d.notes === "string" ? d.notes.trim() : "";
      if (text.length) {
        items.push({ source: "Monday.com", date: d.last_updated ?? d.updated_at ?? null, text });
      }
    }

    items.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return items;
  }, [dailyFlowRows, lead, policyCards]);

  return {
    router,
    idParam,
    selectedDeal,
    lead,
    personalLead,
    personalLeadLoading,
    mondayDeals,
    mondayLoading,
    mondayError,
    duplicateResult,
    duplicateLoading,
    duplicateError,
    dailyFlowRows,
    dailyFlowLoading,
    dailyFlowError,
    loading,
    error,
    canonicalLeadRecord,
    name,
    phone,
    email,
    policyNumber,
    carrier,
    productType,
    center,
    address1,
    city,
    state,
    zip,
    dob,
    ssnLast4,
    monthlyPremium,
    agent,
    personalLeadRecord,
    personalName,
    personalPhone,
    personalEmail,
    personalPolicyNumber,
    personalCarrier,
    personalProductType,
    personalCenter,
    personalAddress1,
    personalCity,
    personalState,
    personalZip,
    personalDob,
    personalSsnLast4,
    personalMonthlyPremium,
    personalAgent,
    personalAdditionalEntries,
    policyCards,
    policyViews,
    selectedPolicyKey,
    setSelectedPolicyKey,
    selectedPolicyView,
    verificationSessionId,
    verificationItems,
    verificationLoading,
    verificationError,
    verificationInputValues,
    toggleVerificationItem,
    updateVerificationItemValue,
    retentionModalOpen,
    setRetentionModalOpen,
    retentionAgent,
    setRetentionAgent,
    retentionAgentLocked,
    retentionType,
    setRetentionType,
    retentionAgentOptions: retentionAgentOptions
      .map((a) => a.display_name)
      .concat(
        retentionAgent && !retentionAgentOptions.some((a) => a.display_name === retentionAgent)
          ? [retentionAgent]
          : [],
      ),
    openRetentionWorkflowModal,
    startRetentionWorkflow,
    retentionStep,
    setRetentionStep,
    goToCallUpdate,
    bankingPolicyStatus,
    setBankingPolicyStatus,
    bankingAccountHolderName,
    setBankingAccountHolderName,
    bankingBankName,
    setBankingBankName,
    bankingRoutingNumber,
    setBankingRoutingNumber,
    bankingAccountNumber,
    setBankingAccountNumber,
    bankingAccountType,
    setBankingAccountType,
    bankingDraftDate,
    setBankingDraftDate,
    bankingSaving,
    bankingSaveError,
    saveBankingInfoToMondayNotes,
    notesItems,
  };
}
