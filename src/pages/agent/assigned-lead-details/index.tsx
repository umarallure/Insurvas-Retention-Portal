"use client";

import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  formatCurrency,
  formatValue,
  pickRowValue,
  titleizeKey,
  useAssignedLeadDetails,
} from "@/lib/agent/assigned-lead-details.logic";
import { useDashboard } from "@/components/dashboard-context";
import { getDealLabelStyle, getDealTagLabelFromGhlStage, getPolicyStatusStyle } from "@/lib/monday-deal-category-tags";
import { NewSaleWorkflow, FixedPaymentWorkflow, CarrierRequirementsWorkflow, type RetentionType } from "@/components/agent/retention-workflows";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { QuickDispositionButton } from "@/components/agent/quick-disposition-button";
import { QuickDispositionModal } from "@/components/agent/quick-disposition-modal";
import type { AgentType } from "@/lib/dispositions/types";

export default function AssignedLeadDetailsPage() {
  const { setCurrentLeadPhone } = useDashboard();
  const [expandedWorkflowKey, setExpandedWorkflowKey] = React.useState<string | null>(null);
  const [activeWorkflowType, setActiveWorkflowType] = React.useState<RetentionType | null>(null);
  const [policyStatusAlertOpen, setPolicyStatusAlertOpen] = React.useState(false);
  const [newSaleConfirmOpen, setNewSaleConfirmOpen] = React.useState(false);
  const [pendingNewSalePolicyKey, setPendingNewSalePolicyKey] = React.useState<string | null>(null);
  const [retentionAgent, setRetentionAgent] = React.useState("");
  const [retentionAgentId, setRetentionAgentId] = React.useState("");
  const [expandedDealFlowRows, setExpandedDealFlowRows] = React.useState<Set<string>>(new Set());
  const [dispositionModalOpen, setDispositionModalOpen] = React.useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = React.useState(false);
  const [pendingNavigationUrl, setPendingNavigationUrl] = React.useState<string | null>(null);
  const allowNavigationRef = React.useRef(false);

  React.useEffect(() => {
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
          setRetentionAgentId(session.user.id);
        }
      } catch {
        if (!cancelled) setRetentionAgent("");
      }
    };

    void loadLoggedInAgent();
    return () => {
      cancelled = true;
    };
  }, []);
  const {
    lead,
    dealId,
    previousAssignedDealId,
    nextAssignedDealId,
    assignedDealsLoading,
    goToPreviousAssignedLead,
    goToNextAssignedLead,
    selectedDeal,
    router,
    mondayLoading,
    duplicateLoading,
    mondayError,
    duplicateError,
    policyCards,
    policyViews,
    selectedPolicyKey,
    setSelectedPolicyKey,
    selectedPolicyView,
    verificationLoading,
    verificationError,
    verificationItems,
    verificationInputValues,
    toggleVerificationItem,
    updateVerificationItemValue,
    dailyFlowLoading,
    dailyFlowError,
    dailyFlowRows,
    personalPhone,
    personalAddress1,
    personalDob,
    personalSsnLast4,
    loading,
    error,
    name,
    carrier,
    productType,
    center,
  } = useAssignedLeadDetails();

  React.useEffect(() => {
    if (!router?.isReady) return;
    if (router.pathname !== "/agent/assigned-lead-details") return;

    const onClickCapture = (e: MouseEvent) => {
      if (allowNavigationRef.current) return;
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href) return;
      if (href.startsWith("#")) return;
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const isExternal = /^https?:\/\//i.test(href) || href.startsWith("//");
      if (isExternal) return;

      if (href === router.asPath) return;

      e.preventDefault();
      setPendingNavigationUrl(href);
      setLeaveConfirmOpen(true);
    };

    window.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("click", onClickCapture, true);
    };
  }, [router]);

  React.useEffect(() => {
    if (!router?.events) return;
    const onDone = () => {
      allowNavigationRef.current = false;
    };
    router.events.on("routeChangeComplete", onDone);
    router.events.on("routeChangeError", onDone);
    return () => {
      router.events.off("routeChangeComplete", onDone);
      router.events.off("routeChangeError", onDone);
    };
  }, [router?.events]);

  React.useEffect(() => {
    const raw = typeof personalPhone === "string" ? personalPhone.trim() : "";
    const phone = raw && raw !== "-" ? raw : null;
    setCurrentLeadPhone(phone);
  }, [personalPhone, setCurrentLeadPhone]);

  React.useEffect(() => {
    return () => {
      setCurrentLeadPhone(null);
    };
  }, [setCurrentLeadPhone]);

  return (
    <div className="w-full px-6 py-8 min-h-screen bg-muted/20">
      <Dialog open={policyStatusAlertOpen} onOpenChange={setPolicyStatusAlertOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Policy Status Alert
            </DialogTitle>
          </DialogHeader>

          <div className="text-muted-foreground text-lg leading-relaxed">
            This is not a pending policy. Either select a different workflow or policy.
          </div>

          <div className="pt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                variant="secondary"
                className="h-12"
                onClick={() => {
                  setPolicyStatusAlertOpen(false);
                  setExpandedWorkflowKey(selectedPolicyKey);
                  setActiveWorkflowType("fixed_payment");
                }}
              >
                Switch to Fix Payment
              </Button>

              <Button
                variant="secondary"
                className="h-12"
                onClick={() => {
                  setPolicyStatusAlertOpen(false);
                  setExpandedWorkflowKey(selectedPolicyKey);
                  setActiveWorkflowType("new_sale");
                }}
              >
                Switch to New Sale
              </Button>
            </div>

            <Button
              variant="outline"
              className="w-full h-12"
              onClick={() => {
                setPolicyStatusAlertOpen(false);
                if (selectedPolicyView && lead && typeof lead.id === "string" && selectedPolicyView.policyNumber) {
                  const raw = (selectedPolicyView.raw ?? null) as unknown as Record<string, unknown> | null;
                  const dealIdForRoute = raw && typeof raw["id"] === "number" ? (raw["id"] as number) : null;
                  void router.push(
                    `/agent/call-update?leadId=${encodeURIComponent(lead.id)}&policyNumber=${encodeURIComponent(
                      selectedPolicyView.policyNumber,
                    )}&dealId=${encodeURIComponent(String(dealIdForRoute ?? ""))}&callCenter=${encodeURIComponent(
                      selectedPolicyView.callCenter ?? "",
                    )}&retentionAgent=${encodeURIComponent(retentionAgent)}&retentionType=carrier_requirements`,
                  );
                }
              }}
            >
              Update Call Result
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newSaleConfirmOpen}
        onOpenChange={(open) => {
          setNewSaleConfirmOpen(open);
          if (!open) setPendingNewSalePolicyKey(null);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Confirm New Sale
            </DialogTitle>
          </DialogHeader>

          <div className="text-sm text-muted-foreground leading-relaxed">
            You are about to proceed with <span className="font-medium text-foreground">New Sale</span>.
            Please confirm.
          </div>

          <div className="pt-4 flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setNewSaleConfirmOpen(false);
                setPendingNewSalePolicyKey(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                const key = pendingNewSalePolicyKey;
                setNewSaleConfirmOpen(false);
                setPendingNewSalePolicyKey(null);
                if (!key) return;
                setExpandedWorkflowKey(key);
                setActiveWorkflowType("new_sale");
              }}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={leaveConfirmOpen}
        onOpenChange={(open) => {
          setLeaveConfirmOpen(open);
          if (!open) setPendingNavigationUrl(null);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Leave this page?</DialogTitle>
            <DialogDescription>
              You will lose your progress if you navigate away. Please open the other page in a new tab.
            </DialogDescription>
          </DialogHeader>

          <div className="pt-4 flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setLeaveConfirmOpen(false);
                setPendingNavigationUrl(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                const url = pendingNavigationUrl;
                allowNavigationRef.current = true;
                setLeaveConfirmOpen(false);
                setPendingNavigationUrl(null);
                if (url) void router.push(url);
              }}
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <QuickDispositionModal
        open={dispositionModalOpen}
        onOpenChange={setDispositionModalOpen}
        dealId={selectedPolicyView ? (selectedPolicyView.raw as { id?: number })?.id ?? null : null}
        mondayItemId={selectedDeal?.monday_item_id ?? undefined}
        policyNumber={selectedPolicyView?.policyNumber ?? undefined}
        policyStatus={selectedDeal?.ghl_stage ?? undefined}
        ghlStage={selectedDeal?.ghl_stage ?? undefined}
        agentId={retentionAgentId}
        agentName={retentionAgent}
        agentType={"retention_agent" as AgentType}
        onSuccess={() => {
          // Intentionally do not refresh the page; modal will close after save.
        }}
      />

      <div className="w-full">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle>{name}</CardTitle>
                <CardDescription>
                  {carrier !== "-" ? carrier : ""}
                  {productType !== "-" ? ` • ${productType}` : ""}
                  {center !== "-" ? ` • ${center}` : ""}
                </CardDescription>
              </div>
              <div className="flex shrink-0 gap-2">
                <QuickDispositionButton
                  onClick={() => setDispositionModalOpen(true)}
                  disabled={!selectedPolicyView || !dealId}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={assignedDealsLoading || !dealId || !previousAssignedDealId}
                  onClick={() => void goToPreviousAssignedLead()}
                >
                  Previous Lead
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={assignedDealsLoading || !dealId || !nextAssignedDealId}
                  onClick={() => void goToNextAssignedLead()}
                >
                  Next Lead
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading lead details...</div>
            ) : error ? (
              <div className="text-sm text-red-600">{error}</div>
            ) : !lead && !selectedDeal ? (
              <div className="text-sm text-muted-foreground">Lead not found.</div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                <div className="min-w-0">
                  <Tabs defaultValue="policies" className="w-full min-w-0">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="policies">Policies</TabsTrigger>
                      <TabsTrigger value="daily">Deal Notes</TabsTrigger>
                    </TabsList>

                    <TabsContent value="policies" className="pt-2">
                      <div className="rounded-md border p-4">
                        <div className="text-sm font-medium">Policies</div>
                        <Separator className="my-3" />

                      {mondayLoading || duplicateLoading ? (
                        <div className="text-sm text-muted-foreground">Loading policies...</div>
                      ) : mondayError || duplicateError ? (
                        <div className="text-sm text-red-600">{mondayError ?? duplicateError}</div>
                      ) : policyCards.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No policies found.</div>
                      ) : (
                        <div className="space-y-3 max-w-xl">
                          {policyViews.map((p) => {
                            const isSelected = p.key === selectedPolicyKey;
                            const rawStage = p.raw && typeof (p.raw as { ghl_stage?: unknown }).ghl_stage === "string" ? ((p.raw as { ghl_stage?: string }).ghl_stage as string) : null;
                            const stageLabel = getDealTagLabelFromGhlStage(rawStage);
                            const stageStyle = getDealLabelStyle(stageLabel);

                            const dispositionLabel =
                              p.raw && typeof (p.raw as { disposition?: unknown }).disposition === "string"
                                ? (((p.raw as { disposition?: string }).disposition ?? "").trim() || null)
                                : null;

                            const statusLabel = (p.status ?? "").toString();
                            const statusStyle = getPolicyStatusStyle(statusLabel);
                            const shouldShowStatusPill =
                              statusLabel.trim().length > 0 &&
                              statusLabel.trim() !== "—" &&
                              statusLabel.trim().toLowerCase() !== (stageLabel ?? "").toString().trim().toLowerCase();
                            return (
                              <div
                                key={p.key}
                                onClick={() => setSelectedPolicyKey(p.key)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setSelectedPolicyKey(p.key);
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                                className={
                                  "text-left rounded-lg border bg-card p-4 transition-all cursor-pointer " +
                                  (isSelected ? "ring-2 ring-primary border-primary shadow-md" : "hover:shadow-sm hover:border-muted-foreground/20")
                                }
                              >
                                <div className="flex items-start justify-between gap-3 mb-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="text-base font-semibold text-foreground truncate" title={p.clientName}>
                                      {p.clientName}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate mt-0.5" title={String(p.callCenter ?? "")}>
                                      {p.callCenter ?? "—"}
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                    {shouldShowStatusPill ? (
                                      <div
                                        className="text-xs rounded-md border px-2.5 py-1 font-medium whitespace-nowrap"
                                        style={
                                          statusStyle
                                            ? { backgroundColor: statusStyle.bg, borderColor: statusStyle.border, color: statusStyle.text }
                                            : undefined
                                        }
                                      >
                                        {p.status}
                                      </div>
                                    ) : null}
                                    {stageLabel && stageStyle ? (
                                      <div
                                        className="text-[11px] rounded-full border px-2 py-0.5 font-medium whitespace-nowrap"
                                        style={{ backgroundColor: stageStyle.bg, borderColor: stageStyle.border, color: stageStyle.text }}
                                      >
                                        {stageLabel}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="grid grid-cols-[1fr_auto] gap-x-8 gap-y-3">
                                  <div className="space-y-1">
                                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Policy #</div>
                                    <div className="text-sm font-medium text-foreground truncate" title={p.policyNumber ?? undefined}>
                                      {p.policyNumber ?? "—"}
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Agent</div>
                                    <div className="text-sm font-medium text-foreground truncate" title={p.agentName ?? undefined}>
                                      {p.agentName ?? "—"}
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Disposition</div>
                                    <div className="text-sm font-medium text-foreground truncate" title={dispositionLabel ?? undefined}>
                                      {dispositionLabel ?? "—"}
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Monthly Premium</div>
                                    <div className="text-sm font-medium text-foreground">
                                      {formatCurrency(p.monthlyPremium)}
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Coverage</div>
                                    <div className="text-sm font-medium text-foreground">
                                      {formatValue(p.coverage)}
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Initial Draft Date</div>
                                    <div className="text-sm font-medium text-foreground">
                                      {formatValue(p.initialDraftDate)}
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Status Notes</div>
                                    <div className="text-sm text-foreground/80 line-clamp-2" title={p.statusNotes ?? undefined}>
                                      {p.statusNotes ?? "—"}
                                    </div>
                                  </div>
                          
                                </div>


                                <div className="mt-3 mb-5 pt-3 border-t">
                                  <div className="flex items-baseline justify-between gap-3">
                                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Last Updated</div>
                                    <div className="text-xs text-muted-foreground">
                                      {formatValue(p.lastUpdated)}
                                    </div>
                                  </div>
                                </div>

                                {isSelected ? (
                                  <div className="mt-4 space-y-3">
                                    <div className="grid grid-cols-3 gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (expandedWorkflowKey === p.key && activeWorkflowType === "new_sale") {
                                            setExpandedWorkflowKey(null);
                                            setActiveWorkflowType(null);
                                          } else {
                                            const statusText = ((p.status ?? "") as string).toString().trim().toLowerCase();
                                            const stageText = ((stageLabel ?? "") as string).toString().trim().toLowerCase();
                                            const needsConfirm =
                                              statusText.includes("failed payment") ||
                                              statusText.includes("pending approval") ||
                                              stageText.includes("failed payment") ||
                                              stageText.includes("pending approval");

                                            if (needsConfirm) {
                                              setPendingNewSalePolicyKey(p.key);
                                              setNewSaleConfirmOpen(true);
                                              return;
                                            }

                                            setExpandedWorkflowKey(p.key);
                                            setActiveWorkflowType("new_sale");
                                          }
                                        }}
                                        className={expandedWorkflowKey === p.key && activeWorkflowType === "new_sale" ? "border-primary bg-primary/10" : ""}
                                      >
                                        New Sale
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (expandedWorkflowKey === p.key && activeWorkflowType === "fixed_payment") {
                                            setExpandedWorkflowKey(null);
                                            setActiveWorkflowType(null);
                                          } else {
                                            setExpandedWorkflowKey(p.key);
                                            setActiveWorkflowType("fixed_payment");
                                          }
                                        }}
                                        className={expandedWorkflowKey === p.key && activeWorkflowType === "fixed_payment" ? "border-primary bg-primary/10" : ""}
                                      >
                                        Fix Payment
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPolicyStatusAlertOpen(true);
                                        }}
                                        className={expandedWorkflowKey === p.key && activeWorkflowType === "carrier_requirements" ? "border-primary bg-primary/10" : ""}
                                      >
                                        Carrier Req.
                                      </Button>
                                    </div>

                                    {expandedWorkflowKey === p.key && activeWorkflowType ? (
                                      <div className="mt-3">
                                        {(() => {
                                          const leadIdForRoute = typeof lead?.id === "string" ? lead.id : null;
                                          const raw = (p.raw ?? null) as unknown as Record<string, unknown> | null;
                                          const dealIdForRoute = raw && typeof raw["id"] === "number" ? (raw["id"] as number) : null;
                                          const phoneNumberForRoute = raw && typeof raw["phone_number"] === "string" ? (raw["phone_number"] as string) : null;
                                          const agentNameForRoute = p.agentName && p.agentName !== "—" ? p.agentName : "";
                                          const writingNumberForRoute = raw && typeof raw["writing_no"] === "string" ? (raw["writing_no"] as string) : "";

                                          const getVerificationValue = (field: string) => {
                                            const item = verificationItems.find(
                                              (it) => typeof it.field_name === "string" && it.field_name === field,
                                            ) as Record<string, unknown> | undefined;
                                            const itemId = item && typeof item.id === "string" ? (item.id as string) : "";
                                            const fromInput = itemId ? (verificationInputValues[itemId] ?? "") : "";
                                            const fromVerified = item && typeof item.verified_value === "string" ? (item.verified_value as string) : "";
                                            const fromOriginal = item && typeof item.original_value === "string" ? (item.original_value as string) : "";

                                            return String(fromInput || fromVerified || fromOriginal || "").trim();
                                          };

                                          const ssnFromVerification = (() => {
                                            return getVerificationValue("social_security");
                                          })();

                                          const dobFromVerification = getVerificationValue("date_of_birth");
                                          const addressFromVerification = getVerificationValue("street_address");

                                          const ssnLast4Raw = (
                                            (ssnFromVerification || "") || (personalSsnLast4 !== "-" ? personalSsnLast4 : "")
                                          ).trim();

                                          const ssnDigits = ssnLast4Raw.replace(/\D/g, "");
                                          const ssnLast4ForRoute = ssnDigits.length > 4 ? ssnDigits.slice(-4) : ssnDigits;

                                          const deal = {
                                            dealId: dealIdForRoute,
                                            policyNumber: p.policyNumber,
                                            callCenter: p.callCenter,
                                            carrier: p.carrier,
                                            clientName: p.clientName,
                                            phoneNumber: phoneNumberForRoute,
                                          };

                                          const leadInfo = {
                                            dob: (dobFromVerification || (personalDob !== "-" ? personalDob : "")).trim(),
                                            ghlStage: selectedDeal?.ghl_stage ?? "",
                                            agentName: agentNameForRoute,
                                            writingNumber: writingNumberForRoute,
                                            ssnLast4: ssnLast4ForRoute,
                                            address: (addressFromVerification || (personalAddress1 !== "-" ? personalAddress1 : "")).trim(),
                                          };

                                          const handleCancel = () => {
                                            setExpandedWorkflowKey(null);
                                            setActiveWorkflowType(null);
                                          };

                                          if (activeWorkflowType === "new_sale") {
                                            return (
                                              <NewSaleWorkflow
                                                leadId={leadIdForRoute}
                                                dealId={dealIdForRoute}
                                                policyNumber={p.policyNumber}
                                                callCenter={p.callCenter}
                                                retentionAgent={retentionAgent}
                                                onCancel={handleCancel}
                                              />
                                            );
                                          }

                                          if (activeWorkflowType === "fixed_payment") {
                                            return (
                                              <FixedPaymentWorkflow
                                                deal={deal}
                                                leadInfo={leadInfo}
                                                lead={lead}
                                                retentionAgent={retentionAgent}
                                                onCancel={handleCancel}
                                              />
                                            );
                                          }

                                          if (activeWorkflowType === "carrier_requirements") {
                                            return (
                                              <CarrierRequirementsWorkflow
                                                deal={deal}
                                                leadInfo={leadInfo}
                                                lead={lead}
                                                retentionAgent={retentionAgent}
                                                onCancel={handleCancel}
                                              />
                                            );
                                          }

                                          return null;
                                        })()}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      </div>
                    </TabsContent>

                    <TabsContent value="daily" className="pt-2">
                      <div className="rounded-md border p-4 min-w-0">
                        <div className="text-sm font-medium">Daily Deal Flow & Notes</div>
                        <Separator className="my-3" />

                    {dailyFlowLoading ? (
                      <div className="text-sm text-muted-foreground">Loading daily deal flow...</div>
                    ) : dailyFlowError ? (
                      <div className="text-sm text-red-600">{dailyFlowError}</div>
                    ) : dailyFlowRows.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No daily deal flow records found.</div>
                    ) : (
                      <div className="space-y-2">
                        {dailyFlowRows.map((row, idx) => {
                          const rowId = String(row["id"] ?? idx);
                          const isExpanded = expandedDealFlowRows.has(rowId);
                          const note = pickRowValue(row, ["notes", "note", "lead_notes"]);
                          const noteText = typeof note === "string" ? note.trim() : "";
                          const hasNotes = noteText.length > 0;

                          const toggleExpand = () => {
                            setExpandedDealFlowRows((prev) => {
                              const next = new Set(prev);
                              if (next.has(rowId)) {
                                next.delete(rowId);
                              } else {
                                next.add(rowId);
                              }
                              return next;
                            });
                          };

                          return (
                            <div key={rowId} className="rounded-md border bg-card">
                              <div
                                className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={toggleExpand}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5">
                                    {hasNotes ? (
                                      isExpanded ? (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                      )
                                    ) : (
                                      <div className="h-4 w-4" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                                      <div>
                                        <div className="text-xs text-muted-foreground">Date</div>
                                        <div className="font-medium">{formatValue(row["date"])}</div>
                                      </div>
                                      <div>
                                        <div className="text-xs text-muted-foreground">Lead Vendor</div>
                                        <div className="font-medium">{formatValue(pickRowValue(row, ["lead_vendor"]))}</div>
                                      </div>
                                      <div>
                                        <div className="text-xs text-muted-foreground">Agent</div>
                                        <div className="font-medium">{formatValue(pickRowValue(row, ["agent"]))}</div>
                                      </div>
                                      <div>
                                        <div className="text-xs text-muted-foreground">Status</div>
                                        <div className="font-medium">{formatValue(pickRowValue(row, ["status"]))}</div>
                                      </div>
                                      <div>
                                        <div className="text-xs text-muted-foreground">Carrier</div>
                                        <div className="font-medium">{formatValue(pickRowValue(row, ["carrier"]))}</div>
                                      </div>
                                      <div>
                                        <div className="text-xs text-muted-foreground">Product Type</div>
                                        <div className="font-medium">{formatValue(pickRowValue(row, ["product_type"]))}</div>
                                      </div>
                                      <div>
                                        <div className="text-xs text-muted-foreground">Monthly Premium</div>
                                        <div className="font-medium">{formatCurrency(pickRowValue(row, ["monthly_premium"]))}</div>
                                      </div>
                                      <div>
                                        <div className="text-xs text-muted-foreground">Face Amount</div>
                                        <div className="font-medium">{formatCurrency(pickRowValue(row, ["face_amount"]))}</div>
                                      </div>
                                    </div>
                                    {hasNotes && !isExpanded && (
                                      <div className="mt-2 text-xs text-muted-foreground italic truncate">
                                        {noteText}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {hasNotes && isExpanded && (
                                <div className="px-3 pb-3">
                                  <div className="ml-7 rounded-md border bg-muted/30 p-3">
                                    <div className="text-xs font-semibold text-muted-foreground mb-2">Notes</div>
                                    <div className="text-sm text-foreground whitespace-pre-wrap">{noteText}</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                      </div>
                    </TabsContent>

                  </Tabs>
                </div>

                <Card className="h-fit lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:flex lg:flex-col">
                  <CardHeader className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-base font-semibold">Verification Panel</CardTitle>
                      <div className="text-xs rounded-md bg-muted px-2 py-1 font-medium text-foreground">
                        {selectedPolicyView?.callCenter ?? "—"}
                      </div>
                    </div>
                    <CardDescription>
                      {selectedPolicyView
                        ? `Selected policy: ${selectedPolicyView.policyNumber ?? "—"}`
                        : "Select a policy to view verification."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div className="text-muted-foreground">Client Name</div>
                      <div className="font-semibold text-foreground text-right">
                        {selectedPolicyView?.clientName ?? "—"}
                      </div>

                      <div className="text-muted-foreground">Carrier</div>
                      <div className="font-semibold text-foreground text-right">
                        {selectedPolicyView?.carrier ?? "—"}
                      </div>

                      <div className="text-muted-foreground">Policy Number</div>
                      <div className="font-semibold text-foreground text-right">
                        {selectedPolicyView?.policyNumber ?? "—"}
                      </div>

                      <div className="text-muted-foreground">Agent</div>
                      <div className="font-semibold text-foreground text-right">
                        {selectedPolicyView?.agentName ?? "—"}
                      </div>
                    </div>

                    <Separator />

                    {verificationLoading ? (
                      <div className="text-sm text-muted-foreground">Loading verification...</div>
                    ) : verificationError ? (
                      <div className="text-sm text-red-600">{verificationError}</div>
                    ) : verificationItems.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No verification fields yet.</div>
                    ) : (
                      <div className="space-y-3">
                        {verificationItems.map((item) => {
                          const itemId = typeof item.id === "string" ? item.id : null;
                          if (!itemId) return null;
                          const fieldName = typeof item.field_name === "string" ? item.field_name : "";
                          const checked = !!item.is_verified;
                          const value = verificationInputValues[itemId] ?? "";

                          return (
                            <div key={itemId} className="rounded-lg border bg-card px-3 py-2 space-y-2">
                              <div className="flex items-center gap-2">
                                <div className="text-xs font-medium text-foreground truncate" title={fieldName}>
                                  {titleizeKey(fieldName || "Field")}
                                </div>
                                <div className="ml-auto flex items-center gap-2">
                                  <div className="text-[11px] text-muted-foreground">
                                    {checked ? "Verified" : "Pending"}
                                  </div>
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(v) => {
                                      void toggleVerificationItem(itemId, Boolean(v));
                                    }}
                                  />
                                </div>
                              </div>

                              <Input
                                value={value}
                                onChange={(e) => {
                                  void updateVerificationItemValue(itemId, e.target.value);
                                }}
                                className="text-xs"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}

                  </CardContent>
                </Card>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
