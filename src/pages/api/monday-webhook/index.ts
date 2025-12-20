import type { NextApiRequest, NextApiResponse } from "next"

// TODO: In the future, if high throughput or debouncing is required, reintroduce Redis-based queuing from this handler.
// import { redis } from "@/lib/redis"
import { getSupabaseAdmin } from "@/lib/supabase"

type MondayItem = {
  id: string
  name: string
  created_at?: string
  updated_at?: string
  group?: {
    id: string
    title: string
    color?: string
  } | null
  column_values?: Array<{
    id: string
    text: string | null
    value: string | null
    type?: string
    column?: { id: string; title: string } | null
  }>
}

type DealFields = {
  monday_item_id: string
  deal_name: string | null
  ghl_name: string | null
  ghl_stage: string | null
  policy_status: string | null
  deal_creation_date: string | null
  policy_number: string | null
  deal_value: number | null
  cc_value: number | null
  notes: string | null
  status: string | null
  last_updated: string | null
  sales_agent: string | null
  writing_no: string | null
  carrier: string | null
  commission_type: string | null
  effective_date: string | null
  call_center: string | null
  phone_number: string | null
  cc_pmt_ws: string | null
  cc_cb_ws: string | null
  carrier_status: string | null
  lead_creation_date: string | null
  policy_type: string | null
  group_title: string | null
  group_color: string | null
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v !== "string") return null
  const cleaned = v.replace(/[^0-9.+-]/g, "").trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function normalizeString(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== "string") return null
  const s = v.trim()
  return s.length ? s : null
}

type ColumnValueEntry = {
  text: string | null
  value: string | null
  type?: string
}

function getEntryByTitle(map: Map<string, ColumnValueEntry>, title: string) {
  return map.get(title)
}

function getStringField(map: Map<string, ColumnValueEntry>, title: string) {
  const e = getEntryByTitle(map, title)
  return normalizeString(e?.text ?? null) ?? normalizeString(e?.value ?? null)
}

function getDateField(map: Map<string, ColumnValueEntry>, title: string) {
  const e = getEntryByTitle(map, title)

  // Monday date columns usually store JSON in `value`, like: {"date":"2025-12-17","changed_at":"..."}
  if (e?.value) {
    try {
      const parsed = JSON.parse(e.value) as { date?: string }
      const d = normalizeString(parsed?.date)
      if (d) return d
    } catch {
      // ignore
      console.log("[webhook] getDateField: failed to parse date")
    }
  }

  return normalizeString(e?.text ?? null)
}

function extractDealFields(item: MondayItem): DealFields {
  const m = new Map<string, ColumnValueEntry>()

  for (const cv of item.column_values ?? []) {
    const t = cv.column?.title?.trim()
    if (!t) continue
    m.set(t, { text: cv.text ?? null, value: cv.value ?? null, type: cv.type })
  }

  const deal_name = normalizeString(item.name) ?? null

  return {
    monday_item_id: item.id,
    deal_name,
    ghl_name: getStringField(m, "GHL Name"),
    ghl_stage: getStringField(m, "GHL Stage"),
    policy_status: getStringField(m, "Policy Status"),
    deal_creation_date: getDateField(m, "Deal creation date"),
    policy_number: getStringField(m, "Policy Number"),
    deal_value: toNumber(getStringField(m, "Deal Value")),
    cc_value: toNumber(getStringField(m, "CC Value")),
    notes: getStringField(m, "Notes"),
    status: getStringField(m, "Status"),
    last_updated: getDateField(m, "Last updated"),
    sales_agent: getStringField(m, "Sales Agent"),
    writing_no: getStringField(m, "Writing #"),
    carrier: getStringField(m, "Carrier"),
    commission_type: getStringField(m, "Commission Type"),
    effective_date: getDateField(m, "Effective Date"),
    call_center: getStringField(m, "Call Center"),
    phone_number: getStringField(m, "Phone Number"),
    cc_pmt_ws: getStringField(m, "CC PMT WS"),
    cc_cb_ws: getStringField(m, "CC CB WS"),
    carrier_status: getStringField(m, "Carrier Status"),
    lead_creation_date: getDateField(m, "Lead Creation Date"),
    policy_type: getStringField(m, "Policy Type"),
    group_title: item.group?.title ?? null,
    group_color: item.group?.color ?? null,
  }
}

