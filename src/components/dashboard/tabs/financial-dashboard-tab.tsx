"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getFinancialMetrics, type FinancialMetrics } from "@/lib/dashboard-stats-extended";
import { supabase } from "@/lib/supabase";
import type { Period } from "@/types";
import type { DateRange } from "react-day-picker";
import { DollarSign, TrendingUp, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

const COLORS = ["#10B981", "#F59E0B", "#EF4444"];

export function FinancialDashboardTab({ period, range }: { period: Period; range: DateRange }) {
  const [metrics, setMetrics] = React.useState<FinancialMetrics | null>(null);
  const [loading, setLoading] = React.useState(true);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFinancialMetrics(range);
      setMetrics(data);
    } catch (error) {
      console.error("[FinancialDashboardTab] Error loading data:", error);
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
      .channel("financial-dashboard-updates")
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
        <div className="text-sm text-muted-foreground">Loading financial data...</div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="text-sm text-muted-foreground">No financial data available</div>
        </CardContent>
      </Card>
    );
  }

  const paymentData = [
    { name: "Paid", value: metrics.paymentStatus.paid, color: COLORS[0] },
    { name: "Not Paid", value: metrics.paymentStatus.notPaid, color: COLORS[1] },
    { name: "Chargeback", value: metrics.paymentStatus.chargeback, color: COLORS[2] },
  ];

  const commissionData = [
    { name: "Advance", value: metrics.commissionStatus.advance, color: "#3B82F6" },
    { name: "As-Earned", value: metrics.commissionStatus.asEarned, color: "#8B5CF6" },
    { name: "Unknown", value: metrics.commissionStatus.unknown, color: "#94A3B8" },
  ];

  return (
    <div className="space-y-6">
      {/* Key Financial Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <div className="text-2xl font-bold">{formatCurrency(metrics.totalRevenue)}</div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Avg: {formatCurrency(metrics.averageDealValue)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">CC Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <div className="text-2xl font-bold">{formatCurrency(metrics.totalCCValue)}</div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Avg: {formatCurrency(metrics.averageCCValue)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Collection Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div className="text-2xl font-bold">{metrics.collectionRate.toFixed(1)}%</div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {metrics.paymentStatus.paid} paid
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Chargeback Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div className="text-2xl font-bold">{metrics.chargebackRate.toFixed(1)}%</div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {metrics.paymentStatus.chargeback} chargebacks
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Payment Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Payment Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(props) => {
                      const percent = props.percent ?? 0;
                      return `${props.name}: ${(percent * 100).toFixed(1)}%`;
                    }}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {paymentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
              {paymentData.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span>{item.name}</span>
                  </div>
                  <span className="font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Commission Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Commission Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={commissionData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(props) => {
                      const percent = props.percent ?? 0;
                      return `${props.name}: ${(percent * 100).toFixed(1)}%`;
                    }}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {commissionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
              {commissionData.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span>{item.name}</span>
                  </div>
                  <span className="font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Financial Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Financial Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground mb-2">Total Combined Value</div>
              <div className="text-2xl font-bold">
                {formatCurrency(metrics.totalRevenue + metrics.totalCCValue)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Revenue + CC Value
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground mb-2">Outstanding Payments</div>
              <div className="text-2xl font-bold text-amber-600">
                {formatCurrency((metrics.totalRevenue + metrics.totalCCValue) * (metrics.paymentStatus.notPaid / (metrics.paymentStatus.paid + metrics.paymentStatus.notPaid + metrics.paymentStatus.chargeback)))}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {metrics.paymentStatus.notPaid} deals not paid
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground mb-2">Chargeback Amount</div>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency((metrics.totalRevenue + metrics.totalCCValue) * (metrics.chargebackRate / 100))}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {metrics.paymentStatus.chargeback} chargebacks
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}



