import { cn } from "@4mica/ui";
import { NavLink, Outlet } from "react-router-dom";
import { SETTINGS_NAV } from "../nav";
import { PageHeader } from "./ui";

/** Settings section: a secondary left nav + the active sub-page via Outlet. */
export function SettingsLayout() {
  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage your account, business, team, and developer configuration."
      />
      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <nav className="grid h-max gap-0.5">
          {SETTINGS_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-overlay/10 font-medium text-ink-strong"
                    : "text-ink-muted hover:bg-overlay/5 hover:text-ink-body",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
