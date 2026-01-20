"use client";

import * as React from "react";
import { useRouter } from "next/router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

import { AlertCircle } from "lucide-react";

type RetentionType = "new_sale" | "fixed_payment" | "carrier_requirements";

type WorkflowStep = "setup" | "banking" | "instructions" | "callResult";

type InstructionKind =
  | { kind: "call"; phone: string; optionsInstruction?: string; script: string }
  | { kind: "task"; title: string; body: string };

type DealLite = {
  dealId: number | null;
  policyNumber: string | null;
  callCenter: string | null;
  carrier: string | null;
  clientName: string | null;
  phoneNumber: string | null;
};

const retentionAgentOptions = ["Aqib Afridi", "Qasim Raja", "Hussain Khan", "Ayan Ali", "Ayan Khan", "N/A"];

const carrierOptions = [
  "Liberty",
  "SBLI",
  "Corebridge",
  "MOH",
  "Transamerica",
  "RNA",
  "AMAM",
  "GTL",
  "Aetna",
  "Americo",
  "CICA",
  "N/A",
];

const productTypeOptions = [
  "Preferred",
  "Standard",
  "Graded",
  "Modified",
  "Immediate",
  "Level",
  "ROP",
  "N/A",
];

function strFromQuery(q: string | string[] | undefined): string | null {
  if (typeof q === "string") return q;
  if (Array.isArray(q)) return q[0] ?? null;
  return null;
}

