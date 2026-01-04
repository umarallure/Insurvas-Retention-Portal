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
import { DISPOSITION_METADATA } from "@/lib/dispositions/rules";
import { type DealLite, type LeadInfo, getTodayDateEST, getString } from "./types";

type WorkflowStep = "banking" | "instructions" | "callResult";

type InstructionKind =
  | { kind: "call"; phone: string; optionsInstruction?: string; script: string }
  | { kind: "task"; title: string; body: string };

type FixedPaymentWorkflowProps = {
  deal: DealLite;
  leadInfo: LeadInfo;
  lead: Record<string, unknown> | null;
  retentionAgent: string;
  onCancel: () => void;
};

export function FixedPaymentWorkflow({ deal, leadInfo, lead, retentionAgent, onCancel }: FixedPaymentWorkflowProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = React.useState<WorkflowStep>("banking");

  const [policyStatus, setPolicyStatus] = React.useState<"issued" | "pending">("pending");
  const [accountHolderName, setAccountHolderName] = React.useState("");
  const [routingNumber, setRoutingNumber] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [accountType, setAccountType] = React.useState<"Checking" | "Savings" | "">("");
  const [bankName, setBankName] = React.useState("");
  const [draftDate, setDraftDate] = React.useState("");

  const [mohFixType, setMohFixType] = React.useState<
    "incorrect_banking" | "insufficient_funds" | "pending_manual" | "pending_lapse" | ""
  >("");

  const [shortFormStatus, setShortFormStatus] = React.useState<string>("");
  const [shortFormNotes, setShortFormNotes] = React.useState<string>("");
  const [submittingShortForm, setSubmittingShortForm] = React.useState(false);

  const allDispositionOptions = React.useMemo(() => {
    return Object.keys(DISPOSITION_METADATA).sort((a, b) => a.localeCompare(b));
  }, []);

  const carrierName = (deal.carrier ?? "").trim();
  const carrierLower = carrierName.toLowerCase();
  const isCorebridge = carrierLower.includes("corebridge");
  const isRoyalNeighbors = carrierLower.includes("royal neighbors") || carrierLower.includes("rna");
  const isAetna = carrierLower.includes("aetna");
  const isMOH = carrierLower.includes("moh") || carrierLower.includes("mutual of omaha");

  const est = React.useMemo(() => new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })), []);
  const isAfter5PM = est.getHours() >= 17;

  const computedScript = React.useMemo(() => {
    if (policyStatus === "issued") {
      return "I need to redate a policy, can you connect me to the correct department";
    }
    return "I need to give new banking information for a policy that has not been issued yet. Can you please direct me to the correct department";
  }, [policyStatus]);

  const instructions: InstructionKind = React.useMemo(() => {
    if (isCorebridge) {
      return {
        kind: "task",
        title: "Action Required",
        body: "Corebridge policy requires an App Fix Task for banking updates.",
      };
    }

    if (isMOH) {
      if (mohFixType === "insufficient_funds") {
        return {
          kind: "call",
          phone: "800-775-7896",
          optionsInstruction: "Press Option 1",
          script:
            "I have the client on the line to redate their policy for their active policy. Can you please direct me to the correct department",
        };
      }

      if (mohFixType === "pending_lapse") {
        return {
          kind: "call",
          phone: "800-775-6000",
          optionsInstruction: "Press Option 1",
          script:
            "I have the client on the line to provide new banking information for their active policy. Can you please direct me to the correct department",
        };
      }

      return {
        kind: "call",
        phone: "800-775-7896",
        optionsInstruction: "Press Option 1",
        script:
          "I have the client on the line to provide new banking information for their active policy. Can you please direct me to the correct department",
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
        phone: "800-264-4000",
        optionsInstruction: "Press Option 1, then Option 3, then Option 1",
        script: "I need to update billing information and draft date for an active policy, can you direct me to the correct department",
      };
    }

    if (isRoyalNeighbors) {
      const isAfter6PM = est.getHours() >= 18;
      if (isAfter6PM) {
        return {
          kind: "task",
          title: "Action Required",
          body: "Royal Neighbors is closed (after 6 PM EST). Please create a task.",
        };
      }

      return {
        kind: "call",
        phone: "800-627-4762",
        optionsInstruction: "Press Option 1, then Option 4",
        script: "I need to update banking for a pending application. Can you please direct me to the correct department",
      };
    }

    return {
      kind: "call",
      phone: "800-736-7311",
      optionsInstruction: "Press Option 1 three times",
      script: computedScript,
    };
  }, [computedScript, isAfter5PM, isAetna, isCorebridge, isMOH, isRoyalNeighbors, mohFixType, est]);

  const handleBankingNext = () => {
    if (!accountHolderName || !routingNumber || !accountNumber || !bankName || !draftDate || !accountType) {
      toast({ title: "Required", description: "Please fill in all banking details", variant: "destructive" });
      return;
    }
    setStep("instructions");
  };

  const canShowNewBankingInfo = !!bankName && !!routingNumber && !!accountNumber && !!draftDate;

  const generateAutoNotes = React.useCallback(
    (status: string) => {
      const parts: string[] = [];

      if (status === "Updated Banking/draft date") {
        parts.push("ACTION: Fixed Failed Payment");
        parts.push(`POLICY STATUS: ${policyStatus === "issued" ? "Issued" : "Pending"}`);
        if (bankName) parts.push(`NEW BANK: ${bankName}`);
        if (routingNumber) parts.push(`NEW ROUTING: ${routingNumber}`);
        if (accountNumber) parts.push(`NEW ACCOUNT: ${accountNumber}`);
        if (draftDate) {
          try {
            const [year, month, day] = draftDate.split("-");
            parts.push(`NEW DRAFT DATE: ${month}/${day}/${year}`);
          } catch {
            parts.push(`NEW DRAFT DATE: ${draftDate}`);
          }
        }
        if (mohFixType) {
          const mohFixMap: Record<string, string> = {
            incorrect_banking: "Incorrect Banking Information",
            insufficient_funds: "Insufficient Funds (Redating)",
            pending_manual: "Pending Manual Action Banking",
            pending_lapse: "Pending Lapse Fix",
          };
          if (mohFixMap[mohFixType]) parts.push(`MOH FIX TYPE: ${mohFixMap[mohFixType]}`);
        }
        parts.push("NOTES: Called carrier and successfully updated banking information/redated policy.");
      }

      return parts.join("\n");
    },
    [accountNumber, bankName, draftDate, mohFixType, policyStatus, routingNumber],
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
      {step === "banking" ? (
        <div className="space-y-4 p-4 border rounded-lg bg-card">
          <div className="text-sm font-medium">Banking Information</div>

          <div className="space-y-3">
            <Label>Policy Status</Label>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setPolicyStatus("issued")}
                className={
                  "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors " +
                  (policyStatus === "issued"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground hover:bg-muted/50")
                }
              >
                <span className="inline-block h-3 w-3 rounded-full border border-primary">
                  {policyStatus === "issued" ? <span className="block h-2 w-2 rounded-full bg-primary m-px" /> : null}
                </span>
                <span>Policy has been issued</span>
              </button>
              <button
                type="button"
                onClick={() => setPolicyStatus("pending")}
                className={
                  "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors " +
                  (policyStatus === "pending"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground hover:bg-muted/50")
                }
              >
                <span className="inline-block h-3 w-3 rounded-full border border-primary">
                  {policyStatus === "pending" ? <span className="block h-2 w-2 rounded-full bg-primary m-px" /> : null}
                </span>
                <span>Policy is pending (lead is in pending manual action on GHL)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Account Holder Name</Label>
              <Input value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Bank Name</Label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Routing Number</Label>
              <Input value={routingNumber} onChange={(e) => setRoutingNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Account Number</Label>
              <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Account Type</Label>
              <Select
                value={accountType}
                onValueChange={(v) => {
                  if (v === "Checking" || v === "Savings" || v === "") setAccountType(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Checking">Checking</SelectItem>
                  <SelectItem value="Savings">Savings</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Draft Date</Label>
              <Input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleBankingNext} className="flex-1">
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {step === "instructions" ? (
        <div className="space-y-4 p-4 border rounded-lg bg-card">
          <div className="text-sm font-medium">Instructions</div>

          {isMOH ? (
            <div className="rounded-md border bg-background p-4 space-y-3">
              <div className="text-sm font-medium">MOH Fix Type</div>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => setMohFixType("incorrect_banking")}
                  className={
                    "rounded-md border px-3 py-2 text-left text-sm transition-colors " +
                    (mohFixType === "incorrect_banking" ? "border-primary bg-primary/10" : "hover:bg-muted/30")
                  }
                >
                  Providing new banking information (FDPF Incorrect Banking Information)
                </button>
                <button
                  type="button"
                  onClick={() => setMohFixType("insufficient_funds")}
                  className={
                    "rounded-md border px-3 py-2 text-left text-sm transition-colors " +
                    (mohFixType === "insufficient_funds" ? "border-primary bg-primary/10" : "hover:bg-muted/30")
                  }
                >
                  Redating/Redrafting w/ Same Banking (FDPF Insufficient Funds)
                </button>
                <button
                  type="button"
                  onClick={() => setMohFixType("pending_manual")}
                  className={
                    "rounded-md border px-3 py-2 text-left text-sm transition-colors " +
                    (mohFixType === "pending_manual" ? "border-primary bg-primary/10" : "hover:bg-muted/30")
                  }
                >
                  Providing new banking information (For Pending Manual Action/Non Issued Policy)
                </button>
                <button
                  type="button"
                  onClick={() => setMohFixType("pending_lapse")}
                  className={
                    "rounded-md border px-3 py-2 text-left text-sm transition-colors " +
                    (mohFixType === "pending_lapse" ? "border-primary bg-primary/10" : "hover:bg-muted/30")
                  }
                >
                  Fixing Pending Lapse Policy
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
                <div className="text-xs text-muted-foreground">SSN</div>
                <div className="font-semibold">{leadInfo.ssnLast4 || "—"}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs text-muted-foreground">Address</div>
                <div className="font-semibold">{leadInfo.address || "—"}</div>
              </div>
            </div>
          </div>

          {canShowNewBankingInfo ? (
            <div className="rounded-md border bg-background p-4">
              <div className="text-sm font-medium mb-3">New Banking Info</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground text-xs">Bank</span>
                  <span className="font-medium">{bankName}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground text-xs">Routing</span>
                  <span className="font-mono font-medium">{routingNumber}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground text-xs">Account</span>
                  <span className="font-mono font-medium">{accountNumber}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground text-xs">Draft</span>
                  <span className="font-medium">{draftDate}</span>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setStep("banking")} className="flex-1">
              Back
            </Button>
            <Button
              onClick={() => {
                if (!canShowNewBankingInfo) {
                  toast({ title: "Required", description: "Please fill in all banking details", variant: "destructive" });
                  setStep("banking");
                  return;
                }
                setStep("callResult");
              }}
              className="flex-1"
            >
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
            <Label>Disposition/Stage</Label>
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
                {allDispositionOptions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DISPOSITION_METADATA[d as keyof typeof DISPOSITION_METADATA].label}
                  </SelectItem>
                ))}
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
