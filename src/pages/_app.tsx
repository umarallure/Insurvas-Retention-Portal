import "@/styles/globals.css";
import "react-toastify/dist/ReactToastify.css";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { Public_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardProvider } from "@/components/dashboard-context";
import { AccessGate, AccessProvider } from "@/components/access-context";
import { CommandPalette } from "@/components/command-palette";
import { NotificationsSlideover } from "@/components/notifications-slideover";
import { CloudTalkWidget } from "@/components/cloudtalk/cloudtalk-widget";
import { supabase } from "@/lib/supabase";
import { ToastContainer } from "react-toastify";
import { useTheme } from "next-themes";
import { ErrorBoundary } from "@/components/error-boundary";

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

function ThemedToastContainer() {
  const { theme, systemTheme } = useTheme();
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  // Use a darker toast style in dark mode, and colored toasts in light mode.
  const toastTheme = resolvedTheme === "dark" ? "dark" : "colored";

  return (
    <ToastContainer
      position="top-right"
      autoClose={4000}
      newestOnTop
      closeOnClick
      pauseOnHover
      draggable
      theme={toastTheme}
      progressClassName="!bg-emerald-500"
      aria-label="Notification messages"
    />
  );
}
export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  const isAuthPage = router.pathname === "/login";

  useEffect(() => {
    // No auth check needed for the login page
    if (isAuthPage) {
      return;
    }

    let isMounted = true;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (!session) {
        router.replace("/login");
      }

      setAuthChecked(true);
    }

    checkSession();

    return () => {
      isMounted = false;
    };
  }, [isAuthPage, router]);

  const isReady = isAuthPage || authChecked;

  if (!isReady) {
    return null;
  }

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Log to error tracking service in production
        if (process.env.NODE_ENV === "production") {
          console.error("[ErrorBoundary] Production error:", error, errorInfo);
          // TODO: Send to error tracking service (e.g., Sentry, LogRocket)
        }
      }}
    >
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <main className={publicSans.variable}>
          <AccessProvider>
            <DashboardProvider>
              {isAuthPage ? (
                <Component {...pageProps} />
              ) : (
                <AccessGate pathname={router.asPath.split("?")[0] ?? router.pathname}>
                  <DashboardShell>
                    <Component {...pageProps} />
                  </DashboardShell>
                </AccessGate>
              )}
              {isAuthPage ? null : <CloudTalkWidget />}
              <CommandPalette />
              <NotificationsSlideover />
              <Toaster />
              <ThemedToastContainer />
            </DashboardProvider>
          </AccessProvider>
        </main>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