function getString(obj: Record<string, unknown> | null, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

function getTodayDateEST(): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export default function RetentionWorkflowPage() {
  const router = useRouter();
  const { toast } = useToast();

  const leadId = strFromQuery(router.query.leadId) ?? null;
  const dealId = (() => {
    const raw = strFromQuery(router.query.dealId);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  })();

  const deal: DealLite = React.useMemo(
    () => ({
      dealId,
      policyNumber: strFromQuery(router.query.policyNumber),
      callCenter: strFromQuery(router.query.callCenter),
      carrier: strFromQuery(router.query.carrier),
      clientName: strFromQuery(router.query.clientName),
      phoneNumber: strFromQuery(router.query.phoneNumber),
    }),
    [dealId, router.query.callCenter, router.query.carrier, router.query.clientName, router.query.phoneNumber, router.query.policyNumber],
  );

  const bankingFromRoute = React.useMemo(
    () => ({
      bankName: strFromQuery(router.query.bankName) ?? "",
      routingNumber: strFromQuery(router.query.routingNumber) ?? "",
      accountNumber: strFromQuery(router.query.accountNumber) ?? "",
      accountType: strFromQuery(router.query.accountType) ?? "",
    }),
    [router.query.accountNumber, router.query.accountType, router.query.bankName, router.query.routingNumber],
  );

  const leadInfoFromRoute = React.useMemo(
    () => ({
      dob: strFromQuery(router.query.dob) ?? "",
      ghlStage: strFromQuery(router.query.ghlStage) ?? "",
      agentName: strFromQuery(router.query.agentName) ?? "",
      writingNumber: strFromQuery(router.query.writingNumber) ?? "",
      ssnLast4: strFromQuery(router.query.ssnLast4) ?? "",
      address: strFromQuery(router.query.address) ?? "",
    }),
    [router.query.dob, router.query.ghlStage, router.query.agentName, router.query.writingNumber, router.query.ssnLast4, router.query.address],
  );

  const [step, setStep] = React.useState<WorkflowStep>("setup");

  const [retentionAgent, setRetentionAgent] = React.useState("");
  const [retentionType, setRetentionType] = React.useState<RetentionType | "">("");

  const [policyStatusAlertOpen, setPolicyStatusAlertOpen] = React.useState(false);

  const [retentionAgentLocked, setRetentionAgentLocked] = React.useState(false);

  const [quoteCarrier, setQuoteCarrier] = React.useState("");
  const [quoteProduct, setQuoteProduct] = React.useState("");
  const [quoteCoverage, setQuoteCoverage] = React.useState("");
  const [quotePremium, setQuotePremium] = React.useState("");
  const [quoteNotes, setQuoteNotes] = React.useState("");

  const [policyStatus, setPolicyStatus] = React.useState<"issued" | "pending">("pending");
  const [accountHolderName, setAccountHolderName] = React.useState("");
  const [routingNumber, setRoutingNumber] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [accountType, setAccountType] = React.useState<"Checking" | "Savings" | "">("");
  const [bankName, setBankName] = React.useState("");
  const [draftDate, setDraftDate] = React.useState("");

  const [shortFormStatus, setShortFormStatus] = React.useState<string>("");
  const [shortFormNotes, setShortFormNotes] = React.useState<string>("");
  const [submittingShortForm, setSubmittingShortForm] = React.useState(false);

  const [rnaRequirementType, setRnaRequirementType] = React.useState<"banking" | "other" | "">("");
  const [mohFixType, setMohFixType] = React.useState<
    "incorrect_banking" | "insufficient_funds" | "pending_manual" | "pending_lapse" | ""
  >("");

  const [lead, setLead] = React.useState<Record<string, unknown> | null>(null);
  const [leadLoading, setLeadLoading] = React.useState(false);
  const [leadError, setLeadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!router.isReady) return;

    const type = strFromQuery(router.query.retentionType);
    if (type === "new_sale" || type === "fixed_payment" || type === "carrier_requirements") {
      setRetentionType(type);
    }

    const agent = strFromQuery(router.query.retentionAgent);
    if (agent) setRetentionAgent(agent);
  }, [router.isReady, router.query.retentionAgent, router.query.retentionType]);

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
          setRetentionAgentLocked(true);
        }
      } catch {
        if (!cancelled) setRetentionAgentLocked(false);
      }
    };

    void loadLoggedInAgent();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!router.isReady) return;
    if (!leadId) {
      setLead(null);
      setLeadLoading(false);
      setLeadError("Missing leadId");
      return;
    }

    let cancelled = false;

    const loadLead = async () => {
      setLeadLoading(true);
      setLeadError(null);
      try {
        const { data, error } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
        if (error) throw error;
        if (!cancelled) setLead((data ?? null) as Record<string, unknown> | null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load lead";
        if (!cancelled) {
          setLead(null);
          setLeadError(msg);
        }
      } finally {
        if (!cancelled) setLeadLoading(false);
      }
    };

    void loadLead();
    return () => {
      cancelled = true;
    };
  }, [leadId, router.isReady]);

  const policyNumber = (deal.policyNumber ?? "").trim();
  const callCenter = (deal.callCenter ?? "").trim();

  const canStart = !!retentionAgent && !!retentionType;

  const handleSetupNext = async () => {
    if (!canStart) {
      toast({ title: "Required", description: "Please select an agent and workflow type", variant: "destructive" });
      return;
    }

    if (retentionType === "carrier_requirements") {
      setPolicyStatusAlertOpen(true);
      return;
    }

    if (retentionType === "new_sale") {
      toast({
        title: "Next step",
        description: "New Sale workflow should be logged via Call Update for now.",
      });
      await handleGoToCallUpdate();
      return;
    }

    if (retentionType === "fixed_payment") {
      setStep("banking");
      return;
    }

    setStep("instructions");
  };

  const handleBankingNext = () => {
    if (!accountHolderName || !routingNumber || !accountNumber || !bankName || !draftDate || !accountType) {
      toast({ title: "Required", description: "Please fill in all banking details", variant: "destructive" });
      return;
    }
    setStep("instructions");
  };

  const computedScript = React.useMemo(() => {
    if (retentionType === "carrier_requirements") {
      return "There is a pending requirement on a pending application I need to fulfill for an applicant. Can you please direct me to the correct department";
    }

    if (retentionType === "fixed_payment") {
      if (policyStatus === "issued") {
        return "I need to redate a policy, can you connect me to the correct department";
      }
      return "I need to give new banking information for a policy that has not been issued yet. Can you please direct me to the correct department";
    }

    return "";
  }, [policyStatus, retentionType]);

  const carrierName = (deal.carrier ?? "").trim();
  const carrierLower = carrierName.toLowerCase();
  const isCorebridge = carrierLower.includes("corebridge");
  const isRoyalNeighbors = carrierLower.includes("royal neighbors") || carrierLower.includes("rna");
  const isAetna = carrierLower.includes("aetna");
  const isMOH = carrierLower.includes("moh") || carrierLower.includes("mutual of omaha");
  const isAMAM = carrierLower.includes("anam") || carrierLower.includes("americo");

  const est = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const isAfter6PM = est.getHours() >= 18;
  const isAfter5PM = est.getHours() >= 17;

  const instructions: InstructionKind = React.useMemo(() => {
    // Corebridge always becomes a task in the legacy flow.
    if (isCorebridge) {
      if (retentionType === "fixed_payment") {
        return {
          kind: "task",
          title: "Action Required",
          body: "Corebridge policy requires an App Fix Task for banking updates.",
        };
      }
      if (retentionType === "carrier_requirements") {
        return {
          kind: "task",
          title: "Action Required",
          body: "Corebridge policy requires an App Fix Task for carrier requirements.",
        };
      }
    }

    // MOH
    if (isMOH) {
      if (retentionType === "carrier_requirements") {
        return {
          kind: "task",
          title: "Email Instructions",
          body:
            "Email to: liferequirements@mutualofomaha.com\nPut Policy number in the subject line\nDocusign with completion form is required (do not need voided check)",
        };
      }

      if (retentionType === "fixed_payment") {
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

        // Default MOH banking update.
        return {
          kind: "call",
          phone: "800-775-7896",
          optionsInstruction: "Press Option 1",
          script:
            "I have the client on the line to provide new banking information for their active policy. Can you please direct me to the correct department",
        };
      }
    }

    // Aetna
    if (isAetna) {
      if (isAfter5PM) {
        return {
          kind: "task",
          title: "Action Required",
          body:
            "Aetna is only able to fix deals over the phone. It is after 5pm EST, so their customer service line is closed. Please schedule a callback for tomorrow during normal business hours.",
        };
      }

      if (retentionType === "fixed_payment") {
        return {
          kind: "call",
          phone: "800-264-4000",
          optionsInstruction: "Press Option 1, then Option 3, then Option 1",
          script:
            "I need to update billing information and draft date for an active policy, can you direct me to the correct department",
        };
      }

      if (retentionType === "carrier_requirements") {
        return {
          kind: "call",
          phone: "866-272-6630",
          optionsInstruction: "Press Option 3, then Option 3",
          script:
            "There is an additional requirement on a pending application we'd like to fulfill. Can you please direct us to the correct department",
        };
      }
    }

    // Royal Neighbors / RNA
    if (isRoyalNeighbors) {
      if (isAfter6PM) {
        return {
          kind: "task",
          title: "Action Required",
          body: "Royal Neighbors is closed (after 6 PM EST). Please create a task.",
        };
      }

      if (retentionType === "fixed_payment") {
        return {
          kind: "call",
          phone: "800-627-4762",
          optionsInstruction: "Press Option 1, then Option 4",
          script: "I need to update banking for a pending application. Can you please direct me to the correct department",
        };
      }

      if (retentionType === "carrier_requirements") {
        if (rnaRequirementType === "other") {
          return {
            kind: "task",
            title: "Action Required",
            body: "This request requires a licensed agent task.",
          };
        }

        // default to banking
        return {
          kind: "call",
          phone: "800-627-4762",
          optionsInstruction: "Press Option 1, then Option 4",
          script: "I need to update banking for a pending application. Can you please direct me to the correct department",
        };
      }
    }

    // AMAM / Americo temporary handling in legacy flow was taskable.
    if (isAMAM && retentionType === "carrier_requirements") {
      return {
        kind: "task",
        title: "Action Required",
        body: "This carrier often requires manual handling. Please create a task if you cannot complete over the phone.",
      };
    }

    // Generic fallback
    if (retentionType === "fixed_payment") {
      return {
        kind: "call",
        phone: "800-736-7311",
        optionsInstruction: "Press Option 1 three times",
        script: computedScript,
      };
    }

    if (retentionType === "carrier_requirements") {
      return {
        kind: "call",
        phone: "800-736-7311",
        optionsInstruction: "Press Option 1 three times",
        script: computedScript,
      };
    }

    return { kind: "task", title: "Action Required", body: "Unable to determine instructions for this workflow." };
  }, [computedScript, isAfter5PM, isAfter6PM, isAetna, isAMAM, isCorebridge, isMOH, isRoyalNeighbors, mohFixType, rnaRequirementType, retentionType]);

  const handleGoToCallUpdate = async () => {
    if (!leadId) {
      toast({ title: "Missing lead", description: "Cannot continue without a leadId.", variant: "destructive" });
      return;
    }

    if (!policyNumber) {
      toast({ title: "Missing policy", description: "Please ensure a policy number is selected.", variant: "destructive" });
      return;
    }

    await router.push(
      `/agent/call-update?leadId=${encodeURIComponent(leadId)}&policyNumber=${encodeURIComponent(
        policyNumber,
      )}&dealId=${encodeURIComponent(String(dealId ?? ""))}&callCenter=${encodeURIComponent(
        callCenter,
      )}&retentionAgent=${encodeURIComponent(
        retentionAgent,
      )}&retentionType=${encodeURIComponent(retentionType)}`,
    );
  };

  const canShowNewBankingInfo =
    retentionType === "fixed_payment" &&
    !!bankName &&
    !!routingNumber &&
    !!accountNumber &&
    !!draftDate;

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
      } else if (status === "Fulfilled carrier requirements") {
        parts.push("ACTION: Fulfilling Carrier Requirements");
        if (rnaRequirementType) {
          parts.push(`RNA REQUIREMENT: ${rnaRequirementType === "banking" ? "Banking Update" : "Other Manual Action"}`);
        }
        parts.push("NOTES: Called carrier and successfully fulfilled pending requirements.");
      }

      return parts.join("\n");
    },
    [accountNumber, bankName, draftDate, mohFixType, policyStatus, rnaRequirementType, routingNumber],
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
          console.warn("[retention-workflow] Error fetching lead_vendor:", fetchError);
        }
      }

      // Get lead_vendor from multiple sources (priority: DB lead > deal.call_center > lead.lead_vendor)
      const finalLeadVendor = 
        leadVendorFromDb ??
        (typeof fullDealData?.call_center === "string" ? fullDealData.call_center.trim() : null) ??
        (deal.callCenter ? deal.callCenter.trim() : null) ??
        getString(lead, "lead_vendor") ??
        null;

      // Use database data if available, otherwise use deal data from route
      const finalPolicyNumber = fullDealData?.policy_number ?? deal.policyNumber;
      const finalCarrier = fullDealData?.carrier ?? deal.carrier;
      const finalProductType = fullDealData?.policy_type ?? null;
      // Get sales agent from database or leadInfo
      const finalSalesAgent = ((typeof fullDealData?.sales_agent === "string" ? fullDealData.sales_agent : null) ?? leadInfoFromRoute.agentName) ?? null;
      // Use deal_value as monthly_premium fallback, cc_value as face_amount fallback
      const finalMonthlyPremium = typeof fullDealData?.deal_value === "number" ? fullDealData.deal_value : null;
      const finalFaceAmount = typeof fullDealData?.cc_value === "number" ? fullDealData.cc_value : null;
      const finalDraftDate = null; // This page doesn't have draft date from form

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

      toast({ title: "Success", description: "Call result updated successfully" });
      await router.push("/agent/assigned-leads");
    } catch {
      toast({ title: "Error", description: "Failed to save call result", variant: "destructive" });
    } finally {
      setSubmittingShortForm(false);
    }
  };

  const leadName = (getString(lead, "customer_full_name") ?? deal.clientName ?? "N/A").trim();
  const leadPhone = (getString(lead, "phone_number") ?? deal.phoneNumber ?? "N/A").trim();
  const leadEmail = (getString(lead, "email") ?? "N/A").trim();
  const leadState = (getString(lead, "state") ?? "N/A").trim();
  const leadVendor = (getString(lead, "lead_vendor") ?? callCenter ?? "N/A").trim();
  const leadDob = ((leadInfoFromRoute.dob || getString(lead, "date_of_birth") || "N/A") as string).trim();
  const leadGhlStage = ((leadInfoFromRoute.ghlStage || getString(lead, "ghl_stage") || "N/A") as string).trim();
  const leadAgentName = ((leadInfoFromRoute.agentName || getString(lead, "agent") || "N/A") as string).trim();
  const leadWritingNumber = ((leadInfoFromRoute.writingNumber || "") as string).trim();
  const leadSsnLast4 = ((leadInfoFromRoute.ssnLast4 || "") as string).trim();
  const leadAddress = ((leadInfoFromRoute.address || getString(lead, "street_address") || "N/A") as string).trim();
  const bankingRouting = ((bankingFromRoute.routingNumber || getString(lead, "beneficiary_routing") || "N/A") as string).trim();
  const bankingAccount = ((bankingFromRoute.accountNumber || getString(lead, "beneficiary_account") || "N/A") as string).trim();
  const bankingInstitution = ((bankingFromRoute.bankName || getString(lead, "beneficiary_bank_name") || "") as string).trim();
  const bankingAccountType = ((bankingFromRoute.accountType || getString(lead, "beneficiary_account_type") || "") as string).trim();

  return (
    <div className="w-full px-4 md:px-8 lg:px-10 py-6 min-h-screen bg-muted/15">
      <Dialog open={policyStatusAlertOpen} onOpenChange={setPolicyStatusAlertOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Policy Status Alert
            </DialogTitle>
          </DialogHeader>

          <div className="text-muted-foreground text-lg leading-relaxed">
            This is not a pending policy. Either select a new workflow, or different policy
          </div>

          <div className="pt-4 space-y-3">
            <Button
              variant="outline"
              className="w-full h-12"
              onClick={async () => {
                setPolicyStatusAlertOpen(false);
                setStep("setup");
                await router.back();
              }}
            >
              Select Different Policy
            </Button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                variant="secondary"
                className="h-12"
                onClick={() => {
                  setRetentionType("fixed_payment");
                  setPolicyStatusAlertOpen(false);
                  setStep("banking");
                }}
              >
                Switch to Fixing Failed Payment
              </Button>

              <Button
                variant="secondary"
                className="h-12"
                onClick={() => {
                  setRetentionType("new_sale");
                  setPolicyStatusAlertOpen(false);
                  setStep("setup");
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
                setStep("setup");
                void handleGoToCallUpdate();
              }}
            >
              Update Call Result
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-3 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
            ← Back
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Workflow</span>
            <Separator orientation="vertical" className="h-4" />
            <span>Policy: {policyNumber || "—"}</span>
            <Separator orientation="vertical" className="h-4" />
            <span>Center: {callCenter || "—"}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
          <div className="lg:col-span-4">
            <Card className="border border-primary/20 shadow-sm bg-primary/5">
              <CardContent className="space-y-6">
                {leadLoading ? (
                  <div className="text-sm text-muted-foreground">Loading lead...</div>
                ) : leadError ? (
                  <div className="text-sm text-red-600">{leadError}</div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">Customer Name</div>
                        <div className="font-semibold text-lg text-foreground">{leadName || "N/A"}</div>
                      </div>

                      <div>
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">Contact</div>
                        <div className="space-y-1 text-sm">
                          <div className="font-medium">{leadPhone || "N/A"}</div>
                          <div className="text-muted-foreground break-all">{leadEmail || "N/A"}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">State</div>
                          <div className="font-medium text-sm">{leadState || "N/A"}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">Vendor</div>
                          <div className="font-medium text-sm">{leadVendor || "N/A"}</div>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">Date of Birth</div>
                        <div className="font-medium text-sm">{leadDob || "N/A"}</div>
                      </div>

                      <div>
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">GHL Stage</div>
                        <div className="font-medium text-sm">{leadGhlStage || "N/A"}</div>
                      </div>
                    </div>

                    {canShowNewBankingInfo ? (
                      <div className="pt-4 border-t border-border">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">New Banking Info</div>
                        <div className="mt-3 space-y-2 text-sm bg-muted/10 p-3 rounded border">
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

                    <div className="pt-4 border-t border-border">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Banking Info (On File)</div>
                      <div className="mt-3 space-y-2 text-sm bg-muted/20 p-3 rounded border">
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground text-xs">Institution</span>
                          <span className="font-medium">{bankingInstitution || "N/A"}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground text-xs">Routing</span>
                          <span className="font-mono font-medium">{bankingRouting || "N/A"}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground text-xs">Account</span>
                          <span className="font-mono font-medium">{bankingAccount || "N/A"}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground text-xs">Account Type</span>
                          <span className="font-medium">{bankingAccountType || "N/A"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-border">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Selected Policy</div>
                      <div className="mt-3 space-y-2 text-sm bg-muted/10 p-3 rounded border">
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground text-xs">Carrier</span>
                          <span className="font-medium">{deal.carrier || "N/A"}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground text-xs">Policy #</span>
                          <span className="font-medium">{policyNumber || "N/A"}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground text-xs">Center</span>
                          <span className="font-medium">{callCenter || "N/A"}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-8">
            {step === "setup" ? (
              <Card className="shadow-md border border-muted/60">
                <CardHeader>
                  <CardTitle>Setup</CardTitle>
                  <CardDescription>Select agent and workflow type to proceed</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Select Retention Agent</Label>
                      {retentionAgentLocked && retentionAgent ? (
                        <div className="rounded-md border bg-background px-3 py-2 text-sm font-medium">
                          {retentionAgent}
                        </div>
                      ) : (
                        <Select value={retentionAgent} onValueChange={setRetentionAgent}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Agent" />
                          </SelectTrigger>
                          <SelectContent>
                            {retentionAgentOptions.map((agentName) => (
                              <SelectItem key={agentName} value={agentName}>
                                {agentName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Retention Call Type</Label>
                      <Select value={retentionType} onValueChange={(val) => setRetentionType(val as RetentionType)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new_sale">New Sale</SelectItem>
                          <SelectItem value="fixed_payment">Fixed Failed Payment</SelectItem>
                          <SelectItem value="carrier_requirements">Fulfilling Carrier Requirements</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

              {retentionType === "new_sale" ? (
                <div className="space-y-4 rounded-md border p-4">
                  <div className="text-sm font-medium text-muted-foreground">Quote Details (Optional)</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Carrier</Label>
                      <Select value={quoteCarrier} onValueChange={setQuoteCarrier}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Carrier" />
                        </SelectTrigger>
                        <SelectContent>
                          {carrierOptions.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Product Level</Label>
                      <Select value={quoteProduct} onValueChange={setQuoteProduct}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Product Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {productTypeOptions.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Coverage Amount</Label>
                      <Input value={quoteCoverage} onChange={(e) => setQuoteCoverage(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Monthly Premium</Label>
                      <Input value={quotePremium} onChange={(e) => setQuotePremium(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} className="min-h-[90px]" />
                  </div>
                </div>
              ) : null}
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={() => void handleSetupNext()}>
                Next
              </Button>
            </CardFooter>
          </Card>
        ) : null}

            {step === "banking" ? (
              <Card className="shadow-md border border-muted/60">
                <CardHeader>
                  <CardTitle>Banking Information</CardTitle>
                  <CardDescription>Enter the banking details required for this fix</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
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
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("setup")}>
                Back
              </Button>
              <Button onClick={handleBankingNext}>Next</Button>
            </CardFooter>
          </Card>
        ) : null}

            {step === "instructions" ? (
              <Card className="shadow-md border border-muted/60">
                <CardHeader className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>Instructions</CardTitle>
                    {retentionType && retentionType !== "carrier_requirements" ? (
                      <Badge variant="secondary">{retentionType}</Badge>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
              {isMOH && retentionType === "fixed_payment" ? (
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

              {isRoyalNeighbors && retentionType === "carrier_requirements" ? (
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Client Name</div>
                    <div className="text-sm font-semibold">{deal.clientName || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Policy Number</div>
                    <div className="text-sm font-semibold">{policyNumber || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Agent Name</div>
                    <div className="text-sm font-semibold">{leadAgentName || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Agent Writing Number</div>
                    <div className="text-sm font-semibold">{leadWritingNumber || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Last 4 Agent SSN</div>
                    <div className="text-sm font-semibold">{leadSsnLast4 || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Date of Birth</div>
                    <div className="text-sm font-semibold">{leadDob || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Carrier</div>
                    <div className="text-sm font-semibold">{deal.carrier || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Call Center</div>
                    <div className="text-sm font-semibold">{callCenter || "—"}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-xs text-muted-foreground">Address</div>
                    <div className="text-sm font-semibold">{leadAddress || "—"}</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setStep(retentionType === "fixed_payment" ? "banking" : "setup");
                  }}
                >
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    if (retentionType === "fixed_payment" && !canShowNewBankingInfo) {
                      toast({ title: "Required", description: "Please fill in all banking details", variant: "destructive" });
                      setStep("banking");
                      return;
                    }
                    setStep("callResult");
                  }}
                >
                  Update Call Result
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

            {step === "callResult" ? (
              <Card className="shadow-md border border-muted/60 bg-primary/5">
                <CardHeader>
                  <CardTitle>Call Result</CardTitle>
                  <CardDescription>Log the outcome of your call</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                        <SelectItem value="Fulfilled carrier requirements">Fulfilled carrier requirements</SelectItem>
                        <SelectItem value="Updated Banking/draft date">Updated Banking/draft date</SelectItem>
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
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep("instructions")}>
                    Back to Instructions
                  </Button>
                  <Button onClick={() => void handleShortFormSubmit()} disabled={submittingShortForm}>
                    Submit & Finish
                  </Button>
                </CardFooter>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
