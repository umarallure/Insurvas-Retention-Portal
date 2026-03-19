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

type NewSaleWorkflowProps = {
  leadId: string | null;
  dealId: number | null;
  policyNumber: string | null;
  callCenter: string | null;
  retentionAgent: string;
  verificationSessionId: string | null;
  customerName: string | null;
  onCancel: () => void;
};

export function NewSaleWorkflow({
  leadId,
  dealId,
  policyNumber,
  callCenter,
  retentionAgent,
  verificationSessionId,
  customerName,
  onCancel,
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
    if (!leadId || !policyNumber) {
      toast({
        title: "Missing lead data",
        description: "Lead and policy are required before submitting this handoff.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.access_token) throw new Error("Not authenticated.");

      const response = await fetch("/api/retention-call-notification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          type: "buffer_connected",
          leadId,
          dealId,
          policyNumber,
          callCenter,
          retentionAgent,
          verificationSessionId,
          customerName,
          retentionType: "new_sale",
          retentionNotes: quoteNotes,
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
