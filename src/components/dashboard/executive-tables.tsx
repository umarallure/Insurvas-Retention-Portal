"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  getRecentDealActivity, 
  getTopDeals, 
  getStatusSummary,
  type RecentDealActivity,
  type TopDeal
} from "@/lib/dashboard-stats-executive";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { TrendingUp, DollarSign, Activity, Building2, User } from "lucide-react";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function getStatusBadgeColor(status: string | null): string {
  if (!status) return "bg-gray-500/10 text-gray-700 dark:text-gray-300";
  
  const lower = status.toLowerCase();
  if (lower.includes("paid") || lower.includes("issued paid")) {
    return "bg-green-500/10 text-green-700 dark:text-green-300";
  }
  if (lower.includes("charge back") || lower.includes("chargeback") || lower.includes("failed")) {
    return "bg-red-500/10 text-red-700 dark:text-red-300";
  }
  if (lower.includes("pending") || lower.includes("not paid")) {
    return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (lower.includes("declined")) {
    return "bg-orange-500/10 text-orange-700 dark:text-orange-300";
  }
  return "bg-blue-500/10 text-blue-700 dark:text-blue-300";
}

export function ExecutiveTables({ range }: { range: DateRange }) {
  const [recentDeals, setRecentDeals] = React.useState<RecentDealActivity[]>([]);
  const [topDeals, setTopDeals] = React.useState<TopDeal[]>([]);
  const [statusSummary, setStatusSummary] = React.useState<{ status: string; count: number; totalValue: number }[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [recent, top, summary] = await Promise.all([
        getRecentDealActivity(15, range),
        getTopDeals(10, range),
        getStatusSummary(range),
      ]);
      setRecentDeals(recent);
      setTopDeals(top);
      setStatusSummary(summary);
    } catch (error) {
      console.error("[ExecutiveTables] Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, [range]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  // Real-time subscription
  React.useEffect(() => {
    const channel = supabase
      .channel("executive-tables-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "monday_com_deals",
        },
        () => {
          void loadData();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-muted-foreground">Loading executive data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statusSummary.slice(0, 4).map((stat) => (
          <Card key={stat.status}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" />
                {stat.status}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.count}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {formatCurrency(stat.totalValue)} total value
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Deal Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Deal Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Client</TableHead>
                    <TableHead className="w-[100px]">Carrier</TableHead>
                    <TableHead className="w-[100px]">Agent</TableHead>
                    <TableHead className="w-[100px] text-right">Value</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead className="w-[100px]">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentDeals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                        No recent activity
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentDeals.map((deal) => (
                      <TableRow key={deal.id} className="hover:bg-muted/50 transition-colors">
                        <TableCell className="font-medium">
                          <div className="max-w-[120px] truncate" title={deal.dealName}>
                            {deal.dealName}
                          </div>
                          {deal.policyNumber && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              #{deal.policyNumber}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {deal.carrier ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate max-w-[80px]" title={deal.salesAgent ?? undefined}>
                              {deal.salesAgent ?? "—"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="font-semibold">{formatCurrency(deal.dealValue + deal.ccValue)}</div>
                          {deal.ccValue > 0 && (
                            <div className="text-xs text-muted-foreground">
                              CC: {formatCurrency(deal.ccValue)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="secondary" 
                            className={`text-xs ${getStatusBadgeColor(deal.policyStatus ?? deal.status)}`}
                          >
                            {deal.policyStatus ?? deal.status ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(deal.lastUpdated), "MMM d, HH:mm")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Top Deals by Value */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Deals by Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Client</TableHead>
                    <TableHead className="w-[100px]">Carrier</TableHead>
                    <TableHead className="w-[100px]">Agent</TableHead>
                    <TableHead className="w-[100px] text-right">Total Value</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topDeals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                        No deals found
                      </TableCell>
                    </TableRow>
                  ) : (
                    topDeals.map((deal, idx) => (
                      <TableRow key={deal.id} className="hover:bg-muted/50 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {idx + 1}
                            </div>
                            <div>
                              <div className="font-medium max-w-[100px] truncate" title={deal.dealName}>
                                {deal.dealName}
                              </div>
                              {deal.policyNumber && (
                                <div className="text-xs text-muted-foreground">
                                  #{deal.policyNumber}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {deal.carrier ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate max-w-[80px]" title={deal.salesAgent ?? undefined}>
                              {deal.salesAgent ?? "—"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="font-bold text-primary">{formatCurrency(deal.totalValue)}</div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="secondary" 
                            className={`text-xs ${getStatusBadgeColor(deal.policyStatus)}`}
                          >
                            {deal.policyStatus ?? "—"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Status Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                  <TableHead className="text-right">Avg Value</TableHead>
                  <TableHead className="text-right">Percentage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statusSummary.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      No status data available
                    </TableCell>
                  </TableRow>
                ) : (
                  (() => {
                    const total = statusSummary.reduce((sum, s) => sum + s.count, 0);
                    return statusSummary.map((stat) => {
                      const percentage = total > 0 ? (stat.count / total) * 100 : 0;
                      const avgValue = stat.count > 0 ? stat.totalValue / stat.count : 0;
                      return (
                        <TableRow key={stat.status} className="hover:bg-muted/50 transition-colors">
                          <TableCell>
                            <Badge 
                              variant="secondary" 
                              className={`${getStatusBadgeColor(stat.status)}`}
                            >
                              {stat.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {stat.count.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(stat.totalValue)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatCurrency(avgValue)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary transition-all"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium w-12 text-right">
                                {percentage.toFixed(1)}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })()
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


