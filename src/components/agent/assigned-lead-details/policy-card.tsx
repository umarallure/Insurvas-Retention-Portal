"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { getDealLabelStyle, getDealTagLabelFromGhlStage, getPolicyStatusStyle } from "@/lib/monday-deal-category-tags";
import { formatCurrency, formatValue } from "@/lib/agent/assigned-lead-details.logic";
import { NewSaleWorkflow, FixedPaymentWorkflow, CarrierRequirementsWorkflow, type RetentionType } from "@/components/agent/retention-workflows";

type PolicyView = {
  key: string;
  clientName: string;
  callCenter?: string | null;
  policyNumber?: string | null;
  agentName?: string | null;
  monthlyPremium?: unknown;
  coverage?: unknown;
  initialDraftDate?: unknown;
  statusNotes?: string | null;
  lastUpdated?: unknown;
  status?: unknown;
  raw?: unknown;
};

type PolicyCardProps = {
  policy: PolicyView;
  isSelected: boolean;
  onSelect: () => void;
  expandedWorkflowKey: string | null;
  activeWorkflowType: RetentionType | null;
  onToggleWorkflow: (workflowType: RetentionType) => void;
  onOpenPolicyStatusAlert: () => void;
  onConfirmNewSale: (policyKey: string) => void;
  lead: { id?: string } | null;
  selectedDeal: { monday_item_id?: string | null; ghl_stage?: string | null } | null;
  retentionAgent: string;
  verificationItems: Array<Record<string, unknown>>;
  verificationInputValues: Record<string, string>;
  personalSsnLast4: string;
  personalDob: string;
  personalAddress1: string;
  onCancelWorkflow: () => void;
};

