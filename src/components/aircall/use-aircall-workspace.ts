"use client";

import {useCallback,useEffect,useState,useRef} from "react";

type SendCallback = (success: boolean, data?: unknown) => void;

type AircallWorkspaceInstance = {
  isLoggedIn: (cb: (res: boolean) => void) => void;
  on: (eventName: string, cb: (payload: unknown) => void) => void;
  removeListener: (eventName: string, cb: (payload: unknown) => void) => void;
  send: (eventName: string, payload: unknown, cb?: SendCallback) => void;
};

type AircallWorkspaceConstructor = new (settings: {
  onLogin: (settings: unknown) => void;
  onLogout: () => void;
  domToLoadWorkspace: string;
  integrationToLoad?: string;
  size?: "big" | "small" | "auto";
  debug?: boolean;
}) => AircallWorkspaceInstance;

export function useAircallWorkspace({
  enabled,
  containerId,
}: {
  enabled: boolean;
  containerId: string;
}) {
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const instanceRef = useRef<AircallWorkspaceInstance | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!enabled) return;
      if (instanceRef.current) return;

      const el = document.querySelector(containerId);
      if (!el) return;

      const mod = (await import("aircall-everywhere")) as unknown as {
        default: AircallWorkspaceConstructor;
      };

      if (cancelled) return;

      const AircallWorkspace = mod.default;

      const inst = new AircallWorkspace({
        domToLoadWorkspace: containerId,
        size: "small",
        debug: true,
        onLogin: () => {
          if (cancelled) return;
          setReady(true);
          setLoggedIn(true);
          setLastError(null);
        },
        onLogout: () => {
          if (cancelled) return;
          setLoggedIn(false);
        },
      });

      instanceRef.current = inst;

      inst.isLoggedIn((res) => {
        if (cancelled) return;
        setReady(true);
        setLoggedIn(Boolean(res));
      });
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [containerId, enabled]);

  const dialNumber = useCallback((phoneNumber: string) => {
    const inst = instanceRef.current;
    if (!inst) {
      setLastError("Aircall workspace not ready");
      return;
    }

    const phone = phoneNumber.trim();
    if (!phone) {
      setLastError("Enter a phone number");
      return;
    }

    setLastError(null);

    inst.send(
      "dial_number",
      { phone_number: phone },
      (success, data) => {
        if (success) return;
        const err = data as { error_message?: unknown } | undefined;
        const msg = typeof err?.error_message === "string" ? err.error_message : "Failed to dial";
        setLastError(msg);
      },
    );
  }, []);

  const autoDialNumber = useCallback((phoneNumber: string) => {
    const inst = instanceRef.current;
    if (!inst) {
      setLastError("Aircall workspace not ready");
      return;
    }

    const phone = phoneNumber.trim();
    if (!phone) {
      setLastError("Enter a phone number");
      return;
    }

    setLastError(null);

    inst.send(
      "dial_number",
      { phone_number: phone },
      (success, data) => {
        if (!success) {
          const err = data as { error_message?: unknown } | undefined;
          const msg = typeof err?.error_message === "string" ? err.error_message : "Failed to populate dialer";
          setLastError(msg);
        }
      },
    );
  }, []);

  return {
    ready,
    loggedIn,
    lastError,
    dialNumber,
    autoDialNumber,
  };
}
