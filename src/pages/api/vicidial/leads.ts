import type { NextApiRequest, NextApiResponse } from "next";
import mysql from "mysql2/promise";
import { getVicidialAgentMapping } from "@/lib/vicidial-agent-mapping";

type LeadsRequestBody = {
  profile_id?: string;
  list_id?: string | number;
  campaign_id?: string;
  limit?: number;
  include_eri?: boolean;
};

type LeadRow = {
  lead_id?: string;
  phone_number?: string;
  alt_phone?: string;
  title?: string;
  first_name?: string;
  last_name?: string;
  address1?: string;
  address2?: string;
  address3?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  province?: string;
  country_code?: string;
  email?: string;
  status?: string;
  vendor_lead_code?: string;
  source_id?: string;
  called_count?: string;
  last_local_call_time?: string;
  entry_date?: string;
  modify_date?: string;
  comments?: string;
  list_id?: string;
  raw: string;
};

type LeadsResponse =
  | {
      ok: true;
      list_id: string | number;
      campaign_id?: string;
      count: number;
      leads: LeadRow[];
    }
  | {
      ok: false;
      error: string;
      details?: string;
    };

export default async function handler(req: NextApiRequest, res: NextApiResponse<LeadsResponse>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = (req.body ?? {}) as LeadsRequestBody;
    const mapping = getVicidialAgentMapping(body.profile_id ?? null);
    const listId = body.list_id ?? mapping?.listId;
    const campaignId = body.campaign_id ?? mapping?.campaignId;
    const limit = Math.max(1, Math.min(200, Number(body.limit ?? 50)));
    const includeEri = body.include_eri === true;

    if (!listId) {
      return res.status(400).json({ ok: false, error: "Missing list mapping", details: "list_id or profile_id is required" });
    }

    const dbHost = process.env.VICIDIAL_DB_HOST;
    const dbUser = process.env.VICIDIAL_DB_USER;
    const dbPass = process.env.VICIDIAL_DB_PASS;
    const dbName = process.env.VICIDIAL_DB_NAME;
    const dbPort = Number(process.env.VICIDIAL_DB_PORT ?? "3306");

    if (!dbHost || !dbUser || !dbName) {
      return res.status(500).json({
        ok: false,
        error: "Missing VICIDIAL_DB_* envs",
        details: "Set VICIDIAL_DB_HOST, VICIDIAL_DB_USER, VICIDIAL_DB_PASS, VICIDIAL_DB_NAME",
      });
    }

    const conn = await mysql.createConnection({
      host: dbHost,
      user: dbUser,
      password: dbPass ?? undefined,
      database: dbName,
      port: dbPort,
    });

    const [rows] = await conn.query(
      `SELECT
          lead_id,
          list_id,
          status,
          phone_number,
          alt_phone,
          title,
          first_name,
          last_name,
          address1,
          address2,
          address3,
          city,
          state,
          postal_code,
          province,
          country_code,
          email,
          vendor_lead_code,
          source_id,
          called_count,
          entry_date,
          modify_date,
          last_local_call_time,
          comments
       FROM vicidial_list
       WHERE list_id = ?
         AND (? = 1 OR status IS NULL OR status <> 'ERI')
       ORDER BY lead_id DESC
       LIMIT ?`,
      [String(listId), includeEri ? 1 : 0, limit],
    );
    await conn.end();

    const leads = (rows as Array<Record<string, unknown>>).map((r) => ({
      lead_id: String(r.lead_id ?? ""),
      list_id: r.list_id ? String(r.list_id) : undefined,
      status: r.status ? String(r.status) : undefined,
      phone_number: String(r.phone_number ?? ""),
      alt_phone: r.alt_phone ? String(r.alt_phone) : undefined,
      title: r.title ? String(r.title) : undefined,
      first_name: r.first_name ? String(r.first_name) : undefined,
      last_name: r.last_name ? String(r.last_name) : undefined,
      address1: r.address1 ? String(r.address1) : undefined,
      address2: r.address2 ? String(r.address2) : undefined,
      address3: r.address3 ? String(r.address3) : undefined,
      city: r.city ? String(r.city) : undefined,
      state: r.state ? String(r.state) : undefined,
      postal_code: r.postal_code ? String(r.postal_code) : undefined,
      province: r.province ? String(r.province) : undefined,
      country_code: r.country_code ? String(r.country_code) : undefined,
      email: r.email ? String(r.email) : undefined,
      vendor_lead_code: r.vendor_lead_code ? String(r.vendor_lead_code) : undefined,
      source_id: r.source_id ? String(r.source_id) : undefined,
      called_count: r.called_count ? String(r.called_count) : undefined,
      entry_date: r.entry_date ? String(r.entry_date) : undefined,
      modify_date: r.modify_date ? String(r.modify_date) : undefined,
      last_local_call_time: r.last_local_call_time ? String(r.last_local_call_time) : undefined,
      comments: r.comments ? String(r.comments) : undefined,
      raw: "",
    }));

    return res.status(200).json({
      ok: true,
      list_id: listId,
      campaign_id: campaignId ?? undefined,
      count: leads.length,
      leads,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "VICIdial leads request failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
