"use client";

import * as React from "react";
import { useRouter } from "next/router";

export function useNavigationPrevention(
  setPendingNavigationUrl: (url: string | null) => void,
  setLeaveConfirmOpen: (open: boolean) => void,
) {
  const router = useRouter();
  const allowNavigationRef = React.useRef(false);
  const routerAsPathRef = React.useRef(router?.asPath);

  React.useEffect(() => {
    routerAsPathRef.current = router?.asPath;
  }, [router?.asPath]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!router?.isReady) return;
    if (router.pathname !== "/agent/assigned-lead-details") return;

    const onClickCapture = (e: MouseEvent) => {
      if (allowNavigationRef.current) return;
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href) return;
      if (href.startsWith("#")) return;
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const isExternal = /^https?:\/\//i.test(href) || href.startsWith("//");
      if (isExternal) return;

      // Use ref value to avoid dependency on router.asPath
      if (href === routerAsPathRef.current) return;

      e.preventDefault();
      setPendingNavigationUrl(href);
      setLeaveConfirmOpen(true);
    };

    window.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("click", onClickCapture, true);
    };
  }, [router?.isReady, router?.pathname, setPendingNavigationUrl, setLeaveConfirmOpen]);

  React.useEffect(() => {
    if (!router?.events) return;
    const onDone = () => {
      allowNavigationRef.current = false;
    };
    const events = router.events;
    events.on("routeChangeComplete", onDone);
    events.on("routeChangeError", onDone);
    return () => {
      events.off("routeChangeComplete", onDone);
      events.off("routeChangeError", onDone);
    };
  }, [router?.events]);

  return {
    allowNavigation: () => {
      allowNavigationRef.current = true;
    },
  };
}

