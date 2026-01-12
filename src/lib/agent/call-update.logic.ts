"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import { supabase } from "@/lib/supabase";
import {
  formatValue,
  titleizeKey,
  type LeadRecord,
  getString,
} from "@/lib/agent/assigned-lead-details.logic";

import type { MondayComDeal } from "@/types";

type RetentionType = "new_sale" | "fixed_payment" | "carrier_requirements";

type RetentionDealFlowRow = {
  id: string;
  submission_id: string;
  client_phone_number: string | null;
  lead_vendor: string | null;
  date?: string | null;
  insured_name: string | null;
  buffer_agent: string | null;
  agent: string | null;
  licensed_agent_account: string | null;
  status: string | null;
  call_result: string | null;
  carrier: string | null;
  product_type: string | null;
  draft_date: string | null;
  monthly_premium: number | null;
  face_amount: number | null;
  from_callback: boolean | null;
  is_retention_call: boolean | null;
  notes: string | null;
  policy_number: string | null;
  retention_agent: string | null;
  retention_agent_id: string | null;
};

type RetentionVerificationSessionRow = Record<string, unknown>;

type ProfileOption = {
  id: string;
  display_name: string;
};

type CenterOption = {
  id: string;
  center_name: string | null;
  lead_vendor: string | null;
};

type CarrierOption = {
  id: string;
  carrier_name: string | null;
  is_active: boolean | null;
  display_order?: number | null;
};

