import type { NextApiRequest, NextApiResponse } from "next";

import { getSupabaseAdmin } from "@/lib/supabase";

type RequestBody = {
  type?: string;
  leadId?: string | null;
  dealId?: number | null;
  policyNumber?: string | null;
  callCenter?: string | null;
  retentionAgent?: string | null;
  verificationSessionId?: string | null;
  customerName?: string | null;
  retentionType?: string | null;
  retentionNotes?: string | null;
  quoteDetails?: Record<string, unknown> | null;
};

type ResponseData =
  | { ok: true; notificationId?: string | null; messageTs?: string | null }
  | { ok: false; error: string };

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

  const body = (req.body ?? {}) as RequestBody;
  if (body.type !== "buffer_connected") {
    return res.status(400).json({ ok: false, error: "Only buffer_connected is supported on this endpoint." });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    const dealId = typeof body.dealId === "number" && Number.isFinite(body.dealId) ? body.dealId : null;
    const policyNumber = typeof body.policyNumber === "string" ? body.policyNumber.trim() : "";
    if (!policyNumber) {
      return res.status(400).json({ ok: false, error: "policyNumber is required" });
    }

    let submissionId = "";
    let customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
    let callCenter = typeof body.callCenter === "string" ? body.callCenter.trim() : "";
    let phoneNumber = "";

    if (leadId) {
      const { data: leadRow, error: leadErr } = await supabaseAdmin
        .from("leads")
        .select("submission_id, customer_full_name, phone_number, lead_vendor")
        .eq("id", leadId)
        .maybeSingle();

      if (leadErr) {
        return res.status(500).json({ ok: false, error: leadErr.message });
      }

      submissionId = typeof leadRow?.submission_id === "string" ? leadRow.submission_id.trim() : "";
      customerName ||= typeof leadRow?.customer_full_name === "string" ? leadRow.customer_full_name.trim() : "";
      phoneNumber = typeof leadRow?.phone_number === "string" ? leadRow.phone_number.trim() : "";
      callCenter ||= typeof leadRow?.lead_vendor === "string" ? leadRow.lead_vendor.trim() : "";
    }

    if ((!submissionId || !customerName || !callCenter) && dealId != null) {
      const { data: dealRow, error: dealErr } = await supabaseAdmin
        .from("monday_com_deals")
        .select("id, monday_item_id, ghl_name, deal_name, phone_number, call_center")
        .eq("id", dealId)
        .maybeSingle();

      if (dealErr) {
        return res.status(500).json({ ok: false, error: dealErr.message });
      }

      submissionId ||= typeof dealRow?.monday_item_id === "string" ? dealRow.monday_item_id.trim() : "";
      customerName ||=
        (typeof dealRow?.ghl_name === "string" ? dealRow.ghl_name.trim() : "") ||
        (typeof dealRow?.deal_name === "string" ? dealRow.deal_name.trim() : "");
      phoneNumber ||= typeof dealRow?.phone_number === "string" ? dealRow.phone_number.trim() : "";
      callCenter ||= typeof dealRow?.call_center === "string" ? dealRow.call_center.trim() : "";
    }

    if (!submissionId) {
      return res.status(400).json({ ok: false, error: "Unable to determine submissionId for this handoff." });
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (profileErr) {
      return res.status(500).json({ ok: false, error: profileErr.message });
    }

    const bufferAgentId = typeof profile?.id === "string" ? profile.id : userData.user.id;
    const bufferAgentName =
      (typeof profile?.display_name === "string" ? profile.display_name.trim() : "") ||
      (typeof body.retentionAgent === "string" ? body.retentionAgent.trim() : "") ||
      "Unknown Agent";

    let verificationSessionId =
      typeof body.verificationSessionId === "string" ? body.verificationSessionId.trim() : "";

    if (!verificationSessionId) {
      const { data: verificationRow, error: verificationErr } = await supabaseAdmin
        .from("verification_sessions")
        .select("id")
        .eq("submission_id", submissionId)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (verificationErr) {
        return res.status(500).json({ ok: false, error: verificationErr.message });
      }

      verificationSessionId = typeof verificationRow?.id === "string" ? verificationRow.id : "";
    }

    if (!verificationSessionId) {
      return res.status(400).json({ ok: false, error: "Unable to determine verificationSessionId for this handoff." });
    }

    const quoteDetails = body.quoteDetails && typeof body.quoteDetails === "object" ? body.quoteDetails : {};
    const rawCoverage = typeof quoteDetails.coverage === "string" ? quoteDetails.coverage.trim() : "";
    const rawPremium = typeof quoteDetails.monthlyPremium === "string" ? quoteDetails.monthlyPremium.trim() : "";
    const draftDate = typeof quoteDetails.draftDate === "string" ? quoteDetails.draftDate.trim() : "";
    const coverage = rawCoverage.length ? Number(rawCoverage.replace(/[^0-9.-]/g, "")) : null;
    const monthlyPremium = rawPremium.length ? Number(rawPremium.replace(/[^0-9.-]/g, "")) : null;

    const { data: existingFlowRows, error: existingFlowErr } = await supabaseAdmin
      .from("retention_deal_flow")
      .select("id")
      .eq("submission_id", submissionId)
      .eq("policy_number", policyNumber)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (existingFlowErr) {
      return res.status(500).json({ ok: false, error: existingFlowErr.message });
    }

    const handoffPatch = {
      submission_id: submissionId,
      policy_number: policyNumber,
      lead_vendor: callCenter || null,
      insured_name: customerName || null,
      client_phone_number: phoneNumber || null,
      retention_agent: bufferAgentName,
      retention_agent_id: bufferAgentId,
      buffer_agent: bufferAgentName,
      call_result: "Submitted to licensed agent",
      carrier: typeof quoteDetails.carrier === "string" ? quoteDetails.carrier.trim() || null : null,
      product_type: typeof quoteDetails.product === "string" ? quoteDetails.product.trim() || null : null,
      monthly_premium: typeof monthlyPremium === "number" && Number.isFinite(monthlyPremium) ? monthlyPremium : null,
      face_amount: typeof coverage === "number" && Number.isFinite(coverage) ? coverage : null,
      draft_date: draftDate || null,
      notes: typeof body.retentionNotes === "string" ? body.retentionNotes.trim() || null : null,
      from_callback: true,
      is_retention_call: true,
      updated_at: new Date().toISOString(),
    };

    const existingFlowId = typeof existingFlowRows?.[0]?.id === "string" ? existingFlowRows[0].id : null;
    if (existingFlowId) {
      const { error: updateFlowErr } = await supabaseAdmin
        .from("retention_deal_flow")
        .update(handoffPatch)
        .eq("id", existingFlowId);

      if (updateFlowErr) {
        return res.status(500).json({ ok: false, error: updateFlowErr.message });
      }
    } else {
      const { error: insertFlowErr } = await supabaseAdmin.from("retention_deal_flow").insert(handoffPatch);
      if (insertFlowErr) {
        return res.status(500).json({ ok: false, error: insertFlowErr.message });
      }
    }

    const portalBaseUrl = getPortalBaseUrl(req);
    const laReadyUrl = `${portalBaseUrl}/call-result-update?submissionId=${encodeURIComponent(
      submissionId,
    )}&sessionId=${encodeURIComponent(verificationSessionId)}&policyNumber=${encodeURIComponent(
      policyNumber,
    )}&dealId=${encodeURIComponent(String(dealId ?? ""))}&leadId=${encodeURIComponent(
      leadId,
    )}`;
    const updateCallResultUrl = `${portalBaseUrl}/agent/call-update?leadId=${encodeURIComponent(
      leadId,
    )}&policyNumber=${encodeURIComponent(policyNumber)}&dealId=${encodeURIComponent(
      String(dealId ?? ""),
    )}&callCenter=${encodeURIComponent(callCenter || "")}&retentionAgent=${encodeURIComponent(
      bufferAgentName,
    )}&retentionType=${encodeURIComponent(String(body.retentionType ?? "new_sale"))}`;

    const functionResponse = await fetch(getFunctionsUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "buffer_connected",
        submissionId,
        verificationSessionId,
        bufferAgentId,
        bufferAgentName,
        customerName,
        leadVendor: callCenter || null,
        retentionType: body.retentionType ?? "new_sale",
        retentionNotes: body.retentionNotes ?? null,
        quoteDetails: {
          ...quoteDetails,
          draftDate,
        },
        portalBaseUrl,
        laReadyUrl,
        updateCallResultUrl,
      }),
    });

    const functionJson = (await functionResponse.json().catch(() => null)) as
      | { success?: boolean; notificationId?: string; messageTs?: string; message?: string }
      | null;

    if (!functionResponse.ok || !functionJson?.success) {
      return res.status(500).json({
        ok: false,
        error: functionJson?.message ?? "Failed to send retention notification.",
      });
    }

    return res.status(200).json({
      ok: true,
      notificationId: functionJson.notificationId ?? null,
      messageTs: functionJson.messageTs ?? null,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to submit retention handoff.",
    });
  }
}
