import { supabase } from "./supabase";

export type GhlStageOption = {
  stage: string;
  count: number;
};

/**
 * Fetch a list of GHL stages with approximate counts.
 * Avoids using unsupported `group()` and uses safe per-value counts.
 */
export async function getGhlStages(): Promise<GhlStageOption[]> {
  try {
    // Fetch distinct stage values (sample up to 1000 rows)
    const { data: rows, error: rowsError } = await supabase
      .from("monday_com_deals")
      .select("ghl_stage", { count: "exact" })
      .not("ghl_stage", "is", null)
      .limit(1000);

    if (rowsError) throw rowsError;

    const s = new Set<string>();
    for (const r of (rows ?? []) as Array<{ ghl_stage?: string | null }>) {
      if (r.ghl_stage) s.add(r.ghl_stage);
    }

    const stages = Array.from(s);

    // For each stage, fetch a count (exact) using a per-stage query.
    const out: GhlStageOption[] = [];
    for (const stage of stages) {
      const { count, error } = await supabase
        .from("monday_com_deals")
        .select("id", { count: "exact" })
        .eq("ghl_stage", stage)
        .limit(1);

      if (error) {
        // If a per-stage count fails, skip it
        console.error("[getGhlStages] count error for stage", stage, error);
        continue;
      }

      out.push({ stage, count: count ?? 0 });
    }

    // Sort descending by count
    out.sort((a, b) => b.count - a.count);
    return out;
  } catch (e) {
    console.error("[getGhlStages] error", e);
    return [];
  }
}
