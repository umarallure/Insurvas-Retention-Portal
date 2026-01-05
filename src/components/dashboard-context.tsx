"use client";

import {createContext,useEffect,useState,ReactNode,useContext,useMemo} from "react";
import { useRouter } from "next/router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getDefaultLandingPath, useAccess } from "@/components/access-context";

type DashboardContextValue = {
  isCommandOpen: boolean;
  setIsCommandOpen: (open: boolean) => void;
  isNotificationsOpen: boolean;
  setIsNotificationsOpen: (open: boolean) => void;
  currentLeadPhone: string | null;
  setCurrentLeadPhone: (phone: string | null) => void;
  dialerOpen: boolean;
  setDialerOpen: (open: boolean) => void;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { access } = useAccess();
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [currentLeadPhone, setCurrentLeadPhone] = useState<string | null>(null);
  const [dialerOpen, setDialerOpen] = useState(false);

  useEffect(() => {
    const handleRouteChange = () => setIsNotificationsOpen(false);
    router.events.on("routeChangeStart", handleRouteChange);
    return () => router.events.off("routeChangeStart", handleRouteChange);
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const key = "cookie-consent";
    const current = window.localStorage.getItem(key) ?? "pending";

    if (current === "accepted") return;

    const id = toast.custom(
      () => (
        <div className="w-full rounded-lg border bg-popover p-4 text-popover-foreground shadow-sm">
          <div className="text-sm">
            We use first-party cookies to enhance your experience on our website.
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                window.localStorage.setItem(key, "accepted");
                toast.dismiss(id);
              }}
            >
              Accept
            </Button>
            <Button variant="ghost" onClick={() => toast.dismiss(id)}>
              Opt out
            </Button>
          </div>
        </div>
      ),
      { duration: Infinity }
    );

    return () => {
      toast.dismiss(id);
    };
  }, []);

  useEffect(() => {
    let awaitingGoto = false;
    let gotoTimer: number | undefined;

    const resetGoto = () => {
      awaitingGoto = false;
      if (gotoTimer) window.clearTimeout(gotoTimer);
      gotoTimer = undefined;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (isEditableElement(e.target)) return;

      if (!awaitingGoto && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setIsNotificationsOpen((v) => !v);
        return;
      }

      // Open command palette with Cmd/Ctrl+K
      if (!awaitingGoto && e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsCommandOpen(true);
        return;
      }

      // Vue shortcut format: 'g-h', etc.
      if (!awaitingGoto && e.key.toLowerCase() === "g") {
        awaitingGoto = true;
        gotoTimer = window.setTimeout(resetGoto, 1000);
        return;
      }

      if (awaitingGoto) {
        const nextKey = e.key.toLowerCase();
        if (["h", "i", "c", "s"].includes(nextKey)) {
          e.preventDefault();
          resetGoto();

          const defaultLanding = getDefaultLandingPath(access);

          const to =
            nextKey === "h"
              ? "/"
              : nextKey === "i"
                ? "/inbox"
                : nextKey === "c"
                  ? access.isManager
                    ? "/customers"
                    : defaultLanding
                  : "/settings";

          router.push(to);
        } else {
          resetGoto();
        }
      }

      // Escape closes overlays.
      if (e.key === "Escape") {
        setIsCommandOpen(false);
        setIsNotificationsOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      resetGoto();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [access, router, setIsCommandOpen]);

  const value = useMemo<DashboardContextValue>(
    () => ({
      isCommandOpen,
      setIsCommandOpen,
      isNotificationsOpen,
      setIsNotificationsOpen,
      currentLeadPhone,
      setCurrentLeadPhone,
      dialerOpen,
      setDialerOpen,
    }),
    [isCommandOpen, isNotificationsOpen, currentLeadPhone, dialerOpen]
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
