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
  updateCallResultUrl?: string | null;
  /** When set, uses call-back deal CRM submission + synthetic policy number for handoff (same edge function path). */
  callBackDealId?: string | null;
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

type CallBackDealHandoffRow = {
  id: string;
  submission_id: string | null;
  name: string | null;
  phone_number: string | null;
  call_center: string | null;
};

const DAILY_DEAL_FLOW_LEAD_VENDOR = "Retention BPO";

/** Calendar YYYY-MM-DD for "today" in US Eastern (America/New_York — EST or EDT). */
function getCalendarDateYmdAmericaNewYork(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
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

    const callBackDealId = typeof body.callBackDealId === "string" ? body.callBackDealId.trim() : "";

    let callBackDealRow: CallBackDealHandoffRow | null = null;

    if (callBackDealId) {
      const { data: cbd, error: cbdErr } = await supabaseAdmin
        .from("call_back_deals")
        .select("id, submission_id, name, phone_number, call_center")
        .eq("id", callBackDealId)
        .maybeSingle();

      if (cbdErr) {
        return res.status(500).json({ ok: false, error: cbdErr.message });
      }
      if (!cbd) {
        return res.status(404).json({ ok: false, error: "call_back_deals row not found" });
      }
      callBackDealRow = cbd as unknown as CallBackDealHandoffRow;
    }

    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    const dealId = typeof body.dealId === "number" && Number.isFinite(body.dealId) ? body.dealId : null;
    let policyNumber = typeof body.policyNumber === "string" ? body.policyNumber.trim() : "";
    if (!policyNumber && callBackDealRow) {
      policyNumber = `CALLBACK-${callBackDealId}`;
    }
    if (!policyNumber) {
      return res.status(400).json({ ok: false, error: "policyNumber is required" });
    }

    /** Submission id for retention_deal_flow, URLs, and edge payload (from lead or Monday deal). */
    let handoffSubmissionId = "";
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

      const leadSid = typeof leadRow?.submission_id === "string" ? leadRow.submission_id.trim() : "";
      handoffSubmissionId = leadSid;
      customerName ||= typeof leadRow?.customer_full_name === "string" ? leadRow.customer_full_name.trim() : "";
      phoneNumber = typeof leadRow?.phone_number === "string" ? leadRow.phone_number.trim() : "";
      callCenter ||= typeof leadRow?.lead_vendor === "string" ? leadRow.lead_vendor.trim() : "";
    }

    if ((!handoffSubmissionId || !customerName || !callCenter) && dealId != null) {
      const { data: dealRow, error: dealErr } = await supabaseAdmin
        .from("monday_com_deals")
        .select("id, monday_item_id, ghl_name, deal_name, phone_number, call_center")
        .eq("id", dealId)
        .maybeSingle();

      if (dealErr) {
        return res.status(500).json({ ok: false, error: dealErr.message });
      }

      const mondaySid =
        typeof dealRow?.monday_item_id === "string" ? dealRow.monday_item_id.trim() : "";
      handoffSubmissionId ||= mondaySid;
      customerName ||=
        (typeof dealRow?.ghl_name === "string" ? dealRow.ghl_name.trim() : "") ||
        (typeof dealRow?.deal_name === "string" ? dealRow.deal_name.trim() : "");
      phoneNumber ||= typeof dealRow?.phone_number === "string" ? dealRow.phone_number.trim() : "";
      callCenter ||= typeof dealRow?.call_center === "string" ? dealRow.call_center.trim() : "";
    }

    if (callBackDealRow) {
      const nm = typeof callBackDealRow.name === "string" ? callBackDealRow.name.trim() : "";
      customerName ||= nm;
      phoneNumber ||= typeof callBackDealRow.phone_number === "string" ? callBackDealRow.phone_number.trim() : "";
      callCenter ||= typeof callBackDealRow.call_center === "string" ? callBackDealRow.call_center.trim() : "";
    }

    if (!handoffSubmissionId) {
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

    const verificationSessionId =
      typeof body.verificationSessionId === "string" ? body.verificationSessionId.trim() : "";

    const dailyFlowDate = getCalendarDateYmdAmericaNewYork();

    const dailyDealFlowMinimal = {
      submission_id: handoffSubmissionId,
      date: dailyFlowDate,
      client_phone_number: phoneNumber.trim().length > 0 ? phoneNumber.trim() : null,
      lead_vendor: DAILY_DEAL_FLOW_LEAD_VENDOR,
      insured_name: customerName.trim().length > 0 ? customerName.trim() : null,
      retention_agent: bufferAgentName.trim().length > 0 ? bufferAgentName.trim() : null,
      retention_agent_id: userData.user.id,
    };

    const { error: dailyInsertErr } = await supabaseAdmin.from("daily_deal_flow").insert(dailyDealFlowMinimal);

    if (dailyInsertErr) {
      const isDuplicate =
        typeof dailyInsertErr === "object" &&
        dailyInsertErr !== null &&
        "code" in dailyInsertErr &&
        (dailyInsertErr as { code?: string }).code === "23505";

      if (isDuplicate) {
        const { error: dailyUpdateErr } = await supabaseAdmin
          .from("daily_deal_flow")
          .update({
            client_phone_number: dailyDealFlowMinimal.client_phone_number,
            lead_vendor: dailyDealFlowMinimal.lead_vendor,
            insured_name: dailyDealFlowMinimal.insured_name,
            retention_agent: dailyDealFlowMinimal.retention_agent,
            retention_agent_id: dailyDealFlowMinimal.retention_agent_id,
            updated_at: new Date().toISOString(),
          })
          .eq("submission_id", handoffSubmissionId)
          .eq("date", dailyFlowDate);

        if (dailyUpdateErr) {
          console.error("[retention-call-notification] daily_deal_flow update error", dailyUpdateErr);
          return res.status(500).json({ ok: false, error: dailyUpdateErr.message });
        }
      } else {
        console.error("[retention-call-notification] daily_deal_flow insert error", dailyInsertErr);
        return res.status(500).json({ ok: false, error: dailyInsertErr.message });
      }
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
      .eq("submission_id", handoffSubmissionId)
      .eq("policy_number", policyNumber)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (existingFlowErr) {
      return res.status(500).json({ ok: false, error: existingFlowErr.message });
    }

    const handoffPatch = {
      submission_id: handoffSubmissionId,
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
    let laReadyUrl = `${portalBaseUrl}/call-result-update?submissionId=${encodeURIComponent(handoffSubmissionId)}`;
    if (verificationSessionId) {
      laReadyUrl += `&sessionId=${encodeURIComponent(verificationSessionId)}`;
    }
    laReadyUrl += `&policyNumber=${encodeURIComponent(policyNumber)}&dealId=${encodeURIComponent(
      String(dealId ?? ""),
    )}&leadId=${encodeURIComponent(leadId)}`;
    const updateCallResultUrl =
      typeof body.updateCallResultUrl === "string" && body.updateCallResultUrl.trim().length
        ? body.updateCallResultUrl
        : `${portalBaseUrl}/call-result-update?submissionId=${encodeURIComponent(handoffSubmissionId)}`;

    // `retention_deal_flow` / session updates above still run; edge notify below.

    const functionResponse = await fetch(getFunctionsUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "buffer_connected",
        submissionId: handoffSubmissionId,
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
