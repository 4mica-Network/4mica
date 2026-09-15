import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { OnboardingGate } from "@/components/Onboarding";
import { Sidebar } from "@/components/Sidebar";

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="flex h-screen bg-surface-deep text-ink-body">
      <div className="relative shrink-0">
        <Sidebar collapsed={collapsed} />
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute right-0 bottom-6 z-30 grid h-6 w-6 translate-x-1/2 place-items-center rounded-md border border-overlay/10 bg-surface text-ink-subtle shadow-sm transition-colors hover:text-ink-strong"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {/* min-h-full + flex column so a page can hand a child `flex-1` and
            have it fill the viewport — an empty state that stops a third of
            the way down reads as a rendering bug rather than a deliberate one.
            Short pages are unaffected: block content still flows from the top. */}
        <div className="flex min-h-full w-full flex-col px-6 py-6">
          <Outlet />
        </div>
      </main>

      {/* Mounted here rather than in main.tsx so it lives inside the
          authenticated subtree and survives route changes without remounting. */}
      <OnboardingGate />
    </div>
  );
}
