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

const newSaleCarrierOptions = [
  "AMAM",
  "Aetna",
  "Aflac",
  "American Home Life",
  "Mutual of Omaha",
  "Transamerica",
];

export type NewSaleQuoteDetails = {
  carrier: string;
  product: string;
  coverage: string;
  monthlyPremium: string;
  draftDate: string;
  notes: string;
};

type NewSaleWorkflowProps = {
  leadId: string | null;
  dealId: number | null;
  policyNumber: string | null;
  callCenter: string | null;
  retentionAgent: string;
  verificationSessionId: string | null;
  customerName: string | null;
  submissionId: string | null;
  /** Present on call-back deal new sale: drives retention handoff submission + synthetic policy number server-side. */
  callBackDealId?: string | null;
  onCancel: () => void;
  onAfterSubmit?: (quote: NewSaleQuoteDetails) => Promise<void> | void;
};

export function NewSaleWorkflow({
  leadId,
  dealId,
  policyNumber,
  callCenter,
  retentionAgent,
  verificationSessionId,
  customerName,
  submissionId,
  callBackDealId,
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
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.access_token) throw new Error("Not authenticated.");

      let effectiveLeadId = leadId;
      let effectiveSubmissionId = submissionId;

      if (callBackDealId) {
        const createResp = await fetch("/api/call-back-deals/create-new-sale-lead", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            callBackDealId,
            quote: {
              carrier: quoteCarrier,
              product: quoteProduct,
              coverage: quoteCoverage,
              monthlyPremium: quotePremium,
              draftDate,
              notes: quoteNotes,
            },
          }),
        });

        const createPayload = (await createResp.json().catch(() => null)) as
          | { ok: true; leadId: string; submissionId: string | null }
          | { ok: false; error: string }
          | null;

        if (!createResp.ok || !createPayload || !("ok" in createPayload) || createPayload.ok === false) {
          throw new Error(
            createPayload && "error" in createPayload ? createPayload.error : `Create lead failed (${createResp.status})`,
          );
        }

        effectiveLeadId = createPayload.leadId;
        effectiveSubmissionId = createPayload.submissionId ?? null;
      }

      const response = await fetch("/api/retention-call-notification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          type: "buffer_connected",
          leadId: effectiveLeadId,
          dealId,
          submissionId: effectiveSubmissionId,
          policyNumber,
          callCenter,
          retentionAgent,
          verificationSessionId,
          customerName,
          retentionType: "new_sale",
          retentionNotes: quoteNotes,
          updateCallResultUrl: `https://agents-portal-zeta.vercel.app/call-result-update?submissionId=${encodeURIComponent(
            effectiveSubmissionId ?? "",
          )}`,
          callBackDealId: callBackDealId ?? null,
          quoteDetails: {
            carrier: quoteCarrier,
            product: quoteProduct,
            coverage: quoteCoverage,
            monthlyPremium: quotePremium,
            draftDate,
          },
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error: string }
        | null;

      if (!response.ok || !payload || ("ok" in payload && payload.ok === false)) {
        throw new Error(payload && "error" in payload ? payload.error : `Submit failed (${response.status})`);
      }

      if (onAfterSubmit && !callBackDealId) {
        try {
          await onAfterSubmit({
            carrier: quoteCarrier,
            product: quoteProduct,
            coverage: quoteCoverage,
            monthlyPremium: quotePremium,
            draftDate,
            notes: quoteNotes,
          });
        } catch (afterError) {
          console.error("[NewSaleWorkflow] onAfterSubmit error", afterError);
          toast({
            title: "Saved notification, but post-submit step failed",
            description:
              afterError instanceof Error ? afterError.message : "An error occurred after submission.",
            variant: "destructive",
          });
        }
      }

      toast({
        title: "Submitted",
        description: "The licensed agent handoff has been sent.",
        variant: "success",
      });
      onCancel();
    } catch (error) {
      toast({
        title: "Submit failed",
        description: error instanceof Error ? error.message : "Failed to submit handoff.",
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
              {newSaleCarrierOptions.map((c) => (
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
          Submit
        </Button>
      </div>
    </div>
  );
}
