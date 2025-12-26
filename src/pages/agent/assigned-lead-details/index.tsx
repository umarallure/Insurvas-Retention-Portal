"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";

import { supabase } from "@/lib/supabase";
import {
  findDuplicateLeadsFromMondayGhlNames,
  type DuplicateLeadFinderResult,
} from "@/lib/duplicate-leads";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { MondayComDeal } from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type LeadRecord = Record<string, unknown>;

function getString(row: LeadRecord | null, key: string): string | null {
  if (!row) return null;
  const v = row[key];
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function titleizeKey(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    const t = value.trim();
    return t.length ? t : "—";
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "—";
}

function pickRowValue(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && !(typeof v === "string" && v.trim().length === 0)) return v;
  }
  return null;
}

function formatCurrency(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (!t.length) return "—";
    const numeric = Number(t.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(numeric)) {
      return numeric.toLocaleString(undefined, { style: "currency", currency: "USD" });
    }
    return t;
  }
  return "—";
}

export default function AssignedLeadDetailsPage() {
  const router = useRouter();
  const idParam = router.query.id;

  const [lead, setLead] = useState<LeadRecord | null>(null);
  const [mondayDeals, setMondayDeals] = useState<MondayComDeal[]>([]);
  const [mondayLoading, setMondayLoading] = useState(false);
  const [mondayError, setMondayError] = useState<string | null>(null);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateLeadFinderResult | null>(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [dailyFlowRows, setDailyFlowRows] = useState<Array<Record<string, unknown>>>([]);
  const [dailyFlowLoading, setDailyFlowLoading] = useState(false);
  const [dailyFlowError, setDailyFlowError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;

    const id = typeof idParam === "string" ? idParam : Array.isArray(idParam) ? idParam[0] : undefined;
    if (!id) {
      setError("Missing lead id in URL.");
      setLead(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: leadsError } = await supabase
          .from("leads")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (leadsError) throw leadsError;

        if (!cancelled) {
          setLead((data ?? null) as LeadRecord | null);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to load lead.";
          setError(msg);
          setLead(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [router.isReady, idParam]);

  useEffect(() => {
    if (!lead) {
      setMondayDeals([]);
      setMondayError(null);
      setMondayLoading(false);
      setDuplicateResult(null);
      setDuplicateError(null);
      setDuplicateLoading(false);
      return;
    }

    const ghlName = getString(lead, "customer_full_name");
    if (!ghlName) {
      setMondayDeals([]);
      setMondayError(null);
      setMondayLoading(false);
      setDuplicateResult(null);
      setDuplicateError(null);
      setDuplicateLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setMondayLoading(true);
      setMondayError(null);
      setDuplicateLoading(true);
      setDuplicateError(null);
      try {
        // 1) Start from Monday: find deals that match this lead's name (fuzzy)
        const escaped = ghlName.replace(/,/g, "");
        const { data: mondayRows, error: mondayErr } = await supabase
          .from("monday_com_deals")
          .select("*")
          .or(`ghl_name.ilike.%${escaped}%,deal_name.ilike.%${escaped}%`)
          .order("last_updated", { ascending: false, nullsFirst: false });

        if (mondayErr) throw mondayErr;

        const deals = (mondayRows ?? []) as MondayComDeal[];
        const ghlNames = Array.from(
          new Set(
            deals
              .map((d) => (typeof d.ghl_name === "string" ? d.ghl_name : null))
              .filter((v): v is string => !!v && v.trim().length > 0)
          )
        );

        const res = await findDuplicateLeadsFromMondayGhlNames({
          supabase,
          ghlNames: ghlNames.length ? ghlNames : [ghlName],
          excludeLeadId: typeof lead["id"] === "string" ? (lead["id"] as string) : undefined,
          includeMondayDeals: true,
        });

        if (!cancelled) {
          setMondayDeals(deals);
          setDuplicateResult(res);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to load duplicate policies.";
          setMondayError(msg);
          setDuplicateError(msg);
          setMondayDeals([]);
          setDuplicateResult(null);
        }
      } finally {
        if (!cancelled) {
          setMondayLoading(false);
          setDuplicateLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [lead]);

  const name = getString(lead, "customer_full_name") ?? "Unknown";
  const phone = getString(lead, "phone_number") ?? "-";
  const email = getString(lead, "email") ?? "-";
  const policyNumber = getString(lead, "policy_number") ?? "-";
  const carrier = getString(lead, "carrier") ?? "-";
  const productType = getString(lead, "product_type") ?? "-";
  const center = getString(lead, "lead_vendor") ?? "-";
  const address1 = getString(lead, "street_address") ?? "-";
  const city = getString(lead, "city") ?? "-";
  const state = getString(lead, "state") ?? "-";
  const zip = getString(lead, "zip_code") ?? "-";
  const dob = getString(lead, "date_of_birth") ?? "-";
  const ssnLast4 = getString(lead, "social_security") ?? "-";
  const monthlyPremium = getString(lead, "monthly_premium") ?? "-";
  const agent = getString(lead, "agent") ?? "-";

  const additionalEntries = useMemo(() => {
    if (!lead) return [] as Array<[string, unknown]>;

    const exclude = new Set([
      "id",
      "created_at",
      "updated_at",
      "customer_full_name",
      "phone_number",
      "email",
      "policy_number",
      "carrier",
      "product_type",
      "lead_vendor",
      "street_address",
      "city",
      "state",
      "zip_code",
      "date_of_birth",
      "social_security",
      "monthly_premium",
      "agent",
    ]);

    return Object.entries(lead).filter(([key, value]) => !exclude.has(key) && value != null);
  }, [lead]);

  useEffect(() => {
    if (!lead) {
      setDailyFlowRows([]);
      setDailyFlowError(null);
      setDailyFlowLoading(false);
      return;
    }

    const p = getString(lead, "phone_number");
    if (!p) {
      setDailyFlowRows([]);
      setDailyFlowError(null);
      setDailyFlowLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setDailyFlowLoading(true);
      setDailyFlowError(null);
      try {
        const { data, error: dfError } = await supabase
          .from("daily_deal_flow")
          .select("*")
          .eq("client_phone_number", p)
          .order("date", { ascending: false })
          .limit(100);

        if (dfError) throw dfError;
        if (!cancelled) setDailyFlowRows((data ?? []) as Array<Record<string, unknown>>);
      } catch (e) {
        if (!cancelled) {
          const err = e as unknown;
          const maybe =
            err && typeof err === "object"
              ? (err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown })
              : null;

          const msg =
            typeof maybe?.message === "string"
              ? [
                  maybe.message,
                  typeof maybe?.code === "string" ? `Code: ${maybe.code}` : null,
                  typeof maybe?.details === "string" ? `Details: ${maybe.details}` : null,
                  typeof maybe?.hint === "string" ? `Hint: ${maybe.hint}` : null,
                ]
                  .filter(Boolean)
                  .join(" • ")
              : "Failed to load Daily Deal Flow.";

          console.error("Daily Deal Flow query failed", {
            leadPhone: p,
            error: err,
          });

          setDailyFlowError(msg);
          setDailyFlowRows([]);
        }
      } finally {
        if (!cancelled) setDailyFlowLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [lead]);

  const policyCards = useMemo(() => {
    const all: MondayComDeal[] = [];

    // Always include deals found directly by fuzzy search
    all.push(...(mondayDeals ?? []));

    // Include any deals found via SSN-expanded duplicate search (if available)
    if (duplicateResult?.mondayDealsByGhlName) {
      for (const deals of Object.values(duplicateResult.mondayDealsByGhlName)) {
        all.push(...(deals ?? []));
      }
    }

    // Deduplicate by policy_number first, otherwise by monday_item_id, otherwise by id
    const byKey = new Map<string, MondayComDeal>();
    for (const d of all) {
      const key =
        (d.policy_number && d.policy_number.trim().length ? `policy:${d.policy_number.trim()}` : null) ??
        (d.monday_item_id && d.monday_item_id.trim().length ? `item:${d.monday_item_id.trim()}` : null) ??
        `id:${String(d.id)}`;

      if (!byKey.has(key)) byKey.set(key, d);
    }

    const unique = Array.from(byKey.values());
    unique.sort((a, b) => {
      const al = a.last_updated ?? "";
      const bl = b.last_updated ?? "";
      return bl.localeCompare(al);
    });

    return unique;
  }, [duplicateResult, mondayDeals]);

  const notesItems = useMemo(() => {
    const items: Array<{ source: string; date: string | null; text: string }> = [];

    const leadNotes = getString(lead, "notes");
    if (leadNotes) {
      items.push({ source: "Lead", date: getString(lead, "updated_at") ?? getString(lead, "created_at"), text: leadNotes });
    }

    for (const row of dailyFlowRows) {
      const note = pickRowValue(row, ["notes", "note", "lead_notes"]);
      const text = typeof note === "string" ? note.trim() : "";
      if (text.length) {
        const date = typeof row["date"] === "string" ? String(row["date"]) : null;
        items.push({ source: "Daily Deal Flow", date, text });
      }
    }

    for (const d of policyCards) {
      const text = typeof d.notes === "string" ? d.notes.trim() : "";
      if (text.length) {
        items.push({ source: "Monday.com", date: d.last_updated ?? d.updated_at ?? null, text });
      }
    }

    items.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return items;
  }, [dailyFlowRows, lead, policyCards]);

  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Lead Details</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Detailed information for the assigned lead.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl">
        <Card>
          <CardHeader>
            <CardTitle>{name}</CardTitle>
            <CardDescription>
              {carrier !== "-" ? carrier : ""}
              {productType !== "-" ? ` • ${productType}` : ""}
              {center !== "-" ? ` • ${center}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading lead details...</div>
            ) : error ? (
              <div className="text-sm text-red-600">{error}</div>
            ) : !lead ? (
              <div className="text-sm text-muted-foreground">Lead not found.</div>
            ) : (
              <Tabs defaultValue="policies" className="w-full">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="policies">Policies</TabsTrigger>
                  <TabsTrigger value="daily">Daily Deal Flow</TabsTrigger>
                  <TabsTrigger value="personal">Personal Details</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                </TabsList>

                <TabsContent value="policies" className="pt-2">
                  <div className="rounded-md border p-4">
                    <div className="text-sm font-medium">Policies</div>
                    <Separator className="my-3" />

                    {mondayLoading || duplicateLoading ? (
                      <div className="text-sm text-muted-foreground">Loading policies...</div>
                    ) : mondayError || duplicateError ? (
                      <div className="text-sm text-red-600">{mondayError ?? duplicateError}</div>
                    ) : policyCards.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No policies found.</div>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3">
                        {policyCards.map((d) => {
                          const status = d.policy_status ?? d.status ?? "—";
                          const premium = d.deal_value;
                          const vendor = d.call_center;
                          const product = d.policy_type;

                          return (
                            <div key={d.id} className="rounded-md border bg-background p-5 space-y-3 w-full">
                              <div className="flex items-start justify-between gap-3">
                                <div className="text-base font-semibold text-foreground">
                                  {d.ghl_name ?? d.deal_name ?? "Policy"}
                                </div>
                                <div className="text-xs rounded-md bg-muted px-2 py-1 font-medium text-foreground">
                                  {status}
                                </div>
                              </div>

                              <div className="text-xs text-muted-foreground">ID: {d.monday_item_id ?? "—"}</div>

                              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                <div className="text-muted-foreground">Policy #:</div>
                                <div className="font-semibold text-foreground text-right">{d.policy_number ?? "—"}</div>

                                <div className="text-muted-foreground">Carrier:</div>
                                <div className="font-semibold text-foreground text-right">{d.carrier ?? "—"}</div>

                                <div className="text-muted-foreground">Product:</div>
                                <div className="font-semibold text-foreground text-right">{product ?? "—"}</div>

                                <div className="text-muted-foreground">Premium:</div>
                                <div className="font-semibold text-foreground text-right">{formatCurrency(premium)}</div>

                                <div className="text-muted-foreground">Agent:</div>
                                <div className="font-semibold text-foreground text-right">{d.sales_agent ?? "—"}</div>

                                <div className="text-muted-foreground">Vendor:</div>
                                <div className="font-semibold text-foreground text-right">{vendor ?? "—"}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="daily" className="pt-2">
                  <div className="rounded-md border p-4">
                    <div className="text-sm font-medium">Daily Deal Flow</div>
                    <Separator className="my-3" />

                    {dailyFlowLoading ? (
                      <div className="text-sm text-muted-foreground">Loading daily deal flow...</div>
                    ) : dailyFlowError ? (
                      <div className="text-sm text-red-600">{dailyFlowError}</div>
                    ) : dailyFlowRows.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No daily deal flow records found.</div>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <Table className="min-w-max">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Lead Vendor</TableHead>
                              <TableHead>Insured Name</TableHead>
                              <TableHead>Phone Number</TableHead>
                              <TableHead>Buffer Agent</TableHead>
                              <TableHead>Retention Agent</TableHead>
                              <TableHead>Agent</TableHead>
                              <TableHead>Licensed Account</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Call Result</TableHead>
                              <TableHead>Carrier</TableHead>
                              <TableHead>Product Type</TableHead>
                              <TableHead className="text-right">Retention Call</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dailyFlowRows.map((row, idx) => (
                              <TableRow key={String(row["id"] ?? idx)}>
                                <TableCell className="whitespace-nowrap">{formatValue(row["date"])}</TableCell>
                                <TableCell className="truncate">{formatValue(pickRowValue(row, ["lead_vendor"]))}</TableCell>
                                <TableCell className="truncate">{formatValue(pickRowValue(row, ["insured_name", "insured", "insured_full_name"]))}</TableCell>
                                <TableCell className="truncate">{formatValue(pickRowValue(row, ["client_phone_number", "phone_number", "phone"]))}</TableCell>
                                <TableCell className="truncate">{formatValue(pickRowValue(row, ["buffer_agent", "buffer"]))}</TableCell>
                                <TableCell className="truncate">{formatValue(pickRowValue(row, ["retention_agent"]))}</TableCell>
                                <TableCell className="truncate">{formatValue(pickRowValue(row, ["agent", "sales_agent"]))}</TableCell>
                                <TableCell className="truncate">
                                  {formatValue(pickRowValue(row, ["licensed_account", "licensed_agent", "licensed"]))}
                                </TableCell>
                                <TableCell className="truncate">{formatValue(pickRowValue(row, ["status"]))}</TableCell>
                                <TableCell className="truncate">{formatValue(pickRowValue(row, ["call_result", "result"]))}</TableCell>
                                <TableCell className="truncate">{formatValue(pickRowValue(row, ["carrier"]))}</TableCell>
                                <TableCell className="truncate">{formatValue(pickRowValue(row, ["product_type", "product", "policy_type"]))}</TableCell>
                                <TableCell className="text-right">{formatValue(row["is_retention_call"])}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="notes" className="pt-2">
                  <div className="rounded-md border p-4">
                    <div className="text-sm font-medium">Notes</div>
                    <Separator className="my-3" />
                    {notesItems.length === 0 ? (
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap">No notes.</div>
                    ) : (
                      <div className="space-y-3">
                        {notesItems.map((n, idx) => (
                          <div key={`${n.source}-${idx}`} className="rounded-md border bg-background p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-semibold text-muted-foreground">Source: {n.source}</div>
                              <div className="text-xs text-muted-foreground">{n.date ?? "—"}</div>
                            </div>
                            <div className="text-sm text-foreground whitespace-pre-wrap mt-2">{n.text}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="personal" className="pt-2">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-md border p-4">
                      <div className="text-sm font-medium">Contact & Address</div>
                      <Separator className="my-3" />
                      <div className="text-sm text-muted-foreground">Name: {name}</div>
                      <div className="text-sm text-muted-foreground">Phone: {phone}</div>
                      <div className="text-sm text-muted-foreground">Email: {email}</div>
                      <div className="text-sm text-muted-foreground mt-3">
                        Address: {address1}
                        {address1 !== "-" ? ", " : ""}
                        {city !== "-" ? `${city}, ` : ""}
                        {state !== "-" ? state : ""}
                        {zip !== "-" ? ` ${zip}` : ""}
                      </div>
                    </div>

                    <div className="rounded-md border p-4">
                      <div className="text-sm font-medium">Policy & Client</div>
                      <Separator className="my-3" />
                      <div className="text-sm text-muted-foreground">Policy #: {policyNumber}</div>
                      <div className="text-sm text-muted-foreground">Carrier: {carrier}</div>
                      <div className="text-sm text-muted-foreground">Product Type: {productType}</div>
                      <div className="text-sm text-muted-foreground">Monthly Premium: {monthlyPremium}</div>
                      <div className="text-sm text-muted-foreground mt-3">DOB: {dob}</div>
                      <div className="text-sm text-muted-foreground">SSN (last 4): {ssnLast4}</div>
                      <div className="text-sm text-muted-foreground mt-3">Agent: {agent}</div>
                    </div>
                  </div>

                  <div className="rounded-md border p-4 mt-4">
                    <div className="text-sm font-medium">Lead Source</div>
                    <Separator className="my-3" />
                    <div className="text-sm text-muted-foreground">Center: {center}</div>
                  </div>

                  {additionalEntries.length > 0 && (
                    <div className="rounded-md border p-4 mt-4">
                      <div className="text-sm font-medium">Additional Details</div>
                      <Separator className="my-3" />
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {additionalEntries.map(([key, value]) => (
                          <div key={key} className="space-y-0.5">
                            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                              {titleizeKey(key)}
                            </div>
                            <div className="text-xs text-foreground">{formatValue(value)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
