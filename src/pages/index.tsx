import * as React from "react";
import { subDays } from "date-fns";
import type { DateRange } from "react-day-picker";

import { HomeDateRangePicker } from "@/components/home/home-date-range-picker";
import { HomePeriodSelect } from "@/components/home/home-period-select";
import { HomeStats } from "@/components/home/home-stats";
import { HomeChart } from "@/components/home/home-chart";
import { HomeSales } from "@/components/home/home-sales";
import type { Period } from "@/types";

export default function Home() {
  const [range, setRange] = React.useState<DateRange>({
    from: subDays(new Date(), 14),
    to: new Date(),
  });

  const [period, setPeriod] = React.useState<Period>("daily");

  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Monitor overall performance with high-level metrics and trends.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <HomeDateRangePicker value={range} onChange={setRange} />
          <HomePeriodSelect value={period} onChange={setPeriod} range={range} />
        </div>
      </div>

      <div>
        <HomeStats period={period} range={range} />
        <HomeChart period={period} range={range} />
        <HomeSales period={period} range={range} />
      </div>
    </div>
  );
}
