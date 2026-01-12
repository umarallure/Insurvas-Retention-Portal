"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { titleizeKey } from "@/lib/agent/assigned-lead-details.logic";

type VerificationPanelProps = {
  selectedPolicyView: {
    callCenter?: string | null;
    policyNumber?: string | null;
    clientName?: string | null;
    carrier?: string | null;
    agentName?: string | null;
  } | null;
  loading: boolean;
  error: string | null;
  verificationItems: Array<Record<string, unknown>>;
  verificationInputValues: Record<string, string>;
  onToggleVerification: (itemId: string, checked: boolean) => void;
  onUpdateValue: (itemId: string, value: string) => void;
};

export function VerificationPanel({
  selectedPolicyView,
  loading,
  error,
  verificationItems,
  verificationInputValues,
  onToggleVerification,
  onUpdateValue,
}: VerificationPanelProps) {
  return (
    <Card className="h-fit lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:flex lg:flex-col">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">Verification Panel</CardTitle>
          <div className="text-xs rounded-md bg-muted px-2 py-1 font-medium text-foreground">
            {selectedPolicyView?.callCenter ?? "—"}
          </div>
        </div>
        <CardDescription>
          {selectedPolicyView ? `Selected policy: ${selectedPolicyView.policyNumber ?? "—"}` : "Select a policy to view verification."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="text-muted-foreground">Client Name</div>
          <div className="font-semibold text-foreground text-right">{selectedPolicyView?.clientName ?? "—"}</div>

          <div className="text-muted-foreground">Carrier</div>
          <div className="font-semibold text-foreground text-right">{selectedPolicyView?.carrier ?? "—"}</div>

          <div className="text-muted-foreground">Policy Number</div>
          <div className="font-semibold text-foreground text-right">{selectedPolicyView?.policyNumber ?? "—"}</div>

          <div className="text-muted-foreground">Agent</div>
          <div className="font-semibold text-foreground text-right">{selectedPolicyView?.agentName ?? "—"}</div>
        </div>

        <Separator />

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading verification...</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : verificationItems.length === 0 ? (
          <div className="text-sm text-muted-foreground">No verification fields yet.</div>
        ) : (
          <div className="space-y-3">
            {verificationItems.map((item) => {
              const itemId = typeof item.id === "string" ? item.id : null;
              if (!itemId) return null;
              const fieldName = typeof item.field_name === "string" ? item.field_name : "";
              const checked = !!item.is_verified;
              const value = verificationInputValues[itemId] ?? "";

              return (
                <div key={itemId} className="rounded-lg border bg-card px-3 py-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-medium text-foreground truncate" title={fieldName}>
                      {titleizeKey(fieldName || "Field")}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <div className="text-[11px] text-muted-foreground">{checked ? "Verified" : "Pending"}</div>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          void onToggleVerification(itemId, Boolean(v));
                        }}
                      />
                    </div>
                  </div>

                  <Input value={value} onChange={(e) => void onUpdateValue(itemId, e.target.value)} className="text-xs" />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

