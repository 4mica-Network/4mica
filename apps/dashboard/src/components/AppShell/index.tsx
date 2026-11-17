import { cn } from "@4mica/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router-dom";
import { OnboardingGate } from "@/components/Onboarding";
import { COLLAPSED_WIDTH, Sidebar } from "@/components/Sidebar";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const DESKTOP_QUERY = "(min-width: 1024px)";

export function AppShell() {
  const { t } = useTranslation();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const { pathname } = useLocation();
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);

  const collapsed = isDesktop ? desktopCollapsed : !overlayOpen;
  const isOverlay = !isDesktop && overlayOpen;
  const mainRef = useRef<HTMLElement>(null);
  const lastPathname = useRef(pathname);

  useEffect(() => {
    if (lastPathname.current === pathname) {
      return;
    }
    lastPathname.current = pathname;
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  useEffect(() => {
    setOverlayOpen(false);
  }, [pathname, isDesktop]);

  useEffect(() => {
    if (!isOverlay) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOverlayOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOverlay]);

  const toggle = () =>
    isDesktop ? setDesktopCollapsed((v) => !v) : setOverlayOpen((v) => !v);

  return (
    <div className="flex h-screen bg-surface-deep text-ink-body">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-ink-strong focus:text-sm focus:shadow-lg"
      >
        {t("shell.skipToContent")}
      </a>
      <div
        className="relative shrink-0"
        style={isDesktop ? undefined : { width: COLLAPSED_WIDTH }}
      >
        <div
          className={cn(
            "relative h-screen",
            !isDesktop && "absolute inset-y-0 left-0 z-40",
            isOverlay && "shadow-2xl",
          )}
        >
          <Sidebar collapsed={collapsed} />
          <button
            type="button"
            onClick={toggle}
            aria-label={t(
              collapsed ? "shell.expandSidebar" : "shell.collapseSidebar",
            )}
            aria-expanded={!collapsed}
            className="absolute right-0 bottom-6 z-30 grid h-6 w-6 translate-x-1/2 place-items-center rounded-md border border-overlay/10 bg-surface text-ink-subtle shadow-sm transition-colors hover:text-ink-strong"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {isOverlay && (
        <button
          type="button"
          aria-label={t("shell.closeSidebar")}
          tabIndex={-1}
          onClick={() => setOverlayOpen(false)}
          className="fixed inset-0 z-30 cursor-default bg-black/50"
        />
      )}

      <main
        ref={mainRef}
        id="main-content"
        tabIndex={-1}
        className="min-w-0 flex-1 overflow-y-auto outline-none"
      >
        <div className="relative flex min-h-full w-full flex-col px-6 py-6">
          <Outlet />
        </div>
      </main>

      <OnboardingGate />
    </div>
  );
}
