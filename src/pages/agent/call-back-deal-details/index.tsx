"use client";

import * as React from "react";
import { useRouter } from "next/router";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, ArrowLeftIcon } from "lucide-react";

import { VerificationPanel } from "@/components/agent/assigned-lead-details/verification-panel";
import {
  buildVerificationFieldMap,
  getVerificationFieldList,
  type RetentionLeadForVerification,
} from "@/lib/call-back-deals/build-verification-items";

type CallBackDealRow = {
  id: string;
  name: string | null;
  phone_number: string | null;
  submission_id: string;
  stage: string | null;
  call_center: string | null;
};

type VerificationItemRow = {
  id: string;
  call_back_deal_id: string;
  field_name: string;
  original_value: string | null;
  verified_value: string | null;
  is_verified: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export default function AgentCallBackDealDetailsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const toastRef = React.useRef(toast);
  React.useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const idParam = typeof router.query.id === "string" ? router.query.id : "";

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [deal, setDeal] = React.useState<CallBackDealRow | null>(null);
  const [lead, setLead] = React.useState<RetentionLeadForVerification | null>(null);
  const [matchedBy, setMatchedBy] = React.useState<string>("none");

  const [verificationItems, setVerificationItems] = React.useState<Array<Record<string, unknown>>>([]);
  const [verificationInputValues, setVerificationInputValues] = React.useState<Record<string, string>>({});

  const loadEverything = React.useCallback(async () => {
    if (!idParam) return;
    setLoading(true);
    setError(null);

    try {
      // Auth token for lookup-lead.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Not authenticated");
        return;
      }

      const resp = await fetch(`/api/call-back-deals/lookup-lead?id=${encodeURIComponent(idParam)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await resp.json().catch(() => null)) as
        | {
            ok: true;
            callBackDeal: CallBackDealRow;
            lead: RetentionLeadForVerification | null;
            matchedBy: string;
            ssn: string | null;
          }
        | { ok: false; error: string }
        | null;

      if (!resp.ok || !json || !json.ok) {
        const message = json && "error" in json ? json.error : `Lookup failed (${resp.status})`;
        setError(message);
        return;
      }

      const loadedDeal = json.callBackDeal;
      setDeal(loadedDeal);
      setLead(json.lead);
      setMatchedBy(json.matchedBy);

      const fieldMap = buildVerificationFieldMap(json.lead, {
        leadVendor: loadedDeal.call_center,
        fullName: loadedDeal.name,
        phone: loadedDeal.phone_number,
      });

      // Load existing verification items for this call back deal.
      const { data: existingItems, error: itemsErr } = await supabase
        .from("call_back_deal_verification_items")
        .select("id, call_back_deal_id, field_name, original_value, verified_value, is_verified, created_at, updated_at")
        .eq("call_back_deal_id", loadedDeal.id);

      if (itemsErr) {
        console.error("[call-back-deal-details] fetch items error", itemsErr);
      }

      const byFieldName = new Map<string, VerificationItemRow>();
      for (const row of (existingItems ?? []) as VerificationItemRow[]) {
        byFieldName.set(row.field_name, row);
      }

      const fieldsToSeed = getVerificationFieldList();

      // Upsert any missing rows so VerificationPanel has a stable set of items
      // and also refresh original_value if the CRM data has a value but the DB doesn't.
      const inserts: Array<{
        call_back_deal_id: string;
        field_name: string;
        original_value: string | null;
      }> = [];
      const updates: Array<{ id: string; original_value: string }> = [];

      for (const fieldName of fieldsToSeed) {
        const current = byFieldName.get(fieldName);
        const newOriginal = (fieldMap[fieldName] ?? "").toString();
        if (!current) {
          inserts.push({
            call_back_deal_id: loadedDeal.id,
            field_name: fieldName,
            original_value: newOriginal || null,
          });
          continue;
        }
        const existingOriginal = typeof current.original_value === "string" ? current.original_value.trim() : "";
        if (newOriginal && !existingOriginal) {
          updates.push({ id: current.id, original_value: newOriginal });
        }
      }

      if (inserts.length > 0) {
        const { error: insertErr } = await supabase
          .from("call_back_deal_verification_items")
          .insert(inserts);
        if (insertErr) {
          console.error("[call-back-deal-details] seed insert error", insertErr);
        }
      }

      for (const patch of updates) {
        const { error: updateErr } = await supabase
          .from("call_back_deal_verification_items")
          .update({ original_value: patch.original_value })
          .eq("id", patch.id);
        if (updateErr) {
          console.error("[call-back-deal-details] seed update error", updateErr);
        }
      }

      // Final fetch after seeding.
      const { data: finalItems, error: finalErr } = await supabase
        .from("call_back_deal_verification_items")
        .select("id, call_back_deal_id, field_name, original_value, verified_value, is_verified, created_at, updated_at")
        .eq("call_back_deal_id", loadedDeal.id)
        .order("created_at", { ascending: true });

      if (finalErr) {
        console.error("[call-back-deal-details] final fetch error", finalErr);
      }

      const finalRows = (finalItems ?? []) as VerificationItemRow[];

      // Preserve the canonical field ordering used in VerificationPanel.
      const orderIndex = new Map<string, number>(
        fieldsToSeed.map((name, idx) => [name, idx]),
      );
      finalRows.sort((a, b) => {
        const aIdx = orderIndex.get(a.field_name) ?? Number.MAX_SAFE_INTEGER;
        const bIdx = orderIndex.get(b.field_name) ?? Number.MAX_SAFE_INTEGER;
        return aIdx - bIdx;
      });

      setVerificationItems(finalRows as unknown as Array<Record<string, unknown>>);
      const initialValues: Record<string, string> = {};
      for (const row of finalRows) {
        const verified = typeof row.verified_value === "string" ? row.verified_value : "";
        const original = typeof row.original_value === "string" ? row.original_value : "";
        const initial = verified.trim().length > 0 ? verified : original;
        if (initial.length > 0) {
          initialValues[row.id] = initial;
        }
      }
      setVerificationInputValues(initialValues);
    } catch (err) {
      console.error("[call-back-deal-details] load error", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [idParam]);

  React.useEffect(() => {
    void loadEverything();
  }, [loadEverything]);

  const handleToggleVerification = React.useCallback(
    async (itemId: string, checked: boolean) => {
      setVerificationItems((prev) =>
        prev.map((row) =>
          typeof row.id === "string" && row.id === itemId ? { ...row, is_verified: checked } : row,
        ),
      );
      const { error: updateErr } = await supabase
        .from("call_back_deal_verification_items")
        .update({ is_verified: checked })
        .eq("id", itemId);
      if (updateErr) {
        toastRef.current({
          title: "Failed to save",
          description: updateErr.message,
          variant: "destructive",
        });
      }
    },
    [],
  );

  const handleUpdateValue = React.useCallback(
    async (itemId: string, value: string) => {
      setVerificationInputValues((prev) => ({ ...prev, [itemId]: value }));
      setVerificationItems((prev) =>
        prev.map((row) =>
          typeof row.id === "string" && row.id === itemId ? { ...row, verified_value: value } : row,
        ),
      );
      const { error: updateErr } = await supabase
        .from("call_back_deal_verification_items")
        .update({ verified_value: value })
        .eq("id", itemId);
      if (updateErr) {
        toastRef.current({
          title: "Failed to save",
          description: updateErr.message,
          variant: "destructive",
        });
      }
    },
    [],
  );

  const selectedPolicyView = React.useMemo(() => {
    if (!deal) return null;
    return {
      callCenter: deal.call_center ?? null,
      policyNumber: null,
      clientName: deal.name ?? null,
      carrier: (lead?.carrier as string | null | undefined) ?? null,
      agentName: null,
    };
  }, [deal, lead]);

  if (!idParam) {
    return (
      <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Missing id query parameter.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="w-full space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/agent/call-back-deals")}>
            <ArrowLeftIcon className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="text-xs text-muted-foreground">
            Matched by: <span className="font-medium">{matchedBy}</span>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h1 className="text-lg font-semibold">{deal?.name ?? "—"}</h1>
              <span className="text-xs text-muted-foreground">#{deal?.submission_id}</span>
              {deal?.stage ? (
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                  {deal.stage}
                </span>
              ) : null}
            </div>
            <div className="text-sm text-muted-foreground">
              Phone: <span className="font-mono">{deal?.phone_number ?? "—"}</span> • Call center:{" "}
              {deal?.call_center ?? "—"}
            </div>
          </CardContent>
        </Card>

        <Separator />

        {loading ? (
          <Card>
            <CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading verification data...
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : (
          <VerificationPanel
            selectedPolicyView={selectedPolicyView}
            dealPhone={deal?.phone_number ?? null}
            loading={false}
            error={null}
            verificationItems={verificationItems}
            verificationInputValues={verificationInputValues}
            onToggleVerification={handleToggleVerification}
            onUpdateValue={handleUpdateValue}
          />
        )}
      </div>
    </div>
  );
}
