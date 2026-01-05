"use client";

import * as React from "react";
import { useRouter } from "next/router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { type DealLite, type LeadInfo, getTodayDateEST, getString } from "./types";

type WorkflowStep = "instructions" | "callResult";

type InstructionKind =
  | { kind: "call"; phone: string; optionsInstruction?: string; script: string }
  | { kind: "task"; title: string; body: string };

type CarrierRequirementsWorkflowProps = {
  deal: DealLite;
  leadInfo: LeadInfo;
  lead: Record<string, unknown> | null;
  retentionAgent: string;
  onCancel: () => void;
};

export function CarrierRequirementsWorkflow({
  deal,
  leadInfo,
  lead,
  retentionAgent,
  onCancel,
}: CarrierRequirementsWorkflowProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = React.useState<WorkflowStep>("instructions");

  const [rnaRequirementType, setRnaRequirementType] = React.useState<"banking" | "other" | "">("");

  const [shortFormStatus, setShortFormStatus] = React.useState<string>("");
  const [shortFormNotes, setShortFormNotes] = React.useState<string>("");
  const [submittingShortForm, setSubmittingShortForm] = React.useState(false);

  const carrierName = (deal.carrier ?? "").trim();
  const carrierLower = carrierName.toLowerCase();
  const isCorebridge = carrierLower.includes("corebridge");
  const isRoyalNeighbors = carrierLower.includes("royal neighbors") || carrierLower.includes("rna");
  const isAetna = carrierLower.includes("aetna");
  const isMOH = carrierLower.includes("moh") || carrierLower.includes("mutual of omaha");
  const isAMAM = carrierLower.includes("anam") || carrierLower.includes("americo");

  const est = React.useMemo(() => new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })), []);
  const isAfter5PM = est.getHours() >= 17;
  const isAfter6PM = est.getHours() >= 18;

  const computedScript = "There is a pending requirement on a pending application I need to fulfill for an applicant. Can you please direct me to the correct department";

  const instructions: InstructionKind = React.useMemo(() => {
    if (isCorebridge) {
      return {
        kind: "task",
        title: "Action Required",
        body: "Corebridge policy requires an App Fix Task for carrier requirements.",
      };
    }

    if (isMOH) {
      return {
        kind: "task",
        title: "Email Instructions",
        body:
          "Email to: liferequirements@mutualofomaha.com\nPut Policy number in the subject line\nDocusign with completion form is required (do not need voided check)",
      };
    }

    if (isAetna) {
      if (isAfter5PM) {
        return {
          kind: "task",
          title: "Action Required",
          body:
            "Aetna is only able to fix deals over the phone. It is after 5pm EST, so their customer service line is closed. Please schedule a callback for tomorrow during normal business hours.",
        };
      }

      return {
        kind: "call",
        phone: "866-272-6630",
        optionsInstruction: "Press Option 3, then Option 3",
        script:
          "There is an additional requirement on a pending application we'd like to fulfill. Can you please direct us to the correct department",
      };
    }

    if (isRoyalNeighbors) {
      if (isAfter6PM) {
        return {
          kind: "task",
          title: "Action Required",
          body: "Royal Neighbors is closed (after 6 PM EST). Please create a task.",
        };
      }

      if (rnaRequirementType === "other") {
        return {
          kind: "task",
          title: "Action Required",
          body: "This request requires a licensed agent task.",
        };
      }

      return {
        kind: "call",
        phone: "800-627-4762",
        optionsInstruction: "Press Option 1, then Option 4",
        script: "I need to update banking for a pending application. Can you please direct me to the correct department",
      };
    }

    if (isAMAM) {
      return {
        kind: "task",
        title: "Action Required",
        body: "This carrier often requires manual handling. Please create a task if you cannot complete over the phone.",
      };
    }

    return {
      kind: "call",
      phone: "800-736-7311",
      optionsInstruction: "Press Option 1 three times",
      script: computedScript,
    };
  }, [computedScript, isAfter5PM, isAfter6PM, isAetna, isAMAM, isCorebridge, isMOH, isRoyalNeighbors, rnaRequirementType]);

  const generateAutoNotes = React.useCallback(
    (status: string) => {
      const parts: string[] = [];

      if (status === "Fulfilled carrier requirements") {
        parts.push("ACTION: Fulfilling Carrier Requirements");
        if (rnaRequirementType) {
          parts.push(`RNA REQUIREMENT: ${rnaRequirementType === "banking" ? "Banking Update" : "Other Manual Action"}`);
        }
        parts.push("NOTES: Called carrier and successfully fulfilled pending requirements.");
      }

      return parts.join("\n");
    },
    [rnaRequirementType],
  );

  const handleShortFormSubmit = async () => {
    if (!shortFormStatus) {
      toast({ title: "Required", description: "Please select a status", variant: "destructive" });
      return;
    }

    const submissionId = getString(lead, "submission_id") ?? null;
    if (!submissionId) {
      toast({ title: "Missing submission", description: "Cannot save call result without submission_id.", variant: "destructive" });
      return;
    }

    setSubmittingShortForm(true);
    try {
      const { error: resultError } = await supabase
        .from("call_results")
        .upsert({
          submission_id: submissionId,
          agent_who_took_call: retentionAgent,
          status: shortFormStatus,
          notes: shortFormNotes,
          is_retention_call: true,
          updated_at: new Date().toISOString(),
        });

      if (resultError) throw resultError;

      await supabase.from("call_update_logs").insert({
        submission_id: submissionId,
        agent_name: retentionAgent,
        agent_type: "retention_agent",
        event_type: "retention_short_form_update",
        event_details: {
          status: shortFormStatus,
          notes: shortFormNotes,
        },
      });

      const { error: ddfError } = await supabase
        .from("daily_deal_flow")
        .upsert(
          {
            submission_id: submissionId,
            lead_vendor: getString(lead, "lead_vendor"),
            insured_name: getString(lead, "customer_full_name") ?? deal.clientName,
            client_phone_number: getString(lead, "phone_number") ?? deal.phoneNumber,
            date: getTodayDateEST(),
            retention_agent: retentionAgent,
            is_retention_call: true,
            from_callback: true,
            status: shortFormStatus,
            notes: shortFormNotes,
          },
          { onConflict: "submission_id, date" },
        );

      if (ddfError) throw ddfError;

      toast({ title: "Success", description: "Call result updated successfully" });
      await router.push("/agent/assigned-leads");
    } catch {
      toast({ title: "Error", description: "Failed to save call result", variant: "destructive" });
    } finally {
      setSubmittingShortForm(false);
    }
  };

  const policyNumber = (deal.policyNumber ?? "").trim();
  const callCenter = (deal.callCenter ?? "").trim();

  return (
    <div className="space-y-4">
      {step === "instructions" ? (
        <div className="space-y-4 p-4 border rounded-lg bg-card">
          <div className="text-sm font-medium">Instructions</div>

          {isRoyalNeighbors ? (
            <div className="rounded-md border bg-background p-4 space-y-3">
              <div className="text-sm font-medium">RNA Requirement Type</div>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => setRnaRequirementType("banking")}
                  className={
                    "rounded-md border px-3 py-2 text-left text-sm transition-colors " +
                    (rnaRequirementType === "banking" ? "border-primary bg-primary/10" : "hover:bg-muted/30")
                  }
                >
                  Update banking information for pending application
                </button>
                <button
                  type="button"
                  onClick={() => setRnaRequirementType("other")}
                  className={
                    "rounded-md border px-3 py-2 text-left text-sm transition-colors " +
                    (rnaRequirementType === "other" ? "border-primary bg-primary/10" : "hover:bg-muted/30")
                  }
                >
                  All other pending manual actions
                </button>
              </div>
            </div>
          ) : null}

          {instructions.kind === "call" ? (
            <div className="rounded-md border bg-blue-50 p-4 space-y-4">
              <div className="text-sm font-medium text-blue-900">Call Instructions</div>
              <div className="text-sm text-blue-800">
                Call <span className="font-semibold text-blue-900">{instructions.phone}</span>
              </div>
              {instructions.optionsInstruction ? (
                <div className="text-sm text-blue-800">{instructions.optionsInstruction}</div>
              ) : null}
              <div>
                <div className="text-sm text-blue-800">When connected, say:</div>
                <div className="mt-2 rounded-md border border-blue-200 bg-white p-3 text-sm text-blue-900">
                  &quot;{instructions.script}&quot;
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md border bg-background p-4 space-y-2">
              <div className="text-sm font-medium">{instructions.title}</div>
              <div className="text-sm text-muted-foreground whitespace-pre-wrap">{instructions.body}</div>
            </div>
          )}

          <div className="rounded-md border bg-background p-4">
            <div className="text-sm font-medium mb-3">Policy Information</div>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Client Name</div>
                <div className="font-semibold">{deal.clientName || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Policy Number</div>
                <div className="font-semibold">{policyNumber || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Agent Name</div>
                <div className="font-semibold">{leadInfo.agentName || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Date of Birth</div>
                <div className="font-semibold">{leadInfo.dob || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Carrier</div>
                <div className="font-semibold">{deal.carrier || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Call Center</div>
                <div className="font-semibold">{callCenter || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Writing Number</div>
                <div className="font-semibold">{leadInfo.writingNumber || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Last 4 Agent SSN</div>
                <div className="font-semibold">{leadInfo.ssnLast4 || "—"}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs text-muted-foreground">Address</div>
                <div className="font-semibold">{leadInfo.address || "—"}</div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
            <Button onClick={() => setStep("callResult")} className="flex-1">
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {step === "callResult" ? (
        <div className="space-y-4 p-4 border rounded-lg bg-card">
          <div className="text-sm font-medium">Call Result</div>

          <div className="space-y-2">
            <Label>Retention Agent</Label>
            <Input value={retentionAgent} disabled />
          </div>

          <div className="space-y-2">
            <Label>Status / Stage</Label>
            <Select
              value={shortFormStatus}
              onValueChange={(val) => {
                setShortFormStatus(val);
                setShortFormNotes(generateAutoNotes(val));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Successfully fixed">Successfully fixed</SelectItem>
                <SelectItem value="Fulfilled carrier requirements">Fulfilled carrier requirements</SelectItem>
                <SelectItem value="Callback Required">Callback Required</SelectItem>
                <SelectItem value="No Answer">No Answer</SelectItem>
                <SelectItem value="Wrong Number">Wrong Number</SelectItem>
                <SelectItem value="Do Not Call">Do Not Call</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={shortFormNotes}
              onChange={(e) => setShortFormNotes(e.target.value)}
              placeholder="Enter call notes..."
              className="min-h-[100px]"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setStep("instructions")} className="flex-1">
              Back
            </Button>
            <Button onClick={() => void handleShortFormSubmit()} disabled={submittingShortForm} className="flex-1">
              Submit & Finish
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