async function fetchMondayItem(itemId: string): Promise<MondayItem | null> {
  const apiKey = process.env.MONDAY_API_KEY

  if (!apiKey) {
    console.log("[webhook] Missing MONDAY_API_KEY (skipping Monday fetch)")
    return null
  }

  console.log(`[webhook] fetching monday item id=${itemId}`)

  const query = `query ($itemId: [ID!]) {
    items(ids: $itemId) {
      id
      name
      created_at
      updated_at
      group {
        id
        title
        color
      }
      column_values {
        id
        text
        value
        type
        column {
          id
          title
        }
      }
    }
  }`

  const resp = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables: { itemId: [itemId] } }),
  })

  const bodyText = await resp
    .clone()
    .text()
    .catch(() => "")

  console.log(`[webhook] monday item fetch status=${resp.status} ok=${resp.ok}`)

  if (bodyText) {
    console.log("[webhook] monday item fetch body", bodyText)
  }

  if (!resp.ok) {
    console.log(`[webhook] Monday API error status=${resp.status}`)
    return null
  }

  let json: {
    data?: { items?: MondayItem[] }
    errors?: unknown
  } = {}

  try {
    json = JSON.parse(bodyText) as {
      data?: { items?: MondayItem[] }
      errors?: unknown
    }
  } catch {
    console.log("[webhook] Monday API returned non-JSON body")
    return null
  }

  if (json?.errors) {
    console.log("[webhook] Monday GraphQL errors", json.errors)
  }

  const item = json?.data?.items?.[0]
  if (!item) {
    console.log(`[webhook] Monday item not found id=${itemId}`)
  }
  return item ?? null
}

type MondayWebhookBody = {
  challenge?: string
  event?: {
    pulseId?: number | string
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).json({ error: "Method not allowed" })
  }

  const body = req.body as MondayWebhookBody

  if (body?.challenge) {
    console.log("[webhook] monday challenge")
    return res.status(200).json({ challenge: body.challenge })
  }

  const pulseId = body?.event?.pulseId

  if (pulseId === undefined || pulseId === null || pulseId === "") {
    console.log("[webhook] received (no pulseId)")
    return res.status(200).json({ received: true })
  }

  const id = String(pulseId)

  try {
    console.log(`[webhook] received pulseId=${id}`)
    // Direct processing: fetch Monday item and upsert into Supabase without queuing
    const item = await fetchMondayItem(id)
    if (item) {
      console.log("[webhook] monday item", {
        id: item.id,
        name: item.name,
        group: item.group
          ? { id: item.group.id, title: item.group.title, color: item.group.color }
          : null,
      })

      const extracted = extractDealFields(item)
      console.log("[webhook] extracted deal fields", extracted)
      console.log("[webhook] deal_creation_date", extracted.deal_creation_date)

      try {
        const supabaseAdmin = getSupabaseAdmin()
        const { error } = await supabaseAdmin
          .from("monday_com_deals")
          .upsert(extracted, { onConflict: "monday_item_id" })

        if (error) {
          console.error("[webhook] supabase upsert error", error)
        } else {
          console.log(`[webhook] supabase upsert ok monday_item_id=${extracted.monday_item_id}`)
        }
      } catch (err) {
        console.error("[webhook] supabase upsert exception", err)
      }
    } else {
      console.log(`[webhook] monday item fetch returned null id=${id}`)
    }
  } catch (err) {
    console.error(`[webhook] error pulseId=${id}`, err)
  }

  return res.status(200).json({ received: true })
}
