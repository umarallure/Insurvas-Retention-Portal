"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  getRetentionAgentPerformance,
  type RetentionAgentPerformance
} from "@/lib/dashboard-stats-extended";
import { supabase } from "@/lib/supabase";
import type { Period } from "@/types";
import type { DateRange } from "react-day-picker";
import { Users, Activity, TrendingUp, CheckCircle2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function RetentionOperationsTab({ period, range }: { period: Period; range: DateRange }) {
  const [agentPerf, setAgentPerf] = React.useState<RetentionAgentPerformance[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const agents = await getRetentionAgentPerformance(range);
      setAgentPerf(agents);
    } catch (error) {
      console.error("[RetentionOperationsTab] Error loading data:", error);
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
      .channel("retention-operations-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_deal_flow",
          filter: "is_retention_call=eq.true",
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
        <div className="text-sm text-muted-foreground">Loading retention operations data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Retention Agent Performance Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Retention Agent Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentPerf.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="agent" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="totalSubmissions" fill="#3B82F6" name="Total Submissions" />
                <Bar dataKey="todaySubmissions" fill="#10B981" name="Today" />
                <Bar dataKey="averagePremium" fill="#F59E0B" name="Avg Premium" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Agent Performance Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {agentPerf.map((agent) => (
          <Card key={agent.agent}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>{agent.agent}</span>
                <Badge variant="outline">{agent.totalSubmissions} total</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Today</div>
                  <div className="font-semibold text-lg">{agent.todaySubmissions}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Avg Premium</div>
                  <div className="font-semibold">{formatCurrency(agent.averagePremium)}</div>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-sm mb-1">Success Rate</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${agent.fixSuccessRate}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold">{agent.fixSuccessRate.toFixed(1)}%</span>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-sm mb-2">Status Breakdown</div>
                <div className="space-y-1">
                  {Object.entries(agent.statusBreakdown)
                    .slice(0, 3)
                    .map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between text-xs">
                        <span className="truncate flex-1">{status}</span>
                        <Badge variant="secondary" className="ml-2">
                          {count}
                        </Badge>
                      </div>
                    ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {agentPerf.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <div className="text-sm text-muted-foreground">No retention agent data available</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


