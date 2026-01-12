"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";

import { supabase } from "@/lib/supabase";
import {
  findDuplicateLeadsFromMondayGhlNames,
  type DuplicateLeadFinderResult,
} from "@/lib/duplicate-leads";
import type { MondayComDeal } from "@/types";

export type LeadRecord = Record<string, unknown>;

export function normalizePhoneDigits(phone: string) {
  return phone.replace(/\D/g, "");
}

export function normalizeName(value: string | null | undefined) {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getNameSignature(value: string | null | undefined) {
  const normalized = normalizeName(value);
  if (!normalized) return "";
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "";
  const firstKey = first.slice(0, 3);
  const lastKey = last.slice(0, 3);
  return `${firstKey}|${lastKey}`;
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

function mergeLeadRecords(
  allLeads: LeadRecord[],
  preferredVendor: string | null,
): LeadRecord | null {
  if (!allLeads.length) return null;

  const normalizedPreferred = preferredVendor
    ? normalizeVendorForMatch(preferredVendor.trim())
    : null;

  let exactMatch: LeadRecord | null = null;
  const otherLeads: LeadRecord[] = [];

  for (const lead of allLeads) {
    const vendor = getString(lead, "lead_vendor");
    if (vendor && normalizedPreferred) {
      const normalized = normalizeVendorForMatch(vendor);
      if (normalized === normalizedPreferred) {
        if (!exactMatch) exactMatch = lead;
        continue;
      }
    }
    otherLeads.push(lead);
  }

  const primary = exactMatch ?? allLeads[0];
  if (!primary) return null;

  const fallbackSources = exactMatch ? otherLeads : allLeads.slice(1);

  const merged: LeadRecord = { ...primary };

  const fieldsToMerge = [
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
    "agent",
    "phone_number",
    "customer_full_name",
  ];

  for (const field of fieldsToMerge) {
    const primaryValue = getString(merged, field);
    if (!primaryValue || primaryValue === "-") {
      for (const fallback of fallbackSources) {
        const fallbackValue = getString(fallback, field);
        if (fallbackValue && fallbackValue !== "-") {
          merged[field] = fallbackValue;
          break;
        }
      }
    }
  }

  return merged;
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

  const rawDealId =
    typeof dealIdParam === "string" ? dealIdParam : Array.isArray(dealIdParam) ? dealIdParam[0] : undefined;
  const parsedDealId = rawDealId ? Number(rawDealId) : null;
  const dealId = parsedDealId != null && Number.isFinite(parsedDealId) ? parsedDealId : null;

  const [lead, setLead] = useState<LeadRecord | null>(null);
  const [personalLead, setPersonalLead] = useState<LeadRecord | null>(null);
  const [allPersonalLeads, setAllPersonalLeads] = useState<LeadRecord[]>([]);
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
  const hasAutoSelectedRef = useRef(false);

  const [verificationSessionId, setVerificationSessionId] = useState<string | null>(null);
  const [verificationItems, setVerificationItems] = useState<Array<Record<string, unknown>>>([]);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationInputValues, setVerificationInputValues] = useState<Record<string, string>>({});

  const [assignedDealIds, setAssignedDealIds] = useState<number[]>([]);
  const [navDealIdToPrimaryDealId, setNavDealIdToPrimaryDealId] = useState<Record<string, number>>({});
  const [assignedDealsLoading, setAssignedDealsLoading] = useState(false);


  useEffect(() => {
    if (!router.isReady) return;

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
                .eq("is_active", true)
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
  }, [router.isReady, dealIdParam, idParam, dealId]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!dealId) {
      setAssignedDealIds([]);
      setNavDealIdToPrimaryDealId({});
      setAssignedDealsLoading(false);
      return;
    }

    let cancelled = false;

    const loadAssignedDealsForAgent = async () => {
      try {
        let hasNavigationSeed = false;
        try {
          const raw = sessionStorage.getItem("assignedLeadsNavigationContext");
          if (raw) {
            const parsed = JSON.parse(raw) as {
              dealIds?: unknown;
              dealIdToPrimaryDealId?: unknown;
            };
            const dealIdsFromStorage = Array.isArray(parsed?.dealIds)
              ? (parsed.dealIds as unknown[]).filter((v): v is number => typeof v === "number" && Number.isFinite(v))
              : [];
            const mapFromStorage =
              parsed?.dealIdToPrimaryDealId && typeof parsed.dealIdToPrimaryDealId === "object"
                ? (parsed.dealIdToPrimaryDealId as Record<string, number>)
                : {};

            if (dealIdsFromStorage.length > 0) {
              if (!cancelled) {
                setAssignedDealIds(dealIdsFromStorage);
                setNavDealIdToPrimaryDealId(mapFromStorage);
                setAssignedDealsLoading(false);
              }
              hasNavigationSeed = true;
            }
          }
        } catch {
          // ignore
        }

        if (!hasNavigationSeed && !cancelled) {
          setAssignedDealsLoading(true);
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        if (!session?.user) {
          if (!cancelled) {
            setAssignedDealIds([]);
            setNavDealIdToPrimaryDealId({});
          }
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        const profileId = (profile?.id as string | null) ?? null;
        if (!profileId) {
          if (!cancelled) {
            setAssignedDealIds([]);
            setNavDealIdToPrimaryDealId({});
          }
          return;
        }

        const { data: rows, error: assignedError } = await supabase
          .from("retention_assigned_leads")
          .select("deal_id, assigned_at")
          .eq("assignee_profile_id", profileId)
          .eq("status", "active")
          .order("assigned_at", { ascending: false })
          .limit(5000);

        if (assignedError) throw assignedError;

        const dealIds = (rows ?? [])
          .map((r) => (typeof r?.deal_id === "number" ? (r.deal_id as number) : null))
          .filter((v): v is number => v != null);

        if (dealIds.length > 0) {
          const { data: dealRows, error: dealsError } = await supabase
            .from("monday_com_deals")
            .select("id, ghl_name, deal_name, phone_number")
            .in("id", dealIds)
            .limit(5000);

          if (dealsError) throw dealsError;

          const dealMap = new Map<number, { name: string; phone: string }>();
          for (const deal of (dealRows ?? []) as Array<{ id: number; ghl_name: string | null; deal_name: string | null; phone_number: string | null }>) {
            const rawName = deal.ghl_name ?? deal.deal_name ?? "";
            const nameSignature = getNameSignature(rawName);
            const phoneDigits = (deal.phone_number ?? "").replace(/\D/g, "").trim();
            dealMap.set(deal.id, { name: nameSignature, phone: phoneDigits });
          }

          // Filter to unique groups (phone + name signature), keeping first occurrence of each
          const seenGroups = new Set<string>();
          const uniqueDealIds: number[] = [];

          for (const id of dealIds) {
            const dealInfo = dealMap.get(id);
            if (!dealInfo) {
              uniqueDealIds.push(id);
              continue;
            }

            let groupKey: string;
            if (dealInfo.phone && dealInfo.name) {
              groupKey = `${dealInfo.phone}|${dealInfo.name}`;
            } else if (dealInfo.phone) {
              groupKey = `${dealInfo.phone}|${id}`;
            } else if (dealInfo.name) {
              groupKey = `name-${dealInfo.name}`;
            } else {
              groupKey = `row-${id}`;
            }

            if (!seenGroups.has(groupKey)) {
              seenGroups.add(groupKey);
              uniqueDealIds.push(id);
            }
          }

          if (!cancelled) setAssignedDealIds(uniqueDealIds);
        } else {
          if (!cancelled) {
            setAssignedDealIds([]);
            setNavDealIdToPrimaryDealId({});
          }
        }
      } catch (e) {
        console.error("[assigned-lead-details] load assigned deal ids error", e);
        if (!cancelled) {
          setAssignedDealIds([]);
          setNavDealIdToPrimaryDealId({});
        }
      } finally {
        if (!cancelled) setAssignedDealsLoading(false);
      }
    };

    void loadAssignedDealsForAgent();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, dealId]);

  const effectiveDealIdForNavigation = useMemo(() => {
    if (!dealId) return null;
    if (assignedDealIds.indexOf(dealId) >= 0) return dealId;
    const mapped = navDealIdToPrimaryDealId[String(dealId)];
    if (typeof mapped === "number" && Number.isFinite(mapped) && assignedDealIds.indexOf(mapped) >= 0) return mapped;
    return assignedDealIds[0] ?? null;
  }, [assignedDealIds, dealId, navDealIdToPrimaryDealId]);

  const currentAssignedIndex = useMemo(() => {
    if (!effectiveDealIdForNavigation) return -1;
    return assignedDealIds.indexOf(effectiveDealIdForNavigation);
  }, [assignedDealIds, effectiveDealIdForNavigation]);

  const previousAssignedDealId = useMemo(() => {
    if (currentAssignedIndex < 0) return null;
    return assignedDealIds[currentAssignedIndex - 1] ?? null;
  }, [assignedDealIds, currentAssignedIndex]);

  const nextAssignedDealId = useMemo(() => {
    if (currentAssignedIndex < 0) return null;
    return assignedDealIds[currentAssignedIndex + 1] ?? null;
  }, [assignedDealIds, currentAssignedIndex]);

  const goToPreviousAssignedLead = async () => {
    if (!previousAssignedDealId) return;
    await router.push(`/agent/assigned-lead-details?dealId=${encodeURIComponent(String(previousAssignedDealId))}`);
  };

  const goToNextAssignedLead = async () => {
    if (!nextAssignedDealId) return;
    await router.push(`/agent/assigned-lead-details?dealId=${encodeURIComponent(String(nextAssignedDealId))}`);
  };

  // Validate that dealId belongs to the current agent
  // This checks both direct assignment and related deals (for duplicate/grouped deals)
  // Only redirects if definitively unauthorized - allows page to load normally otherwise
  useEffect(() => {
    if (!router.isReady) return;
    if (!dealId) return;
    // Wait a bit for the assigned deals to load from the other effect
    if (assignedDealsLoading) return;
    
    let cancelled = false;
    let redirectTimeout: NodeJS.Timeout | null = null;
    
    const verifyAuthorization = async () => {
      try {
        // Get session and profile first (needed for all checks)
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user) {
          console.warn("[assigned-lead-details] Session check failed");
          if (!cancelled && !session?.user) {
            redirectTimeout = setTimeout(() => {
              void router.push("/agent/assigned-leads");
            }, 1500);
          }
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, display_name")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (profileError || !profile) {
          console.error("[assigned-lead-details] Profile lookup failed:", profileError);
          if (!cancelled && !profile) {
            redirectTimeout = setTimeout(() => {
              void router.push("/agent/assigned-leads");
            }, 1500);
          }
          return;
        }

        const agentName = typeof profile.display_name === "string" ? profile.display_name.trim() : null;
        
        if (!agentName) {
          console.error("[assigned-lead-details] Agent name not found in profile");
          // Continue with authorization check but skip handled check if no agent name
        }

        // Helper function to check if a deal has already been handled
        const checkIfHandled = async (checkDealId: number): Promise<boolean> => {
          if (!agentName) {
            return false; // Can't check if handled without agent name
          }
          
          try {
            // Get the deal's submission_id (monday_item_id)
            const { data: dealInfo } = await supabase
              .from("monday_com_deals")
              .select("monday_item_id")
              .eq("id", checkDealId)
              .maybeSingle();

            if (!dealInfo || typeof dealInfo.monday_item_id !== "string") {
              return false; // Can't determine if handled without submission_id
            }

            const submissionId = dealInfo.monday_item_id.trim();
            if (!submissionId) return false;

            // Check if this submission has already been handled by this agent
            const { data: handledEntry } = await supabase
              .from("retention_deal_flow")
              .select("id")
              .eq("submission_id", submissionId)
              .eq("retention_agent", agentName)
              .limit(1)
              .maybeSingle();

            return !!handledEntry;
          } catch {
            return false; // On error, assume not handled to allow access
          }
        };

        // First, check if dealId is in the already-loaded assignedDealIds (fast check)
        if (assignedDealIds.includes(dealId)) {
          // Check if it's already been handled
          const isHandled = await checkIfHandled(dealId);
          if (isHandled) {
            console.warn("[assigned-lead-details] Lead already handled - blocking access (fast path)", {
              dealId,
            });
            if (!cancelled) {
              setError("This lead has already been handled. You cannot access it again.");
              redirectTimeout = setTimeout(() => {
                void router.push("/agent/assigned-leads");
              }, 2000);
            }
            return;
          }
          console.log("[assigned-lead-details] Authorization verified via assignedDealIds for dealId:", dealId);
          return;
        }

        // Check if it's a mapped dealId (duplicate that maps to primary)
    const mapped = navDealIdToPrimaryDealId[String(dealId)];
        if (typeof mapped === "number" && Number.isFinite(mapped) && assignedDealIds.includes(mapped)) {
          // Check if the mapped (primary) deal has been handled
          const isHandled = await checkIfHandled(mapped);
          if (isHandled) {
            console.warn("[assigned-lead-details] Lead already handled - blocking access (mapped path)", {
              dealId,
              mappedDealId: mapped,
            });
            if (!cancelled) {
              setError("This lead has already been handled. You cannot access it again.");
              redirectTimeout = setTimeout(() => {
                void router.push("/agent/assigned-leads");
              }, 2000);
            }
            return;
          }
          console.log("[assigned-lead-details] Authorization verified via mapped dealId for dealId:", dealId);
          return;
        }

        // Check if this exact dealId is assigned
        const { data: assignment, error: assignmentError } = await supabase
          .from("retention_assigned_leads")
          .select("id")
          .eq("deal_id", dealId)
          .eq("assignee_profile_id", profile.id)
          .eq("status", "active")
          .maybeSingle();

        if (assignmentError) {
          console.error("[assigned-lead-details] Error checking assignment:", assignmentError);
          // Don't redirect on database errors - allow page to load
          return;
        }

        if (assignment) {
          // Deal is assigned - now check if it's already been handled
          const isHandled = await checkIfHandled(dealId);
          if (isHandled) {
            console.warn("[assigned-lead-details] Lead already handled - blocking access (direct DB check)", {
              dealId,
              profileId: profile.id
            });
            if (!cancelled) {
              setError("This lead has already been handled. You cannot access it again.");
              redirectTimeout = setTimeout(() => {
                void router.push("/agent/assigned-leads");
              }, 2000);
            }
            return;
          }

          console.log("[assigned-lead-details] Authorization verified via direct DB check for dealId:", dealId);
          return;
        }

        // Deal is not directly assigned - check if any related deals (same customer) are assigned
        // Get deal info to find related deals
        const { data: dealInfo } = await supabase
          .from("monday_com_deals")
          .select("phone_number, ghl_name, deal_name")
          .eq("id", dealId)
          .maybeSingle();

        if (dealInfo) {
          const phone = typeof dealInfo.phone_number === "string" ? dealInfo.phone_number.trim() : "";
          const ghlName = typeof dealInfo.ghl_name === "string" ? dealInfo.ghl_name.trim() : "";
          const dealName = typeof dealInfo.deal_name === "string" ? dealInfo.deal_name.trim() : "";

          // Check if any deal with same phone/name is assigned to this agent
          if (phone || ghlName || dealName) {
            const orParts: string[] = [];
            if (phone) orParts.push(`phone_number.eq.${phone}`);
            if (ghlName) orParts.push(`ghl_name.ilike.%${ghlName.replace(/,/g, "")}%`);
            if (dealName) orParts.push(`deal_name.ilike.%${dealName.replace(/,/g, "")}%`);

            if (orParts.length > 0) {
              const { data: relatedDeals } = await supabase
                .from("monday_com_deals")
                .select("id")
                .or(orParts.join(","))
                .limit(50);

              if (relatedDeals && relatedDeals.length > 0) {
                const relatedDealIds = relatedDeals
                  .map((d) => (typeof d.id === "number" ? d.id : null))
                  .filter((id): id is number => id !== null);

                if (relatedDealIds.length > 0) {
                  const { data: relatedAssignment } = await supabase
                    .from("retention_assigned_leads")
                    .select("id")
                    .in("deal_id", relatedDealIds)
                    .eq("assignee_profile_id", profile.id)
                    .eq("status", "active")
                    .limit(1)
                    .maybeSingle();

                  if (relatedAssignment) {
                    // Related deal is assigned - check if the original dealId has been handled
                    const isHandled = await checkIfHandled(dealId);
                    if (isHandled) {
                      console.warn("[assigned-lead-details] Lead already handled - blocking access (related deals path)", {
                        dealId,
                      });
                      if (!cancelled) {
                        setError("This lead has already been handled. You cannot access it again.");
                        redirectTimeout = setTimeout(() => {
                          void router.push("/agent/assigned-leads");
                        }, 2000);
                      }
                      return;
                    }
                    console.log("[assigned-lead-details] Authorization verified via related deal for dealId:", dealId);
                    return;
                  }
                }
              }
            }
          }
        }

        // No assignment found - unauthorized
        console.warn("[assigned-lead-details] Unauthorized access attempt - dealId not assigned to agent", {
          dealId,
          profileId: profile.id
        });
        if (!cancelled) {
          redirectTimeout = setTimeout(() => {
            void router.push("/agent/assigned-leads");
          }, 1500);
        }
      } catch (authError) {
        console.error("[assigned-lead-details] Error during authorization check:", authError);
        // Don't redirect on catch - allow page to try loading
      }
    };

    // Run authorization check
    void verifyAuthorization();

    return () => {
      cancelled = true;
      if (redirectTimeout) clearTimeout(redirectTimeout);
    };
  }, [dealId, router, assignedDealIds, assignedDealsLoading, navDealIdToPrimaryDealId]);

  // Handle mapping to primary deal ID (separate effect for navigation)
  useEffect(() => {
    if (!router.isReady) return;
    if (!dealId) return;
    if (assignedDealsLoading) return; // Wait for assigned deals to load for navigation mapping
    
    const mapped = navDealIdToPrimaryDealId[String(dealId)];
    if (mapped && typeof mapped === "number" && Number.isFinite(mapped)) {
    if (mapped === dealId) return;
    const query = { ...router.query, dealId: String(mapped) };
    void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    }
  }, [dealId, navDealIdToPrimaryDealId, router, assignedDealsLoading]);

  useEffect(() => {
    if (selectedDeal) {
      setPersonalLead(null);
      setAllPersonalLeads([]);
      setPersonalLeadLoading(false);
      setDuplicateResult(null);
      setDuplicateError(null);
      setDuplicateLoading(false);
      return;
    }

    if (!lead) {
      setPersonalLead(null);
      setAllPersonalLeads([]);
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
        const escaped = lookupName.replace(/,/g, "").trim();
        if (!escaped.length) {
          if (!cancelled) {
            setPersonalLead(null);
            setAllPersonalLeads([]);
          }
          return;
        }

        const q = supabase
          .from("leads")
          .select("*")
          .ilike("customer_full_name", `%${escaped}%`)
          .order("updated_at", { ascending: false })
          .order("submission_date", { ascending: false })
          .limit(50);

        const { data: byNameRows, error: byNameErr } = await q;
        if (byNameErr) throw byNameErr;

        const allLeads = (byNameRows ?? []) as LeadRecord[];
        const mergedLead = mergeLeadRecords(allLeads, leadVendor);

        if (!cancelled) {
          setAllPersonalLeads(allLeads);
          setPersonalLead(mergedLead);
        }
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
  const phone =
    getString(canonicalLeadRecord, "phone_number") ?? getString(dealFallback, "phone_number") ?? "-";
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

  const canonicalNameSignature = getNameSignature(name);
  const canonicalPhoneDigits = normalizePhoneDigits(
    getString(canonicalLeadRecord, "phone_number") ?? getString(dealFallback, "phone_number") ?? "",
  );
  const canonicalPhoneLast10 =
    canonicalPhoneDigits.length >= 10 ? canonicalPhoneDigits.slice(-10) : canonicalPhoneDigits;

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
      const at = Date.parse(a.deal_creation_date ?? "") || 0;
      const bt = Date.parse(b.deal_creation_date ?? "") || 0;
      return bt - at;
    });

    const filtered = unique.filter((deal) => {
      const key =
        (deal.monday_item_id && deal.monday_item_id.trim().length ? `item:${deal.monday_item_id.trim()}` : null) ??
        `id:${String(deal.id)}`;

      if (selectedPolicyKey && key === selectedPolicyKey) {
        return true;
      }

      if (!canonicalNameSignature && !canonicalPhoneLast10) {
        return true;
      }

      const dealNameSignature = getNameSignature(deal.ghl_name ?? deal.deal_name ?? "");
      const dealDigits = normalizePhoneDigits(deal.phone_number ?? "");
      const dealLast10 = dealDigits.length >= 10 ? dealDigits.slice(-10) : dealDigits;

      const matchesName =
        canonicalNameSignature && dealNameSignature ? canonicalNameSignature === dealNameSignature : true;
      const matchesPhone =
        canonicalPhoneLast10 && dealLast10 ? canonicalPhoneLast10 === dealLast10 : true;

      if (canonicalNameSignature && canonicalPhoneLast10) {
        return matchesName && matchesPhone;
      }
      if (canonicalNameSignature) {
        return matchesName;
      }
      if (canonicalPhoneLast10) {
        return matchesPhone;
      }
      return true;
    });

    return filtered;
  }, [duplicateResult, mondayDeals, canonicalNameSignature, canonicalPhoneLast10, selectedPolicyKey]);

  const setSelectedPolicyKeyOnly = useCallback((nextKey: string | null) => {
    setSelectedPolicyKey(nextKey);
  }, []);

  useEffect(() => {
    if (!policyCards || policyCards.length === 0) {
      hasAutoSelectedRef.current = false;
      if (selectedPolicyKey) setSelectedPolicyKey(null);
      return;
    }

    if (hasAutoSelectedRef.current && selectedPolicyKey) {
      return;
    }

    const chosen = policyCards[0];
    const key =
      (chosen.monday_item_id && chosen.monday_item_id.trim().length ? `item:${chosen.monday_item_id.trim()}` : null) ??
      `id:${String(chosen.id)}`;
    
    if (selectedPolicyKey !== key) {
      setSelectedPolicyKeyOnly(key);
      hasAutoSelectedRef.current = true;
    }
  }, [policyCards, selectedPolicyKey, setSelectedPolicyKeyOnly]);

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

  // State for fetched database data
  const [fetchedDealData, setFetchedDealData] = useState<MondayComDeal | null>(null);
  const [fetchedLeadData, setFetchedLeadData] = useState<LeadRecord | null>(null);
  const [fetchingData, setFetchingData] = useState(false);

  // Fetch complete data from database when policy is selected
  useEffect(() => {
    if (!selectedPolicyView) {
      setFetchedDealData(null);
      setFetchedLeadData(null);
      return;
    }

    let cancelled = false;
    const fetchData = async () => {
      setFetchingData(true);
      try {
        // Get deal ID from selected policy
        const dealId = selectedPolicyView?.raw?.id;
        const policyNumber = selectedPolicyView?.policyNumber;
        const leadId = (lead && typeof lead["id"] === "string" ? (lead["id"] as string) : null) ??
          (personalLead && typeof personalLead["id"] === "string" ? (personalLead["id"] as string) : null);

        // Fetch deal data from monday_com_deals
        let dealData: MondayComDeal | null = null;
        
        if (dealId && typeof dealId === "number" && Number.isFinite(dealId)) {
          const { data, error: dealError } = await supabase
            .from("monday_com_deals")
            .select("*")
            .eq("id", dealId)
            .maybeSingle();

          if (!cancelled && !dealError && data) {
            dealData = data as MondayComDeal;
            setFetchedDealData(dealData);
          }
        } else if (policyNumber && policyNumber !== "—") {
          // Try to find by policy number
          const { data, error: dealError } = await supabase
            .from("monday_com_deals")
            .select("*")
            .eq("policy_number", policyNumber)
            .eq("is_active", true)
            .order("last_updated", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!cancelled && !dealError && data) {
            dealData = data as MondayComDeal;
            setFetchedDealData(dealData);
          }
        }

        // Fetch lead data - try multiple methods
        let leadData: LeadRecord | null = null;

        // Method 1: Direct lead ID
        if (leadId && leadId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)) {
          const { data, error: leadError } = await supabase
            .from("leads")
            .select("*")
            .eq("id", leadId)
            .maybeSingle();

          if (!cancelled && !leadError && data) {
            leadData = data as LeadRecord;
          }
        }

        // Method 2: If we have deal data, try to find lead by submission_id (monday_item_id)
        if (!leadData && dealData && typeof dealData.monday_item_id === "string" && dealData.monday_item_id.trim()) {
          const { data, error: submissionError } = await supabase
            .from("leads")
            .select("*")
            .eq("submission_id", dealData.monday_item_id.trim())
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!cancelled && !submissionError && data) {
            leadData = data as LeadRecord;
          }
        }

        // Method 3: Try to find lead by phone number from deal
        if (!leadData && dealData && typeof dealData.phone_number === "string" && dealData.phone_number.trim()) {
          const phone = dealData.phone_number.trim();
          const normalizedPhone = phone.replace(/\D/g, "");
          
          if (normalizedPhone.length >= 10) {
            // Extract last 10 digits for matching
            const last10 = normalizedPhone.slice(-10);
            
            // Try multiple phone number formats
            const phonePatterns = [
              last10, // Last 10 digits
              `1${last10}`, // With country code
              `+1${last10}`, // With + country code
              phone, // Original format
            ];

            // Try each pattern
            for (const pattern of phonePatterns) {
              if (cancelled) break;
              
              const { data, error: phoneError } = await supabase
                .from("leads")
                .select("*")
                .or(`phone_number.ilike.%${pattern}%,phone_number.ilike.%${last10}%`)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!phoneError && data) {
                leadData = data as LeadRecord;
                break; // Found a match, stop searching
              }
            }
          }
        }

        // Note: leads table doesn't have policy_number column, so we skip this method

        if (!cancelled && leadData) {
          console.log("[assigned-lead-details] Found lead data for verification:", {
            leadId: leadData.id,
            hasStreetAddress: !!getString(leadData, "street_address"),
            hasDateOfBirth: !!getString(leadData, "date_of_birth"),
            hasAge: !!getString(leadData, "age"),
          });
          setFetchedLeadData(leadData);
        } else if (!cancelled) {
          console.log("[assigned-lead-details] No lead data found for verification panel", {
            dealId,
            policyNumber,
            leadId,
            hasDealData: !!dealData,
            dealPhoneNumber: dealData?.phone_number,
            dealSubmissionId: dealData?.monday_item_id,
          });
        }
      } catch (e) {
        console.error("[assigned-lead-details] Error fetching data for verification:", e);
      } finally {
        if (!cancelled) {
          setFetchingData(false);
        }
      }
    };

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [selectedPolicyView, lead, personalLead]);

  const verificationAutofillByFieldName = useMemo(() => {
    // Prefer fetched database data over cached data
    const monday = fetchedDealData ?? selectedPolicyView?.raw ?? null;
    const leadRecord = fetchedLeadData ?? canonicalLeadRecord;
    const map: Record<string, string> = {};

    const fromLead = (key: string) => getString(leadRecord, key) ?? "";
    const fromMonday = (key: keyof MondayComDeal) => {
      const v = monday ? (monday[key] as unknown) : null;
      return v == null ? "" : String(v);
    };

    // Helper to get value from related deals (mondayDeals) when current deal has null/empty value
    const fromRelatedDeals = (key: keyof MondayComDeal, currentValue: string): string => {
      if (currentValue && currentValue.trim().length > 0) {
        return currentValue; // Already has value, don't override
      }
      
      // Look through related deals (mondayDeals) to find a non-null value
      if (mondayDeals && mondayDeals.length > 0) {
        for (const relatedDeal of mondayDeals) {
          // Skip the current deal
          if (monday && relatedDeal.id === monday.id) {
            continue;
          }
          
          const value = relatedDeal[key];
          if (value != null) {
            const strValue = typeof value === "number" ? String(value) : String(value);
            if (strValue.trim().length > 0) {
              return strValue;
            }
          }
        }
      }
      
      return "";
    };

    // Helper to get value from related leads when current lead has null/empty value
    const fromRelatedLeads = (key: string, currentValue: string): string => {
      if (currentValue && currentValue.trim().length > 0) {
        return currentValue; // Already has value, don't override
      }
      
      // Look through all personal leads to find a non-null value
      if (allPersonalLeads && allPersonalLeads.length > 0) {
        for (const relatedLead of allPersonalLeads) {
          // Skip the current lead
          if (leadRecord && typeof leadRecord.id === "string" && typeof relatedLead.id === "string" && relatedLead.id === leadRecord.id) {
            continue;
          }
          
          const value = getString(relatedLead, key);
          if (value && value.trim().length > 0) {
            return value;
          }
        }
      }
      
      return "";
    };

    map["lead_vendor"] = fromLead("lead_vendor") || fromMonday("call_center");
    map["customer_full_name"] = fromLead("customer_full_name") || fromMonday("ghl_name") || fromMonday("deal_name");
    // Fill from related deals if current is empty
    if (!map["customer_full_name"] || !map["customer_full_name"].trim()) {
      map["customer_full_name"] = fromRelatedDeals("ghl_name", map["customer_full_name"]) || 
                                  fromRelatedDeals("deal_name", map["customer_full_name"]);
    }
    
    map["street_address"] = fromLead("street_address");
    map["street_address"] = fromRelatedLeads("street_address", map["street_address"]);
    
    map["beneficiary_information"] = fromLead("beneficiary_information");
    map["beneficiary_information"] = fromRelatedLeads("beneficiary_information", map["beneficiary_information"]);
    
    map["billing_and_mailing_address_is_the_same"] = fromLead("billing_and_mailing_address_is_the_same");
    map["billing_and_mailing_address_is_the_same"] = fromRelatedLeads("billing_and_mailing_address_is_the_same", map["billing_and_mailing_address_is_the_same"]);
    
    map["date_of_birth"] = fromLead("date_of_birth");
    map["date_of_birth"] = fromRelatedLeads("date_of_birth", map["date_of_birth"]);
    
    map["age"] = fromLead("age");
    map["age"] = fromRelatedLeads("age", map["age"]);
    
    map["phone_number"] = fromLead("phone_number") || fromMonday("phone_number");
    map["phone_number"] = fromRelatedDeals("phone_number", map["phone_number"]) || fromRelatedLeads("phone_number", map["phone_number"]);
    
    map["social_security"] = fromLead("social_security");
    map["social_security"] = fromRelatedLeads("social_security", map["social_security"]);
    
    map["driver_license"] = fromLead("driver_license");
    map["driver_license"] = fromRelatedLeads("driver_license", map["driver_license"]);
    
    map["exp"] = fromLead("exp");
    map["exp"] = fromRelatedLeads("exp", map["exp"]);
    
    map["existing_coverage"] = fromLead("existing_coverage");
    map["existing_coverage"] = fromRelatedLeads("existing_coverage", map["existing_coverage"]);
    
    map["applied_to_life_insurance_last_two_years"] = fromLead("applied_to_life_insurance_last_two_years");
    map["applied_to_life_insurance_last_two_years"] = fromRelatedLeads("applied_to_life_insurance_last_two_years", map["applied_to_life_insurance_last_two_years"]);
    
    map["height"] = fromLead("height");
    map["height"] = fromRelatedLeads("height", map["height"]);
    
    map["weight"] = fromLead("weight");
    map["weight"] = fromRelatedLeads("weight", map["weight"]);
    
    map["doctors_name"] = fromLead("doctors_name");
    map["doctors_name"] = fromRelatedLeads("doctors_name", map["doctors_name"]);
    
    map["tobacco_use"] = fromLead("tobacco_use");
    map["tobacco_use"] = fromRelatedLeads("tobacco_use", map["tobacco_use"]);
    
    map["health_conditions"] = fromLead("health_conditions");
    map["health_conditions"] = fromRelatedLeads("health_conditions", map["health_conditions"]);
    
    map["medications"] = fromLead("medications");
    map["medications"] = fromRelatedLeads("medications", map["medications"]);
    
    map["insurance_application_details"] = fromLead("insurance_application_details");
    map["insurance_application_details"] = fromRelatedLeads("insurance_application_details", map["insurance_application_details"]);

    map["carrier"] = fromLead("carrier") || fromMonday("carrier");
    map["carrier"] = fromRelatedDeals("carrier", map["carrier"]) || fromRelatedLeads("carrier", map["carrier"]);
    
    map["policy_number"] = selectedPolicyView?.policyNumber || fromMonday("policy_number") || fromLead("policy_number") || "";
    map["policy_number"] = fromRelatedDeals("policy_number", map["policy_number"]) || fromRelatedLeads("policy_number", map["policy_number"]);
    
    map["product_type"] = fromMonday("policy_type") || fromLead("product_type") || "";
    map["product_type"] = fromRelatedDeals("policy_type", map["product_type"]) || fromRelatedLeads("product_type", map["product_type"]);
    
    map["agent"] = selectedPolicyView?.agentName || fromMonday("sales_agent") || fromLead("agent") || "";
    map["agent"] = fromRelatedDeals("sales_agent", map["agent"]) || fromRelatedLeads("agent", map["agent"]);
    
    // Prefer values from the selected policy (selectedPolicyView) first, then Monday.com deal data, then lead-level data
    // This ensures we use the correct policy-specific values, not values from other policies
    // IMPORTANT: For monthly_premium, we need to match what the policy card displays.
    // The policy card shows selectedPolicyView.monthlyPremium, which is calculated as:
    // - If daily_deal_flow exists: use ddf.monthly_premium
    // - Else: use deal.deal_value
    // So we should use the same logic to ensure consistency between policy card and verification panel.
    let monthlyPremiumValue = "";
    
    // Priority 1: Use selectedPolicyView.monthlyPremium (this is what the policy card displays)
    // This ensures the verification panel matches what's shown in the policy card
    if (selectedPolicyView?.monthlyPremium != null) {
      monthlyPremiumValue = String(selectedPolicyView.monthlyPremium);
      console.log("[verification-autofill] Using monthly_premium from selectedPolicyView.monthlyPremium (policy card value):", monthlyPremiumValue);
    }
    // Priority 2: Use deal_value from fetchedDealData (most reliable, directly from DB)
    else if (fetchedDealData && typeof fetchedDealData.deal_value === "number") {
      monthlyPremiumValue = String(fetchedDealData.deal_value);
      console.log("[verification-autofill] Using monthly_premium from fetchedDealData.deal_value:", monthlyPremiumValue);
    }
    // Priority 3: Use deal_value from selectedPolicyView.raw (the deal object - this is the selected deal)
    else if (selectedPolicyView?.raw && typeof selectedPolicyView.raw.deal_value === "number") {
      monthlyPremiumValue = String(selectedPolicyView.raw.deal_value);
      console.log("[verification-autofill] Using monthly_premium from selectedPolicyView.raw.deal_value:", monthlyPremiumValue);
    }
    // Priority 4: Use deal_value from monday (fallback)
    else if (monday && typeof monday.deal_value === "number") {
      monthlyPremiumValue = String(monday.deal_value);
      console.log("[verification-autofill] Using monthly_premium from monday.deal_value:", monthlyPremiumValue);
    }
    // Priority 5: Check lead data
    else {
      monthlyPremiumValue = fromLead("monthly_premium") || "";
      console.log("[verification-autofill] Using monthly_premium from lead:", monthlyPremiumValue || "empty");
    }
    
    // IMPORTANT: Do NOT use fromRelatedDeals for monthly_premium - each deal has its own monthly premium
    // Only use related leads if we have absolutely no value for this specific deal
    map["monthly_premium"] = monthlyPremiumValue || fromRelatedLeads("monthly_premium", monthlyPremiumValue);
    
    // IMPORTANT: For coverage_amount, we need to match what the policy card displays.
    // The policy card shows selectedPolicyView.coverage, which is calculated from daily_deal_flow or deal.cc_value.
    // So we should use the same logic to ensure consistency between policy card and verification panel.
    let coverageAmountValue = "";
    
    // Priority 1: Use selectedPolicyView.coverage (this is what the policy card displays)
    // This ensures the verification panel matches what's shown in the policy card
    if (selectedPolicyView?.coverage != null) {
      coverageAmountValue = String(selectedPolicyView.coverage);
      console.log("[verification-autofill] Using coverage_amount from selectedPolicyView.coverage (policy card value):", coverageAmountValue);
    }
    // Priority 2: Use cc_value from fetchedDealData (most reliable, directly from DB)
    else if (fetchedDealData && typeof fetchedDealData.cc_value === "number") {
      coverageAmountValue = String(fetchedDealData.cc_value);
      console.log("[verification-autofill] Using coverage_amount from fetchedDealData.cc_value:", coverageAmountValue);
    }
    // Priority 3: Use cc_value from selectedPolicyView.raw (the deal object)
    else if (selectedPolicyView?.raw && typeof selectedPolicyView.raw.cc_value === "number") {
      coverageAmountValue = String(selectedPolicyView.raw.cc_value);
      console.log("[verification-autofill] Using coverage_amount from selectedPolicyView.raw.cc_value:", coverageAmountValue);
    }
    // Priority 4: Use cc_value from monday (fallback)
    else if (monday && typeof monday.cc_value === "number") {
      coverageAmountValue = String(monday.cc_value);
      console.log("[verification-autofill] Using coverage_amount from monday.cc_value:", coverageAmountValue);
    }
    // Priority 5: Check lead data
    else {
      coverageAmountValue = fromLead("coverage_amount") || "";
      console.log("[verification-autofill] Using coverage_amount from lead:", coverageAmountValue || "empty");
    }
    
    // IMPORTANT: Do NOT use fromRelatedDeals for coverage_amount - each deal has its own coverage
    // Only use related leads if we have absolutely no value for this specific deal
    map["coverage_amount"] = coverageAmountValue || fromRelatedLeads("coverage_amount", coverageAmountValue);
    
    map["draft_date"] =
      (selectedPolicyView?.initialDraftDate != null ? String(selectedPolicyView.initialDraftDate) : "") ||
      fromLead("draft_date") ||
      "";
    map["draft_date"] = fromRelatedLeads("draft_date", map["draft_date"]);
    
    map["first_draft"] = fromLead("first_draft");
    map["first_draft"] = fromRelatedLeads("first_draft", map["first_draft"]);
    
    map["institution_name"] = fromLead("institution_name");
    map["institution_name"] = fromRelatedLeads("institution_name", map["institution_name"]);
    
    map["beneficiary_routing"] = fromLead("beneficiary_routing");
    map["beneficiary_routing"] = fromRelatedLeads("beneficiary_routing", map["beneficiary_routing"]);
    
    map["beneficiary_account"] = fromLead("beneficiary_account");
    map["beneficiary_account"] = fromRelatedLeads("beneficiary_account", map["beneficiary_account"]);
    
    map["account_type"] = fromLead("account_type");
    map["account_type"] = fromRelatedLeads("account_type", map["account_type"]);

    map["city"] = fromLead("city");
    map["city"] = fromRelatedLeads("city", map["city"]);
    
    map["state"] = fromLead("state");
    map["state"] = fromRelatedLeads("state", map["state"]);
    
    map["zip_code"] = fromLead("zip_code");
    map["zip_code"] = fromRelatedLeads("zip_code", map["zip_code"]);
    
    map["birth_state"] = fromLead("birth_state");
    map["birth_state"] = fromRelatedLeads("birth_state", map["birth_state"]);
    
    map["call_phone_landline"] = fromLead("call_phone_landline");
    map["call_phone_landline"] = fromRelatedLeads("call_phone_landline", map["call_phone_landline"]);
    
    map["additional_notes"] = fromLead("additional_notes") || getString(lead, "notes") || "";
    map["additional_notes"] = fromRelatedLeads("additional_notes", map["additional_notes"]) || fromRelatedLeads("notes", map["additional_notes"]);

    return map;
  }, [canonicalLeadRecord, lead, selectedPolicyView, fetchedDealData, fetchedLeadData, mondayDeals, allPersonalLeads]);

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

        const autofillData = verificationAutofillByFieldName;
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
            autofill: autofillData,
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
          const fieldName = typeof r["field_name"] === "string" ? (r["field_name"] as string) : "";
          const vv = typeof r["verified_value"] === "string" ? (r["verified_value"] as string) : null;
          const ov = typeof r["original_value"] === "string" ? (r["original_value"] as string) : null;
          
          // For monthly_premium and coverage_amount, always prefer our autofill value over original_value from database
          // because these values should match what the policy card displays, which comes from selectedPolicyView
          // The original_value might come from daily_deal_flow which could be from a different entry or outdated
          if (fieldName === "monthly_premium" || fieldName === "coverage_amount") {
            const autofill = verificationAutofillByFieldName[fieldName] || "";
            if (autofill && autofill.trim().length > 0) {
              map[id] = autofill;
              continue;
            }
          }
          
          const stored = (vv ?? ov ?? "").toString();
          if (stored.trim().length) {
            map[id] = stored;
            continue;
          }

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
    const currentValue = verificationInputValues[itemId] ?? "";
    const item = verificationItems.find((r) => r["id"] === itemId) ?? null;
    const original = item && typeof item["original_value"] === "string" ? (item["original_value"] as string) : "";
    const isModified = original !== currentValue;

    setVerificationItems((prev) =>
      prev.map((r) => (r["id"] === itemId ? { ...r, is_verified: checked, verified_at: checked ? new Date().toISOString() : null, verified_value: currentValue, is_modified: isModified } : r)),
    );

    const { error: updateErr } = await supabase
      .from("retention_verification_items")
      .update({ 
        is_verified: checked, 
        verified_at: checked ? new Date().toISOString() : null,
        verified_value: currentValue,
        is_modified: isModified
      })
      .eq("id", itemId);

    if (updateErr) throw updateErr;
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
    dealId,
    selectedDeal,
    lead,
    personalLead,
    allPersonalLeads,
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
    setSelectedPolicyKey: setSelectedPolicyKeyOnly,
    selectedPolicyView,
    verificationSessionId,
    verificationItems,
    verificationLoading,
    verificationError,
    verificationInputValues,
    toggleVerificationItem,
    updateVerificationItemValue,
    assignedDealsLoading,
    previousAssignedDealId,
    nextAssignedDealId,
    goToPreviousAssignedLead,
    goToNextAssignedLead,
    notesItems,
  };
}
