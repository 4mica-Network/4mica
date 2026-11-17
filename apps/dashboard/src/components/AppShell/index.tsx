import { cn } from "@4mica/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { OnboardingGate } from "@/components/Onboarding";
import { COLLAPSED_WIDTH, Sidebar } from "@/components/Sidebar";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const DESKTOP_QUERY = "(min-width: 1024px)";

export function AppShell() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const { pathname } = useLocation();
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);

  const collapsed = isDesktop ? desktopCollapsed : !overlayOpen;
  const isOverlay = !isDesktop && overlayOpen;

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
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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
          aria-label="Close sidebar"
          tabIndex={-1}
          onClick={() => setOverlayOpen(false)}
          className="fixed inset-0 z-30 cursor-default bg-black/50"
        />
      )}

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="relative flex min-h-full w-full flex-col px-6 py-6">
          <Outlet />
        </div>
      </main>

      <OnboardingGate />
    </div>
  );
}
