"use client";

import * as React from "react";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency, formatValue, pickRowValue } from "@/lib/agent/assigned-lead-details.logic";

type DailyDealFlowTabProps = {
  loading: boolean;
  error: string | null;
  rows: Array<Record<string, unknown>>;
  expandedRows: Set<string>;
  onToggleRow: (rowId: string) => void;
};

export function DailyDealFlowTab({ loading, error, rows, expandedRows, onToggleRow }: DailyDealFlowTabProps) {
  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading daily deal flow...</div>;
  }

  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }

  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground">No daily deal flow records found.</div>;
  }

  return (
    <div className="space-y-2">
      {rows.map((row, idx) => {
        const rowId = String(row["id"] ?? idx);
        const isExpanded = expandedRows.has(rowId);
        const note = pickRowValue(row, ["notes", "note", "lead_notes"]);
        const noteText = typeof note === "string" ? note.trim() : "";
        const hasNotes = noteText.length > 0;

        return (
          <div key={rowId} className="rounded-md border bg-card">
            <div className="p-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => onToggleRow(rowId)}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {hasNotes ? (
                    isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )
                  ) : (
                    <div className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Date</div>
                      <div className="font-medium">{formatValue(row["date"])}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Lead Vendor</div>
                      <div className="font-medium">{formatValue(pickRowValue(row, ["lead_vendor"]))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Agent</div>
                      <div className="font-medium">{formatValue(pickRowValue(row, ["agent"]))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Status</div>
                      <div className="font-medium">{formatValue(pickRowValue(row, ["status"]))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Carrier</div>
                      <div className="font-medium">{formatValue(pickRowValue(row, ["carrier"]))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Product Type</div>
                      <div className="font-medium">{formatValue(pickRowValue(row, ["product_type"]))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Monthly Premium</div>
                      <div className="font-medium">{formatCurrency(pickRowValue(row, ["monthly_premium"]))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Face Amount</div>
                      <div className="font-medium">{formatCurrency(pickRowValue(row, ["face_amount"]))}</div>
                    </div>
                  </div>
                  {hasNotes && !isExpanded && (
                    <div className="mt-2 text-xs text-muted-foreground italic truncate">{noteText}</div>
                  )}
                </div>
              </div>
            </div>
            {hasNotes && isExpanded && (
              <div className="px-3 pb-3">
                <div className="ml-7 rounded-md border bg-muted/30 p-3">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">Notes</div>
                  <div className="text-sm text-foreground whitespace-pre-wrap">{noteText}</div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

