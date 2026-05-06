"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { productTypeOptions } from "./types";

const US_STATES = [
  { value: "Alabama", label: "Alabama" },
  { value: "Alaska", label: "Alaska" },
  { value: "Arizona", label: "Arizona" },
  { value: "Arkansas", label: "Arkansas" },
  { value: "California", label: "California" },
  { value: "Colorado", label: "Colorado" },
  { value: "Connecticut", label: "Connecticut" },
  { value: "Delaware", label: "Delaware" },
  { value: "Florida", label: "Florida" },
  { value: "Georgia", label: "Georgia" },
  { value: "Hawaii", label: "Hawaii" },
  { value: "Idaho", label: "Idaho" },
  { value: "Illinois", label: "Illinois" },
  { value: "Indiana", label: "Indiana" },
  { value: "Iowa", label: "Iowa" },
  { value: "Kansas", label: "Kansas" },
  { value: "Kentucky", label: "Kentucky" },
  { value: "Louisiana", label: "Louisiana" },
  { value: "Maine", label: "Maine" },
  { value: "Maryland", label: "Maryland" },
  { value: "Massachusetts", label: "Massachusetts" },
  { value: "Michigan", label: "Michigan" },
  { value: "Minnesota", label: "Minnesota" },
  { value: "Mississippi", label: "Mississippi" },
  { value: "Missouri", label: "Missouri" },
  { value: "Montana", label: "Montana" },
  { value: "Nebraska", label: "Nebraska" },
  { value: "Nevada", label: "Nevada" },
  { value: "New Hampshire", label: "New Hampshire" },
  { value: "New Jersey", label: "New Jersey" },
  { value: "New Mexico", label: "New Mexico" },
  { value: "New York", label: "New York" },
  { value: "North Carolina", label: "North Carolina" },
  { value: "North Dakota", label: "North Dakota" },
  { value: "Ohio", label: "Ohio" },
  { value: "Oklahoma", label: "Oklahoma" },
  { value: "Oregon", label: "Oregon" },
  { value: "Pennsylvania", label: "Pennsylvania" },
  { value: "Rhode Island", label: "Rhode Island" },
  { value: "South Carolina", label: "South Carolina" },
  { value: "South Dakota", label: "South Dakota" },
  { value: "Tennessee", label: "Tennessee" },
  { value: "Texas", label: "Texas" },
  { value: "Utah", label: "Utah" },
  { value: "Vermont", label: "Vermont" },
  { value: "Virginia", label: "Virginia" },
  { value: "Washington", label: "Washington" },
  { value: "West Virginia", label: "West Virginia" },
  { value: "Wisconsin", label: "Wisconsin" },
  { value: "Wyoming", label: "Wyoming" },
];

export type NewSaleQuoteDetails = {
  carrier: string;
  product: string;
  coverage: string;
  monthlyPremium: string;
  draftDate: string;
  notes: string;
  state: string;
};

type NewSaleWorkflowProps = {
  leadId: string | null;
  dealId: number | null;
  policyNumber: string | null;
  callCenter: string | null;
  retentionAgent: string;
  retentionAgentId: string;
  verificationSessionId: string | null;
  customerName: string | null;
  submissionId: string | null;
  /** Present on call-back deal new sale: drives retention handoff submission + synthetic policy number server-side. */
  callBackDealId?: string | null;
  /** Verification items from the parent page (already loaded). */
  verificationItems?: Array<Record<string, unknown>>;
  /** Input values from the verification panel (already loaded). */
  verificationInputValues?: Record<string, string>;
  onCancel: () => void;
  onAfterSubmit?: (quote: NewSaleQuoteDetails) => Promise<void> | void;
};

