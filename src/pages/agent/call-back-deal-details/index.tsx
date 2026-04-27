"use client";

import * as React from "react";
import { useRouter } from "next/router";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, ArrowLeftIcon } from "lucide-react";

import { LeadHeader } from "@/components/agent/assigned-lead-details/lead-header";
import { PolicyCard } from "@/components/agent/assigned-lead-details/policy-card";
import { DailyDealFlowTab } from "@/components/agent/assigned-lead-details/daily-deal-flow-tab";
import { ContactNotesPanel } from "@/components/agent/assigned-lead-details/contact-notes-panel";
import { VerificationPanel } from "@/components/agent/assigned-lead-details/verification-panel";
import { PolicyStatusAlertDialog } from "@/components/agent/assigned-lead-details/policy-status-alert-dialog";
import { NewSaleConfirmDialog } from "@/components/agent/assigned-lead-details/new-sale-confirm-dialog";
import { useRetentionAgent } from "@/components/agent/assigned-lead-details/use-retention-agent";
import { CallBackQuickDispositionModal } from "@/components/agent/call-back-deal-details/call-back-quick-disposition-modal";
import type { RetentionType } from "@/components/agent/retention-workflows";
import {
  buildVerificationFieldMap,
  getVerificationFieldList,
  type RetentionLeadForVerification,
} from "@/lib/call-back-deals/build-verification-items";
import {
  normalizePhoneDigits,
  buildDigitWildcardPattern,
} from "@/lib/agent/assigned-lead-details.logic";
import {
  CALL_BACK_DEALS_NAV_MAX_AGE_MS,
  CALL_BACK_DEALS_NAV_STORAGE_KEY,
  normaliseCallBackDealId,
  parseCallBackDealsNavContext,
  type CallBackDealsNavContext,
} from "@/lib/call-back-deals/navigation-context";

type CallBackDealRow = {
  id: string;
  name: string | null;
  phone_number: string | null;
  submission_id: string;
  stage: string | null;
  call_center: string | null;
};

type VerificationItemRow = {
  id: string;
  call_back_deal_id: string;
  field_name: string;
  original_value: string | null;
  verified_value: string | null;
  is_verified: boolean;
  created_at: string | null;
  updated_at: string | null;
};

const NOOP = () => {};

export default function AgentCallBackDealDetailsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const toastRef = React.useRef(toast);
  React.useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const { retentionAgent, retentionAgentId } = useRetentionAgent();

  const rawQueryId = router.query.id;
  const idParam = React.useMemo(() => {
    if (!router.isReady) return "";
    const v = Array.isArray(rawQueryId) ? rawQueryId[0] : rawQueryId;
    return typeof v === "string" ? normaliseCallBackDealId(v) : "";
  }, [router.isReady, rawQueryId]);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deal, setDeal] = React.useState<CallBackDealRow | null>(null);
  const [lead, setLead] = React.useState<RetentionLeadForVerification | null>(null);
  const [matchedBy, setMatchedBy] = React.useState<string>("none");

  const [verificationItems, setVerificationItems] = React.useState<Array<Record<string, unknown>>>([]);
  const [verificationInputValues, setVerificationInputValues] = React.useState<Record<string, string>>({});
  const [selectedPolicyKey, setSelectedPolicyKey] = React.useState<string | null>(null);

  const [expandedWorkflowKey, setExpandedWorkflowKey] = React.useState<string | null>(null);
  const [activeWorkflowType, setActiveWorkflowType] = React.useState<RetentionType | null>(null);
  const [policyStatusAlertOpen, setPolicyStatusAlertOpen] = React.useState(false);
  const [newSaleConfirmOpen, setNewSaleConfirmOpen] = React.useState(false);
  const [pendingNewSalePolicyKey, setPendingNewSalePolicyKey] = React.useState<string | null>(null);

  const [dispositionModalOpen, setDispositionModalOpen] = React.useState(false);

  const [dailyFlowRows, setDailyFlowRows] = React.useState<Array<Record<string, unknown>>>([]);
  const [dailyFlowLoading, setDailyFlowLoading] = React.useState(false);
  const [dailyFlowError, setDailyFlowError] = React.useState<string | null>(null);
  const [expandedDealFlowRows, setExpandedDealFlowRows] = React.useState<Set<string>>(new Set());

  const handleToggleDealFlowRow = React.useCallback((rowId: string) => {
    setExpandedDealFlowRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }, []);

  const handleToggleWorkflow = React.useCallback(
    (policyKey: string, workflowType: RetentionType) => {
      if (expandedWorkflowKey === policyKey && activeWorkflowType === workflowType) {
        setExpandedWorkflowKey(null);
        setActiveWorkflowType(null);
      } else {
        setExpandedWorkflowKey(policyKey);
        setActiveWorkflowType(workflowType);
      }
    },
    [expandedWorkflowKey, activeWorkflowType],
  );

  const handleCancelWorkflow = React.useCallback(() => {
    setExpandedWorkflowKey(null);
    setActiveWorkflowType(null);
  }, []);

  const [navDealIds, setNavDealIds] = React.useState<string[]>([]);
  const [navLoading, setNavLoading] = React.useState(false);
  const [navSeed, setNavSeed] = React.useState<CallBackDealsNavContext | null>(null);
  const [navSeedReady, setNavSeedReady] = React.useState(false);

  React.useLayoutEffect(() => {
    try {
      setNavSeed(parseCallBackDealsNavContext(sessionStorage.getItem(CALL_BACK_DEALS_NAV_STORAGE_KEY)));
    } finally {
      setNavSeedReady(true);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const loadNavIds = async () => {
      setNavLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user) {
          if (!cancelled) setNavDealIds([]);
          return;
        }
        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (profileErr || !profile?.id) {
          if (!cancelled) setNavDealIds([]);
          return;
        }
        const { data: rows, error } = await supabase
          .from("call_back_deals")
          .select("id")
          .eq("assigned_to_profile_id", profile.id as string)
          .eq("is_active", true)
          .order("assigned_at", { ascending: false, nullsFirst: false })
          .limit(2000);
        if (error) throw error;
        if (!cancelled) {
          setNavDealIds(
            (rows ?? []).map((r) => normaliseCallBackDealId(String((r as { id: string }).id))),
          );
        }
      } catch (e) {
        console.error("[call-back-deal-details] nav ids error", e);
        if (!cancelled) setNavDealIds([]);
      } finally {
        if (!cancelled) setNavLoading(false);
      }
    };
    void loadNavIds();
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveNavIds = React.useMemo(() => {
    const server = navDealIds;
    const seed = navSeed?.dealIds ?? [];
    const fresh =
      navSeed &&
      idParam &&
      seed.includes(idParam) &&
      Date.now() - navSeed.createdAt < CALL_BACK_DEALS_NAV_MAX_AGE_MS;
    if (fresh) return seed;
    return server.length > 0 ? server : seed;
  }, [navDealIds, navSeed, idParam]);

  const { previousCallBackDealId, nextCallBackDealId } = React.useMemo(() => {
    const idx = idParam ? effectiveNavIds.indexOf(idParam) : -1;
    if (idx < 0) {
      return { previousCallBackDealId: null as string | null, nextCallBackDealId: null as string | null };
    }
    return {
      previousCallBackDealId: idx > 0 ? effectiveNavIds[idx - 1]! : null,
      nextCallBackDealId: idx < effectiveNavIds.length - 1 ? effectiveNavIds[idx + 1]! : null,
    };
  }, [effectiveNavIds, idParam]);

  const assignedDealsLoadingForHeader =
    !navSeedReady || (navLoading && effectiveNavIds.length === 0);

  const goToPreviousCallBackDeal = React.useCallback(() => {
    if (!previousCallBackDealId) return;
    void router.push(`/agent/call-back-deal-details?id=${encodeURIComponent(previousCallBackDealId)}`);
  }, [previousCallBackDealId, router]);

  const goToNextCallBackDeal = React.useCallback(() => {
    if (!nextCallBackDealId) return;
    void router.push(`/agent/call-back-deal-details?id=${encodeURIComponent(nextCallBackDealId)}`);
  }, [nextCallBackDealId, router]);

  React.useEffect(() => {
    if (effectiveNavIds.length === 0 || !idParam) return;
    try {
      sessionStorage.setItem(
        CALL_BACK_DEALS_NAV_STORAGE_KEY,
        JSON.stringify({ dealIds: effectiveNavIds, createdAt: Date.now() }),
      );
    } catch {
      // ignore
    }
  }, [effectiveNavIds, idParam]);

  const loadEverything = React.useCallback(async () => {
    if (!idParam) return;
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Not authenticated");
        return;
      }

      const resp = await fetch(`/api/call-back-deals/lookup-lead?id=${encodeURIComponent(idParam)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await resp.json().catch(() => null)) as
        | {
            ok: true;
            callBackDeal: CallBackDealRow;
            lead: RetentionLeadForVerification | null;
            matchedBy: string;
            ssn: string | null;
          }
        | { ok: false; error: string }
        | null;

      if (!resp.ok || !json || !json.ok) {
        const message = json && "error" in json ? json.error : `Lookup failed (${resp.status})`;
        setError(message);
        return;
      }

      const loadedDealRaw = json.callBackDeal;
      const loadedDeal: CallBackDealRow = {
        ...loadedDealRaw,
        id: normaliseCallBackDealId(String(loadedDealRaw.id)),
      };
      setDeal(loadedDeal);
      setLead(json.lead);
      setMatchedBy(json.matchedBy);
      setSelectedPolicyKey(loadedDeal.id);

      const fieldMap = buildVerificationFieldMap(json.lead, {
        leadVendor: loadedDeal.call_center,
        fullName: loadedDeal.name,
        phone: loadedDeal.phone_number,
      });

      const { data: existingItems, error: itemsErr } = await supabase
        .from("call_back_deal_verification_items")
        .select("id, call_back_deal_id, field_name, original_value, verified_value, is_verified, created_at, updated_at")
        .eq("call_back_deal_id", loadedDeal.id);

      if (itemsErr) {
        console.error("[call-back-deal-details] fetch items error", itemsErr);
      }

      const byFieldName = new Map<string, VerificationItemRow>();
      for (const row of (existingItems ?? []) as VerificationItemRow[]) {
        byFieldName.set(row.field_name, row);
      }

      const fieldsToSeed = getVerificationFieldList();

      const inserts: Array<{
        call_back_deal_id: string;
        field_name: string;
        original_value: string | null;
      }> = [];
      const updates: Array<{ id: string; original_value: string }> = [];

      for (const fieldName of fieldsToSeed) {
        const current = byFieldName.get(fieldName);
        const newOriginal = (fieldMap[fieldName] ?? "").toString();
        if (!current) {
          inserts.push({
            call_back_deal_id: loadedDeal.id,
            field_name: fieldName,
            original_value: newOriginal || null,
          });
          continue;
        }
        const existingOriginal = typeof current.original_value === "string" ? current.original_value.trim() : "";
        if (newOriginal && !existingOriginal) {
          updates.push({ id: current.id, original_value: newOriginal });
        }
      }

      if (inserts.length > 0) {
        const { error: insertErr } = await supabase
          .from("call_back_deal_verification_items")
          .insert(inserts);
        if (insertErr) {
          console.error("[call-back-deal-details] seed insert error", insertErr);
        }
      }

      for (const patch of updates) {
        const { error: updateErr } = await supabase
          .from("call_back_deal_verification_items")
          .update({ original_value: patch.original_value })
          .eq("id", patch.id);
        if (updateErr) {
          console.error("[call-back-deal-details] seed update error", updateErr);
        }
      }

      const { data: finalItems, error: finalErr } = await supabase
        .from("call_back_deal_verification_items")
        .select("id, call_back_deal_id, field_name, original_value, verified_value, is_verified, created_at, updated_at")
        .eq("call_back_deal_id", loadedDeal.id)
        .order("created_at", { ascending: true });

      if (finalErr) {
        console.error("[call-back-deal-details] final fetch error", finalErr);
      }

      const finalRows = (finalItems ?? []) as VerificationItemRow[];

      const orderIndex = new Map<string, number>(
        fieldsToSeed.map((name, idx) => [name, idx]),
      );
      finalRows.sort((a, b) => {
        const aIdx = orderIndex.get(a.field_name) ?? Number.MAX_SAFE_INTEGER;
        const bIdx = orderIndex.get(b.field_name) ?? Number.MAX_SAFE_INTEGER;
        return aIdx - bIdx;
      });

      setVerificationItems(finalRows as unknown as Array<Record<string, unknown>>);
      const initialValues: Record<string, string> = {};
      for (const row of finalRows) {
        const verified = typeof row.verified_value === "string" ? row.verified_value : "";
        const original = typeof row.original_value === "string" ? row.original_value : "";
        const initial = verified.trim().length > 0 ? verified : original;
        if (initial.length > 0) {
          initialValues[row.id] = initial;
        }
      }
      setVerificationInputValues(initialValues);
    } catch (err) {
      console.error("[call-back-deal-details] load error", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [idParam]);

  React.useEffect(() => {
    if (!router.isReady || !idParam) return;
    void loadEverything();
  }, [router.isReady, idParam, loadEverything]);

  React.useEffect(() => {
    const leadRec = (lead ?? null) as unknown as Record<string, unknown> | null;
    const fallbackPhone =
      (typeof deal?.phone_number === "string" && deal.phone_number.trim().length ? deal.phone_number : null) ??
      (leadRec && typeof leadRec["phone_number"] === "string" ? (leadRec["phone_number"] as string) : null);
    const fallbackName =
      (leadRec && typeof leadRec["customer_full_name"] === "string"
        ? (leadRec["customer_full_name"] as string)
        : null) ??
      (typeof deal?.name === "string" && deal.name.trim().length ? deal.name : null);

    if (!fallbackPhone && !fallbackName) {
      setDailyFlowRows([]);
      setDailyFlowError(null);
      setDailyFlowLoading(false);
      return;
    }

    const insuredNameEscaped = (fallbackName ?? "").replace(/,/g, "").trim();
    const phoneDigits = normalizePhoneDigits(fallbackPhone ?? "");
    const last10 = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits;
    const phonePattern = last10 ? buildDigitWildcardPattern(last10) : null;

    const hasAnyFilter =
      (!!fallbackPhone && fallbackPhone.trim().length > 0) ||
      (!!insuredNameEscaped && insuredNameEscaped.length > 0);
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
          const err = e as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown } | null;
          const msg =
            err && typeof err.message === "string"
              ? [
                  err.message,
                  typeof err.code === "string" ? `Code: ${err.code}` : null,
                  typeof err.details === "string" ? `Details: ${err.details}` : null,
                  typeof err.hint === "string" ? `Hint: ${err.hint}` : null,
                ]
                  .filter(Boolean)
                  .join(" • ")
              : "Failed to load Daily Deal Flow.";
          console.error("Daily Deal Flow query failed", { err });
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
  }, [deal, lead]);

  const handleToggleVerification = React.useCallback(
    async (itemId: string, checked: boolean) => {
      setVerificationItems((prev) =>
        prev.map((row) =>
          typeof row.id === "string" && row.id === itemId ? { ...row, is_verified: checked } : row,
        ),
      );
      const { error: updateErr } = await supabase
        .from("call_back_deal_verification_items")
        .update({ is_verified: checked })
        .eq("id", itemId);
      if (updateErr) {
        toastRef.current({
          title: "Failed to save",
          description: updateErr.message,
          variant: "destructive",
        });
      }
    },
    [],
  );

  const handleUpdateValue = React.useCallback(
    async (itemId: string, value: string) => {
      setVerificationInputValues((prev) => ({ ...prev, [itemId]: value }));
      setVerificationItems((prev) =>
        prev.map((row) =>
          typeof row.id === "string" && row.id === itemId ? { ...row, verified_value: value } : row,
        ),
      );
      const { error: updateErr } = await supabase
        .from("call_back_deal_verification_items")
        .update({ verified_value: value })
        .eq("id", itemId);
      if (updateErr) {
        toastRef.current({
          title: "Failed to save",
          description: updateErr.message,
          variant: "destructive",
        });
      }
    },
    [],
  );

  const leadRecord = React.useMemo(
    () => (lead ?? null) as unknown as Record<string, unknown> | null,
    [lead],
  );

  const policyViews = React.useMemo(() => {
    if (!deal) return [];
    const leadRec = leadRecord ?? {};
    const raw: Record<string, unknown> = {
      ...leadRec,
      ghl_stage: deal.stage ?? null,
      carrier: (leadRec["carrier"] as string | null | undefined) ?? null,
      phone_number: deal.phone_number ?? null,
      policy_type: (leadRec["product_type"] as string | null | undefined) ?? null,
    };
    return [
      {
        key: deal.id,
        clientName: deal.name ?? (leadRec["customer_full_name"] as string | null | undefined) ?? "—",
        callCenter: deal.call_center ?? (leadRec["lead_vendor"] as string | null | undefined) ?? null,
        policyNumber: null,
        agentName: (leadRec["agent"] as string | null | undefined) ?? null,
        monthlyPremium: (leadRec["monthly_premium"] as number | string | null | undefined) ?? null,
        coverage: (leadRec["coverage_amount"] as number | string | null | undefined) ?? null,
        initialDraftDate: (leadRec["draft_date"] as string | null | undefined) ?? null,
        statusNotes: null,
        lastUpdated: (leadRec["updated_at"] as string | null | undefined) ?? null,
        status: deal.stage ?? null,
        raw,
      },
    ];
  }, [deal, leadRecord]);

  const selectedPolicyView = React.useMemo(() => {
    if (!deal) return null;
    const leadRec = leadRecord ?? {};
    return {
      callCenter: deal.call_center ?? null,
      policyNumber: null,
      clientName: deal.name ?? null,
      carrier: (leadRec["carrier"] as string | null | undefined) ?? null,
      agentName: (leadRec["agent"] as string | null | undefined) ?? null,
    };
  }, [deal, leadRecord]);

  const personalSsnLast4 = React.useMemo(() => {
    const ssn = (lead?.social_security as string | null | undefined) ?? "";
    const digits = ssn.replace(/\D/g, "");
    return digits.length >= 4 ? digits.slice(-4) : "-";
  }, [lead]);

  const personalDob = React.useMemo(() => {
    const dob = (lead?.date_of_birth as string | null | undefined) ?? "";
    return dob && dob.trim().length > 0 ? dob : "-";
  }, [lead]);

  const personalAddress1 = React.useMemo(() => {
    const street = (lead?.street_address as string | null | undefined) ?? "";
    return street && street.trim().length > 0 ? street : "-";
  }, [lead]);

  const name = deal?.name ?? "—";
  const phone = deal?.phone_number ?? "-";
  const carrier = ((lead?.carrier as string | null | undefined) ?? "-") || "-";
  const productType = ((lead?.product_type as string | null | undefined) ?? "-") || "-";
  const center = deal?.call_center ?? "-";

  if (!router.isReady) {
    return (
      <div className="w-full px-6 py-8 min-h-screen bg-muted/20 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!idParam) {
    return (
      <div className="w-full px-6 py-8 min-h-screen bg-muted/20">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Missing id query parameter.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full px-6 py-8 min-h-screen bg-muted/20">
      <PolicyStatusAlertDialog
        open={policyStatusAlertOpen}
        onOpenChange={setPolicyStatusAlertOpen}
        selectedPolicyKey={selectedPolicyKey}
        selectedPolicyView={selectedPolicyView}
        lead={null}
        selectedDeal={null}
        retentionAgent={retentionAgent}
        onSwitchToFixedPayment={() => {
          setPolicyStatusAlertOpen(false);
          if (selectedPolicyKey) {
            setExpandedWorkflowKey(selectedPolicyKey);
            setActiveWorkflowType("fixed_payment");
          }
        }}
        onSwitchToNewSale={() => {
          setPolicyStatusAlertOpen(false);
          if (selectedPolicyKey) {
            setExpandedWorkflowKey(selectedPolicyKey);
            setActiveWorkflowType("new_sale");
          }
        }}
      />

      <NewSaleConfirmDialog
        open={newSaleConfirmOpen}
        onOpenChange={(open) => {
          setNewSaleConfirmOpen(open);
          if (!open) setPendingNewSalePolicyKey(null);
        }}
        onConfirm={() => {
          const key = pendingNewSalePolicyKey;
          setNewSaleConfirmOpen(false);
          setPendingNewSalePolicyKey(null);
          if (!key) return;
          setExpandedWorkflowKey(key);
          setActiveWorkflowType("new_sale");
        }}
      />

      <div className="w-full space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/agent/call-back-deals")}>
            <ArrowLeftIcon className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="text-xs text-muted-foreground">
            Matched by: <span className="font-medium">{matchedBy}</span>
          </div>
        </div>

        <Card>
          <LeadHeader
            name={name}
            phone={phone}
            carrier={carrier}
            productType={productType}
            center={center}
            dealId={null}
            previousAssignedDealId={null}
            nextAssignedDealId={null}
            assignedDealsLoading={assignedDealsLoadingForHeader}
            selectedPolicyView={null}
            onPreviousLead={goToPreviousCallBackDeal}
            onNextLead={goToNextCallBackDeal}
            onOpenDisposition={() => setDispositionModalOpen(true)}
            hideGoToDialer={true}
            callBackNavigation={{
              previousId: previousCallBackDealId,
              nextId: nextCallBackDealId,
            }}
          />
          <CardContent className="flex flex-col gap-6">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading lead details...
              </div>
            ) : error ? (
              <div className="text-sm text-red-600">{error}</div>
            ) : !deal ? (
              <div className="text-sm text-muted-foreground">Call back deal not found.</div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                <div className="min-w-0">
                  <Tabs defaultValue="daily" className="w-full min-w-0">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="policies">Policies</TabsTrigger>
                      <TabsTrigger value="daily">Deal Notes</TabsTrigger>
                      <TabsTrigger value="contact-notes">Contact Notes</TabsTrigger>
                    </TabsList>

                    <TabsContent value="policies" className="pt-2">
                      <div className="rounded-md border p-4">
                        <div className="text-sm font-medium">Policies</div>
                        <Separator className="my-3" />

                        {policyViews.length === 0 ? (
                          <div className="text-sm text-muted-foreground">No policies found.</div>
                        ) : (
                          <div className="space-y-3 max-w-2xl">
                            {policyViews.map((p) => (
                              <PolicyCard
                                key={p.key}
                                policy={p}
                                isSelected={p.key === selectedPolicyKey}
                                onSelect={() => setSelectedPolicyKey(p.key)}
                                expandedWorkflowKey={expandedWorkflowKey}
                                activeWorkflowType={activeWorkflowType}
                                onToggleWorkflow={(workflowType) => handleToggleWorkflow(p.key, workflowType)}
                                onOpenPolicyStatusAlert={() => setPolicyStatusAlertOpen(true)}
                                onConfirmNewSale={(policyKey) => {
                                  setPendingNewSalePolicyKey(policyKey);
                                  setNewSaleConfirmOpen(true);
                                }}
                                lead={leadRecord}
                                selectedDeal={{
                                  monday_item_id: deal?.submission_id ?? null,
                                  ghl_stage: deal?.stage ?? null,
                                }}
                                retentionAgent={retentionAgent}
                                retentionAgentId={retentionAgentId}
                                verificationSessionId={null}
                                verificationItems={verificationItems}
                                verificationInputValues={verificationInputValues}
                                personalSsnLast4={personalSsnLast4}
                                personalDob={personalDob}
                                personalAddress1={personalAddress1}
                                onCancelWorkflow={handleCancelWorkflow}
                                callBackDealId={deal?.id ?? null}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="daily" className="pt-2">
                      <div className="rounded-md border p-4 min-w-0">
                        <div className="text-sm font-medium">Daily Deal Flow & Notes</div>
                        <Separator className="my-3" />
                        <DailyDealFlowTab
                          loading={dailyFlowLoading}
                          error={dailyFlowError}
                          rows={dailyFlowRows}
                          expandedRows={expandedDealFlowRows}
                          onToggleRow={handleToggleDealFlowRow}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="contact-notes" className="pt-2">
                      <div className="space-y-4">
                        {deal?.submission_id ? (
                          <ContactNotesPanel mondayItemId={String(deal.submission_id)} />
                        ) : (
                          <div className="text-sm text-muted-foreground">No submission ID available for contact notes.</div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>

                <div className="space-y-4">
                  <VerificationPanel
                    selectedPolicyView={selectedPolicyView}
                    dealPhone={phone}
                    loading={false}
                    error={null}
                    verificationItems={verificationItems}
                    verificationInputValues={verificationInputValues}
                    onToggleVerification={handleToggleVerification}
                    onUpdateValue={handleUpdateValue}
                    disableTcpaCheck={true}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CallBackQuickDispositionModal
        open={dispositionModalOpen}
        onOpenChange={setDispositionModalOpen}
        submissionId={deal?.submission_id ?? ""}
        clientName={deal?.name ?? null}
        phoneNumber={deal?.phone_number ?? null}
        agentProfileId={retentionAgentId}
        onSuccess={() => {
          void loadEverything();
        }}
      />
    </div>
  );
}
