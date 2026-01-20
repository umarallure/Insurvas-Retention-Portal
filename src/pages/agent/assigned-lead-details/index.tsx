"use client";

import * as React from "react";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAssignedLeadDetails } from "@/lib/agent/assigned-lead-details.logic";
import { useDashboard } from "@/components/dashboard-context";
import { QuickDispositionModal } from "@/components/agent/quick-disposition-modal";
import type { AgentType } from "@/lib/dispositions/types";
import type { RetentionType } from "@/components/agent/retention-workflows";
import { PolicyStatusAlertDialog } from "@/components/agent/assigned-lead-details/policy-status-alert-dialog";
import { NewSaleConfirmDialog } from "@/components/agent/assigned-lead-details/new-sale-confirm-dialog";
import { LeaveConfirmDialog } from "@/components/agent/assigned-lead-details/leave-confirm-dialog";
import { LeadHeader } from "@/components/agent/assigned-lead-details/lead-header";
import { PolicyCard } from "@/components/agent/assigned-lead-details/policy-card";
import { DailyDealFlowTab } from "@/components/agent/assigned-lead-details/daily-deal-flow-tab";
import { VerificationPanel } from "@/components/agent/assigned-lead-details/verification-panel";
import { useNavigationPrevention } from "@/components/agent/assigned-lead-details/use-navigation-prevention";
import { useRetentionAgent } from "@/components/agent/assigned-lead-details/use-retention-agent";
import { DataValidationPanel } from "@/components/data-quality/data-validation-panel";
import { ActivityTimeline } from "@/components/data-quality/activity-timeline";
import { useAccess } from "@/components/access-context";

export default function AssignedLeadDetailsPage() {
  const { setCurrentLeadPhone } = useDashboard();
  const router = useRouter();
  const { retentionAgent, retentionAgentId } = useRetentionAgent();
  const { access } = useAccess();

  const [expandedWorkflowKey, setExpandedWorkflowKey] = React.useState<string | null>(null);
  const [activeWorkflowType, setActiveWorkflowType] = React.useState<RetentionType | null>(null);
  const [policyStatusAlertOpen, setPolicyStatusAlertOpen] = React.useState(false);
  const [newSaleConfirmOpen, setNewSaleConfirmOpen] = React.useState(false);
  const [pendingNewSalePolicyKey, setPendingNewSalePolicyKey] = React.useState<string | null>(null);
  const [expandedDealFlowRows, setExpandedDealFlowRows] = React.useState<Set<string>>(new Set());
  const [dispositionModalOpen, setDispositionModalOpen] = React.useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = React.useState(false);
  const [pendingNavigationUrl, setPendingNavigationUrl] = React.useState<string | null>(null);

  const { allowNavigation } = useNavigationPrevention(setPendingNavigationUrl, setLeaveConfirmOpen);

  const {
    lead,
    dealId,
    previousAssignedDealId,
    nextAssignedDealId,
    assignedDealsLoading,
    goToPreviousAssignedLead,
    goToNextAssignedLead,
    selectedDeal,
    mondayLoading,
    duplicateLoading,
    mondayError,
    duplicateError,
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
    const raw = typeof personalPhone === "string" ? personalPhone.trim() : "";
    const phone = raw && raw !== "-" ? raw : null;
    setCurrentLeadPhone(phone);
  }, [personalPhone, setCurrentLeadPhone]);

  React.useEffect(() => {
    return () => {
      setCurrentLeadPhone(null);
    };
  }, [setCurrentLeadPhone]);

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

  return (
    <div className="w-full px-6 py-8 min-h-screen bg-muted/20">
      <PolicyStatusAlertDialog
        open={policyStatusAlertOpen}
        onOpenChange={setPolicyStatusAlertOpen}
        selectedPolicyKey={selectedPolicyKey}
        selectedPolicyView={selectedPolicyView}
        lead={lead}
        selectedDeal={selectedDeal}
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

      <LeaveConfirmDialog
        open={leaveConfirmOpen}
        onOpenChange={(open) => {
          setLeaveConfirmOpen(open);
          if (!open) setPendingNavigationUrl(null);
        }}
        pendingNavigationUrl={pendingNavigationUrl}
        onConfirm={() => {
                const url = pendingNavigationUrl;
          allowNavigation();
                setLeaveConfirmOpen(false);
                setPendingNavigationUrl(null);
                if (url) void router.push(url);
              }}
      />

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
          <LeadHeader
            name={name}
            carrier={carrier}
            productType={productType}
            center={center}
            dealId={dealId}
            previousAssignedDealId={previousAssignedDealId}
            nextAssignedDealId={nextAssignedDealId}
            assignedDealsLoading={assignedDealsLoading}
            selectedPolicyView={selectedPolicyView}
            onPreviousLead={() => void goToPreviousAssignedLead()}
            onNextLead={() => void goToNextAssignedLead()}
            onOpenDisposition={() => setDispositionModalOpen(true)}
          />
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
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="policies">Policies</TabsTrigger>
                      <TabsTrigger value="daily">Deal Notes</TabsTrigger>
                      <TabsTrigger value="data-quality">Data Quality</TabsTrigger>
                    </TabsList>

                    <TabsContent value="policies" className="pt-2">
                      <div className="rounded-md border p-4">
                        <div className="text-sm font-medium">Policies</div>
                        <Separator className="my-3" />

                      {mondayLoading || duplicateLoading ? (
                        <div className="text-sm text-muted-foreground">Loading policies...</div>
                      ) : mondayError || duplicateError ? (
                        <div className="text-sm text-red-600">{mondayError ?? duplicateError}</div>
                        ) : policyViews.length === 0 ? (
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
                                                lead={lead}
                                selectedDeal={selectedDeal}
                                                retentionAgent={retentionAgent}
                                verificationItems={verificationItems}
                                verificationInputValues={verificationInputValues}
                                personalSsnLast4={personalSsnLast4}
                                personalDob={personalDob}
                                personalAddress1={personalAddress1}
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
                        <DailyDealFlowTab
                          loading={dailyFlowLoading}
                          error={dailyFlowError}
                          rows={dailyFlowRows}
                          expandedRows={expandedDealFlowRows}
                          onToggleRow={handleToggleDealFlowRow}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="data-quality" className="pt-2">
                      <div className="space-y-4">
                        {(selectedDeal?.monday_item_id || lead?.submission_id) ? (
                          <>
                            <DataValidationPanel
                              submissionId={String(selectedDeal?.monday_item_id ?? lead?.submission_id ?? "")}
                              dealId={selectedPolicyView ? (selectedPolicyView.raw as { id?: number })?.id ?? undefined : undefined}
                            />
                            <ActivityTimeline
                              submissionId={String(selectedDeal?.monday_item_id ?? lead?.submission_id ?? "")}
                            />
                          </>
                        ) : (
                          <div className="text-sm text-muted-foreground">No submission ID available for data quality analysis.</div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>

                <div className="space-y-4">
                <VerificationPanel
                  selectedPolicyView={selectedPolicyView}
                  loading={verificationLoading}
                  error={verificationError}
                  verificationItems={verificationItems}
                  verificationInputValues={verificationInputValues}
                  onToggleVerification={toggleVerificationItem}
                  onUpdateValue={updateVerificationItemValue}
                />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
