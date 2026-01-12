"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DealsKanbanCard, type DealsKanbanRow } from "@/components/customers/deals-kanban-card";

export function DealsKanbanColumn({
  title,
  color,
  count,
  loading,
  rows,
  page,
  pageSize,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  title: string;
  color: string;
  count: number | null;
  loading: boolean;
  rows: DealsKanbanRow[];
  page: number;
  pageSize: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const totalPages = React.useMemo(() => {
    if (typeof count !== "number" || !Number.isFinite(count)) return null;
    if (!pageSize || pageSize <= 0) return null;
    return Math.max(1, Math.ceil(count / pageSize));
  }, [count, pageSize]);

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden flex flex-col min-h-0 h-full">
      <div className="bg-muted/10 border-b" style={{ borderLeft: `4px solid ${color}` }}>
        <div className="px-4 py-3 border-b border-border/50">
          <div className="flex items-center justify-between gap-2">
            <div className="text-lg font-bold tracking-wide" style={{ color }}>
            {title.toUpperCase()}
          </div>
            <Badge variant="secondary" className="text-sm h-8 px-4 rounded-full font-bold">
            {typeof count === "number" ? count.toLocaleString() : "—"}
          </Badge>
        </div>
      </div>

        <div className="px-4 py-2.5 bg-card border-b border-border/50 shrink-0">
          <div className="flex items-center justify-between gap-2 text-base text-muted-foreground">
            <div className="font-semibold">
              Page {page}
              {totalPages ? ` of ${totalPages}` : ""}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!canPrev} onClick={onPrev} className="h-9 px-4 text-base font-medium">
                Prev
              </Button>
              <Button variant="outline" size="sm" disabled={!canNext} onClick={onNext} className="h-9 px-4 text-base font-medium">
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {loading ? (
          <div className="text-lg text-muted-foreground text-center py-12 font-medium">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-lg text-muted-foreground text-center py-12 font-medium">No records.</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            {rows.map((deal) => (
              <DealsKanbanCard key={deal.id} deal={deal} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