export function NewSaleWorkflow({
  leadId,
  dealId,
  policyNumber,
  callCenter,
  retentionAgent,
  retentionAgentId,
  verificationSessionId,
  customerName,
  submissionId,
  callBackDealId,
  verificationItems,
  verificationInputValues,
  onCancel,
  onAfterSubmit,
}: NewSaleWorkflowProps) {
  const { toast } = useToast();

  const [quoteCarrier, setQuoteCarrier] = React.useState("");
  const [quoteProduct, setQuoteProduct] = React.useState("");
  const [quoteCoverage, setQuoteCoverage] = React.useState("");
  const [quotePremium, setQuotePremium] = React.useState("");
  const [quoteNotes, setQuoteNotes] = React.useState("");
  const [draftDate, setDraftDate] = React.useState("");
  const [quoteState, setQuoteState] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [carriers, setCarriers] = React.useState<Array<{ id: number; name: string }>>([]);
  const [carriersError, setCarriersError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loadCarriers = async () => {
      try {
        const { data, error } = await supabase.from("carriers").select("id, name").order("name");
        if (error) throw error;
        if (data && data.length > 0) {
          setCarriers(data);
        } else {
          // Fallback to hardcoded list if table is empty
          setCarriers([
            { id: 12, name: "AMAM" },
            { id: 13, name: "American Home Life" },
            { id: 14, name: "Aetna" },
            { id: 15, name: "Aflac" },
            { id: 18, name: "MOH" },
            { id: 26, name: "Sentinel Security Life" },
          ]);
        }
      } catch (err) {
        console.warn("[NewSaleWorkflow] failed to load carriers, using fallback:", err);
        // Fallback to hardcoded list
        setCarriers([
          { id: 12, name: "AMAM" },
          { id: 13, name: "American Home Life" },
          { id: 14, name: "Aetna" },
          { id: 15, name: "Aflac" },
          { id: 18, name: "MOH" },
          { id: 26, name: "Sentinel Security Life" },
        ]);
      }
    };
    void loadCarriers();
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    let functionMayHaveSucceeded = false;
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.access_token) throw new Error("Not authenticated.");

      // Build leadData from verification items
      let leadData: Record<string, string> = {};

      // If verificationItems are passed as props, use those
      if (verificationItems && verificationItems.length > 0) {
        for (const item of verificationItems) {
          const fieldName = item.field_name as string;
          const itemId = item.id as string;
          const value =
            (verificationInputValues?.[itemId] ?? "").trim() ||
            (item.verified_value as string | null ?? "").trim() ||
            (item.original_value as string | null ?? "").trim();
          if (value && fieldName) {
            leadData[fieldName] = value;
          }
        }
      } else if (callBackDealId) {
        // Otherwise, fetch from database if callBackDealId is available
        const { data: dbVerificationItems } = await supabase
          .from("call_back_deal_verification_items")
          .select("field_name, verified_value, original_value")
          .eq("call_back_deal_id", callBackDealId);

        if (dbVerificationItems) {
          for (const item of dbVerificationItems) {
            const value = item.verified_value?.trim() || item.original_value?.trim() || "";
            if (value && item.field_name) {
              leadData[item.field_name] = value;
            }
          }
        }
      }

      // Call the Edge Function for new sale
      const edgeFunctionUrl = "https://agnefzuxoimnmfarqaxz.supabase.co/functions/v1/retnetion-new-sale-connector";

      const leadDataWithCustomerName = {
        ...leadData,
        customer_full_name: customerName,
      };

      let response: Response | null = null;
      try {
        response = await fetch(edgeFunctionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            retentionAgent,
            retentionAgentId,
            quote: {
              carrier: quoteCarrier,
              product: quoteProduct,
              coverage: quoteCoverage,
              monthlyPremium: quotePremium,
              draftDate,
              notes: quoteNotes,
            },
            leadData: leadDataWithCustomerName,
          }),
        });
      } catch (fetchError) {
        // Network-level error (Failed to fetch) - function may have succeeded
        console.warn("[NewSaleWorkflow] Network error, function may have completed:", fetchError);
        functionMayHaveSucceeded = true;
      }

      // If we got a response, check if it succeeded
      if (response) {
        const result = (await response.json().catch(() => null)) as
          | { ok: true; leadId?: string; submissionId?: string }
          | { ok: false; error: string }
          | null;

        if (!response.ok) {
          throw new Error(`Submit failed (${response.status})`);
        }

        if (!result || ("ok" in result && result.ok === false)) {
          throw new Error(result && "error" in result ? result.error : "Unknown error");
        }
      }

      // Call notify-eligible-agents if we have carrier and state
      if (quoteCarrier && quoteState) {
        try {
          const notifyUrl = "https://gqhcjqxcvhgwsqfqgekh.supabase.co/functions/v1/notify-eligible-agents";
          await fetch(notifyUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              carrier: quoteCarrier,
              state: quoteState,
              lead_vendor: "Retention BPO",
            }),
          });
        } catch (notifyError) {
          console.warn("[NewSaleWorkflow] notify-eligible-agents error:", notifyError);
          // Don't fail the whole submission if notify fails
        }
      }

      toast({
        title: "Submitted",
        description: "The licensed agent handoff has been sent.",
        variant: "success",
      });
      onCancel();
    } catch (error) {
      console.error("[NewSaleWorkflow] submit error:", error);
      const message = error instanceof Error ? error.message : "Failed to submit handoff.";
      toast({
        title: "Submit failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      <div className="text-sm font-medium text-muted-foreground">Quote Details (Optional)</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Carrier</Label>
          <Select value={quoteCarrier} onValueChange={setQuoteCarrier}>
            <SelectTrigger>
              <SelectValue placeholder="Select Carrier" />
            </SelectTrigger>
            <SelectContent>
              {carriers.map((c) => (
                <SelectItem key={c.id} value={c.name}>
                  {c.name}
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
          <Label>State</Label>
          <Select value={quoteState} onValueChange={setQuoteState}>
            <SelectTrigger>
              <SelectValue placeholder="Select State" />
            </SelectTrigger>
            <SelectContent>
              {US_STATES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
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
        <Label>Draft Date</Label>
        <Input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} className="min-h-[90px]" />
      </div>

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button onClick={() => void handleSubmit()} className="flex-1" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit"}
        </Button>
      </div>
    </div>
  );
}