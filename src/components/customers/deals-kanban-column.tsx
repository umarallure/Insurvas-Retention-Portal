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
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col min-h-0 h-full">
      <div className="px-4 py-3 bg-muted/10 border-b" style={{ borderLeft: `4px solid ${color}` }}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-bold" style={{ color }}>
            {title.toUpperCase()}
          </div>
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5 rounded-full">
            {typeof count === "number" ? count : "—"}
          </Badge>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No records.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((deal) => (
              <DealsKanbanCard key={deal.id} deal={deal} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t bg-card px-3 py-2">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>
            Page <span className="font-medium">{page}</span>
            {totalPages ? (
              <>
                {" "}
                of <span className="font-medium">{totalPages}</span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={!canPrev} onClick={onPrev}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={!canNext} onClick={onNext}>
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
