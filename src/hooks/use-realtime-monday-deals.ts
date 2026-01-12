import * as React from "react";

import type { MondayComDeal } from "@/types";
import { supabase } from "@/lib/supabase";

export function useRealtimeMondayDeals(page: number, pageSize: number) {
  const [data, setData] = React.useState<MondayComDeal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [hasMore, setHasMore] = React.useState(false);

  const refresh = React.useCallback(
    async (overridePage?: number, overridePageSize?: number) => {
      const currentPage = overridePage ?? page;
      const currentPageSize = overridePageSize ?? pageSize;

      const from = (currentPage - 1) * currentPageSize;
      const to = from + currentPageSize - 1;

      setLoading(true);
      try {
        const { data: rows, error, count } = await supabase
          .from("monday_com_deals")
          .select("*", { count: "exact" })
          .eq("is_active", true)
          .order("last_updated", { ascending: false, nullsFirst: false })
          .range(from, to);

        if (!error && rows) {
          setData(rows as MondayComDeal[]);
          if (typeof count === "number") {
            setHasMore(to + 1 < count);
          } else {
            setHasMore(rows.length === currentPageSize);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize]
  );

  // Initial & page-dependent fetch
  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      await refresh();
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Realtime subscription
  React.useEffect(() => {
    const channel = supabase
      .channel("monday_com_deals_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "monday_com_deals",
        },
        () => {
          console.log("[realtime] monday_com_deals change received");
          void refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { data, loading, refresh, hasMore };
}
