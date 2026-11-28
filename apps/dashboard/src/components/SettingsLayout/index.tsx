import { cn } from "@4mica/ui";
import { useAppSelector } from "@stores/hooks";
import {
  allows,
  selectActiveOrganization,
} from "@stores/organization/selector";
import type { Permission } from "@stores/organization/type";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useWorkspaceMode } from "@/hooks/useWorkspaceMode";
import { type NavItem, resolveNav, SETTINGS_SECTIONS } from "@/nav";
import { preloadPage } from "@/routes";

function SettingsTabs({ group }: { group: NavItem }) {
  const { t } = useTranslation();
  const label = t(group.labelKey);
  return (
    <div className="mx-auto w-full pr-3 lg:max-w-3xl">
      <p className="font-medium text-ink-subtle text-xs uppercase tracking-wide">
        {label}
      </p>
      <nav
        aria-label={label}
        className="mt-2 mb-6 flex flex-wrap gap-1 border-overlay/10 border-b pb-2"
        data-testid="settings-tabs"
      >
        {group.children?.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            onMouseEnter={() => preloadPage(tab.to)}
            onFocus={() => preloadPage(tab.to)}
            className={({ isActive }) =>
              cn(
                "rounded-md px-2.5 py-1.5 font-medium text-sm",
                isActive
                  ? "bg-overlay/10 text-ink-strong"
                  : "text-ink-muted hover:bg-overlay/5 hover:text-ink-body",
              )
            }
          >
            {t(tab.labelKey)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function SettingsLayout() {
  const { pathname } = useLocation();
  const mode = useWorkspaceMode();
  const organization = useAppSelector(selectActiveOrganization);
  const group = resolveNav(SETTINGS_SECTIONS, mode, (permission: Permission) =>
    allows(organization, permission),
  )
    .flatMap((section) => section.items)
    .find((item) => item.children?.some((child) => child.to === pathname));

  return (
    <div className="flex h-full w-full flex-col">
      {group && <SettingsTabs group={group} />}
      <div className="min-h-0 w-full flex-1">
        <Outlet />
      </div>
    </div>
  );
}
