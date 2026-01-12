"use client";

import * as React from "react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Period } from "@/types";
import type { DateRange } from "react-day-picker";
import { getDashboardStats } from "@/lib/dashboard-stats";
import { subDays } from "date-fns";

import {
  UsersIcon,
  PieChartIcon,
  DollarSignIcon,
  ShoppingCartIcon,
} from "lucide-react";

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

type BaseStat = {
  title: string;
  icon: React.ReactNode;
  minValue: number;
  maxValue: number;
  minVariation: number;
  maxVariation: number;
  formatter?: (value: number) => string;
};

const baseStats: BaseStat[] = [
  {
    title: "Customers",
    icon: <UsersIcon className="size-4" />,
    minValue: 400,
    maxValue: 1000,
    minVariation: -15,
    maxVariation: 25,
  },
  {
    title: "Conversions",
    icon: <PieChartIcon className="size-4" />,
    minValue: 1000,
    maxValue: 2000,
    minVariation: -10,
    maxVariation: 20,
  },
  {
    title: "Revenue",
    icon: <DollarSignIcon className="size-4" />,
    minValue: 200000,
    maxValue: 500000,
    minVariation: -20,
    maxVariation: 30,
    formatter: formatCurrency,
  },
  {
    title: "Orders",
    icon: <ShoppingCartIcon className="size-4" />,
    minValue: 100,
    maxValue: 300,
    minVariation: -5,
    maxVariation: 15,
  },
];

type StatView = {
  title: string;
  icon: React.ReactNode;
  value: string | number;
  variation: number;
};

export function HomeStats({ period, range }: { period: Period; range: DateRange }) {
  const [stats, setStats] = React.useState<StatView[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      setLoading(true);
      try {
        // Calculate previous period for comparison
        const rangeDays = range.from && range.to 
          ? Math.ceil((range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24))
          : 14;
        
        const previousRange: DateRange = {
          from: range.from ? subDays(range.from, rangeDays) : subDays(new Date(), rangeDays * 2),
          to: range.from ? subDays(range.from, 1) : subDays(new Date(), rangeDays),
        };

        const dashboardStats = await getDashboardStats(range, previousRange);

        if (cancelled) return;

        const statsData: StatView[] = [
          {
            title: "New Leads",
            icon: <UsersIcon className="size-4" />,
            value: dashboardStats.newLeads.toLocaleString(),
            variation: dashboardStats.variation?.deals ?? 0,
          },
          {
            title: "Assigned Leads",
            icon: <PieChartIcon className="size-4" />,
            value: dashboardStats.assignedLeads.toLocaleString(),
            variation: 0,
          },
          {
            title: "Unassigned Leads",
            icon: <ShoppingCartIcon className="size-4" />,
            value: dashboardStats.unassignedLeads.toLocaleString(),
            variation: 0,
          },
          {
            title: "Handled Policies",
            icon: <DollarSignIcon className="size-4" />,
            value: dashboardStats.handledPolicies.toLocaleString(),
            variation: 0,
          },
          {
            title: "Fixed Policies",
            icon: <ShoppingCartIcon className="size-4" />,
            value: dashboardStats.totalFixedPolicies.toLocaleString(),
            variation: 0,
          },
        ];

        setStats(statsData);
      } catch (error) {
        console.error("[HomeStats] Error fetching stats:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchStats();
    return () => {
      cancelled = true;
    };
  }, [range]);

  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <div className="text-sm text-muted-foreground">Loading statistics...</div>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <div className="text-sm text-muted-foreground">No statistics available</div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-5 lg:gap-px">
      {stats.map((s) => (
        <Link key={s.title} href="/customers" className="group">
          <Card className="rounded-lg lg:rounded-none lg:first:rounded-l-lg lg:last:rounded-r-lg hover:z-10">
            <CardContent className="flex items-start justify-between p-4">
              <div>
                <div className="text-xs uppercase text-muted-foreground">{s.title}</div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="text-2xl font-semibold text-foreground">{s.value}</div>
                  <Badge variant="secondary" className={s.variation > 0 ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}>
                    {s.variation > 0 ? "+" : ""}
                    {s.variation}%
                  </Badge>
                </div>
              </div>

              <div className="rounded-full bg-primary/10 p-2 text-primary ring-1 ring-inset ring-primary/25">
                {s.icon}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
