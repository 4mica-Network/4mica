import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

/** Full-screen application shell: collapsible left sidebar + full-width content. */
export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="flex h-screen bg-surface-deep text-ink-body">
      <div className="relative shrink-0">
        <Sidebar collapsed={collapsed} />
        {/* Collapse handle: sits on the sidebar's right edge near the bottom,
            styled like the content surface so it reads as part of it. */}
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
        <div className="w-full px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
