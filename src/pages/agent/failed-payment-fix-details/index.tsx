"use client";

import * as React from "react";
import { useRouter } from "next/router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, ArrowLeftIcon, PhoneIcon } from "lucide-react";

import { DailyDealFlowTab } from "@/components/agent/assigned-lead-details/daily-deal-flow-tab";
import { ContactNotesPanel } from "@/components/agent/assigned-lead-details/contact-notes-panel";
import { CrmLeadNotesPanel } from "@/components/agent/assigned-lead-details/crm-lead-notes-panel";
import { VerificationPanel } from "@/components/agent/assigned-lead-details/verification-panel";
import { PolicyCard } from "@/components/agent/assigned-lead-details/policy-card";
import { LeadHeader } from "@/components/agent/assigned-lead-details/lead-header";
import { useRetentionAgent } from "@/components/agent/assigned-lead-details/use-retention-agent";
import {
  normalizePhoneDigits,
  buildDigitWildcardPattern,
} from "@/lib/agent/assigned-lead-details.logic";
import type { RetentionType } from "@/components/agent/retention-workflows";
import {
  getVerificationFieldList,
} from "@/lib/call-back-deals/build-verification-items";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FailedPaymentFixRow = {
  id: string;
  name: string | null;
  phone_number: string | null;
  email: string | null;
  policy_number: string;
  carrier: string | null;
  policy_type: string | null;
  policy_status: string | null;
  carrier_status: string | null;
  ghl_name: string | null;
  ghl_stage: string | null;
  assigned_agency: string | null;
  deal_value: number | null;
  cc_value: number | null;
  call_center: string | null;
  sales_agent: string | null;
  writing_number: string | null;
  assigned: boolean;
  is_active: boolean;
  tcpa_flag: boolean;
  tcpa_message: string | null;
  assigned_to_profile_id: string | null;
  assigned_at: string | null;
  failure_reason: string | null;
  failure_date: string | null;
};

const FAILED_PAYMENT_FIXES_NAV_STORAGE_KEY = "fpf_nav_context";
const FAILED_PAYMENT_FIXES_NAV_MAX_AGE_MS = 1000 * 60 * 30;

type FailedPaymentFixesNavContext = {
  dealIds: string[];
  createdAt: number;
};

type Disposition =
  | "Busy"
  | "No Answer"
  | "Answering Machine"
  | "Wrong Number"
  | "Do Not Call"
  | "On Hold"
  | "hungup"
  | "callback"
  | "sale"
  | "dq";

const DISPOSITION_OPTIONS: Array<{ value: Disposition; label: string }> = [
  { value: "Busy", label: "Busy" },
  { value: "No Answer", label: "No Answer" },
  { value: "Answering Machine", label: "Answering Machine" },
  { value: "Wrong Number", label: "Wrong Number" },
  { value: "Do Not Call", label: "Do Not Call" },
  { value: "On Hold", label: "On Hold" },
  { value: "hungup", label: "Hung Up" },
  { value: "callback", label: "Callback" },
  { value: "sale", label: "Sale" },
  { value: "dq", label: "DQ" },
];

function parseFailedPaymentFixesNavContext(raw: string | null): FailedPaymentFixesNavContext | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || !Array.isArray(parsed.dealIds) || typeof parsed.createdAt !== "number") {
      return null;
    }
    return parsed as FailedPaymentFixesNavContext;
  } catch {
    return null;
  }
}

