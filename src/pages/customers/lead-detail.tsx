import * as React from "react";
import { useRouter } from "next/router";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type LeadRecord = Record<string, unknown>;

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length ? value : "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatCompact(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length ? value : "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "—";
}

function formatDate(value: unknown) {
  if (!value || typeof value !== "string") return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function titleizeKey(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getString(row: LeadRecord | null, key: string) {
  if (!row) return null;
  const v = row[key];
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function getUnknown(row: LeadRecord | null, key: string) {
  if (!row) return null;
  return row[key];
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div className="text-sm font-medium text-foreground">{formatCompact(value)}</div>
    </div>
  );
}

function FieldDate({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div className="text-sm font-medium text-foreground">{formatDate(value)}</div>
    </div>
  );
}

export default function LeadDetailPage() {
  const router = useRouter();

  const idParam = router.query.id;

  const [lead, setLead] = React.useState<LeadRecord | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!router.isReady) return;

    const rawQuery = typeof router.asPath === "string" ? router.asPath : "";
    const queryPart = rawQuery.split("?", 2)[1] ?? "";
    const bareId = queryPart && !queryPart.includes("=") ? queryPart.trim() : "";

    const id = typeof idParam === "string" ? idParam.trim() : "";
    const effectiveId = bareId || id;

    if (!effectiveId) {
      setLead(null);
      setError("Missing lead id in URL. Expected /customers/lead-detail?<id> (or /customers/lead-detail?id=<id>). ");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const numericId = Number(effectiveId);
        if (!Number.isFinite(numericId)) {
          setLead(null);
          setError("Invalid id. Expected a numeric id like /customers/lead-detail?300");
          return;
        }

        const res = await supabase
          .from("monday_com_deals")
          .select("*")
          .eq("id", numericId)
          .maybeSingle();

        if (res.error && res.error.code !== "PGRST116") {
          throw res.error;
        }

        const data = (res.data ?? null) as LeadRecord | null;

        if (!cancelled) {
          setLead(data);
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
  }, [router.isReady, router.asPath, idParam]);

  const handleBack = () => {
    router.push("/customers");
  };

  const entries = React.useMemo(() => {
    const e = Object.entries(lead ?? {}).filter(([key]) => {
      return key !== "id" && key !== "created_at" && key !== "updated_at";
    });
    e.sort(([a], [b]) => a.localeCompare(b));
    return e;
  }, [lead]);

  const title = React.useMemo(() => {
    if (!lead) return null;
    const value = lead["deal_name"];
    return typeof value === "string" && value.trim().length ? value : null;
  }, [lead]);

  const badges = React.useMemo(() => {
    const items: Array<{ key: string; label: string; variant: "default" | "secondary" | "outline" }> = [];

    const policyStatus = getString(lead, "policy_status");
    if (policyStatus) items.push({ key: "policy_status", label: policyStatus, variant: "outline" });

    const status = getString(lead, "status");
    if (status) items.push({ key: "status", label: status, variant: "secondary" });

    const carrier = getString(lead, "carrier");
    if (carrier) items.push({ key: "carrier", label: carrier, variant: "outline" });

    const callCenter = getString(lead, "call_center");
    if (callCenter) items.push({ key: "call_center", label: callCenter, variant: "outline" });

    return items;
  }, [lead]);

  return (
    <div className="w-full min-h-screen bg-muted/20">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
        <div className="px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={handleBack}>
                Back
              </Button>
              <div>
                <div className="text-xs text-muted-foreground">Lead Detail</div>
                <h1 className="text-lg sm:text-xl font-semibold text-foreground leading-tight">
                  {title ?? "Lead"}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              {badges.slice(0, 4).map((b) => (
                <Badge key={b.key} variant={b.variant} className="max-w-[220px]">
                  <span className="truncate">{b.label}</span>
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full px-8 py-8">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading lead details...</div>
        ) : error ? (
          <Card className="max-w-3xl">
            <CardHeader className="border-b">
              <CardTitle className="text-base">Couldn’t load lead</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-red-600">{error}</div>
            </CardContent>
          </Card>
        ) : !lead ? (
          <div className="text-sm text-muted-foreground">Lead not found.</div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-12">
              <Card className="lg:col-span-8">
                <CardHeader className="border-b">
                  <CardTitle className="text-base">Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Policy Number" value={getUnknown(lead, "policy_number")} />
                    <Field label="Carrier" value={getUnknown(lead, "carrier")} />
                    <Field label="Policy Type" value={getUnknown(lead, "policy_type")} />
                    <Field label="Policy Status" value={getUnknown(lead, "policy_status")} />
                    <Field label="Status" value={getUnknown(lead, "status")} />
                    <Field label="Carrier Status" value={getUnknown(lead, "carrier_status")} />
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-4">
                <CardHeader className="border-b">
                  <CardTitle className="text-base">Quick Info</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Field label="GHL Name" value={getUnknown(lead, "ghl_name")} />
                    <Field label="Phone" value={getUnknown(lead, "phone_number")} />
                    <Field label="Call Center" value={getUnknown(lead, "call_center")} />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-12">
              <Card className="lg:col-span-6">
                <CardHeader className="border-b">
                  <CardTitle className="text-base">Dates</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FieldDate label="Deal Creation" value={getUnknown(lead, "deal_creation_date")} />
                    <FieldDate label="Effective Date" value={getUnknown(lead, "effective_date")} />
                    <FieldDate label="Lead Creation" value={getUnknown(lead, "lead_creation_date")} />
                    <FieldDate label="Last Updated" value={getUnknown(lead, "last_updated")} />
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-6">
                <CardHeader className="border-b">
                  <CardTitle className="text-base">Assignments & Value</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Sales Agent" value={getUnknown(lead, "sales_agent")} />
                    <Field label="Writing #" value={getUnknown(lead, "writing_no")} />
                    <Field label="Commission Type" value={getUnknown(lead, "commission_type")} />
                    <Field label="Deal Value" value={getUnknown(lead, "deal_value")} />
                    <Field label="CC Value" value={getUnknown(lead, "cc_value")} />
                    <Field label="Tasks" value={getUnknown(lead, "tasks")} />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm whitespace-pre-wrap wrap-break-word text-foreground">
                  {getString(lead, "notes") ?? "No notes yet for this lead."}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-base">All Fields</CardTitle>
              </CardHeader>
              <CardContent>
                <details className="group">
                  <summary className="cursor-pointer select-none text-sm font-medium text-muted-foreground hover:text-foreground">
                    Show raw record
                  </summary>
                  <Separator className="my-4" />
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {entries.map(([key, value]) => (
                      <div key={key} className="rounded-lg border bg-background p-4">
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                          {titleizeKey(key)}
                        </div>
                        <pre className="mt-2 text-sm whitespace-pre-wrap wrap-break-word font-sans text-foreground">
                          {formatValue(value)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </details>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
