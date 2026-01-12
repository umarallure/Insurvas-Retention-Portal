"use client";

import * as React from "react";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { Period } from "@/types";
import type { DateRange } from "react-day-picker";
import type { Sale, SaleStatus } from "@/types";
import { getRecentSales } from "@/lib/dashboard-stats";

const sampleEmails = [
  "james.anderson@example.com",
  "mia.white@example.com",
  "william.brown@example.com",
  "emma.davis@example.com",
  "ethan.harris@example.com",
];

function statusBadge(status: SaleStatus) {
  const className =
    status === "paid"
      ? "bg-green-500/10 text-green-700 dark:text-green-300"
      : status === "failed"
        ? "bg-red-500/10 text-red-700 dark:text-red-300"
        : "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300";

  return (
    <Badge variant="secondary" className={`capitalize ${className}`}>
      {status}
    </Badge>
  );
}

export function HomeSales({ period, range }: { period: Period; range: DateRange }) {
  const [rows, setRows] = React.useState<Sale[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    const fetchSales = async () => {
      setLoading(true);
      try {
        const recentSales = await getRecentSales(10);
        if (cancelled) return;
        setRows(recentSales);
      } catch (error) {
        console.error("[HomeSales] Error fetching sales:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchSales();
    return () => {
      cancelled = true;
    };
  }, []);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);

  if (loading) {
    return (
      <div className="mt-6 overflow-hidden rounded-lg border bg-card">
        <div className="p-8 text-center text-sm text-muted-foreground">
          Loading sales data...
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="mt-6 overflow-hidden rounded-lg border bg-card">
        <div className="p-8 text-center text-sm text-muted-foreground">
          No recent submissions found
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="w-[80px]">ID</TableHead>
            <TableHead className="w-[160px]">Date</TableHead>
            <TableHead className="w-[140px]">Status</TableHead>
            <TableHead>Policy / Client</TableHead>
            <TableHead className="text-right w-[120px]">Premium</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">#{r.id}</TableCell>
              <TableCell>
                {format(new Date(r.date), "d MMM HH:mm")}
              </TableCell>
              <TableCell>{statusBadge(r.status)}</TableCell>
              <TableCell>{r.email}</TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(r.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
