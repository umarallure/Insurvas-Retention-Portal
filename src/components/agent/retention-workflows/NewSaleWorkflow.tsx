"use client";

import * as React from "react";
import { useRouter } from "next/router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { carrierOptions, productTypeOptions } from "./types";

type NewSaleWorkflowProps = {
  leadId: string | null;
  dealId: number | null;
  policyNumber: string | null;
  callCenter: string | null;
  retentionAgent: string;
  onCancel: () => void;
};

export function NewSaleWorkflow({
  leadId,
  dealId,
  policyNumber,
  callCenter,
  retentionAgent,
  onCancel,
}: NewSaleWorkflowProps) {
  const router = useRouter();

  const [quoteCarrier, setQuoteCarrier] = React.useState("");
  const [quoteProduct, setQuoteProduct] = React.useState("");
  const [quoteCoverage, setQuoteCoverage] = React.useState("");
  const [quotePremium, setQuotePremium] = React.useState("");
  const [quoteNotes, setQuoteNotes] = React.useState("");
  const [draftDate, setDraftDate] = React.useState("");

  const handleGoToCallUpdate = async () => {
    if (!leadId || !policyNumber) return;

    await router.push(
      `/agent/call-update?leadId=${encodeURIComponent(leadId)}&policyNumber=${encodeURIComponent(
        policyNumber,
      )}&dealId=${encodeURIComponent(String(dealId ?? ""))}&callCenter=${encodeURIComponent(
        callCenter ?? "",
      )}&retentionAgent=${encodeURIComponent(retentionAgent)}&retentionType=new_sale&draftDate=${encodeURIComponent(draftDate)}`,
    );
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
        <Button onClick={() => void handleGoToCallUpdate()} className="flex-1">
          Go to Call Update
        </Button>
      </div>
    </div>
  );
}
