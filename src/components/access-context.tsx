"use client";

import * as React from "react";
import { useRouter } from "next/router";

import { supabase } from "@/lib/supabase";

export type AccessLevel = "unknown" | "agent" | "manager" | "none";

type AccessState = {
  loading: boolean;
  profileId: string | null;
  isAgent: boolean;
  isManager: boolean;
};

type AccessContextValue = {
  access: AccessState;
  refreshAccess: () => Promise<void>;
};

const AccessContext = React.createContext<AccessContextValue | null>(null);

const defaultAccess: AccessState = {
  loading: true,
  profileId: null,
  isAgent: false,
  isManager: false,
};

export function getAccessLevel(access: AccessState): AccessLevel {
  if (access.loading) return "unknown";
  if (access.isManager) return "manager";
  if (access.isAgent) return "agent";
  return "none";
}

export function isRouteAllowed(pathname: string, access: AccessState): boolean {
  const level = getAccessLevel(access);
  if (level === "unknown") return false;

  if (pathname === "/" || pathname === "/landing" || pathname.startsWith("/settings")) return true;

  // Keep inbox accessible for now.
  if (pathname.startsWith("/inbox")) return true;

  if (pathname.startsWith("/customers")) return level === "manager";
  if (pathname.startsWith("/manager")) return level === "manager";
  if (pathname.startsWith("/agent")) return level === "agent";

  // Default: allow other non-critical pages.
  return true;
}

export function getDefaultLandingPath(access: AccessState): string {
  const level = getAccessLevel(access);
  if (level === "manager") return "/customers";
  if (level === "agent") return "/agent/assigned-leads";
  return "/";
}

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [access, setAccess] = React.useState<AccessState>(defaultAccess);

  const refreshAccess = React.useCallback(async () => {
    setAccess((prev) => ({ ...prev, loading: true }));

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      setAccess({ ...defaultAccess, loading: false });
      return;
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr || !profile?.id) {
      setAccess({ loading: false, profileId: null, isAgent: false, isManager: false });
      return;
    }

    const profileId = profile.id as string;

    const [{ data: agentRow }, { data: managerRow }] = await Promise.all([
      supabase
        .from("retention_agents")
        .select("id")
        .eq("profile_id", profileId)
        .eq("active", true)
        .maybeSingle(),
      supabase
        .from("retention_managers")
        .select("id")
        .eq("profile_id", profileId)
        .eq("active", true)
        .maybeSingle(),
    ]);

    setAccess({
      loading: false,
      profileId,
      isAgent: Boolean(agentRow),
      isManager: Boolean(managerRow),
    });
  }, []);

  React.useEffect(() => {
    refreshAccess();
  }, [refreshAccess]);

  const value = React.useMemo<AccessContextValue>(() => ({ access, refreshAccess }), [access, refreshAccess]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const ctx = React.useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used within AccessProvider");
  return ctx;
}

export function AccessGate({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const router = useRouter();
  const { access } = useAccess();

  React.useEffect(() => {
    if (access.loading) return;

    // Dedicated landing route: redirect users to their default page.
    if (pathname === "/landing") {
      router.replace(getDefaultLandingPath(access));
      return;
    }

    // If user has no role membership, keep them on non-critical pages only.
    const allowed = isRouteAllowed(pathname, access);
    if (allowed) return;

    const next = getDefaultLandingPath(access);
    router.replace(next);
  }, [access, pathname, router]);

  if (access.loading) return null;
  if (!isRouteAllowed(pathname, access)) return null;

  return <>{children}</>;
}
