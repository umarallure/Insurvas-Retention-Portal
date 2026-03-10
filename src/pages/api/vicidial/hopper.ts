import type { NextApiRequest, NextApiResponse } from "next";
import mysql from "mysql2/promise";
import { callVicidialNonAgentApi, type VicidialParams } from "@/lib/vicidial";
import { getSupabaseAdmin } from "@/lib/supabase";

type HopperRow = {
  hopper_order: string;
  priority: string;
  lead_id: string;
  list_id: string;
  phone_number: string;
  status: string;
  last_call_time: string;
  vendor_lead_code?: string;
  source_id?: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
};

function normalizeCell(value: string | undefined) {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : "";
}

function normalizePhoneDigits(input?: string | null) {
  return (input ?? "").replace(/\D/g, "");
}

function hasDisplayName(row: Pick<HopperRow, "first_name" | "last_name">) {
  return Boolean(normalizeCell(row.first_name) || normalizeCell(row.last_name));
}

type HopperResponse =
  | {
      ok: true;
      rows: HopperRow[];
      raw: string;
      active_lead_id: string | null;
    }
  | {
      ok: false;
      error: string;
      details?: unknown;
      raw?: string;
      active_lead_id: string | null;
    };

function parsePipeTable(raw: string) {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const header = lines[0].split("|").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => line.split("|").map((v) => v.trim()));
  return { header, rows };
}

