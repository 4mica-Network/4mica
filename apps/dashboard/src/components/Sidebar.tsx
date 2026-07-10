import { cn, Dropdown } from "@4mica/ui";
import { ChevronsUpDown, LogOut, UserCog } from "lucide-react";
import { useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useDashboard } from "../app/dashboard-context";
import { FOOTER_ITEMS, NAV_SECTIONS, type NavItem } from "../nav";

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 font-medium text-sm transition-colors",
          isActive
            ? "bg-overlay/10 text-ink-strong"
            : "text-ink-muted hover:bg-overlay/5 hover:text-ink-body",
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

function AvatarMenu() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg border border-overlay/10 bg-surface/50 p-2 text-left transition-colors hover:bg-overlay/5"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand font-semibold text-sm text-white">
          4M
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink-strong text-sm">
            4Mica Workspace
          </span>
          <span className="block truncate text-ink-subtle text-xs">
            engineering@4mica.io
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-ink-subtle" />
      </button>

      <Dropdown
        isOpen={open}
        anchorRef={anchorRef}
        placement="bottom"
        matchAnchorWidth
        onClickOutside={() => setOpen(false)}
        className="p-1"
      >
        <NavLink
          to="/settings/4mica-profile"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-ink-body text-sm hover:bg-overlay/10"
        >
          <UserCog className="h-4 w-4" />
          Profile settings
        </NavLink>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-ink-body text-sm hover:bg-overlay/10"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </Dropdown>
    </>
  );
}

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

export function Sidebar() {
  const { client } = useDashboard();
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-overlay/10 border-r bg-surface-deep">
      <div className="p-3">
        <AvatarMenu />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {NAV_SECTIONS.map((section, i) => (
          <div key={section.title ?? `section-${i}`} className="mb-4">
            {section.title && (
              <div className="px-2.5 pb-1 text-2xs text-ink-subtle uppercase tracking-wide">
                {section.title}
              </div>
            )}
            <div className="grid gap-0.5">
              {section.items.map((item) => (
                <SidebarLink key={item.to} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-overlay/10 border-t p-3">
        <div className="mb-2 grid gap-0.5">
          {FOOTER_ITEMS.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </div>
        <div className="px-2.5">
          <SandboxPill mode={client.mode} />
        </div>
      </div>
    </aside>
  );
}
