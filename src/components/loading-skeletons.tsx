"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function AssignedLeadsSkeleton() {
  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="w-full">
        <Card className="shadow-sm">
          <CardHeader>
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-96 mt-2" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-[260px]" />
              <Skeleton className="h-10 w-24" />
            </div>

            <div className="rounded-md border">
              <div className="grid gap-3 p-3 text-sm font-medium text-muted-foreground" style={{ gridTemplateColumns: "2.5fr 1fr 1fr 0.8fr" }}>
                <div>GHL Name</div>
                <div>Center</div>
                <div>Disposition</div>
                <div className="text-right">Actions</div>
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="grid gap-3 p-3 text-sm items-center border-t" style={{ gridTemplateColumns: "2.5fr 1fr 1fr 0.8fr" }}>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-8 w-16 ml-auto" />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <Skeleton className="h-4 w-32" />
              <div className="flex gap-2">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-20" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function LeadDetailsSkeleton() {
  return (
    <div className="w-full px-6 py-8 min-h-screen bg-muted/20">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-md border">
      <div className="p-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-3 border-b last:border-b-0 py-3">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton key={j} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

