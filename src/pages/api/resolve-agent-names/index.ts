import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdmin } from "@/lib/supabase";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const idsParam = typeof req.query.ids === "string" ? req.query.ids.trim() : "";
  if (!idsParam) {
    return res.status(400).json({ error: "ids parameter is required" });
  }

  const ids = idsParam.split(",").map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) {
    return res.status(400).json({ error: "ids parameter is empty" });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .in("id", ids);

    if (error) {
      console.error("[resolve-agent-names] query error", error);
      return res.status(500).json({ error: "Failed to resolve agent names" });
    }

    const names: Record<string, string> = {};
    for (const row of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
      names[row.id] = row.display_name ?? "Unknown";
    }

    return res.status(200).json({ names });
  } catch (error) {
    console.error("[resolve-agent-names] unexpected error", error);
    return res.status(500).json({ error: "Failed to resolve agent names" });
  }
}