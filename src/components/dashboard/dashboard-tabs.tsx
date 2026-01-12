"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Activity,
  PieChart,
  Building2,
  Target
} from "lucide-react";
import { ExecutiveSummaryTab } from "./tabs/executive-summary-tab";
import { DealPerformanceTab } from "./tabs/deal-performance-tab";
import { RetentionOperationsTab } from "./tabs/retention-operations-tab";
import { FinancialDashboardTab } from "./tabs/financial-dashboard-tab";
import type { Period } from "@/types";
import type { DateRange } from "react-day-picker";

export function DashboardTabs({ 
  period, 
  range 
}: { 
  period: Period; 
  range: DateRange;
}) {
  const [activeTab, setActiveTab] = React.useState("executive");

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-4 lg:grid-cols-4 h-12 mb-6 bg-muted/50 p-1 rounded-lg border shadow-sm">
        <TabsTrigger 
          value="executive" 
          className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-primary transition-all duration-200 hover:bg-background/50"
        >
          <BarChart3 className="h-4 w-4" />
          <span className="hidden sm:inline">Executive</span>
        </TabsTrigger>
        <TabsTrigger 
          value="deals" 
          className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-primary transition-all duration-200 hover:bg-background/50"
        >
          <TrendingUp className="h-4 w-4" />
          <span className="hidden sm:inline">Deal Performance</span>
        </TabsTrigger>
        <TabsTrigger 
          value="retention" 
          className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-primary transition-all duration-200 hover:bg-background/50"
        >
          <Users className="h-4 w-4" />
          <span className="hidden sm:inline">Retention</span>
        </TabsTrigger>
        <TabsTrigger 
          value="financial" 
          className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-primary transition-all duration-200 hover:bg-background/50"
        >
          <DollarSign className="h-4 w-4" />
          <span className="hidden sm:inline">Financial</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="executive" className="mt-0 space-y-6 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
        <ExecutiveSummaryTab period={period} range={range} />
      </TabsContent>

      <TabsContent value="deals" className="mt-0 space-y-6 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
        <DealPerformanceTab period={period} range={range} />
      </TabsContent>

      <TabsContent value="retention" className="mt-0 space-y-6 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
        <RetentionOperationsTab period={period} range={range} />
      </TabsContent>

      <TabsContent value="financial" className="mt-0 space-y-6 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
        <FinancialDashboardTab period={period} range={range} />
      </TabsContent>
    </Tabs>
  );
}

