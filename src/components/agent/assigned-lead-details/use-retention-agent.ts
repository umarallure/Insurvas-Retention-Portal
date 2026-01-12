"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase";

export function useRetentionAgent() {
  const [retentionAgent, setRetentionAgent] = React.useState("");
  const [retentionAgentId, setRetentionAgentId] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;

    const loadLoggedInAgent = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        if (!session?.user) return;

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        const name = (profile?.display_name as string | null) ?? null;
        if (!cancelled && name && name.trim().length) {
          setRetentionAgent(name);
          setRetentionAgentId(session.user.id);
        }
      } catch {
        if (!cancelled) setRetentionAgent("");
      }
    };

    void loadLoggedInAgent();
    return () => {
      cancelled = true;
    };
  }, []);

  return { retentionAgent, retentionAgentId };
}

