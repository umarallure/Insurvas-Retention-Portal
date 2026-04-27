// supabase/functions/retnetion-new-sale-connector/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ==========================================
// HARDCODED IDs & CHANNELS
// ==========================================
const HARDCODED_CALL_CENTER_ID = "f26e7ad6-c1b6-4ebb-8355-a7b0bc73b4a6"; 
const HARDCODED_STAGE_ID = 116; 
const HARDCODED_SLACK_CHANNEL = "#sales-team-callback-portal";

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function generateLeadUniqueId(length = 9): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function postSlack(slackMessage: Record<string, unknown>) {
  if (!SLACK_BOT_TOKEN) {
    console.warn("Missing SLACK_BOT_TOKEN environment variable.");
    return { ok: false, error: "Token not configured" };
  }
  const slackResponse = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(slackMessage),
  });
  return slackResponse.json();
}

// ==========================================
// DATA MAPPING ARRAYS & FUNCTIONS
// ==========================================
const VERIFICATION_FIELD_TO_LEAD_COLUMN: Record<string, string> = {
  applied_to_life_insurance_last_two_years: "previous_applications_2_years",
  existing_coverage: "existing_coverage_last_2_years",
  social_security: "social",
  driver_license: "driver_license_number",
  street_address: "street1",
  beneficiary_routing: "routing_number",
  beneficiary_account: "account_number",
  account_type: "bank_account_type",
  phone_number: "phone",
  doctors_name: "doctor_name" 
};

const YES_NO_CONSTRAINTS = new Set([
  "tobacco_use",
  "existing_coverage_last_2_years",
  "previous_applications_2_years"
]);

const ALLOWED_FIELDS = new Set([
  "first_name", "last_name", "customer_full_name",
  "lead_vendor", "street_address", "beneficiary_information", "phone_number",
  "date_of_birth", "age", "social_security", "driver_license", "existing_coverage",
  "applied_to_life_insurance_last_two_years", "height", "weight", "doctors_name",
  "tobacco_use", "health_conditions", "medications", "carrier", "product_type",
  "monthly_premium", "coverage_amount", "draft_date", "institution_name",
  "beneficiary_routing", "beneficiary_account", "account_type", "birth_state",
  "additional_information"
]);

function formatYesNo(val: string): string | null {
  const normalized = val.toLowerCase().trim();
  if (normalized === "yes" || normalized === "true" || normalized === "y") return "Yes";
  if (normalized === "no" || normalized === "false" || normalized === "n") return "No";
  return null; 
}

function mapDirectLeadData(leadData: Record<string, any>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(leadData)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    if (value === null || value === undefined || value === "") continue;

    // Handle customer_full_name - split into first_name and last_name
    if (key === "customer_full_name") {
      const fullName = String(value).trim();
      const nameParts = fullName.split(" ");
      if (nameParts.length >= 2) {
        patch.first_name = nameParts[0];
        patch.last_name = nameParts.slice(1).join(" ");
      } else {
        patch.first_name = fullName;
        patch.last_name = "";
      }
      continue;
    }

    const column = VERIFICATION_FIELD_TO_LEAD_COLUMN[key] ?? key;

    if (YES_NO_CONSTRAINTS.has(column)) {
      const yesNoVal = formatYesNo(String(value));
      if (yesNoVal) patch[column] = yesNoVal;
      continue;
    }

    patch[column] = typeof value === "string" ? value.trim() : value;
  }

  return patch;
}

