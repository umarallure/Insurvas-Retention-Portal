"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  getCarrierPerformance, 
  getAgentPerformance, 
  getCallCenterPerformance,
  getStatusBreakdown,
  type CarrierPerformance,
  type AgentPerformance,
  type CallCenterPerformance,
  type StatusBreakdown
} from "@/lib/dashboard-stats-extended";
import { supabase } from "@/lib/supabase";
import type { Period } from "@/types";
import type { DateRange } from "react-day-picker";
import { Building2, Users, Phone, TrendingUp, AlertCircle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function DealPerformanceTab({ period, range }: { period: Period; range: DateRange }) {
  const [carrierPerf, setCarrierPerf] = React.useState<CarrierPerformance[]>([]);
  const [agentPerf, setAgentPerf] = React.useState<AgentPerformance[]>([]);
  const [centerPerf, setCenterPerf] = React.useState<CallCenterPerformance[]>([]);
  const [statusBreakdown, setStatusBreakdown] = React.useState<StatusBreakdown[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [carriers, agents, centers, statuses] = await Promise.all([
        getCarrierPerformance(range),
        getAgentPerformance(range),
        getCallCenterPerformance(range),
        getStatusBreakdown(range),
      ]);
      setCarrierPerf(carriers);
      setAgentPerf(agents);
      setCenterPerf(centers);
      setStatusBreakdown(statuses);
    } catch (error) {
      console.error("[DealPerformanceTab] Error loading data:", error);
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
      .channel("deal-performance-updates")
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

  const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-muted-foreground">Loading performance data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Deal Status Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusBreakdown.slice(0, 6)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ status, percentage }) => `${status}: ${percentage.toFixed(1)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {statusBreakdown.slice(0, 6).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2">
            {statusBreakdown.slice(0, 6).map((status, idx) => (
              <div key={status.status} className="flex items-center gap-2 text-sm">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                />
                <span className="text-muted-foreground">{status.status}:</span>
                <span className="font-semibold">{status.count}</span>
                <span className="text-muted-foreground">({status.percentage.toFixed(1)}%)</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Carrier Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Carrier Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={carrierPerf.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="carrier" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="totalValue" fill="#3B82F6" name="Total Value" />
                  <Bar dataKey="totalDeals" fill="#10B981" name="Total Deals" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
              {carrierPerf.slice(0, 5).map((carrier) => (
                <div key={carrier.carrier} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{carrier.carrier}</Badge>
                    <span className="text-muted-foreground">{carrier.totalDeals} deals</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrency(carrier.totalValue)}</div>
                    <div className="text-xs text-muted-foreground">
                      {carrier.conversionRate.toFixed(1)}% conversion
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Agent Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Sales Agent Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agentPerf.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="agent" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="totalValue" fill="#8B5CF6" name="Total Value" />
                  <Bar dataKey="totalDeals" fill="#EC4899" name="Total Deals" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
              {agentPerf.slice(0, 5).map((agent) => (
                <div key={agent.agent} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{agent.agent}</Badge>
                    <span className="text-muted-foreground">{agent.totalDeals} deals</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrency(agent.totalValue)}</div>
                    <div className="text-xs text-muted-foreground">
                      {agent.conversionRate.toFixed(1)}% conversion
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Call Center Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Call Center Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {centerPerf.slice(0, 6).map((center) => (
              <div key={center.center} className="rounded-lg border p-4">
                <div className="font-semibold mb-2">{center.center}</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Deals:</span>
                    <span className="font-medium">{center.totalDeals}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Value:</span>
                    <span className="font-medium">{formatCurrency(center.totalValue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg Value:</span>
                    <span className="font-medium">{formatCurrency(center.averageValue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Conversion:</span>
                    <Badge variant={center.conversionRate > 30 ? "default" : "secondary"}>
                      {center.conversionRate.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


