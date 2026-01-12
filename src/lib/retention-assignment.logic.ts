import { supabase } from "./supabase";

export type GhlStageOption = {
  stage: string;
  count: number;
};

/**
 * Fetch a list of GHL stages with approximate counts.
 * Avoids using unsupported `group()` and uses safe per-value counts.
 * @param carrierFilter Optional array of carrier names to filter by
 */
export async function getGhlStages(carrierFilter?: string[]): Promise<GhlStageOption[]> {
  try {
    const stageSet = new Set<string>();
    const PAGE_SIZE = 1000;
    let offset = 0;
    let pagesWithoutNew = 0;

    while (true) {
      let query = supabase
        .from("monday_com_deals")
        .select("ghl_stage")
        .eq("is_active", true)
        .not("ghl_stage", "is", null)
        .range(offset, offset + PAGE_SIZE - 1);

      // Apply carrier filter if provided
      if (carrierFilter && carrierFilter.length > 0) {
        query = query.in("carrier", carrierFilter);
      }

      const { data: rows, error: rowsError } = await query;
      if (rowsError) throw rowsError;

      const before = stageSet.size;
      for (const r of (rows ?? []) as Array<{ ghl_stage?: string | null }>) {
        const stage = typeof r?.ghl_stage === "string" ? r.ghl_stage.trim() : "";
        if (stage.length) stageSet.add(stage);
      }
      const after = stageSet.size;

      const batch = (rows ?? []) as Array<{ ghl_stage?: string | null }>;
      if (batch.length < PAGE_SIZE) break;

      if (after === before) {
        pagesWithoutNew += 1;
      } else {
        pagesWithoutNew = 0;
      }

      // If we've scanned several pages without finding a new stage, stop.
      // (Stages are low-cardinality; this prevents scanning the entire table.)
      if (pagesWithoutNew >= 5) break;

      offset += PAGE_SIZE;
      if (offset > 200000) break;
    }

    const stages = Array.from(stageSet.values());

    // 2) Fetch exact counts per stage using `head: true` (no row payload returned).
    // Concurrency-limited to avoid flooding the network.
    const CONCURRENCY = 5;
    const out: GhlStageOption[] = [];

    for (let i = 0; i < stages.length; i += CONCURRENCY) {
      const slice = stages.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        slice.map(async (stage) => {
          let countQuery = supabase
            .from("monday_com_deals")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true)
            .eq("ghl_stage", stage);

          // Apply carrier filter if provided
          if (carrierFilter && carrierFilter.length > 0) {
            countQuery = countQuery.in("carrier", carrierFilter);
          }

          const { count, error } = await countQuery;
          if (error) throw error;
          return { stage, count: count ?? 0 } as GhlStageOption;
        }),
      );
      out.push(...results);
    }

    // Sort descending by count
    out.sort((a, b) => b.count - a.count);
    return out;
  } catch (e) {
    console.error("[getGhlStages] error", e);
    return [];
  }
}
