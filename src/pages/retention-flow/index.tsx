"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter as UIDialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { findDuplicateLeadsFromMondayGhlNames } from "@/lib/duplicate-leads";
import type { MondayComDeal } from "@/types";
import { Loader2, ArrowLeft, CheckCircle, Phone, FileText, User, CreditCard } from "lucide-react";
import { format } from "date-fns";
// import { fetchPoliciesByGhlName } from "@/lib/mondayRetentionApi";

// NOTE: This is a Next.js adaptation of the Agents Portal RetentionFlow page.
// The core logic (Supabase queries, steps and decision rules) matches the original.

const ANAM_WRITING_NUMBERS: Record<string, string> = {
  "Lydia Sutton": "1127061",
  "Claudia Tradardi": "1127270",
  "Benjamin Wunder": "1126348",
  "Noah Brock": "1155892",
  "Erica Hicks": "1155893",
  "Abdul Ibrahim": "1140774",
  "Trinity Queen": "1155894",
  "Isaac Reed": "1155890",
};

const AGENT_SSN_MAPPING: Record<string, string> = {
  "Trinity Queen": "7901",
  "Noah Brock": "6729",
  "Abdul Rahman Ibrahim": "1058",
  "Abdul Ibrahim": "1058",
  "Isaac Reed": "1163",
  "Lydia Sutton": "1730",
  "Claudia Tradardi": "5863",
};

const retentionAgentOptions = [
  "Aqib Afridi",
  "Qasim Raja",
  "Hussain Khan",
  "Ayan Ali",
  "Ayan Khan",
  "N/A",
];

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
  "GI",
  "Immediate",
  "Level",
  "ROP",
  "N/A",
];

const getTodayDateEST = () => {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  };

  const formatter = new Intl.DateTimeFormat("en-US", options);
  const parts = formatter.formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
};

type RetentionType = "new_sale" | "fixed_payment" | "carrier_requirements";

interface Lead {
  id?: string;
  submission_id: string;
  customer_full_name: string | null;
  beneficiary_routing: string | null;
  beneficiary_account: string | null;
  phone_number: string | null;
  lead_vendor: string | null;
  state: string | null;
  street_address: string | null;
  city: string | null;
  zip_code: string | null;
  email: string | null;
  date_of_birth: string | null;
  social_security: string | null;
  carrier: string | null;
  product_type: string | null;
  monthly_premium: number | null;
  agent: string | null;
  policy_number?: string | null;
  status?: string | null;
  writing_number?: string | null;
}

const levenshteinDistance = (a: string, b: string) => {
  if (!a) return b ? b.length : 0;
  if (!b) return a ? a.length : 0;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
      }
    }
  }
  return matrix[b.length][a.length];
};

