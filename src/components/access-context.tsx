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
  managerId: string | null;
  allowedPages: string[];
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
  managerId: null,
  allowedPages: [],
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

  if (level === "none") return false;

  if (pathname === "/landing") return true;

  if (pathname === "/") {
    return level === "manager" || level === "agent";
  }

  if (pathname.startsWith("/settings")) return true;
  if (pathname.startsWith("/inbox")) return true;

  if (pathname.startsWith("/manager") || pathname === "/customers" || pathname === "/non-retention-leads") {
    if (level !== "manager") return false;
    if (access.allowedPages.length === 0) return true;
    return access.allowedPages.some(page => pathname.startsWith(page));
  }
  if (pathname.startsWith("/agent")) return level === "agent";

  return true;
}

export function getDefaultLandingPath(access: AccessState): string {
  const level = getAccessLevel(access);
  if (level === "manager" && access.allowedPages.length > 0) {
    return access.allowedPages[0];
  }
  if (level === "manager") return "/customers";
  if (level === "agent") return "/";
  return "/settings";
}

export const MANAGER_PAGES = [
  { path: "/manager/retention-daily-deal-flow", label: "Retention Deal Flow" },
  { path: "/manager/call-back-deals", label: "New Sales Deal" },
  { path: "/manager/fixed-policies", label: "Fixed Policies" },
  { path: "/manager/agent-report-card", label: "Agent Report Card" },
  { path: "/manager/usermanagnent", label: "User Management" },
  { path: "/manager/lead-email-ghl-notes", label: "Lead Email / Notes" },
  { path: "/manager/failed-payment-fixes", label: "Failed Payment Fixes" },
];

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [access, setAccess] = React.useState<AccessState>(defaultAccess);
  const refreshingRef = React.useRef(false);
  const currentUserIdRef = React.useRef<string | null>(null);
  const accessLoadedRef = React.useRef(false);

  const refreshAccess = React.useCallback(async () => {
    if (refreshingRef.current) {
      return;
    }

    try {
      const {
        data: { session },
        error: sessionErr,
      } = await supabase.auth.getSession();

      if (sessionErr || !session) {
        console.log("[access-context] No session found:", sessionErr?.message);
        setAccess({ ...defaultAccess, loading: false });
        currentUserIdRef.current = null;
        accessLoadedRef.current = false;
        return;
      }

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        console.log("[access-context] No user found:", userErr?.message);
        setAccess({ ...defaultAccess, loading: false });
        currentUserIdRef.current = null;
        accessLoadedRef.current = false;
        return;
      }

      if (currentUserIdRef.current === user.id && accessLoadedRef.current) {
        console.log("[access-context] User unchanged, skipping refresh");
        return;
      }

      refreshingRef.current = true;
      currentUserIdRef.current = user.id;
      setAccess((prev) => ({ ...prev, loading: true }));

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileErr) {
        console.error("[access-context] Error fetching profile:", profileErr);
        setAccess({ loading: false, profileId: null, isAgent: false, isManager: false, managerId: null, allowedPages: [] });
        accessLoadedRef.current = false;
        refreshingRef.current = false;
        return;
      }

      if (!profile?.id) {
        console.log("[access-context] No profile found for user:", user.id);
        setAccess({ loading: false, profileId: null, isAgent: false, isManager: false, managerId: null, allowedPages: [] });
        accessLoadedRef.current = false;
        refreshingRef.current = false;
        return;
      }

      const profileId = profile.id as string;

      const [{ data: agentRow, error: agentErr }, { data: managerRow, error: managerErr }] = await Promise.all([
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

      if (agentErr) {
        console.error("[access-context] Error fetching agent:", agentErr);
      }
      if (managerErr) {
        console.error("[access-context] Error fetching manager:", managerErr);
      }

      const isAgent = Boolean(agentRow);
      const isManager = Boolean(managerRow);
      const managerId = managerRow?.id ?? null;

      let allowedPages: string[] = [];
      if (isManager && managerId) {
        const { data: pageAccessData, error: pageAccessErr } = await supabase
          .from("manager_page_access")
          .select("page_path")
          .eq("manager_id", managerId);

        if (pageAccessErr) {
          console.error("[access-context] Error fetching page access:", pageAccessErr);
        } else {
          allowedPages = (pageAccessData ?? []).map((r: { page_path: string }) => r.page_path);
        }
      }

      console.log("[access-context] Access check result:", {
        profileId,
        isAgent,
        isManager,
        managerId,
        allowedPages,
      });

      setAccess({
        loading: false,
        profileId,
        isAgent,
        isManager,
        managerId,
        allowedPages,
      });
      accessLoadedRef.current = true;
    } catch (error) {
      console.error("[access-context] Unexpected error in refreshAccess:", error);
      setAccess({ ...defaultAccess, loading: false });
      accessLoadedRef.current = false;
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  React.useEffect(() => {
    refreshAccess();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[access-context] Auth state changed:", event, session?.user?.id);
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        refreshAccess();
      } else if (event === "SIGNED_OUT") {
        currentUserIdRef.current = null;
        accessLoadedRef.current = false;
        setAccess({ ...defaultAccess, loading: false });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
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
  const [isRedirecting, setIsRedirecting] = React.useState(false);

  React.useEffect(() => {
    if (access.loading) {
      return;
    }

    const level = getAccessLevel(access);

    if (level === "none" && pathname !== "/login") {
      setIsRedirecting(true);
      const checkAndSignOut = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log("[access-context] User has session but no role, signing out");
          await supabase.auth.signOut();
        }
        router.replace("/login");
      };
      checkAndSignOut();
      return;
    }

    if (pathname === "/landing") {
      const next = getDefaultLandingPath(access);
      setIsRedirecting(true);
      router.replace(next);
      return;
    }

    const allowed = isRouteAllowed(pathname, access);
    if (!allowed) {
      const next = getDefaultLandingPath(access);
      setIsRedirecting(true);
      router.replace(next);
      return;
    }

    setIsRedirecting(false);
  }, [access, pathname, router]);

  if (access.loading) {
    if (pathname === "/landing") {
      return (
        <div className="w-full px-6 py-6 min-h-screen bg-muted/20 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      );
    }
    return (
      <div className="w-full px-6 py-6 min-h-screen bg-muted/20 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (isRedirecting) {
    return (
      <div className="w-full px-6 py-6 min-h-screen bg-muted/20 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Redirecting...</div>
      </div>
    );
  }

  if (!isRouteAllowed(pathname, access)) {
    return (
      <div className="w-full px-6 py-6 min-h-screen bg-muted/20 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Redirecting...</div>
      </div>
    );
  }

  return <>{children}</>;
}