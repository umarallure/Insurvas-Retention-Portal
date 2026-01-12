import * as React from "react";
import { subDays } from "date-fns";
import type { DateRange } from "react-day-picker";

import { HomeDateRangePicker } from "@/components/home/home-date-range-picker";
import { HomePeriodSelect } from "@/components/home/home-period-select";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { AgentDashboard } from "@/components/agent/agent-dashboard";
import { useAccess } from "@/components/access-context";
import type { Period } from "@/types";

export default function Home() {
  const { access } = useAccess();
  const [range, setRange] = React.useState<DateRange>({
    from: subDays(new Date(), 14),
    to: new Date(),
  });

  const [period, setPeriod] = React.useState<Period>("daily");

  // Show loading state while checking access
  if (access.loading) {
    return (
      <div className="w-full px-6 py-6 min-h-screen bg-muted/20 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  // Show agent dashboard for agents
  if (access.isAgent && !access.isManager) {
    return (
      <div className="w-full px-6 py-6 min-h-screen bg-muted/20">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">Agent Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Your performance metrics and activity overview
          </p>
        </div>
        <AgentDashboard range={range} />
      </div>
    );
  }

  // Show manager dashboard for managers
  return (
    <div className="w-full px-6 py-6 min-h-screen bg-muted/20">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <HomeDateRangePicker value={range} onChange={setRange} />
          <HomePeriodSelect value={period} onChange={setPeriod} range={range} />
        </div>
        <div className="text-sm text-muted-foreground">
          Data updates in real-time
        </div>
      </div>

      <DashboardTabs period={period} range={range} />
    </div>
  );
}
