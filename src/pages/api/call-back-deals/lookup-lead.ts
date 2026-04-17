import type { NextApiRequest, NextApiResponse } from "next";

import { getSupabaseAdmin } from "@/lib/supabase";

type LeadRow = Record<string, unknown> & {
  id: string;
  submission_id: string | null;
  customer_full_name: string | null;
  social_security: string | null;
  created_at: string | null;
};

type LookupResponse =
  | {
      ok: true;
      callBackDeal: Record<string, unknown>;
      lead: Record<string, unknown> | null;
      matchedBy: "submission_id" | "name" | "ssn" | "none";
      ssn: string | null;
    }
  | {
      ok: false;
      error: string;
    };

function getBearerToken(req: NextApiRequest) {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] ?? null;
}

function normalizeName(value: string | null | undefined) {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickLatest<T extends { created_at: string | null }>(rows: T[]): T | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => {
    const aTime = a.created_at ? Date.parse(a.created_at) : 0;
    const bTime = b.created_at ? Date.parse(b.created_at) : 0;
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  })[0] ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<LookupResponse>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Missing Authorization Bearer token" });
  }

  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) {
    return res.status(400).json({ ok: false, error: "id query param is required" });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    // 1. Load the call_back_deals row.
    const { data: cbd, error: cbdErr } = await supabaseAdmin
      .from("call_back_deals")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (cbdErr) {
      console.error("[call-back-deals/lookup-lead] lookup error", cbdErr);
      return res.status(500).json({ ok: false, error: cbdErr.message });
    }
    if (!cbd) {
      return res.status(404).json({ ok: false, error: "call_back_deals row not found" });
    }

    const { data: viewerProfile, error: viewerProfileErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (viewerProfileErr || !viewerProfile?.id) {
      return res.status(403).json({ ok: false, error: "Profile not found" });
    }

    const viewerProfileId = String(viewerProfile.id).trim().toLowerCase();

    const { data: managerRow } = await supabaseAdmin
      .from("retention_managers")
      .select("id")
      .eq("profile_id", viewerProfile.id)
      .eq("active", true)
      .maybeSingle();

    const isManager = Boolean(managerRow);

    if (!isManager) {
      const assigneeRaw =
        typeof cbd.assigned_to_profile_id === "string" ? cbd.assigned_to_profile_id.trim().toLowerCase() : "";
      if (!assigneeRaw || assigneeRaw !== viewerProfileId) {
        return res.status(403).json({ ok: false, error: "You do not have access to this call back deal" });
      }
      if (cbd.is_active === false) {
        return res.status(403).json({ ok: false, error: "This call back deal is no longer active" });
      }
    }

    const submissionId = typeof cbd.submission_id === "string" ? cbd.submission_id.trim() : "";
    const fullName = typeof cbd.name === "string" ? cbd.name.trim() : "";

    let matchedBy: "submission_id" | "name" | "ssn" | "none" = "none";
    let nameMatch: LeadRow | null = null;

    // 2. Try to find the originating retention-portal lead by submission_id first
    //    (strongest signal, guarantees we land on the same customer).
    if (submissionId) {
      const { data, error } = await supabaseAdmin
        .from("leads")
        .select("*")
        .eq("submission_id", submissionId)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn("[call-back-deals/lookup-lead] submission_id lookup failed:", error.message);
      } else if (data) {
        nameMatch = data as unknown as LeadRow;
        matchedBy = "submission_id";
      }
    }

    // 3. Fallback to name search on the retention portal leads table.
    //    Pulls up to 50 potential matches and picks the latest whose normalized
    //    name equals the callback-deal name (otherwise falls back to latest overall).
    if (!nameMatch && fullName) {
      const escaped = fullName.replace(/,/g, "");
      const { data, error } = await supabaseAdmin
        .from("leads")
        .select("*")
        .ilike("customer_full_name", `%${escaped}%`)
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(50);

      if (error) {
        console.warn("[call-back-deals/lookup-lead] name lookup failed:", error.message);
      } else {
        const rows = (data ?? []) as unknown as LeadRow[];
        const wantedNorm = normalizeName(fullName);
        const exactMatches = rows.filter(
          (r) => normalizeName(r.customer_full_name ?? "") === wantedNorm,
        );
        nameMatch = pickLatest(exactMatches) ?? pickLatest(rows);
        if (nameMatch) matchedBy = "name";
      }
    }

    // 4. If we found an SSN, re-query the retention portal leads table by SSN
    //    and pick the most recent record. This is the value that drives the
    //    verification panel.
    const ssn =
      nameMatch && typeof nameMatch.social_security === "string" && nameMatch.social_security.trim().length > 0
        ? nameMatch.social_security.trim()
        : null;

    let latestLead: LeadRow | null = nameMatch;
    if (ssn) {
      const { data: ssnRows, error: ssnErr } = await supabaseAdmin
        .from("leads")
        .select("*")
        .eq("social_security", ssn)
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(50);

      if (ssnErr) {
        console.warn("[call-back-deals/lookup-lead] SSN lookup failed:", ssnErr.message);
      } else {
        const rows = (ssnRows ?? []) as unknown as LeadRow[];
        const latest = pickLatest(rows);
        if (latest) {
          latestLead = latest;
          matchedBy = "ssn";
        }
      }
    }

    return res.status(200).json({
      ok: true,
      callBackDeal: cbd as Record<string, unknown>,
      lead: latestLead as Record<string, unknown> | null,
      matchedBy,
      ssn,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Lookup failed";
    console.error("[call-back-deals/lookup-lead] fatal", error);
    return res.status(500).json({ ok: false, error: msg });
  }
}
