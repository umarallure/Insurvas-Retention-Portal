import { useEffect } from "react";
import { useRouter } from "next/router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

export default function CallResultUpdateLandingPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;

    const run = async () => {
      const submissionId = typeof router.query.submissionId === "string" ? router.query.submissionId : "";
      const sessionId = typeof router.query.sessionId === "string" ? router.query.sessionId : "";
      const notificationId = typeof router.query.notificationId === "string" ? router.query.notificationId : "";
      const policyNumber = typeof router.query.policyNumber === "string" ? router.query.policyNumber : "";
      const dealIdRaw = typeof router.query.dealId === "string" ? router.query.dealId : "";
      const leadId = typeof router.query.leadId === "string" ? router.query.leadId : "";

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        await router.replace(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }

      const dealId = dealIdRaw.trim().length ? Number(dealIdRaw) : null;

      const response = await fetch("/api/retention-call-notification/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          submissionId,
          sessionId,
          notificationId,
          policyNumber,
          dealId,
          leadId,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok: true; redirectUrl: string }
        | { ok: false; error: string }
        | null;

      if (!response.ok || !payload || ("ok" in payload && payload.ok === false)) {
        return;
      }

      await router.replace(payload.redirectUrl);
    };

    void run();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Loading Call Update</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Confirming your handoff and opening the agent portal for this lead.
        </CardContent>
      </Card>
    </div>
  );
}
