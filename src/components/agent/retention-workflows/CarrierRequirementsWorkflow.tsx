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

    // Verify that this deal is assigned to the current agent
    if (deal.dealId) {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          toast({ 
            title: "Unauthorized", 
            description: "You must be logged in to submit workflows", 
            variant: "destructive" 
          });
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (profileError || !profile) {
          toast({ 
            title: "Error", 
            description: "Failed to verify your profile", 
            variant: "destructive" 
          });
          return;
        }

        // Check if this deal is assigned to the current agent
        const { data: assignment, error: assignmentError } = await supabase
          .from("retention_assigned_leads")
          .select("id")
          .eq("deal_id", deal.dealId)
          .eq("assignee_profile_id", profile.id)
          .eq("status", "active")
          .maybeSingle();

        if (assignmentError) {
          console.error("[carrier-requirements] Error checking assignment:", assignmentError);
          toast({ 
            title: "Error", 
            description: "Failed to verify assignment", 
            variant: "destructive" 
          });
          return;
        }

        if (!assignment) {
          console.warn("[carrier-requirements] Unauthorized submission attempt - deal not assigned to agent", {
            dealId: deal.dealId,
            profileId: profile.id
          });
          toast({ 
            title: "Unauthorized", 
            description: "This lead is not assigned to you. You cannot submit workflows for leads that are not assigned to you.", 
            variant: "destructive" 
          });
          return;
        }
      } catch (authError) {
        console.error("[carrier-requirements] Error during authorization check:", authError);
        toast({ 
          title: "Error", 
          description: "Failed to verify authorization", 
          variant: "destructive" 
        });
        return;
      }
    }

    // Try multiple sources for submission_id
    let submissionId = getString(lead, "submission_id") ?? null;
    
    // If not in lead, try from deal's monday_item_id (which is often the submission_id)
    if (!submissionId && deal.raw) {
      const mondayItemId = typeof deal.raw.monday_item_id === "string" ? deal.raw.monday_item_id.trim() : null;
      if (mondayItemId) {
        submissionId = mondayItemId;
      }
    }
    
    // If still not found and we have dealId, try to fetch from database
    if (!submissionId && deal.dealId) {
      try {
        const { data: dealData } = await supabase
          .from("monday_com_deals")
          .select("monday_item_id")
          .eq("id", deal.dealId)
          .maybeSingle();
        
        if (dealData && typeof dealData.monday_item_id === "string") {
          const mondayItemId = dealData.monday_item_id.trim();
          if (mondayItemId) {
            submissionId = mondayItemId;
          }
        }
      } catch (fetchError) {
        console.warn("[carrier-requirements] Error fetching monday_item_id:", fetchError);
      }
    }
    
    if (!submissionId) {
      console.error("[carrier-requirements] Missing submission_id:", {
        leadHasSubmissionId: !!getString(lead, "submission_id"),
        dealHasRaw: !!deal.raw,
        dealRawHasMondayItemId: deal.raw && typeof deal.raw.monday_item_id === "string",
        dealId: deal.dealId,
      });
      toast({ 
        title: "Missing submission", 
        description: "Cannot save call result without submission_id. The policy may be missing a Monday.com item ID. Please contact support.", 
        variant: "destructive" 
      });
      return;
    }
    
    console.log("[carrier-requirements] Using submission_id:", submissionId);

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

      // Extract additional data from deal and raw policy data
      const rawDeal = deal.raw ?? null;
      const policyNumber = deal.policyNumber ?? null;
      const carrier = deal.carrier ?? (rawDeal && typeof rawDeal.carrier === "string" ? rawDeal.carrier : null);
      const productType = deal.productType ?? (rawDeal && typeof rawDeal.policy_type === "string" ? rawDeal.policy_type : null);
      // Get sales agent from raw deal data (sales_agent field)
      const salesAgent = (rawDeal && typeof rawDeal.sales_agent === "string" ? rawDeal.sales_agent : null) || leadInfo.agentName || null;
      
      // Parse monthly premium
      let monthlyPremium: number | null = null;
      if (deal.monthlyPremium != null) {
        if (typeof deal.monthlyPremium === "number") {
          monthlyPremium = deal.monthlyPremium;
        } else if (typeof deal.monthlyPremium === "string") {
          const parsed = parseFloat(deal.monthlyPremium.replace(/[^0-9.-]/g, ""));
          monthlyPremium = isNaN(parsed) ? null : parsed;
        }
      } else if (rawDeal && rawDeal.monthly_premium != null) {
        if (typeof rawDeal.monthly_premium === "number") {
          monthlyPremium = rawDeal.monthly_premium;
        } else if (typeof rawDeal.monthly_premium === "string") {
          const parsed = parseFloat(rawDeal.monthly_premium.replace(/[^0-9.-]/g, ""));
          monthlyPremium = isNaN(parsed) ? null : parsed;
        }
      }

      // Parse face amount (coverage)
      let faceAmount: number | null = null;
      if (deal.coverage != null) {
        if (typeof deal.coverage === "number") {
          faceAmount = deal.coverage;
        } else if (typeof deal.coverage === "string") {
          const parsed = parseFloat(deal.coverage.replace(/[^0-9.-]/g, ""));
          faceAmount = isNaN(parsed) ? null : parsed;
        }
      } else if (rawDeal && rawDeal.face_amount != null) {
        if (typeof rawDeal.face_amount === "number") {
          faceAmount = rawDeal.face_amount;
        } else if (typeof rawDeal.face_amount === "string") {
          const parsed = parseFloat(rawDeal.face_amount.replace(/[^0-9.-]/g, ""));
          faceAmount = isNaN(parsed) ? null : parsed;
        }
      }

      // Try to fetch full deal data from database if dealId is available
      let fullDealData: Record<string, unknown> | null = null;
      if (deal.dealId) {
        const { data: dealData } = await supabase
          .from("monday_com_deals")
          .select("policy_number, carrier, policy_type, deal_value, cc_value, sales_agent, call_center")
          .eq("id", deal.dealId)
          .maybeSingle();
        if (dealData) {
          fullDealData = dealData;
        }
      }

      // Try to fetch lead_vendor from leads table using submission_id
      let leadVendorFromDb: string | null = null;
      if (submissionId) {
        try {
          const { data: leadData } = await supabase
            .from("leads")
            .select("lead_vendor")
            .eq("submission_id", submissionId)
            .maybeSingle();
          
          if (leadData && typeof leadData.lead_vendor === "string") {
            leadVendorFromDb = leadData.lead_vendor.trim() || null;
          }
        } catch (fetchError) {
          console.warn("[carrier-requirements] Error fetching lead_vendor:", fetchError);
        }
      }

      // Get lead_vendor from multiple sources (priority: DB lead > deal.call_center > lead.lead_vendor)
      const finalLeadVendor = 
        leadVendorFromDb ??
        (typeof fullDealData?.call_center === "string" ? fullDealData.call_center.trim() : null) ??
        (deal.callCenter ? deal.callCenter.trim() : null) ??
        (rawDeal && typeof rawDeal.call_center === "string" ? rawDeal.call_center.trim() : null) ??
        getString(lead, "lead_vendor") ??
        null;

      // Use database data if available, otherwise use deal/raw data
      const finalPolicyNumber = fullDealData?.policy_number ?? policyNumber;
      const finalCarrier = fullDealData?.carrier ?? carrier;
      const finalProductType = fullDealData?.policy_type ?? productType;
      // Get sales agent from database or raw deal data
      const finalSalesAgent = (typeof fullDealData?.sales_agent === "string" ? fullDealData.sales_agent : null) ?? salesAgent;
      // Use deal_value as monthly_premium fallback, cc_value as face_amount fallback
      const finalMonthlyPremium = monthlyPremium ?? (typeof fullDealData?.deal_value === "number" ? fullDealData.deal_value : null);
      const finalFaceAmount = faceAmount ?? (typeof fullDealData?.cc_value === "number" ? fullDealData.cc_value : null);
      const finalDraftDate = null; // Carrier requirements workflow doesn't have draft date

      const { error: ddfError } = await supabase
        .from("retention_deal_flow")
        .upsert(
          {
            submission_id: submissionId,
            lead_vendor: finalLeadVendor,
            insured_name: getString(lead, "customer_full_name") ?? deal.clientName,
            client_phone_number: getString(lead, "phone_number") ?? deal.phoneNumber,
            date: getTodayDateEST(),
            retention_agent: retentionAgent,
            agent: finalSalesAgent, // Sales agent from policy
            from_callback: true,
            status: shortFormStatus,
            notes: shortFormNotes,
            policy_number: finalPolicyNumber,
            carrier: finalCarrier,
            product_type: finalProductType,
            monthly_premium: finalMonthlyPremium,
            face_amount: finalFaceAmount,
            draft_date: finalDraftDate,
          },
          { onConflict: "submission_id, date" },
        );

      if (ddfError) throw ddfError;

      // Note: Policy is now tracked as "handled" in retention_deal_flow
      // Manager or agent can mark it as "fixed" later via the fixed policies page
      console.log("[workflow] Policy handled - can be marked as fixed later:", {
        submissionId,
        dealId: deal.dealId,
        retentionAgentName: retentionAgent,
      });

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