export default function AgentFailedPaymentFixDetailsPage() {
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
    return typeof v === "string" ? v : "";
  }, [router.isReady, rawQueryId]);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deal, setDeal] = React.useState<FailedPaymentFixRow | null>(null);
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

  const [selectedDisposition, setSelectedDisposition] = React.useState<Disposition | "">("");
  const [dispositionNotes, setDispositionNotes] = React.useState("");
  const [savingDisposition, setSavingDisposition] = React.useState(false);

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
  const [navSeed, setNavSeed] = React.useState<FailedPaymentFixesNavContext | null>(null);
  const [navSeedReady, setNavSeedReady] = React.useState(false);

  React.useLayoutEffect(() => {
    try {
      setNavSeed(parseFailedPaymentFixesNavContext(sessionStorage.getItem(FAILED_PAYMENT_FIXES_NAV_STORAGE_KEY)));
    } finally {
      setNavSeedReady(true);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const loadNavIds = async () => {
      setNavLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
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
          .from("failed_payment_fixes")
          .select("id")
          .eq("assigned_to_profile_id", profile.id as string)
          .eq("is_active", true)
          .eq("assigned", true)
          .order("assigned_at", { ascending: false, nullsFirst: false })
          .limit(2000);
        if (error) throw error;
        if (!cancelled) {
          setNavDealIds((rows ?? []).map((r) => String((r as { id: string }).id)));
        }
      } catch (e) {
        console.error("[failed-payment-fix-details] nav ids error", e);
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
    const fresh = navSeed && idParam && seed.includes(idParam) && Date.now() - navSeed.createdAt < FAILED_PAYMENT_FIXES_NAV_MAX_AGE_MS;
    if (fresh) return seed;
    return server.length > 0 ? server : seed;
  }, [navDealIds, navSeed, idParam]);

  const { previousFailedPaymentFixId, nextFailedPaymentFixId } = React.useMemo(() => {
    const idx = idParam ? effectiveNavIds.indexOf(idParam) : -1;
    if (idx < 0) {
      return { previousFailedPaymentFixId: null as string | null, nextFailedPaymentFixId: null as string | null };
    }
    return {
      previousFailedPaymentFixId: idx > 0 ? effectiveNavIds[idx - 1]! : null,
      nextFailedPaymentFixId: idx < effectiveNavIds.length - 1 ? effectiveNavIds[idx + 1]! : null,
    };
  }, [effectiveNavIds, idParam]);

  const assignedDealsLoadingForHeader = !navSeedReady || (navLoading && effectiveNavIds.length === 0);

  const goToPreviousFailedPaymentFix = React.useCallback(() => {
    if (!previousFailedPaymentFixId) return;
    void router.push(`/agent/failed-payment-fix-details?id=${encodeURIComponent(previousFailedPaymentFixId)}`);
  }, [previousFailedPaymentFixId, router]);

  const goToNextFailedPaymentFix = React.useCallback(() => {
    if (!nextFailedPaymentFixId) return;
    void router.push(`/agent/failed-payment-fix-details?id=${encodeURIComponent(nextFailedPaymentFixId)}`);
  }, [nextFailedPaymentFixId, router]);

  React.useEffect(() => {
    if (effectiveNavIds.length === 0 || !idParam) return;
    try {
      sessionStorage.setItem(FAILED_PAYMENT_FIXES_NAV_STORAGE_KEY, JSON.stringify({ dealIds: effectiveNavIds, createdAt: Date.now() }));
    } catch {
      // ignore
    }
  }, [effectiveNavIds, idParam]);

  const loadEverything = React.useCallback(async () => {
    if (!idParam) return;
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Not authenticated");
        return;
      }

      const resp = await fetch(`/api/failed-payment-fixes/lookup-lead?id=${encodeURIComponent(idParam)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await resp.json().catch(() => null)) as
        | { ok: true; failedPaymentFix: FailedPaymentFixRow; matchedBy: string; verificationItems: Array<{ id: string; field_name: string; original_value: string | null; verified_value: string | null; is_verified: boolean }> }
        | { ok: false; error: string }
        | null;

      if (!resp.ok || !json || !json.ok) {
        const message = json && "error" in json ? json.error : `Lookup failed (${resp.status})`;
        setError(message);
        return;
      }

      const loadedDeal = json.failedPaymentFix;
      console.log("[fpf-details] raw ghl_stage from DB:", loadedDeal.ghl_stage);
      setDeal(loadedDeal);
      setMatchedBy(json.matchedBy);
      setSelectedPolicyKey(loadedDeal.id);

      if (json.verificationItems && json.verificationItems.length > 0) {
        const fieldsOrder = getVerificationFieldList();
        const orderIndex = new Map<string, number>(fieldsOrder.map((name, idx) => [name, idx]));
        
        const formattedItems = [...json.verificationItems].sort((a, b) => {
          const aIdx = orderIndex.get(a.field_name) ?? Number.MAX_SAFE_INTEGER;
          const bIdx = orderIndex.get(b.field_name) ?? Number.MAX_SAFE_INTEGER;
          return aIdx - bIdx;
        }).map(item => ({
          ...item,
          id: item.id,
          field_name: item.field_name,
          original_value: item.original_value,
          verified_value: item.verified_value,
          is_verified: item.is_verified,
        }));
        setVerificationItems(formattedItems as unknown as Array<Record<string, unknown>>);
        
        const initialValues: Record<string, string> = {};
        for (const item of json.verificationItems) {
          const verified = typeof item.verified_value === "string" ? item.verified_value : "";
          const original = typeof item.original_value === "string" ? item.original_value : "";
          const initial = verified.trim().length > 0 ? verified : original;
          if (initial.length > 0) {
            initialValues[item.id] = initial;
          }
        }
        setVerificationInputValues(initialValues);
      }
    } catch (err) {
      console.error("[failed-payment-fix-details] load error", err);
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
    const fallbackPhone = deal?.phone_number ?? "";
    const fallbackName = deal?.name ?? "";

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

    if (!fallbackPhone?.trim() && !insuredNameEscaped.length) {
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
        if (insuredNameEscaped.length) orParts.push(`insured_name.ilike.%${insuredNameEscaped}%`);
        if (phonePattern) orParts.push(`client_phone_number.ilike.${phonePattern}`);
        if (orParts.length) q = q.or(orParts.join(","));
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
        if (insuredNameEscaped.length) fq = fq.ilike("insured_name", `%${insuredNameEscaped}%`);
        fq = fq.order("date", { ascending: false }).limit(250);

        const { data: fuzzyData, error: fuzzyErr } = await fq;
        if (fuzzyErr) throw fuzzyErr;
        if (!cancelled) setDailyFlowRows((fuzzyData ?? []) as Array<Record<string, unknown>>);
      } catch (e) {
        if (!cancelled) {
          const err = e as { message?: unknown };
          const msg = err && typeof err.message === "string" ? err.message : "Failed to load Daily Deal Flow.";
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
  }, [deal]);

  const handleToggleVerification = React.useCallback(
    async (itemId: string, checked: boolean) => {
      setVerificationItems((prev) =>
        prev.map((row) =>
          typeof row.id === "string" && row.id === itemId ? { ...row, is_verified: checked } : row,
        ),
      );
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
    },
    [],
  );

  const handleOpenPolicyStatusAlert = React.useCallback(() => {
    setPolicyStatusAlertOpen(true);
  }, []);

  const handleConfirmNewSale = React.useCallback((policyKey: string) => {
    setPendingNewSalePolicyKey(policyKey);
    setNewSaleConfirmOpen(true);
  }, []);

  const handlePolicyStatusAlertConfirm = React.useCallback(() => {
    if (pendingNewSalePolicyKey) {
      setSelectedPolicyKey(pendingNewSalePolicyKey);
    }
    setPolicyStatusAlertOpen(false);
    setPendingNewSalePolicyKey(null);
  }, [pendingNewSalePolicyKey]);

  const handleNewSaleConfirm = React.useCallback(() => {
    setNewSaleConfirmOpen(false);
    setSelectedPolicyKey(null);
    void loadEverything();
  }, [loadEverything]);

  const handleSaveDisposition = async () => {
    if (!selectedDisposition || !deal) return;
    setSavingDisposition(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Not authenticated");

      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", session.user.id).maybeSingle();
      if (!profile) throw new Error("Profile not found");

      const today = new Date().toISOString().split("T")[0];
      await supabase.from("retention_deal_flow").insert({
        submission_id: deal.policy_number,
        client_phone_number: deal.phone_number || null,
        insured_name: deal.name || null,
        date: today,
        retention_agent: profile.id,
        notes: dispositionNotes.trim() || null,
        status: selectedDisposition,
        call_result: selectedDisposition,
        is_retention_call: true,
        updated_at: new Date().toISOString(),
      });

      await supabase.from("failed_payment_fix_dispositions").insert({
        failed_payment_fix_id: deal.id,
        profile_id: profile.id,
        disposition: selectedDisposition,
        note: dispositionNotes.trim() || null,
      });

      toastRef.current({ title: "Disposition saved", description: `${selectedDisposition} saved successfully` });
      setDispositionModalOpen(false);
      setSelectedDisposition("");
      setDispositionNotes("");
    } catch (error) {
      console.error("Error saving disposition:", error);
      toastRef.current({ title: "Error", description: error instanceof Error ? error.message : "Failed to save disposition", variant: "destructive" });
    } finally {
      setSavingDisposition(false);
    }
  };

  React.useEffect(() => {
    if (!dispositionModalOpen) {
      setSelectedDisposition("");
      setDispositionNotes("");
    }
  }, [dispositionModalOpen]);

  const policyViews = React.useMemo(() => {
    if (!deal) return [];
    return [
      {
        key: deal.id,
        clientName: deal.name ?? "—",
        callCenter: deal.call_center ?? null,
        policyNumber: deal.policy_number,
        agentName: deal.sales_agent ?? null,
        monthlyPremium: deal.deal_value,
        coverage: deal.cc_value,
        initialDraftDate: null,
        statusNotes: deal.failure_reason ?? null,
        lastUpdated: deal.failure_date ?? null,
        status: deal.policy_status ?? null,
        raw: {
          ghl_stage: deal.ghl_stage,
          carrier: deal.carrier,
          phone_number: deal.phone_number,
          policy_type: deal.policy_type,
          policy_number: deal.policy_number,
          policy_status: deal.policy_status,
          deal_value: deal.deal_value,
          cc_value: deal.cc_value,
          call_center: deal.call_center,
          sales_agent: deal.sales_agent,
          assigned_agency: deal.assigned_agency,
          writing_number: deal.writing_number,
        },
      },
    ];
  }, [deal]);

  const selectedPolicyView = React.useMemo(() => {
    if (!deal) return null;
    return {
      callCenter: deal.call_center ?? null,
      policyNumber: deal.policy_number,
      clientName: deal.name ?? null,
      carrier: deal.carrier ?? null,
      agentName: deal.sales_agent ?? null,
    };
  }, [deal]);

  const name = deal?.name ?? "—";
  const phone = deal?.phone_number ?? "-";
  const carrier = deal?.carrier ?? "-";
  const productType = deal?.policy_type ?? "-";
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
      <div className="w-full space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/agent/failed-payment-fixes")}>
            <ArrowLeftIcon className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="text-xs text-muted-foreground">Matched by: <span className="font-medium">{matchedBy}</span></div>
          <div className="flex-1" />
          {previousFailedPaymentFixId && (
            <Button variant="outline" size="sm" onClick={goToPreviousFailedPaymentFix}>← Previous</Button>
          )}
          <div className="text-xs text-muted-foreground px-2">
            {effectiveNavIds.length > 0 ? effectiveNavIds.indexOf(idParam) + 1 : 0} / {effectiveNavIds.length}
          </div>
          {nextFailedPaymentFixId && (
            <Button variant="outline" size="sm" onClick={goToNextFailedPaymentFix}>Next →</Button>
          )}
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
            onPreviousLead={goToPreviousFailedPaymentFix}
            onNextLead={goToNextFailedPaymentFix}
            onOpenDisposition={() => setDispositionModalOpen(true)}
            hideGoToDialer={true}
            callBackNavigation={{
              previousId: previousFailedPaymentFixId,
              nextId: nextFailedPaymentFixId,
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
              <div className="text-sm text-muted-foreground">Failed payment fix not found.</div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                <div className="min-w-0">
                  <Tabs defaultValue="policies" className="w-full min-w-0">
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
                                onOpenPolicyStatusAlert={handleOpenPolicyStatusAlert}
                                onConfirmNewSale={handleConfirmNewSale}
                                lead={null}
                                selectedDeal={{
                                  monday_item_id: deal?.policy_number ?? null,
                                  ghl_stage: deal?.ghl_stage ?? null,
                                }}
                                retentionAgent={retentionAgent}
                                retentionAgentId={retentionAgentId}
                                verificationSessionId={null}
                                verificationItems={verificationItems}
                                verificationInputValues={verificationInputValues}
                                personalSsnLast4="****"
                                personalDob="-"
                                personalAddress1="-"
                                onCancelWorkflow={handleCancelWorkflow}
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
                        <DailyDealFlowTab loading={dailyFlowLoading} error={dailyFlowError} rows={dailyFlowRows} expandedRows={expandedDealFlowRows} onToggleRow={handleToggleDealFlowRow} />
                      </div>
                    </TabsContent>

                    <TabsContent value="contact-notes" className="pt-2">
                      <div className="space-y-4">
                        {deal?.policy_number ? (
                          <CrmLeadNotesPanel policyId={String(deal.policy_number)} />
                        ) : (
                          <div className="text-sm text-muted-foreground">No policy number available for contact notes.</div>
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

      <Dialog open={dispositionModalOpen} onOpenChange={setDispositionModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Quick Disposition</DialogTitle>
            <DialogDescription>
              Record disposition for {deal?.name || "this lead"} - {deal?.phone_number || "no phone"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Label>Disposition *</Label>
              <div className="grid grid-cols-2 gap-2">
                {DISPOSITION_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center space-x-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50 ${selectedDisposition === opt.value ? "bg-muted border-primary" : ""}`}
                  >
                    <input
                      type="radio"
                      name="disposition"
                      value={opt.value}
                      checked={selectedDisposition === opt.value}
                      onChange={(e) => setSelectedDisposition(e.target.value as Disposition)}
                      className="accent-primary"
                    />
                    <span className="flex-1 text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={dispositionNotes} onChange={(e) => setDispositionNotes(e.target.value)} placeholder="Add any notes..." className="min-h-[100px]" />
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDispositionModalOpen(false)} disabled={savingDisposition} className="flex-1">Cancel</Button>
            <Button onClick={handleSaveDisposition} disabled={!selectedDisposition || savingDisposition} className="flex-1">
              {savingDisposition ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Disposition"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}