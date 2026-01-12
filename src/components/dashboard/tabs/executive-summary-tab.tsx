"use client";

import * as React from "react";
import { HomeStats } from "@/components/home/home-stats";
import { HomeChart } from "@/components/home/home-chart";
import { ExecutiveTables } from "@/components/dashboard/executive-tables";
import type { Period } from "@/types";
import type { DateRange } from "react-day-picker";

export function ExecutiveSummaryTab({ 
  period, 
  range 
}: { 
  period: Period; 
  range: DateRange;
}) {
  return (
    <div className="space-y-6">
      <HomeStats period={period} range={range} />
      <HomeChart period={period} range={range} />
      <ExecutiveTables range={range} />
    </div>
  );
}