export function useCallUpdate() {
  const router = useRouter();

  const leadId = typeof router.query.leadId === "string" ? router.query.leadId : undefined;
  const policyNumber = typeof router.query.policyNumber === "string" ? router.query.policyNumber : undefined;
  const dealId = (() => {
    const raw = typeof router.query.dealId === "string" ? router.query.dealId : undefined;
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  })();
  const callCenterFromRoute = typeof router.query.callCenter === "string" ? router.query.callCenter : "";
  const retentionAgent = typeof router.query.retentionAgent === "string" ? router.query.retentionAgent : "";
  const retentionType = (typeof router.query.retentionType === "string" ? router.query.retentionType : "") as
    | RetentionType
    | "";

  const [lead, setLead] = useState<LeadRecord | null>(null);
  const [loadingLead, setLoadingLead] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);

  const [verificationSessionId, setVerificationSessionId] = useState<string | null>(null);
  const [verificationSession, setVerificationSession] = useState<RetentionVerificationSessionRow | null>(null);
  const [verificationItems, setVerificationItems] = useState<Array<Record<string, unknown>>>([]);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationInputValues, setVerificationInputValues] = useState<Record<string, string>>({});

  const [policyDeal, setPolicyDeal] = useState<MondayComDeal | null>(null);
  const [policyDealLoading, setPolicyDealLoading] = useState(false);
  const [policyDealError, setPolicyDealError] = useState<string | null>(null);

  const submissionIdFromDeal = useMemo(() => {
    const raw = policyDeal && typeof policyDeal.monday_item_id === "string" ? policyDeal.monday_item_id.trim() : "";
    return raw.length ? raw : null;
  }, [policyDeal]);

  const leadVendorForInsert = useMemo(() => {
    return (
      (typeof policyDeal?.call_center === "string" ? policyDeal.call_center : null) ??
      (getString(verificationSession, "call_center") ?? null) ??
      getString(lead, "lead_vendor")
    );
  }, [lead, policyDeal?.call_center, verificationSession]);

  const [dealFlowRow, setDealFlowRow] = useState<RetentionDealFlowRow | null>(null);
  const [dealFlowLoading, setDealFlowLoading] = useState(false);
  const [dealFlowError, setDealFlowError] = useState<string | null>(null);

  const [agentOptions, setAgentOptions] = useState<ProfileOption[]>([]);
  const [agentOptionsLoading, setAgentOptionsLoading] = useState(false);
  const [agentOptionsError, setAgentOptionsError] = useState<string | null>(null);

  const [centerOptions, setCenterOptions] = useState<CenterOption[]>([]);
  const [centerOptionsLoading, setCenterOptionsLoading] = useState(false);
  const [centerOptionsError, setCenterOptionsError] = useState<string | null>(null);

  const [carrierOptions, setCarrierOptions] = useState<CarrierOption[]>([]);
  const [carrierOptionsLoading, setCarrierOptionsLoading] = useState(false);
  const [carrierOptionsError, setCarrierOptionsError] = useState<string | null>(null);

  const [dealFlowColumns, setDealFlowColumns] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const loadColumns = async () => {
      try {
        const { data, error } = await supabase
          .from("information_schema.columns")
          .select("column_name")
          .eq("table_schema", "public")
          .eq("table_name", "daily_deal_flow");

        if (error) throw error;
        if (cancelled) return;
        const cols = new Set<string>();
        for (const r of (data ?? []) as Array<Record<string, unknown>>) {
          const name = typeof r["column_name"] === "string" ? (r["column_name"] as string) : null;
          if (name) cols.add(name);
        }
        setDealFlowColumns(cols);
      } catch {
        if (!cancelled) setDealFlowColumns(new Set());
      }
    };

    void loadColumns();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!router.isReady) return;

    let cancelled = false;

    const loadAgents = async () => {
      setAgentOptionsLoading(true);
      setAgentOptionsError(null);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, display_name")
          .not("display_name", "is", null)
          .order("display_name", { ascending: true, nullsFirst: false });

        if (error) throw error;
        if (cancelled) return;
        const rows = (data ?? []) as Array<Record<string, unknown>>;
        const next: ProfileOption[] = [];
        for (const r of rows) {
          const id = typeof r["id"] === "string" ? (r["id"] as string) : null;
          const dn = typeof r["display_name"] === "string" ? (r["display_name"] as string) : null;
          if (!id || !dn || !dn.trim().length) continue;
          next.push({ id, display_name: dn });
        }
        setAgentOptions(next);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to load agents.";
          setAgentOptionsError(msg);
          setAgentOptions([]);
        }
      } finally {
        if (!cancelled) setAgentOptionsLoading(false);
      }
    };

    void loadAgents();
    return () => {
      cancelled = true;
    };
  }, [router.isReady]);

  useEffect(() => {
    if (!router.isReady) return;

    let cancelled = false;

    const loadCarriers = async () => {
      setCarrierOptionsLoading(true);
      setCarrierOptionsError(null);
      try {
        const { data, error } = await supabase
          .from("carriers")
          .select("id, carrier_name, is_active, display_order")
          .eq("is_active", true)
          .order("display_order", { ascending: true, nullsFirst: false })
          .order("carrier_name", { ascending: true, nullsFirst: false });

        if (error) throw error;
        if (cancelled) return;
        setCarrierOptions((data ?? []) as CarrierOption[]);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to load carriers.";
          setCarrierOptionsError(msg);
          setCarrierOptions([]);
        }
      } finally {
        if (!cancelled) setCarrierOptionsLoading(false);
      }
    };

    void loadCarriers();
    return () => {
      cancelled = true;
    };
  }, [router.isReady]);

  useEffect(() => {
    if (!router.isReady) return;

    let cancelled = false;

    const loadCenters = async () => {
      setCenterOptionsLoading(true);
      setCenterOptionsError(null);
      try {
        let query = supabase
          .from("centers")
          .select("id, center_name, lead_vendor")
          .limit(1000);

        query = query
          .order("center_name", { ascending: true, nullsFirst: false })
          .order("lead_vendor", { ascending: true, nullsFirst: false });

        const { data, error } = await query;

        if (error) throw error;
        if (cancelled) return;

        const rows = (data ?? []) as Array<Record<string, unknown>>;
        const map = new Map<string, CenterOption>();
        for (const r of rows) {
          const id = typeof r["id"] === "string" ? (r["id"] as string) : null;
          const centerName = typeof r["center_name"] === "string" ? (r["center_name"] as string) : null;
          const leadVendorRaw = typeof r["lead_vendor"] === "string" ? (r["lead_vendor"] as string) : null;
          if (!id) continue;
          const key = (leadVendorRaw ?? "").trim();
          if (!key.length) continue;
          if (!map.has(key)) {
            map.set(key, { id, center_name: centerName, lead_vendor: key });
          }
        }
        setCenterOptions(Array.from(map.values()));
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to load centers.";
          setCenterOptionsError(msg);
          setCenterOptions([]);
        }
      } finally {
        if (!cancelled) setCenterOptionsLoading(false);
      }
    };

    void loadCenters();
    return () => {
      cancelled = true;
    };
  }, [router.isReady]);

  const hasDealFlowColumn = useMemo(() => {
    return (col: string) => dealFlowColumns.has(col);
  }, [dealFlowColumns]);

  const sanitizeDealFlowPatch = useMemo(() => {
    return (patch: Record<string, unknown>) => {
      if (dealFlowColumns.size === 0) {
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch)) {
          if (k === "id") continue;
          cleaned[k] = v;
        }
        return cleaned;
      }

      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (k === "id") continue;
        if (!dealFlowColumns.has(k)) continue;
        cleaned[k] = v;
      }
      return cleaned;
    };
  }, [dealFlowColumns]);

  useEffect(() => {
    if (!router.isReady) return;

    if (!leadId && dealId == null) {
      setLead(null);
      setLeadError("Missing leadId in URL.");
      return;
    }

    let cancelled = false;

    const loadLead = async () => {
      setLoadingLead(true);
      setLeadError(null);
      try {
        // Prefer deriving the lead from the selected deal when dealId is present.
        // This avoids mixing policy context (dealId/policyNumber/callCenter) with a stale leadId.
        if (dealId != null && submissionIdFromDeal) {
          const { data, error } = await supabase
            .from("leads")
            .select("*")
            .eq("submission_id", submissionIdFromDeal)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) throw error;
          if (!cancelled) setLead((data ?? null) as LeadRecord | null);
          return;
        }

        if (!leadId) {
          if (!cancelled) {
            setLead(null);
            setLeadError("Missing leadId in URL.");
          }
          return;
        }

        const { data, error } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();

        if (error) throw error;
        const leadData = (data ?? null) as LeadRecord | null;
        
        if (!cancelled) setLead(leadData);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to load lead.";
          setLeadError(msg);
          setLead(null);
        }
      } finally {
        if (!cancelled) setLoadingLead(false);
      }
    };

    void loadLead();
    return () => {
      cancelled = true;
    };
  }, [dealId, leadId, router.isReady, submissionIdFromDeal]);

  useEffect(() => {
    if (!lead || typeof lead["id"] !== "string") {
      setVerificationSessionId(null);
      setVerificationSession(null);
      setVerificationItems([]);
      setVerificationLoading(false);
      setVerificationError(null);
      setVerificationInputValues({});
      return;
    }

    if (!policyNumber || !policyNumber.trim().length) {
      setVerificationSessionId(null);
      setVerificationItems([]);
      setVerificationLoading(false);
      setVerificationError("Missing policy number.");
      setVerificationInputValues({});
      return;
    }

    let cancelled = false;

    const run = async () => {
      setVerificationLoading(true);
      setVerificationError(null);
      try {
        const leadIdLocal = lead["id"] as string;
        const callCenterParam = callCenterFromRoute.trim().length ? callCenterFromRoute.trim() : getString(lead, "lead_vendor");

        const { data: sessionRow, error: sessionErr } = await supabase.rpc(
          "retention_get_or_create_verification_session",
          {
            lead_id_param: leadIdLocal,
            policy_number_param: policyNumber,
            call_center_param: callCenterParam,
          },
        );

        if (sessionErr) throw sessionErr;
        const session = sessionRow as unknown as Record<string, unknown> | null;
        const sessionId = session && typeof session["id"] === "string" ? (session["id"] as string) : null;
        if (!sessionId) throw new Error("Failed to create or load verification session.");

        const { data: sessionDbRow, error: sessionDbErr } = await supabase
          .from("retention_verification_sessions")
          .select("*")
          .eq("id", sessionId)
          .maybeSingle();

        if (sessionDbErr) throw sessionDbErr;

        const { data: itemsRows, error: itemsErr } = await supabase
          .from("retention_verification_items")
          .select("*")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true });

        if (itemsErr) throw itemsErr;

        if (cancelled) return;

        const rows = (itemsRows ?? []) as Array<Record<string, unknown>>;
        
        setVerificationSessionId(sessionId);
        setVerificationSession(((sessionDbRow ?? null) as RetentionVerificationSessionRow | null) ?? session);
        setVerificationItems(rows);

        const map: Record<string, string> = {};
        for (const r of rows) {
          const id = typeof r["id"] === "string" ? (r["id"] as string) : null;
          if (!id) continue;
          const vv = typeof r["verified_value"] === "string" ? (r["verified_value"] as string) : null;
          const ov = typeof r["original_value"] === "string" ? (r["original_value"] as string) : null;
          map[id] = (vv ?? ov ?? "").toString();
        }
        
        setVerificationInputValues(map);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Failed to load verification panel.";
        setVerificationError(msg);
        setVerificationSessionId(null);
        setVerificationSession(null);
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
  }, [callCenterFromRoute, lead, policyNumber]);

  useEffect(() => {
    if (!router.isReady) return;

    if ((!policyNumber || !policyNumber.trim().length) && dealId == null) {
      setPolicyDeal(null);
      setPolicyDealLoading(false);
      setPolicyDealError(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setPolicyDealLoading(true);
      setPolicyDealError(null);
      try {
        let q = supabase.from("monday_com_deals").select("*");
        if (dealId != null) {
          // Allow viewing by dealId even if inactive (agent may be working on assigned deal)
          q = q.eq("id", dealId);
        } else {
          // When searching by policy number, only show active deals
          q = q
            .eq("is_active", true)
            .eq("policy_number", policyNumber)
            .order("last_updated", { ascending: false, nullsFirst: false })
            .order("updated_at", { ascending: false, nullsFirst: false })
            .limit(1);
        }

        const { data, error } = await q.maybeSingle();

        if (error) throw error;
        if (!cancelled) setPolicyDeal((data ?? null) as MondayComDeal | null);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to load policy details.";
          setPolicyDealError(msg);
          setPolicyDeal(null);
        }
      } finally {
        if (!cancelled) setPolicyDealLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [dealId, policyNumber, router.isReady]);

  const toggleVerificationItem = async (itemId: string, checked: boolean) => {
    const currentValue = verificationInputValues[itemId] ?? "";
    const item = verificationItems.find((r) => r["id"] === itemId) ?? null;
    const original = item && typeof item["original_value"] === "string" ? (item["original_value"] as string) : "";
    const isModified = original !== currentValue;

    setVerificationItems((prev) =>
      prev.map((r) =>
        r["id"] === itemId
          ? { ...r, is_verified: checked, verified_at: checked ? new Date().toISOString() : null, verified_value: currentValue, is_modified: isModified }
          : r,
      ),
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

  useEffect(() => {
    if (!lead) {
      setDealFlowRow(null);
      setDealFlowLoading(false);
      setDealFlowError(null);
      return;
    }

    const submissionId = getString(lead, "submission_id");
    if (!submissionId) {
      setDealFlowRow(null);
      setDealFlowLoading(false);
      setDealFlowError("Missing submission_id on lead.");
      return;
    }

    if (!policyNumber || !policyNumber.trim().length) {
      setDealFlowRow(null);
      setDealFlowLoading(false);
      setDealFlowError("Missing policy number.");
      return;
    }

    let cancelled = false;

    const loadOrCreate = async () => {
      setDealFlowLoading(true);
      setDealFlowError(null);
      try {
        const { data: existingRows, error: selectErr } = await supabase
          .from("retention_deal_flow")
          .select("*")
          .eq("submission_id", submissionId)
          .eq("policy_number", policyNumber)
          .order("updated_at", { ascending: false, nullsFirst: false })
          .limit(1);

        if (selectErr) throw selectErr;
        const existing = ((existingRows ?? [])[0] ?? null) as RetentionDealFlowRow | null;

        if (existing) {
          if (!cancelled) setDealFlowRow(existing);
          return;
        }

        const payload: Partial<RetentionDealFlowRow> & { submission_id: string } = {
          submission_id: submissionId,
          policy_number: policyNumber,
          client_phone_number: getString(lead, "phone_number"),
          lead_vendor: leadVendorForInsert,
          insured_name: getString(lead, "customer_full_name"),
          retention_agent: retentionAgent || null,
          from_callback: true,
        };

        const { data: insertedRows, error: insertErr } = await supabase
          .from("retention_deal_flow")
          .insert(payload)
          .select("*")
          .limit(1);

        if (insertErr) throw insertErr;
        const inserted = ((insertedRows ?? [])[0] ?? null) as RetentionDealFlowRow | null;
        if (!cancelled) setDealFlowRow(inserted);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to load call update row.";
          setDealFlowError(msg);
          setDealFlowRow(null);
        }
      } finally {
        if (!cancelled) setDealFlowLoading(false);
      }
    };

    void loadOrCreate();
    return () => {
      cancelled = true;
    };
  }, [lead, policyNumber, retentionAgent, leadVendorForInsert]);

  const saveDealFlow = async (patch: Partial<RetentionDealFlowRow>) => {
    if (!dealFlowRow?.id) return;

    const next = { ...dealFlowRow, ...patch };
    setDealFlowRow(next);

    const { error } = await supabase
      .from("retention_deal_flow")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", dealFlowRow.id);

    if (error) throw error;
  };

  const insuredName = getString(lead, "customer_full_name") ?? "Unknown";
  const leadVendor =
    (typeof policyDeal?.call_center === "string" ? policyDeal.call_center : null) ??
    (getString(verificationSession, "call_center") ?? null) ??
    getString(lead, "lead_vendor") ??
    "";
  const phoneNumber = getString(lead, "phone_number") ?? "";

  const carrier =
    (typeof policyDeal?.carrier === "string" ? policyDeal.carrier : null) ??
    (getString(verificationSession, "carrier") ?? null) ??
    (dealFlowRow?.carrier ?? null) ??
    (getString(lead, "carrier") ?? null) ??
    "";

  const productType =
    (typeof policyDeal?.policy_type === "string" ? policyDeal.policy_type : null) ??
    (getString(verificationSession, "product_type") ?? null) ??
    (dealFlowRow?.product_type ?? null) ??
    (getString(lead, "product_type") ?? null) ??
    "";

  const sessionCallCenter = getString(verificationSession, "call_center") ?? "";
  const sessionPolicyNumber = getString(verificationSession, "policy_number") ?? policyNumber ?? "";

  const verificationProgress = useMemo(() => {
    const total = verificationItems.length;
    const verified = verificationItems.filter((i) => !!i["is_verified"]).length;
    const percent = total > 0 ? Math.round((verified / total) * 100) : 0;
    return { total, verified, percent };
  }, [verificationItems]);

  return {
    router,
    leadId,
    policyNumber,
    retentionAgent,
    retentionType,
    lead,
    insuredName,
    leadVendor,
    phoneNumber,
    carrier,
    productType,
    sessionCallCenter,
    sessionPolicyNumber,
    loadingLead,
    leadError,
    verificationSessionId,
    verificationSession,
    verificationItems,
    verificationLoading,
    verificationError,
    verificationInputValues,
    toggleVerificationItem,
    updateVerificationItemValue,
    policyDeal,
    policyDealLoading,
    policyDealError,
    dealFlowRow,
    dealFlowLoading,
    dealFlowError,
    saveDealFlow,
    hasDealFlowColumn,
    sanitizeDealFlowPatch,
    agentOptions,
    agentOptionsLoading,
    agentOptionsError,
    centerOptions,
    centerOptionsLoading,
    centerOptionsError,
    carrierOptions,
    carrierOptionsLoading,
    carrierOptionsError,
    verificationProgress,
    formatValue,
    titleizeKey,
  };
}