function parseNumericOrNull(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function getCalendarDateYmdAmericaNewYork(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { 
      leadData = {}, 
      quote, 
      retentionAgent
    } = await req.json();

    // === STEP 1: CREATE LEAD ===
    const leadPatch = mapDirectLeadData(leadData);

    if (quote) {
      if (quote.carrier) leadPatch.carrier = quote.carrier;
      if (quote.product) leadPatch.product_type = quote.product;
      if (quote.coverage) leadPatch.coverage_amount = String(quote.coverage); 
      if (quote.monthlyPremium) leadPatch.monthly_premium = String(quote.monthlyPremium);
      if (quote.draftDate) leadPatch.draft_date = quote.draftDate;
      if (quote.notes) leadPatch.additional_information = quote.notes; 
    }

    // Apply IDs and System Fields
    leadPatch.lead_source = "Retention BPO"; 
    leadPatch.submission_id = crypto.randomUUID(); 
    leadPatch.lead_unique_id = generateLeadUniqueId(); 
    leadPatch.submission_date = new Date().toISOString();
    leadPatch.call_center_id = HARDCODED_CALL_CENTER_ID; 
    leadPatch.stage_id = HARDCODED_STAGE_ID; 

    const { data: newLead, error: leadError } = await supabase
      .from("leads")
      .insert(leadPatch)
      .select("id, submission_id, lead_unique_id")
      .single();

    if (leadError) {
      console.error("Lead insert error:", leadError);
      return new Response(JSON.stringify({ ok: false, error: leadError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const submissionId = newLead.submission_id;

    const phoneNumber = (leadPatch.phone as string) || null;
    const firstName = (leadPatch.first_name as string) || "";
    const lastName = (leadPatch.last_name as string) || "";
    const customerName = `${firstName} ${lastName}`.trim() || "N/A";

    // === STEP 2: CREATE DAILY_DEAL_FLOW ENTRY ===
    const ddfCoverage = quote?.coverage ? parseNumericOrNull(quote.coverage) : null;
    const ddfMonthlyPremium = quote?.monthlyPremium ? parseNumericOrNull(quote.monthlyPremium) : null;

    const dailyFlowDate = getCalendarDateYmdAmericaNewYork();
    const dailyDealFlowEntry = {
      submission_id: submissionId,
      date: dailyFlowDate,
      client_phone_number: phoneNumber,
      lead_vendor: "Unlimited Retention BPO",
      insured_name: customerName === "N/A" ? null : customerName,
      retention_agent: retentionAgent || null,
      buffer_agent: retentionAgent || null, 
      call_result: "Submitted to licensed agent",
      carrier: quote?.carrier || null,
      product_type: quote?.product || null,
      monthly_premium: ddfMonthlyPremium,
      face_amount: ddfCoverage,
      draft_date: quote?.draftDate || null,
      notes: quote?.notes || null,
      from_callback: true,
      is_retention_call: true,
      call_center_id: HARDCODED_CALL_CENTER_ID 
    };

    const { error: dailyInsertErr } = await supabase
      .from("daily_deal_flow")
      .insert(dailyDealFlowEntry);

    if (dailyInsertErr && dailyInsertErr.code !== "23505") {
      console.error("Daily deal flow insert error:", dailyInsertErr);
    }

    // === STEP 3: SEND SLACK NOTIFICATION ===
    try {
      const transferUrl = `https://app.insurvas.com/dashboard/sales_agent_licensed/transfer-leads/${newLead.id}`;
      
      let retentionDetailsText = "\n\n*Retention Type:* New Sale";
      if (quote) {
        retentionDetailsText += "\n*Quote Details:*";
        if (quote.carrier) retentionDetailsText += `\n• Carrier: ${quote.carrier}`;
        if (quote.product) retentionDetailsText += `\n• Product: ${quote.product}`;
        if (quote.coverage) retentionDetailsText += `\n• Coverage: ${quote.coverage}`;
        if (quote.monthlyPremium) retentionDetailsText += `\n• Monthly Premium: ${quote.monthlyPremium}`;
        if (quote.draftDate) retentionDetailsText += `\n• Draft Date: ${quote.draftDate}`;
      }

      const slackMessage = {
        channel: HARDCODED_SLACK_CHANNEL,
        text: `:phone: Retention Call - ${retentionAgent || "Agent"} connected with ${customerName}`,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "📞 Retention Call - Agent Connected", emoji: true },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Retention Agent:*\n${retentionAgent || "N/A"}` },
              { type: "mrkdwn", text: `*Customer:*\n${customerName}` },
              { type: "mrkdwn", text: `*Lead Vendor:*\nRetention BPO` },
              { type: "mrkdwn", text: `*Submission ID:*\n${submissionId}` },
            ],
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: retentionDetailsText },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: "*Use the action below to open the lead:*" },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "✅ Ready", emoji: true },
                style: "primary",
                url: transferUrl,
                action_id: "la_ready_button",
              },
              {
                type: "button",
                text: { type: "plain_text", text: "📝 Update call result", emoji: true },
                url: transferUrl,
                action_id: "update_call_result_button",
              },
            ],
          },
        ],
      };

      const slackResult = await postSlack(slackMessage);
      if (!slackResult.ok) {
        console.error("Slack post failed:", slackResult.error);
      }
    } catch (notifyError) {
      console.error("Slack Notification error:", notifyError);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        leadId: newLead.id,
        leadUniqueId: newLead.lead_unique_id,
        submissionId: submissionId,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message || "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});