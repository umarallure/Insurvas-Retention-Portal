"use client";

import * as React from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Period } from "@/types";
import { getChartData } from "@/lib/dashboard-stats";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type RecordPoint = {
  date: Date;
  amount: number;
};

const formatMoney = new Intl.NumberFormat("en", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
}).format;

export function HomeChart({ period, range }: { period: Period; range: DateRange }) {
  const [data, setData] = React.useState<RecordPoint[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    const fetchChartData = async () => {
      setLoading(true);
      try {
        const chartData = await getChartData(period, range);
        if (cancelled) return;
        setData(chartData);
      } catch (error) {
        console.error("[HomeChart] Error fetching chart data:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (range.from && range.to) {
      void fetchChartData();
    } else {
      setData([]);
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [period, range]);

  const total = data.reduce((sum, point) => sum + point.amount, 0);

  const labelForDate = (d: Date) => {
    if (period === "monthly") return format(d, "MMM yyy");
    return format(d, "d MMM");
  };

  if (loading) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Deal Value Chart</div>
            <div className="mt-1 text-sm text-muted-foreground">Loading chart data...</div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Deal Value Chart</div>
            <div className="mt-1 text-sm text-muted-foreground">No data available for selected period</div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Total Deal Value</div>
          <div className="mt-1 text-3xl font-semibold text-foreground">{formatMoney(total)}</div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(_, index) => {
                  if (index === 0 || index === data.length - 1) return "";
                  const point = data[index];
                  if (!point) return "";
                  return labelForDate(point.date);
                }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis hide />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]?.payload as RecordPoint | undefined;
                  if (!p) return null;
                  return (
                    <div className="rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-sm">
                      {labelForDate(p.date)}: {formatMoney(p.amount)}
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="var(--primary)"
                fill="var(--primary)"
                fillOpacity={0.1}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
