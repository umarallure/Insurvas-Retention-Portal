"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { getDealLabelStyle, getDealTagLabelFromGhlStage } from "@/lib/monday-deal-category-tags";
import { formatCurrency, formatValue } from "@/lib/agent/assigned-lead-details.logic";
import {
  NewSaleWorkflow,
  FixedPaymentWorkflow,
  CarrierRequirementsWorkflow,
  type RetentionType,
  type NewSaleQuoteDetails,
} from "@/components/agent/retention-workflows";

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
  lead: Record<string, unknown> | null;
  selectedDeal: { monday_item_id?: string | null; ghl_stage?: string | null } | null;
  retentionAgent: string;
  retentionAgentId: string;
  verificationSessionId: string | null;
  verificationItems: Array<Record<string, unknown>>;
  verificationInputValues: Record<string, string>;
  personalSsnLast4: string;
  personalDob: string;
  personalAddress1: string;
  onCancelWorkflow: () => void;
  onNewSaleAfterSubmit?: (quote: NewSaleQuoteDetails) => Promise<void> | void;
  callBackDealId?: string | null;
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
  retentionAgentId,
  verificationSessionId,
  verificationItems,
  verificationInputValues,
  personalSsnLast4,
  personalDob,
  personalAddress1,
  onCancelWorkflow,
  onNewSaleAfterSubmit,
  callBackDealId,
}: PolicyCardProps) {
  const rawStage =
    policy.raw && typeof (policy.raw as { ghl_stage?: unknown }).ghl_stage === "string"
      ? ((policy.raw as { ghl_stage?: string }).ghl_stage as string)
      : null;
  const stageLabel = getDealTagLabelFromGhlStage(rawStage);
  const stageStyle = getDealLabelStyle(stageLabel);

  const statusLabel = (policy.status ?? "").toString();

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

  const handleCarrierRequirementsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (expandedWorkflowKey === policy.key && activeWorkflowType === "carrier_requirements") {
      onCancelWorkflow();
      return;
    }

    const statusText = statusLabel.trim().toLowerCase();
    const stageText = ((stageLabel ?? "") as string).toString().trim().toLowerCase();
    const rawStageText = (rawStage ?? "").trim().toLowerCase();

    const isPendingPolicy =
      statusText.includes("pending") ||
      stageText.includes("pending") ||
      rawStageText.includes("pending");

    if (isPendingPolicy) {
      onToggleWorkflow("carrier_requirements");
      return;
    }

    onOpenPolicyStatusAlert();
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
  const writingNumberForRoute = raw && typeof raw["writing_number"] === "string" ? (raw["writing_number"] as string) : "";

  const AGENT_SSN_MAP: Record<string, string> = {
    "andrea munoz bonilla": "1610",
    "maria estrella sanchez santiago": "6980",
    "aubrey nichols": "5624",
    "trinity queen": "7901",
    "noah brock": "6729",
    "isaac reed": "1163",
    "brandon flinchum": "5400",
    "benjamin wunder": "9151",
    "abdul rahman ibrahim": "1058",
    "lydia sutton": "1730",
  };

  function tokenizeName(name: string): string[] {
    return name
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((t) => t.length > 1);
  }

  function getAgentSsnLast4(agentName: string): string {
    if (!agentName) return "";
    const inputTokens = tokenizeName(agentName);

    for (const [mapName, ssn] of Object.entries(AGENT_SSN_MAP)) {
      const mapTokens = tokenizeName(mapName);

      // Single-word names: require exact token match
      if (mapTokens.length === 1) {
        if (inputTokens.includes(mapTokens[0])) return ssn;
        continue;
      }

      // Count how many map tokens appear in the input
      const overlap = mapTokens.filter((t) => inputTokens.includes(t)).length;

      // Require at least 2 matching name parts
      if (overlap >= 2) return ssn;
    }
    return "";
  }

  const agentSsnLast4 = getAgentSsnLast4(agentNameForRoute);

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
    ssnLast4: agentSsnLast4 || ssnLast4ForRoute || "—",
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
          {rawStage && stageStyle ? (
            <div
              className="text-[9px] rounded-full border px-1 py-0.5 font-medium whitespace-nowrap"
              style={{ backgroundColor: stageStyle.bg, borderColor: stageStyle.border, color: stageStyle.text }}
            >
              {rawStage}
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
              onClick={handleCarrierRequirementsClick}
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
                  retentionAgentId={retentionAgentId}
                  verificationSessionId={verificationSessionId}
                  customerName={policy.clientName}
                  submissionId={typeof lead?.submission_id === "string" ? lead.submission_id : null}
                  callBackDealId={callBackDealId ?? null}
                  verificationItems={verificationItems}
                  verificationInputValues={verificationInputValues}
                  onCancel={onCancelWorkflow}
                  onAfterSubmit={onNewSaleAfterSubmit}
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