function findColumnIndex(header: string[], names: string[]) {
  const lowered = header.map((h) => h.toLowerCase());
  for (const name of names) {
    const idx = lowered.indexOf(name.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function findActiveLeadIdFromAgentTable(raw: string, agentUser?: string) {
  const parsed = parsePipeTable(raw);
  if (!parsed) return null;

  const idxAgent = findColumnIndex(parsed.header, ["user", "agent_user", "user_name"]);
  const idxStatus = findColumnIndex(parsed.header, ["status", "agent_status"]);
  const idxLeadId = findColumnIndex(parsed.header, ["lead_id", "leadid", "lead"]);
  if (idxLeadId < 0) return null;

  const targetUser = (agentUser ?? "").trim().toLowerCase();
  for (const row of parsed.rows) {
    const rowUser = idxAgent >= 0 ? (row[idxAgent] ?? "").trim().toLowerCase() : "";
    if (targetUser && idxAgent >= 0 && rowUser !== targetUser) continue;

    const status = idxStatus >= 0 ? (row[idxStatus] ?? "").trim().toUpperCase() : "";
    const leadId = (row[idxLeadId] ?? "").trim();
    if (!leadId) continue;

    if (!status) return leadId;

    // Ignore obvious non-live states; otherwise accept the lead id.
    if (status === "READY" || status === "PAUSED" || status === "DEAD") continue;
    return leadId;
  }

  // Fallback: if status column was missing/unreliable, still try to return lead_id for the agent row.
  if (targetUser && idxAgent >= 0 && idxStatus < 0) {
    for (const row of parsed.rows) {
      const rowUser = (row[idxAgent] ?? "").trim().toLowerCase();
      if (rowUser !== targetUser) continue;
      const leadId = (row[idxLeadId] ?? "").trim();
      if (leadId) return leadId;
    }
  }

  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<HopperResponse>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed", active_lead_id: null });
  }

  const { campaign_id, agent_user } = (req.body ?? {}) as { campaign_id?: string; agent_user?: string };

  if (!campaign_id) {
    return res.status(400).json({
      ok: false,
      error: "campaign_id is required",
      active_lead_id: null,
    });
  }

  try {
    const params: VicidialParams = {
      campaign_id,
      stage: "pipe",
      header: "YES",
    };

    const result = await callVicidialNonAgentApi("hopper_list", params);
    const raw = result.raw.trim();

    if (/^ERROR:/i.test(raw)) {
      return res.status(200).json({
        ok: false,
        error: raw.split("\n")[0]?.trim() ?? "VICIdial hopper_list error",
        raw,
        active_lead_id: null,
      });
    }

    let activeLeadId: string | null = null;
    try {
      const loggedIn = await callVicidialNonAgentApi("logged_in_agents", {
        campaign_id,
        stage: "pipe",
        header: "YES",
      });
      activeLeadId = findActiveLeadIdFromAgentTable(loggedIn.raw, agent_user);

      if (!activeLeadId && agent_user) {
        const agentStatus = await callVicidialNonAgentApi("agent_status", {
          agent_user,
          stage: "pipe",
          header: "YES",
        });
        activeLeadId = findActiveLeadIdFromAgentTable(agentStatus.raw, agent_user);
      }
    } catch {
      activeLeadId = null;
    }

    if (!raw) {
      return res.status(200).json({
        ok: true,
        rows: [],
        raw,
        active_lead_id: activeLeadId,
      });
    }

    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return res.status(200).json({
        ok: true,
        rows: [],
        raw,
        active_lead_id: activeLeadId,
      });
    }

    const header = lines[0].split("|").map((h) => h.trim());
    const dataLines = lines.slice(1);

    const getIndex = (name: string): number => header.indexOf(name);
    const idxHopperOrder = getIndex("hopper_order");
    const idxPriority = getIndex("priority");
    const idxLeadId = getIndex("lead_id");
    const idxListId = getIndex("list_id");
    const idxPhoneNumber = getIndex("phone_number");
    const idxStatus = getIndex("status");
    const idxLastCallTime = getIndex("last_call_time");
    const idxVendorLeadCode = getIndex("vendor_lead_code");
    const idxSourceId = getIndex("source_id");
    const idxFirstName = getIndex("first_name");
    const idxLastName = getIndex("last_name");

    const baseRows: HopperRow[] = dataLines.map((line) => {
      const cols = line.split("|");
      const safeGet = (idx: number): string => (idx >= 0 && idx < cols.length ? cols[idx] ?? "" : "");

      return {
        hopper_order: safeGet(idxHopperOrder),
        priority: safeGet(idxPriority),
        lead_id: safeGet(idxLeadId),
        list_id: safeGet(idxListId),
        phone_number: safeGet(idxPhoneNumber),
        status: safeGet(idxStatus),
        last_call_time: safeGet(idxLastCallTime),
        vendor_lead_code: normalizeCell(safeGet(idxVendorLeadCode)) || undefined,
        source_id: normalizeCell(safeGet(idxSourceId)) || undefined,
        first_name: normalizeCell(safeGet(idxFirstName)) || undefined,
        last_name: normalizeCell(safeGet(idxLastName)) || undefined,
      };
    });

    // Enrich with names from vicidial_list when DB credentials are available
    let rows: HopperRow[] = baseRows;
    const dbHost = process.env.VICIDIAL_DB_HOST;
    const dbUser = process.env.VICIDIAL_DB_USER;
    const dbPass = process.env.VICIDIAL_DB_PASS;
    const dbName = process.env.VICIDIAL_DB_NAME;
    const dbPort = Number(process.env.VICIDIAL_DB_PORT ?? "3306");

    if (dbHost && dbUser && dbName && rows.length > 0) {
      try {
        const conn = await mysql.createConnection({
          host: dbHost,
          user: dbUser,
          password: dbPass ?? undefined,
          database: dbName,
          port: dbPort,
        });

        const leadIds = Array.from(
          new Set(
            rows
              .map((r) => r.lead_id)
              .filter((id): id is string => Boolean(id && id.trim())),
          ),
        );

        if (leadIds.length > 0) {
          const [nameRows] = await conn.query(
            `SELECT lead_id, first_name, last_name, phone_number
             FROM vicidial_list
             WHERE lead_id IN (${leadIds
              .map(() => "?")
              .join(",")})`,
            leadIds,
          );

          const nameMapByLeadId = new Map<string, { first_name?: string; last_name?: string }>();
          const nameMapByPhone = new Map<string, { first_name?: string; last_name?: string }>();
          for (const row of nameRows as Array<Record<string, unknown>>) {
            const id = row.lead_id != null ? String(row.lead_id) : "";
            const phone = row.phone_number != null ? String(row.phone_number).trim() : "";
            const mapped = {
              first_name: row.first_name != null ? String(row.first_name).trim() || undefined : undefined,
              last_name: row.last_name != null ? String(row.last_name).trim() || undefined : undefined,
            };

            if (id) nameMapByLeadId.set(id.trim(), mapped);
            if (phone) nameMapByPhone.set(phone, mapped);
          }

          rows = rows.map((r) => {
            if (hasDisplayName(r)) return r;

            const byLead = nameMapByLeadId.get((r.lead_id ?? "").trim());
            if (byLead && hasDisplayName(byLead as Pick<HopperRow, "first_name" | "last_name">)) {
              return {
                ...r,
                first_name: byLead.first_name,
                last_name: byLead.last_name,
              };
            }

            const byPhone = nameMapByPhone.get((r.phone_number ?? "").trim());
            if (byPhone && hasDisplayName(byPhone as Pick<HopperRow, "first_name" | "last_name">)) {
              return {
                ...r,
                first_name: byPhone.first_name,
                last_name: byPhone.last_name,
              };
            }

            return r;
          });
        }

        await conn.end();
      } catch {
        // If DB lookup fails, still return base hopper data
        rows = baseRows;
      }
    }

    // Supabase fallback for missing names:
    // 1) by vendor_lead_code (deal id) when available
    // 2) by phone_number
    const rowsMissingName = rows.filter((r) => !hasDisplayName(r) && !normalizeCell(r.display_name));
    if (rowsMissingName.length > 0) {
      try {
        const admin = getSupabaseAdmin();

        const dealIds = Array.from(
          new Set(
            rowsMissingName
              .map((r) => normalizeCell(r.vendor_lead_code))
              .filter((v) => /^\d+$/.test(v))
              .map((v) => Number(v))
              .filter((v) => Number.isFinite(v)),
          ),
        );

        const byDealId = new Map<number, string>();
        if (dealIds.length > 0) {
          const { data: dealRows, error: dealErr } = await admin
            .from("monday_com_deals")
            .select("id,ghl_name,deal_name,last_updated")
            .in("id", dealIds)
            .order("last_updated", { ascending: false, nullsFirst: false })
            .limit(5000);
          if (!dealErr) {
            for (const row of (dealRows ?? []) as Array<Record<string, unknown>>) {
              const id = typeof row.id === "number" ? row.id : Number(row.id);
              if (!Number.isFinite(id)) continue;
              if (byDealId.has(id)) continue;
              const name =
                (typeof row.ghl_name === "string" && row.ghl_name.trim()) ||
                (typeof row.deal_name === "string" && row.deal_name.trim()) ||
                "";
              if (!name) continue;
              byDealId.set(id, name);
            }
          }
        }

        const missingAfterDealLookup = rows.filter((r) => {
          if (hasDisplayName(r) || normalizeCell(r.display_name)) return false;
          const id = Number(normalizeCell(r.vendor_lead_code));
          return !(Number.isFinite(id) && byDealId.get(id));
        });

        const phoneDigits = Array.from(
          new Set(
            missingAfterDealLookup
              .map((r) => normalizePhoneDigits(r.phone_number))
              .filter((v) => v.length > 0),
          ),
        );

        const byPhone = new Map<string, string>();
        if (phoneDigits.length > 0) {
          const candidates = Array.from(
            new Set(
              phoneDigits.flatMap((p) => {
                const opts = [p];
                if (p.length === 10) opts.push(`1${p}`);
                if (p.length === 11 && p.startsWith("1")) opts.push(p.slice(1));
                return opts;
              }),
            ),
          );

          const { data: phoneRows, error: phoneErr } = await admin
            .from("monday_com_deals")
            .select("phone_number,ghl_name,deal_name,last_updated")
            .in("phone_number", candidates)
            .order("last_updated", { ascending: false, nullsFirst: false })
            .limit(5000);
          if (!phoneErr) {
            for (const row of (phoneRows ?? []) as Array<Record<string, unknown>>) {
              const phone = normalizePhoneDigits(typeof row.phone_number === "string" ? row.phone_number : "");
              if (!phone || byPhone.has(phone)) continue;
              const name =
                (typeof row.ghl_name === "string" && row.ghl_name.trim()) ||
                (typeof row.deal_name === "string" && row.deal_name.trim()) ||
                "";
              if (!name) continue;
              byPhone.set(phone, name);
            }
          }
        }

        rows = rows.map((r) => {
          if (hasDisplayName(r) || normalizeCell(r.display_name)) return r;

          const dealId = Number(normalizeCell(r.vendor_lead_code));
          const dealName = Number.isFinite(dealId) ? byDealId.get(dealId) : undefined;
          if (dealName) {
            return {
              ...r,
              display_name: dealName,
            };
          }

          const phoneName = byPhone.get(normalizePhoneDigits(r.phone_number));
          if (phoneName) {
            return {
              ...r,
              display_name: phoneName,
            };
          }

          return r;
        });
      } catch {
        // Supabase fallback is best-effort only.
      }
    }

    // If the active lead is no longer in hopper, inject it so UI can still pin/highlight it.
    if (activeLeadId && !rows.some((r) => normalizeCell(r.lead_id) === normalizeCell(activeLeadId))) {
      let activeRow: HopperRow | null = null;

      if (dbHost && dbUser && dbName) {
        try {
          const conn = await mysql.createConnection({
            host: dbHost,
            user: dbUser,
            password: dbPass ?? undefined,
            database: dbName,
            port: dbPort,
          });

          const [activeRows] = await conn.query(
            `SELECT lead_id, list_id, phone_number, status, first_name, last_name, vendor_lead_code, source_id
             FROM vicidial_list
             WHERE lead_id = ?
             LIMIT 1`,
            [activeLeadId],
          );
          await conn.end();

          const first = (activeRows as Array<Record<string, unknown>>)[0];
          if (first) {
            activeRow = {
              hopper_order: "-1",
              priority: "999",
              lead_id: normalizeCell(String(first.lead_id ?? activeLeadId)),
              list_id: normalizeCell(String(first.list_id ?? "")),
              phone_number: normalizeCell(String(first.phone_number ?? "")),
              status: "INCALL",
              last_call_time: "LIVE",
              vendor_lead_code: normalizeCell(String(first.vendor_lead_code ?? "")) || undefined,
              source_id: normalizeCell(String(first.source_id ?? "")) || undefined,
              first_name: normalizeCell(String(first.first_name ?? "")) || undefined,
              last_name: normalizeCell(String(first.last_name ?? "")) || undefined,
            };
          }
        } catch {
          activeRow = null;
        }
      }

      if (!activeRow) {
        activeRow = {
          hopper_order: "-1",
          priority: "999",
          lead_id: normalizeCell(activeLeadId),
          list_id: "",
          phone_number: "",
          status: "INCALL",
          last_call_time: "LIVE",
        };
      }

      rows = [activeRow, ...rows];
    }

    return res.status(200).json({
      ok: true,
      rows,
      raw,
      active_lead_id: activeLeadId,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "VICIdial hopper_list request failed",
      details: error instanceof Error ? error.message : "Unknown error",
      active_lead_id: null,
    });
  }
}