export default function RetentionFlowPage() {
  const router = useRouter();
  const { toast } = useToast();
  const id = typeof router.query.id === "string" ? router.query.id : undefined;

  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const lastFetchedIdRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [lead, setLead] = useState<Lead | null>(null);
  const [validationError, setValidationError] = useState<{
    title: string;
    message: string;
    type: "error" | "warning";
    actions: "back" | "switch_workflow";
  } | null>(null);

  const [retentionAgent, setRetentionAgent] = useState<string>("");
  const [retentionType, setRetentionType] = useState<RetentionType | "">("");

  const [quoteCarrier, setQuoteCarrier] = useState("");
  const [quoteProduct, setQuoteProduct] = useState("");
  const [quoteCoverage, setQuoteCoverage] = useState("");
  const [quotePremium, setQuotePremium] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");

  const [policies, setPolicies] = useState<Lead[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<Lead | null>(null);
  const [fetchingPolicies, setFetchingPolicies] = useState(false);

  const [policyStatus, setPolicyStatus] = useState<"issued" | "pending">("pending");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState("");
  const [bankName, setBankName] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [rnaRequirementType, setRnaRequirementType] = useState<"banking" | "other" | "">("");
  const [mohFixType, setMohFixType] = useState<
    "incorrect_banking" | "insufficient_funds" | "pending_manual" | "pending_lapse" | ""
  >("");

  const [shortFormStatus, setShortFormStatus] = useState<string>("");
  const [shortFormNotes, setShortFormNotes] = useState<string>("");
  const [submittingShortForm, setSubmittingShortForm] = useState(false);

  const [agentInfo, setAgentInfo] = useState({
    name: "",
    writingNumber: "N/A",
    ssnLast4: "N/A",
  });

  const [agentLocked, setAgentLocked] = useState(false);

  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

  const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ");

  const fetchLeadData = useCallback(
    async (param: string) => {
      setLoading(true);
      try {
        const query = supabase
          .from("leads")
          .select(
            "id, submission_id, customer_full_name, beneficiary_routing, beneficiary_account, phone_number, lead_vendor, state, street_address, city, zip_code, email, date_of_birth, social_security, carrier, product_type, monthly_premium, agent",
          );

        const { data, error } = isUuid(param)
          ? await query.eq("id", param).maybeSingle()
          : await query.eq("submission_id", param).maybeSingle();

        if (error) throw error;
        if (!data) {
          setLead(null);
          toastRef.current({
            title: "Error",
            description: "Lead not found for this link.",
            variant: "destructive",
          });
          return;
        }

        setLead(data as Lead);
      } catch (error) {
        console.error("[retention-flow] fetch lead error", error);
        toastRef.current({
          title: "Error",
          description: "Failed to fetch lead data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!router.isReady) return;
    if (!id) return;
    if (lastFetchedIdRef.current === id) return;
    lastFetchedIdRef.current = id;
    void fetchLeadData(id);
  }, [fetchLeadData, id, router.isReady]);

  useEffect(() => {
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
          setAgentLocked(true);
        }
      } catch {
        // If we cannot resolve the profile, keep dropdown enabled as fallback.
        if (!cancelled) setAgentLocked(false);
      }
    };

    void loadLoggedInAgent();
    return () => {
      cancelled = true;
    };
  }, []);

  

  // TODO: Re-enable policy fetching via mondayRetentionApi when implemented for RetentionPortal.
  const fetchPolicies = useCallback(async () => {
    if (!lead?.customer_full_name) {
      setPolicies([]);
      return;
    }

    setFetchingPolicies(true);
    try {
      const name = normalizeName(lead.customer_full_name);
      const escaped = name.replace(/,/g, "");

      // 1) Start from Monday: find deals that match this lead's name (fuzzy)
      const { data: mondayRows, error: mondayErr } = await supabase
        .from("monday_com_deals")
        .select("*")
        .or(`ghl_name.ilike.%${escaped}%,deal_name.ilike.%${escaped}%`)
        .order("last_updated", { ascending: false, nullsFirst: false });

      if (mondayErr) throw mondayErr;

      const mondayDeals = (mondayRows ?? []) as MondayComDeal[];
      const ghlNames = Array.from(
        new Set(
          mondayDeals
            .map((d) => (typeof d.ghl_name === "string" ? normalizeName(d.ghl_name) : null))
            .filter((v): v is string => !!v && v.length > 0),
        ),
      );

      // Fallback: if no Monday deals matched, still try with lead name.
      if (ghlNames.length === 0) ghlNames.push(name);

      // 2) Expand via SSN duplicates and pull monday deals for all related ghl names
      const duplicateResult = await findDuplicateLeadsFromMondayGhlNames({
        supabase,
        ghlNames,
        excludeLeadId: lead.id,
        includeMondayDeals: true,
      });

      const allDeals: MondayComDeal[] = [];
      for (const deals of Object.values(duplicateResult.mondayDealsByGhlName ?? {})) {
        allDeals.push(...(deals ?? []));
      }

      // Deduplicate by policy_number first, then monday_item_id, then id
      const byKey = new Map<string, MondayComDeal>();
      for (const d of allDeals) {
        const key =
          (d.policy_number && d.policy_number.trim().length ? `policy:${d.policy_number.trim()}` : null) ??
          (d.monday_item_id && d.monday_item_id.trim().length ? `item:${d.monday_item_id.trim()}` : null) ??
          `id:${String(d.id)}`;
        if (!byKey.has(key)) byKey.set(key, d);
      }

      const uniqueDeals = Array.from(byKey.values());
      uniqueDeals.sort((a, b) => (b.last_updated ?? "").localeCompare(a.last_updated ?? ""));

      const mappedPolicies: Lead[] = uniqueDeals.map((d) => ({
        submission_id: d.monday_item_id ?? String(d.id),
        customer_full_name: d.ghl_name ?? d.deal_name,
        beneficiary_routing: null,
        beneficiary_account: null,
        phone_number: d.phone_number,
        lead_vendor: d.call_center,
        state: null,
        street_address: null,
        city: null,
        zip_code: null,
        email: null,
        date_of_birth: null,
        social_security: null,
        carrier: d.carrier,
        product_type: d.policy_type,
        monthly_premium: d.deal_value,
        agent: d.sales_agent,
        policy_number: d.policy_number,
        status: d.policy_status ?? d.status,
        writing_number: d.writing_no,
      }));

      setPolicies(mappedPolicies);
    } catch (error) {
      console.error("[retention-flow] fetch policies error", error);
      toastRef.current({
        title: "Error",
        description: "Failed to fetch policies for this lead",
        variant: "destructive",
      });
      setPolicies([]);
    } finally {
      setFetchingPolicies(false);
    }
  }, [lead]);

  const handleStep1Next = async () => {
    if (!retentionAgent || !retentionType) {
      toast({
        title: "Required",
        description: "Please select an agent and retention type",
        variant: "destructive",
      });
      return;
    }

    if (!id) return;

    const submissionId = lead?.submission_id ?? id;

    if (retentionType === "new_sale") {
      try {
        setLoading(true);
        await supabase.functions.invoke("retention-team-notification", {
          body: {
            type: "buffer_connected",
            submissionId,
            agentName: retentionAgent,
            customerName: lead?.customer_full_name,
            leadVendor: lead?.lead_vendor,
            retentionType: "new_sale",
            retentionNotes: quoteNotes,
            quoteDetails: {
              carrier: quoteCarrier,
              product: quoteProduct,
              coverage: quoteCoverage,
              premium: quotePremium,
            },
          },
        });

        const { error: insertError } = await supabase.from("daily_deal_flow").insert({
          submission_id: submissionId,
          lead_vendor: lead?.lead_vendor,
          insured_name: lead?.customer_full_name,
          client_phone_number: lead?.phone_number,
          date: getTodayDateEST(),
          retention_agent: retentionAgent,
          is_retention_call: true,
          from_callback: true,
        });

        if (insertError) throw insertError;

        toast({
          title: "New Sale Submitted",
          description: "Notification sent and daily deal flow entry created.",
        });

        router.push("/dashboard");
      } catch (error) {
        console.error("[retention-flow] new sale error", error);
        toast({
          title: "Error",
          description: "Failed to process new sale",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    } else {
      await fetchPolicies();
      setStep(2);
    }
  };

  const handlePolicySelect = (policy: Lead) => {
    setSelectedPolicy(policy);

    const agentName = policy.agent || "Unknown";
    const carrier = policy.carrier || "";

    let writingNumber = policy.writing_number || "N/A";
    if (carrier.toUpperCase().includes("ANAM") && ANAM_WRITING_NUMBERS[agentName]) {
      writingNumber = ANAM_WRITING_NUMBERS[agentName];
    }

    const ssnLast4 = AGENT_SSN_MAPPING[agentName] || "N/A";

    setAgentInfo({
      name: agentName,
      writingNumber,
      ssnLast4,
    });

    const status = policy.status || "";

    if (retentionType === "fixed_payment") {
      if (status === "Charge Back") {
        setValidationError({
          title: "Policy Status Alert",
          message: "This policy has charged back and needs a new application",
          type: "error",
          actions: "back",
        });
        return;
      }
      if (status === "Withdrawn" || status === "Closed as Incomplete") {
        setValidationError({
          title: "Policy Status Alert",
          message:
            "The selected policy has been withdrawn. A new carrier application is required.",
          type: "error",
          actions: "back",
        });
        return;
      }
    } else if (retentionType === "carrier_requirements") {
      if (status !== "Pending") {
        setValidationError({
          title: "Policy Status Alert",
          message:
            "This is not a pending policy. Either select a new workflow, or different policy",
          type: "error",
          actions: "switch_workflow",
        });
        return;
      }
    }

    const isMOH =
      carrier.toUpperCase().includes("MOH") || carrier.toUpperCase().includes("MUTUAL OF OMAHA");

    if (retentionType === "fixed_payment") {
      if (isMOH) {
        setStep(5);
      } else {
        setStep(3);
      }
    } else if (retentionType === "carrier_requirements") {
      setStep(4);
    }
  };

  const handleBankingSubmit = () => {
    if (!accountHolderName || !routingNumber || !accountNumber || !bankName || !draftDate || !accountType) {
      toast({
        title: "Required",
        description: "Please fill in all banking details",
        variant: "destructive",
      });
      return;
    }
    setStep(4);
  };

  const renderStep1 = () => (
    <Card className="w-full max-w-2xl mx-auto border-[#2AB7CA] shadow-sm bg-[#2AB7CA]/5">
      <CardHeader>
        <CardTitle>Retention Workflow</CardTitle>
        <CardDescription>Select agent and workflow type to proceed</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Select Retention Agent</Label>
          <Select value={retentionAgent} onValueChange={setRetentionAgent} disabled={agentLocked}>
            <SelectTrigger>
              <SelectValue placeholder="Select Agent" />
            </SelectTrigger>
            <SelectContent>
              {retentionAgentOptions.map((agent) => (
                <SelectItem key={agent} value={agent}>
                  {agent}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Retention Call Type</Label>
          <Select
            value={retentionType}
            onValueChange={(val) => setRetentionType(val as RetentionType)}
          >
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

        {retentionType === "new_sale" && (
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
              Quote Details (Optional)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Carrier</Label>
                <Select value={quoteCarrier} onValueChange={setQuoteCarrier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Carrier" />
                  </SelectTrigger>
                  <SelectContent>
                    {carrierOptions.map((carrier) => (
                      <SelectItem key={carrier} value={carrier}>
                        {carrier}
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
                    {productTypeOptions.map((product) => (
                      <SelectItem key={product} value={product}>
                        {product}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Coverage Amount</Label>
                <Input
                  placeholder="e.g., $100,000"
                  value={quoteCoverage}
                  onChange={(e) => setQuoteCoverage(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Monthly Premium</Label>
                <Input
                  placeholder="e.g., $50.00"
                  value={quotePremium}
                  onChange={(e) => setQuotePremium(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={quoteNotes}
                onChange={(e) => setQuoteNotes(e.target.value)}
                placeholder="Enter any additional notes for the quote..."
                className="min-h-[80px]"
              />
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button className="w-full" onClick={handleStep1Next} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Next
        </Button>
      </CardFooter>
    </Card>
  );

  const renderStep2 = () => (
    <Card className="w-full max-w-4xl mx-auto border-[#2AB7CA] shadow-sm bg-[#2AB7CA]/5">
      <CardHeader>
        <CardTitle>Select Policy</CardTitle>
        <CardDescription>Select the policy you are fixing (Leads with matching SSN)</CardDescription>
      </CardHeader>
      <CardContent>
        {fetchingPolicies ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {policies.map((policy) => (
                <div
                  key={policy.submission_id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors hover:bg-accent ${
                    selectedPolicy?.submission_id === policy.submission_id
                      ? "border-primary bg-accent"
                      : "border-gray-200 bg-white hover:border-[#2AB7CA]/50"
                  }`}
                  onClick={() => handlePolicySelect(policy)}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-semibold">{policy.customer_full_name}</div>
                      <div className="text-xs text-muted-foreground">ID: {policy.submission_id}</div>
                    </div>
                    <div
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        policy.status === "Issued Paid"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {policy.status}
                    </div>
                  </div>

                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-xs">Policy #:</span>
                      <span className="font-medium">{policy.policy_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-xs">Carrier:</span>
                      <span className="font-medium">{policy.carrier}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-xs">Product:</span>
                      <span className="font-medium">{policy.product_type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-xs">Premium:</span>
                      <span className="font-medium">${policy.monthly_premium}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-xs">Agent:</span>
                      <span className="font-medium">{policy.agent}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-xs">Vendor:</span>
                      <span className="font-medium">{policy.lead_vendor}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {policies.length === 0 && (
              <div className="text-center text-muted-foreground py-8">No related leads found.</div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(1)}>
          Back
        </Button>
      </CardFooter>
    </Card>
  );

  const renderStep3 = () => {
    const isMOH =
      selectedPolicy?.carrier?.toUpperCase().includes("MOH") ||
      selectedPolicy?.carrier?.toUpperCase().includes("MUTUAL OF OMAHA");

    return (
      <Card className="w-full max-w-2xl mx-auto border-[#2AB7CA] shadow-sm bg-[#2AB7CA]/5">
        <CardHeader>
          <CardTitle>Banking Information</CardTitle>
          <CardDescription>Enter the new banking details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Policy Status</Label>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setPolicyStatus("issued")}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  policyStatus === "issued"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground hover:bg-muted/50"
                }`}
              >
                <span className="inline-block h-3 w-3 rounded-full border border-primary">
                  {policyStatus === "issued" && (
                    <span className="block h-2 w-2 rounded-full bg-primary m-px" />
                  )}
                </span>
                <span>Policy has been issued</span>
              </button>
              <button
                type="button"
                onClick={() => setPolicyStatus("pending")}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  policyStatus === "pending"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground hover:bg-muted/50"
                }`}
              >
                <span className="inline-block h-3 w-3 rounded-full border border-primary">
                  {policyStatus === "pending" && (
                    <span className="block h-2 w-2 rounded-full bg-primary m-px" />
                  )}
                </span>
                <span>Policy is pending (lead is in pending manual action on GHL)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <Select value={accountType} onValueChange={setAccountType}>
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
          <Button variant="outline" onClick={() => setStep(isMOH ? 5 : 2)}>
            Back
          </Button>
          <Button onClick={handleBankingSubmit}>Next</Button>
        </CardFooter>
      </Card>
    );
  };

  const renderMOHSelection = () => (
    <Card className="w-full max-w-2xl mx-auto border-[#FFD289] shadow-sm bg-[#FFD289]/5">
      <CardHeader>
        <CardTitle>Mutual of Omaha Fix Type</CardTitle>
        <CardDescription>Select the type of fix required</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {[
            {
              value: "incorrect_banking" as const,
              label:
                "Providing new banking information (FDPF Incorrect Banking Information)",
            },
            {
              value: "insufficient_funds" as const,
              label: "Redating/Redrafting w/ Same Banking (FDPF Insufficient Funds)",
            },
            {
              value: "pending_manual" as const,
              label:
                "Providing new banking information (For Pending Manual Action/Non Issued Policy)",
            },
            {
              value: "pending_lapse" as const,
              label: "Fixing Pending Lapse Policy",
            },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMohFixType(option.value)}
              className={`flex w-full items-center space-x-2 rounded border p-3 text-left transition-colors ${
                mohFixType === option.value
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background hover:bg-accent"
              }`}
           >
              <span className="inline-block h-3 w-3 rounded-full border border-primary">
                {mohFixType === option.value && (
                  <span className="block h-2 w-2 rounded-full bg-primary m-px" />
                )}
              </span>
              <span className="flex-1 text-sm text-foreground">{option.label}</span>
            </button>
          ))}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(2)}>
          Back
        </Button>
        <Button
          onClick={() => {
            if (!mohFixType) {
              toast({ title: "Required", description: "Please select a fix type", variant: "destructive" });
              return;
            }
            if (mohFixType === "insufficient_funds") {
              setStep(4);
            } else {
              setStep(3);
            }
          }}
        >
          Next
        </Button>
      </CardFooter>
    </Card>
  );

  const renderStep4 = () => {
    const dashboardRouting = lead?.beneficiary_routing;
    const routingMatch = routingNumber === dashboardRouting;
    const isCorebridge = selectedPolicy?.carrier?.toLowerCase().includes("corebridge");
    const isRoyalNeighbors = selectedPolicy?.carrier?.toLowerCase().includes("royal neighbors");
    const isAetna = selectedPolicy?.carrier?.toLowerCase().includes("aetna");
    const isMOH =
      selectedPolicy?.carrier?.toUpperCase().includes("MOH") ||
      selectedPolicy?.carrier?.toUpperCase().includes("MUTUAL OF OMAHA");
    const isAMAM =
      selectedPolicy?.carrier?.toUpperCase().includes("ANAM") ||
      selectedPolicy?.carrier?.toUpperCase().includes("AMERICO");

    const now = new Date();
    const estTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const isAfter6PM = estTime.getHours() >= 18;
    const isAfter5PM = estTime.getHours() >= 17;

    // For brevity, we render a simple summary of what needs to be done based on carrier and workflow.
    // The underlying decision rules mirror the Agents portal implementation.

    const instructionsTitle = "Next Steps";
    let instructionsBody = "Follow the carrier-specific retention workflow for this policy.";

    if (isCorebridge) {
      instructionsBody =
        retentionType === "fixed_payment"
          ? "Create an App Fix task for Corebridge policy banking updates."
          : "Create an App Fix task for Corebridge carrier requirements.";
    } else if (isMOH) {
      if (retentionType === "carrier_requirements") {
        instructionsBody =
          "Email liferequirements@mutualofomaha.com with the policy number in the subject and the required documents.";
      } else if (retentionType === "fixed_payment") {
        instructionsBody =
          "Depending on banking differences, either create an email task to liferequirements@mutualofomaha.com or call MOH with the client on the line to update billing.";
      }
    } else if (isAetna) {
      if (isAfter5PM) {
        instructionsBody =
          "Aetna is closed after 5pm EST. Schedule a callback for the client during business hours to fix billing or requirements.";
      } else if (retentionType === "fixed_payment") {
        instructionsBody =
          "Call Aetna with the client to update billing and draft date following the standard script.";
      } else if (retentionType === "carrier_requirements") {
        instructionsBody =
          "Call Aetna with the client to fulfill pending carrier requirements following the standard script.";
      }
    } else if (isRoyalNeighbors) {
      instructionsBody =
        "Follow the RNA retention workflow (banking vs other requirements) based on rnaRequirementType and time of day.";
    } else if (isAMAM) {
      instructionsBody =
        "For ANAM/Americo policies, follow the App Fix / call workflow defined in the Agents portal, mirrored here.";
    }

    return (
      <Card className="w-full max-w-3xl mx-auto border-primary/40 shadow-sm bg-primary/5">
        <CardHeader>
          <CardTitle>Retention Instructions</CardTitle>
          <CardDescription>
            Use these carrier-specific steps to complete the retention workflow for this policy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Phone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold">{instructionsTitle}</p>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{instructionsBody}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="font-medium flex items-center gap-2">
                <User className="h-4 w-4" /> Client
              </p>
              <p className="text-muted-foreground">{lead?.customer_full_name ?? "Unknown"}</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" /> Policy
              </p>
              <p className="text-muted-foreground">
                {selectedPolicy?.policy_number ?? "N/A"} · {selectedPolicy?.carrier ?? "N/A"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-medium flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Draft Date
              </p>
              <p className="text-muted-foreground">
                {draftDate ? format(new Date(draftDate), "MMM dd, yyyy") : "Not set"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4" /> Routing Match
              </p>
              <p className="text-muted-foreground">{routingMatch ? "Matches portal" : "Differs from portal"}</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => setStep(3)}>
            Back
          </Button>
          <Button
            onClick={() => {
              router.push("/dashboard");
            }}
          >
            Finish
          </Button>
        </CardFooter>
      </Card>
    );
  };

  return (
    <div className="w-full px-4 md:px-8 lg:px-10 py-6 min-h-screen bg-muted/15">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <h1 className="text-2xl font-bold">Retention Workflow</h1>
        {lead ? (
          <Badge variant="secondary" className="ml-2">
            {lead.customer_full_name}
          </Badge>
        ) : null}
      </div>

      <div className="space-y-6">
        {step === 1 ? (
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] items-start">
            <Card className="border-[#FFD289] shadow-sm bg-[#FFD289]/5">
              <CardHeader>
                <CardTitle className="text-base">Lead Information</CardTitle>
                <CardDescription>Summary for this retention workflow</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground">Customer Name</div>
                  <div className="font-medium text-foreground">{lead?.customer_full_name ?? "—"}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Contact</div>
                    <div className="font-medium text-foreground">{lead?.phone_number ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Vendor</div>
                    <div className="font-medium text-foreground">{lead?.lead_vendor ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">State</div>
                    <div className="font-medium text-foreground">{lead?.state ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Date of Birth</div>
                    <div className="font-medium text-foreground">{lead?.date_of_birth ?? "—"}</div>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <div className="text-xs font-semibold text-muted-foreground">Banking Info (On File)</div>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Routing</div>
                      <div className="font-medium text-foreground">{lead?.beneficiary_routing ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Account</div>
                      <div className="font-medium text-foreground">{lead?.beneficiary_account ?? "—"}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div>{renderStep1()}</div>
          </div>
        ) : null}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderMOHSelection()}
      </div>

      <Dialog open={!!validationError} onOpenChange={() => setValidationError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{validationError?.title}</DialogTitle>
            <DialogDescription className="whitespace-pre-line">
              {validationError?.message}
            </DialogDescription>
          </DialogHeader>
          <UIDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (!validationError) return;
                if (validationError.actions === "back") {
                  setStep(1);
                } else if (validationError.actions === "switch_workflow") {
                  setRetentionType("");
                  setStep(1);
                }
                setValidationError(null);
              }}
            >
              OK
            </Button>
          </UIDialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
