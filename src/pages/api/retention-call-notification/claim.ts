import type { NextApiRequest, NextApiResponse } from "next";

import { getSupabaseAdmin } from "@/lib/supabase";

type ResponseData =
  | {
      ok: true;
      redirectUrl: string;
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

function getPortalBaseUrl(req: NextApiRequest) {
  const configured =
    process.env.RETENTION_PORTAL_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "https://retention-portal-4d87.vercel.app";

  if (configured.trim().length) return configured.replace(/\/+$/, "");

  const host = req.headers.host;
  if (!host) return "http://localhost:3000";
  const proto = host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

function getFunctionsUrl() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!supabaseUrl.trim().length) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  }

  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/retention-call-notification`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ResponseData>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Missing Authorization Bearer token" });
  }

  try {
    const submissionId = typeof req.body?.submissionId === "string" ? req.body.submissionId.trim() : "";
    const verificationSessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
    const notificationId = typeof req.body?.notificationId === "string" ? req.body.notificationId.trim() : "";
    const policyNumberFromBody = typeof req.body?.policyNumber === "string" ? req.body.policyNumber.trim() : "";
    const dealIdFromBody =
      typeof req.body?.dealId === "number" && Number.isFinite(req.body.dealId) ? req.body.dealId : null;
    const leadIdFromBody = typeof req.body?.leadId === "string" ? req.body.leadId.trim() : "";

    if (!submissionId || !verificationSessionId) {
      return res.status(400).json({ ok: false, error: "submissionId and sessionId are required." });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (profileErr) {
      return res.status(500).json({ ok: false, error: profileErr.message });
    }

    const licensedAgentId = typeof profile?.id === "string" ? profile.id : userData.user.id;
    const licensedAgentName =
      (typeof profile?.display_name === "string" ? profile.display_name.trim() : "") || "Licensed Agent";

    const { data: notificationRow, error: notificationErr } = await supabaseAdmin
      .from("retention_call_notifications")
      .select("*")
      .eq("id", notificationId)
      .maybeSingle();

    if (notificationErr) {
      return res.status(500).json({ ok: false, error: notificationErr.message });
    }

    const bufferAgentId =
      typeof notificationRow?.buffer_agent_id === "string" ? notificationRow.buffer_agent_id : null;
    const bufferAgentName =
      typeof notificationRow?.buffer_agent_name === "string" ? notificationRow.buffer_agent_name : null;
    const customerName =
      typeof notificationRow?.customer_name === "string" ? notificationRow.customer_name : null;
    const leadVendor = typeof notificationRow?.lead_vendor === "string" ? notificationRow.lead_vendor : null;

    const functionResponse = await fetch(getFunctionsUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "la_ready",
        submissionId,
        verificationSessionId,
        notificationId: notificationId || null,
        bufferAgentId,
        bufferAgentName,
        licensedAgentId,
        licensedAgentName,
        customerName,
        leadVendor,
      }),
    });

    const functionJson = (await functionResponse.json().catch(() => null)) as
      | { success?: boolean; message?: string }
      | null;

    if (!functionResponse.ok || !functionJson?.success) {
      return res.status(500).json({
        ok: false,
        error: functionJson?.message ?? "Failed to claim retention handoff.",
      });
    }

    let leadId = leadIdFromBody;
    if (!leadId) {
      const { data: leadRow, error: leadErr } = await supabaseAdmin
        .from("leads")
        .select("id")
        .eq("submission_id", submissionId)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (leadErr) {
        return res.status(500).json({ ok: false, error: leadErr.message });
      }

      leadId = typeof leadRow?.id === "string" ? leadRow.id : "";
    }

    let dealId = dealIdFromBody;
    if (dealId == null) {
      const { data: dealRow, error: dealErr } = await supabaseAdmin
        .from("monday_com_deals")
        .select("id")
        .eq("monday_item_id", submissionId)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (dealErr) {
        return res.status(500).json({ ok: false, error: dealErr.message });
      }

      dealId = typeof dealRow?.id === "number" ? dealRow.id : null;
    }

    const { data: flowRows, error: flowErr } = await supabaseAdmin
      .from("retention_deal_flow")
      .select("policy_number, lead_vendor, retention_agent")
      .eq("submission_id", submissionId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (flowErr) {
      return res.status(500).json({ ok: false, error: flowErr.message });
    }

    const flowRow = flowRows?.[0] ?? null;
    const policyNumber =
      policyNumberFromBody ||
      (typeof flowRow?.policy_number === "string" ? flowRow.policy_number.trim() : "");
    const callCenter = typeof flowRow?.lead_vendor === "string" ? flowRow.lead_vendor.trim() : "";
    const retentionAgent = typeof flowRow?.retention_agent === "string" ? flowRow.retention_agent.trim() : "";

    if (!leadId || !policyNumber) {
      return res.status(400).json({
        ok: false,
        error: "Unable to resolve the lead or policy for the call update page.",
      });
    }

    const redirectUrl = new URL("/agent/call-update", getPortalBaseUrl(req));
    redirectUrl.searchParams.set("leadId", leadId);
    redirectUrl.searchParams.set("policyNumber", policyNumber);
    if (dealId != null) {
      redirectUrl.searchParams.set("dealId", String(dealId));
    }
    if (callCenter) {
      redirectUrl.searchParams.set("callCenter", callCenter);
    }
    if (retentionAgent) {
      redirectUrl.searchParams.set("retentionAgent", retentionAgent);
    }
    redirectUrl.searchParams.set("retentionType", "new_sale");

    return res.status(200).json({ ok: true, redirectUrl: redirectUrl.toString() });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to claim retention handoff.",
    });
  }
}
