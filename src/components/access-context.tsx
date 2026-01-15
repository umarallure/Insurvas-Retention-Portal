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

  // Users with no role should not have access to any pages (except login, which is handled in _app.tsx)
  if (level === "none") return false;

  // Landing route is always allowed (will redirect to appropriate page)
  if (pathname === "/landing") return true;
  
  // Home page "/" is accessible to both managers and agents (they see different dashboards)
  if (pathname === "/") {
    return level === "manager" || level === "agent";
  }

  if (pathname.startsWith("/settings")) return true;

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
  if (level === "agent") return "/"; // Agents see their dashboard on home page
  // For users with no role, redirect to settings (a safe page they can access)
  return "/settings";
}

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [access, setAccess] = React.useState<AccessState>(defaultAccess);

  const refreshAccess = React.useCallback(async () => {
    setAccess((prev) => ({ ...prev, loading: true }));

    try {
      // First check session, then get user - this ensures session is established
      const {
        data: { session },
        error: sessionErr,
      } = await supabase.auth.getSession();

      if (sessionErr || !session) {
        console.log("[access-context] No session found:", sessionErr?.message);
        setAccess({ ...defaultAccess, loading: false });
        return;
      }

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        console.log("[access-context] No user found:", userErr?.message);
        setAccess({ ...defaultAccess, loading: false });
        return;
      }

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileErr) {
        console.error("[access-context] Error fetching profile:", profileErr);
        setAccess({ loading: false, profileId: null, isAgent: false, isManager: false });
        return;
      }

      if (!profile?.id) {
        console.log("[access-context] No profile found for user:", user.id);
        setAccess({ loading: false, profileId: null, isAgent: false, isManager: false });
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

      console.log("[access-context] Access check result:", {
        profileId,
        isAgent,
        isManager,
        agentRow: agentRow?.id,
        managerRow: managerRow?.id,
      });

      setAccess({
        loading: false,
        profileId,
        isAgent,
        isManager,
      });
    } catch (error) {
      console.error("[access-context] Unexpected error in refreshAccess:", error);
      setAccess({ ...defaultAccess, loading: false });
    }
  }, []);

  React.useEffect(() => {
    refreshAccess();

    // Listen for auth state changes (login, logout, session refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[access-context] Auth state changed:", event, session?.user?.id);
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        // Refresh access when user signs in or session is refreshed
        refreshAccess();
      } else if (event === "SIGNED_OUT") {
        // Clear access when user signs out
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
    // Wait for access check to complete
    if (access.loading) {
      return;
    }

    const level = getAccessLevel(access);

    // Users with no role should be signed out and redirected to login
    // But only if we're not on the login page and access check has completed
    if (level === "none" && pathname !== "/login") {
      setIsRedirecting(true);
      // Check if user actually has a session before signing out
      const checkAndSignOut = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // User has session but no role - sign them out
          console.log("[access-context] User has session but no role, signing out");
          await supabase.auth.signOut();
        }
        router.replace("/login");
      };
      checkAndSignOut();
      return;
    }

    // Dedicated landing route: redirect users to their default page.
    if (pathname === "/landing") {
      const next = getDefaultLandingPath(access);
      setIsRedirecting(true);
      router.replace(next);
      return;
    }

    // Check if route is allowed
    const allowed = isRouteAllowed(pathname, access);
    if (!allowed) {
      const next = getDefaultLandingPath(access);
      setIsRedirecting(true);
      router.replace(next);
      return;
    }

    setIsRedirecting(false);
  }, [access, pathname, router]);

  // Show loading state while checking access
  // Allow /landing route to show loading state (will redirect once access is determined)
  if (access.loading) {
    if (pathname === "/landing") {
      return (
        <div className="w-full px-6 py-6 min-h-screen bg-muted/20 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      );
    }
    // For other routes, show loading while access is being determined
    return (
      <div className="w-full px-6 py-6 min-h-screen bg-muted/20 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Show redirecting state
  if (isRedirecting) {
    return (
      <div className="w-full px-6 py-6 min-h-screen bg-muted/20 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Redirecting...</div>
      </div>
    );
  }

  // Final check - if route is not allowed, show redirecting (shouldn't happen due to effect above)
  if (!isRouteAllowed(pathname, access)) {
    return (
      <div className="w-full px-6 py-6 min-h-screen bg-muted/20 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Redirecting...</div>
      </div>
    );
  }

  return <>{children}</>;
}