export function PolicyCard({
  policy,
  isSelected,
  onSelect,
  expandedWorkflowKey,
  activeWorkflowType,
  onToggleWorkflow,
  onOpenPolicyStatusAlert,
  onConfirmNewSale,
  lead,
  selectedDeal,
  retentionAgent,
  verificationItems,
  verificationInputValues,
  personalSsnLast4,
  personalDob,
  personalAddress1,
  onCancelWorkflow,
}: PolicyCardProps) {
  const rawStage =
    policy.raw && typeof (policy.raw as { ghl_stage?: unknown }).ghl_stage === "string"
      ? ((policy.raw as { ghl_stage?: string }).ghl_stage as string)
      : null;
  const stageLabel = getDealTagLabelFromGhlStage(rawStage);
  const stageStyle = getDealLabelStyle(stageLabel);

  const statusLabel = (policy.status ?? "").toString();
  const statusStyle = getPolicyStatusStyle(statusLabel);
  const shouldShowStatusPill =
    statusLabel.trim().length > 0 &&
    statusLabel.trim() !== "—" &&
    statusLabel.trim().toLowerCase() !== (stageLabel ?? "").toString().trim().toLowerCase();

  const handleNewSaleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (expandedWorkflowKey === policy.key && activeWorkflowType === "new_sale") {
      onCancelWorkflow();
    } else {
      const statusText = ((policy.status ?? "") as string).toString().trim().toLowerCase();
      const stageText = ((stageLabel ?? "") as string).toString().trim().toLowerCase();
      const needsConfirm =
        statusText.includes("failed payment") ||
        statusText.includes("pending approval") ||
        stageText.includes("failed payment") ||
        stageText.includes("pending approval");

      if (needsConfirm) {
        onConfirmNewSale(policy.key);
        return;
      }

      onToggleWorkflow("new_sale");
    }
  };

  const handleFixedPaymentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (expandedWorkflowKey === policy.key && activeWorkflowType === "fixed_payment") {
      onCancelWorkflow();
    } else {
      onToggleWorkflow("fixed_payment");
    }
  };

  const getVerificationValue = (field: string) => {
    const item = verificationItems.find((it) => typeof it.field_name === "string" && it.field_name === field) as
      | Record<string, unknown>
      | undefined;
    const itemId = item && typeof item.id === "string" ? (item.id as string) : "";
    const fromInput = itemId ? (verificationInputValues[itemId] ?? "") : "";
    const fromVerified = item && typeof item.verified_value === "string" ? (item.verified_value as string) : "";
    const fromOriginal = item && typeof item.original_value === "string" ? (item.original_value as string) : "";

    return String(fromInput || fromVerified || fromOriginal || "").trim();
  };

  const ssnFromVerification = getVerificationValue("social_security");
  const dobFromVerification = getVerificationValue("date_of_birth");
  const addressFromVerification = getVerificationValue("street_address");

  const ssnLast4Raw = ((ssnFromVerification || "") || (personalSsnLast4 !== "-" ? personalSsnLast4 : "")).trim();
  const ssnDigits = ssnLast4Raw.replace(/\D/g, "");
  const ssnLast4ForRoute = ssnDigits.length > 4 ? ssnDigits.slice(-4) : ssnDigits;

  const raw = (policy.raw ?? null) as unknown as Record<string, unknown> | null;
  const dealIdForRoute = raw && typeof raw["id"] === "number" ? (raw["id"] as number) : null;
  const phoneNumberForRoute = raw && typeof raw["phone_number"] === "string" ? (raw["phone_number"] as string) : null;
  const agentNameForRoute = policy.agentName && policy.agentName !== "—" ? policy.agentName : "";
  const writingNumberForRoute = raw && typeof raw["writing_no"] === "string" ? (raw["writing_no"] as string) : "";

  const deal = {
    dealId: dealIdForRoute,
    policyNumber: policy.policyNumber ?? null,
    callCenter: policy.callCenter ?? null,
    carrier: (policy.raw as { carrier?: string })?.carrier ?? null,
    clientName: policy.clientName,
    phoneNumber: phoneNumberForRoute,
    monthlyPremium: (typeof policy.monthlyPremium === "number" || typeof policy.monthlyPremium === "string") ? policy.monthlyPremium : null,
    coverage: (typeof policy.coverage === "number" || typeof policy.coverage === "string") ? policy.coverage : null,
    productType: (policy.raw as { policy_type?: string })?.policy_type ?? null,
    raw: policy.raw as Record<string, unknown> | null,
  };

  const leadInfo = {
    dob: (dobFromVerification || (personalDob !== "-" ? personalDob : "")).trim(),
    ghlStage: selectedDeal?.ghl_stage ?? "",
    agentName: agentNameForRoute,
    writingNumber: writingNumberForRoute,
    ssnLast4: ssnLast4ForRoute,
    address: (addressFromVerification || (personalAddress1 !== "-" ? personalAddress1 : "")).trim(),
  };

  const leadIdForRoute = typeof lead?.id === "string" ? lead.id : null;

  return (
    <div
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      className={
        "text-left rounded-lg border bg-card p-4 transition-all cursor-pointer " +
        (isSelected
          ? "ring-2 ring-primary border-primary shadow-md"
          : "hover:shadow-sm hover:border-muted-foreground/20")
      }
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground truncate" title={policy.clientName}>
            {policy.clientName}
          </div>
          <div className="text-[10px] text-muted-foreground truncate mt-0.5" title={String(policy.callCenter ?? "")}>
            {policy.callCenter ?? "—"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {shouldShowStatusPill ? (
            <div
              className="text-[9px] rounded-md border px-1.5 py-0.5 font-medium whitespace-nowrap"
              style={statusStyle ? { backgroundColor: statusStyle.bg, borderColor: statusStyle.border, color: statusStyle.text } : undefined}
            >
              {String(policy.status ?? "")}
            </div>
          ) : null}
          {stageLabel && stageStyle ? (
            <div
              className="text-[9px] rounded-full border px-1 py-0.5 font-medium whitespace-nowrap"
              style={{ backgroundColor: stageStyle.bg, borderColor: stageStyle.border, color: stageStyle.text }}
            >
              {stageLabel}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-xs">
        <div>
          <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Policy #</div>
          <div className="font-medium text-foreground truncate" title={policy.policyNumber ?? undefined}>
            {policy.policyNumber ?? "—"}
          </div>
        </div>

        <div>
          <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Agent</div>
          <div className="font-medium text-foreground truncate" title={policy.agentName ?? undefined}>
            {policy.agentName ?? "—"}
          </div>
        </div>

        <div>
          <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Carrier</div>
          <div className="font-medium text-foreground truncate" title={raw && typeof raw.carrier === "string" ? raw.carrier : undefined}>
            {raw && typeof raw.carrier === "string" ? raw.carrier : "—"}
          </div>
        </div>

        <div>
          <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Monthly Premium</div>
          <div className="font-medium text-foreground">{formatCurrency(policy.monthlyPremium)}</div>
        </div>

        <div>
          <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Coverage</div>
          <div className="font-medium text-foreground">{formatValue(policy.coverage)}</div>
        </div>

        <div>
          <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Draft Date</div>
          <div className="font-medium text-foreground">{formatValue(policy.initialDraftDate)}</div>
        </div>
      </div>

      {policy.statusNotes && policy.statusNotes !== "—" ? (
        <div className="mt-1.5 pt-1.5 border-t">
          <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Status Notes</div>
          <div className="text-[10px] text-foreground/80 line-clamp-2" title={policy.statusNotes ?? undefined}>
            {policy.statusNotes}
          </div>
        </div>
      ) : null}

      <div className="mt-1.5 pt-1.5 border-t">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">Last Updated</div>
          <div className="text-[9px] text-muted-foreground">{formatValue(policy.lastUpdated)}</div>
        </div>
      </div>

      {isSelected ? (
        <div className="mt-2 space-y-1.5">
          <div className="grid grid-cols-3 gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleNewSaleClick}
              className={expandedWorkflowKey === policy.key && activeWorkflowType === "new_sale" ? "border-primary bg-primary/10" : ""}
            >
              New Sale
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFixedPaymentClick}
              className={expandedWorkflowKey === policy.key && activeWorkflowType === "fixed_payment" ? "border-primary bg-primary/10" : ""}
            >
              Fix Payment
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onOpenPolicyStatusAlert();
              }}
              className={expandedWorkflowKey === policy.key && activeWorkflowType === "carrier_requirements" ? "border-primary bg-primary/10" : ""}
            >
              Carrier Req.
            </Button>
          </div>

          {expandedWorkflowKey === policy.key && activeWorkflowType ? (
            <div className="mt-3">
              {activeWorkflowType === "new_sale" ? (
                <NewSaleWorkflow
                  leadId={leadIdForRoute}
                  dealId={dealIdForRoute}
                  policyNumber={policy.policyNumber ?? null}
                  callCenter={policy.callCenter ?? null}
                  retentionAgent={retentionAgent}
                  onCancel={onCancelWorkflow}
                />
              ) : activeWorkflowType === "fixed_payment" ? (
                <FixedPaymentWorkflow deal={deal} leadInfo={leadInfo} lead={lead} retentionAgent={retentionAgent} onCancel={onCancelWorkflow} />
              ) : activeWorkflowType === "carrier_requirements" ? (
                <CarrierRequirementsWorkflow
                  deal={deal}
                  leadInfo={leadInfo}
                  lead={lead}
                  retentionAgent={retentionAgent}
                  onCancel={onCancelWorkflow}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

