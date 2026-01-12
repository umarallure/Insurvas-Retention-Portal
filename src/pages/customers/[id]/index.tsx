import * as React from "react";
import { useRouter } from "next/router";

import { supabase } from "@/lib/supabase";
import type { MondayComDeal } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function CustomerDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [deal, setDeal] = React.useState<MondayComDeal | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!id || typeof id !== "string") return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        // First try by monday_item_id
        const first = await supabase
          .from("monday_com_deals")
          .select("*")
          .eq("monday_item_id", id)
          .maybeSingle();

        let data = first.data as MondayComDeal | null;
        const error = first.error;

        if (error && error.code !== "PGRST116") {
          throw error;
        }

        if (!data) {
          // Fallback: try by numeric id
          const numericId = Number(id);
          if (Number.isFinite(numericId)) {
            const res = await supabase
              .from("monday_com_deals")
              .select("*")
              .eq("is_active", true)
              .eq("id", numericId)
              .maybeSingle();

            data = res.data as MondayComDeal | null;
          }
        }

        if (!cancelled) {
          setDeal((data ?? null) as MondayComDeal | null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleBack = () => {
    router.push("/customers");
  };

  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <Button variant="outline" size="sm" onClick={handleBack}>
            Back to Customers
          </Button>
        </div>
        {deal?.policy_status && (
          <Badge variant="outline" className="px-3 py-1 text-sm">
            {deal.policy_status}
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading lead details...</div>
      ) : !deal ? (
        <div className="text-sm text-muted-foreground">Lead not found.</div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border bg-card p-5 space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Overview
            </h2>
            <div className="space-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Policy Number</span>
                <div className="font-medium">{deal.policy_number ?? ""}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Carrier</span>
                <div className="font-medium">{deal.carrier ?? ""}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Policy Type</span>
                <div>{deal.policy_type ?? ""}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Status</span>
                <div>{deal.status ?? deal.policy_status ?? ""}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              CRM & Contact
            </h2>
            <div className="space-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">GHL Name</span>
                <div>{deal.ghl_name ?? ""}</div>
              </div>
              <div>
                <span className="text-muted-foreground">GHL Stage</span>
                <div>{deal.ghl_stage ?? ""}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Phone Number</span>
                <div className="tabular-nums">{deal.phone_number ?? ""}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Call Center</span>
                <div>{deal.call_center ?? ""}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Dates & Meta
            </h2>
            <div className="space-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Deal Creation Date</span>
                <div>{deal.deal_creation_date ?? ""}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Effective Date</span>
                <div>{deal.effective_date ?? ""}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Lead Creation Date</span>
                <div>{deal.lead_creation_date ?? ""}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Last Updated</span>
                <div>{deal.last_updated ?? ""}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-2 md:col-span-2 lg:col-span-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Notes
            </h2>
            <div className="text-sm whitespace-pre-wrap min-h-[60px]">
              {deal.notes ?? "No notes yet for this lead."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
