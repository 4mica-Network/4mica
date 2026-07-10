import { cn } from "@4mica/ui";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useDashboard } from "../app/dashboard-context";

const NAV = [
  { to: "/agents", label: "Agents" },
  { to: "/transactions", label: "Transactions" },
  { to: "/whitelist", label: "Whitelist" },
];

function SandboxPill({ mode }: { mode: "sandbox" | "live" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-xs",
        mode === "sandbox"
          ? "bg-amber-400/15 text-amber-500"
          : "bg-brand-teal/15 text-brand-teal",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          mode === "sandbox" ? "bg-amber-500" : "bg-brand-teal",
        )}
      />
      {mode === "sandbox" ? "Sandbox mode" : "Live"}
    </span>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { client } = useDashboard();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-overlay/10 border-b bg-surface-deep/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-ink-strong tracking-tight">
              4Mica <span className="text-brand">Dashboard</span>
            </span>
            <nav className="flex items-center gap-1">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
                      isActive
                        ? "bg-overlay/10 text-ink-strong"
                        : "text-ink-muted hover:text-ink-body",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <SandboxPill mode={client.mode} />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
