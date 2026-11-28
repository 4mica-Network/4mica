import { cn, Dropdown, Tooltip } from "@4mica/ui";
import { useClerk } from "@clerk/clerk-react";
import { useAppSelector } from "@stores/hooks";
import {
  selectActiveOrganization,
  selectOrganizations,
  selectPersonalOrganization,
} from "@stores/organization/selector";
import { LogOut, Plus, UserCog } from "lucide-react";
import { lazy, type ReactNode, Suspense, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import {
  OrganizationAvatar,
  UserAvatar,
  useDisplayName,
} from "@/components/Sidebar/identity";
import { useSwitchOrganization } from "@/hooks/useSwitchOrganization";

const CreateOrganizationModal = lazy(() =>
  import("@/components/Organization/CreateOrganizationModal").then(
    (module) => ({
      default: module.CreateOrganizationModal,
    }),
  ),
);

const RAIL_WIDTH = 64;

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black";

const MENU_ITEM =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-ink-body text-sm outline-none hover:bg-overlay/10 focus-visible:bg-overlay/10 focus-visible:ring-1 focus-visible:ring-overlay/60 focus-visible:ring-inset";

function RailItem({
  label,
  active = false,
  onClick,
  testId,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div className="group relative flex w-full justify-center">
      <span
        aria-hidden="true"
        data-testid={active ? "rail-active-indicator" : undefined}
        className={cn(
          "absolute top-1/2 left-0 w-1 -translate-y-1/2 rounded-r-full bg-white transition-[height] duration-150",
          active ? "h-8" : "h-0 group-hover:h-4",
        )}
      />
      <Tooltip title={label} placement="right" delay={80}>
        <button
          type="button"
          aria-label={label}
          aria-current={active ? "true" : undefined}
          onClick={onClick}
          data-testid={testId}
          className={cn(
            "grid h-10 w-10 place-items-center rounded-xl transition-[opacity,box-shadow] duration-150",
            FOCUS_RING,
            active
              ? "ring-2 ring-white/90 ring-offset-2 ring-offset-black"
              : "opacity-75 hover:opacity-100",
          )}
        >
          {children}
        </button>
      </Tooltip>
    </div>
  );
}

function UserMenu() {
  const { t } = useTranslation();
  const { signOut } = useClerk();
  const displayName = useDisplayName();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  return (
    <>
      <Tooltip title={displayName} placement="right" delay={80} disabled={open}>
        <button
          ref={anchorRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={t("rail.account", { name: displayName })}
          onClick={() => setOpen((value) => !value)}
          data-testid="rail-user"
          className={cn(
            "grid h-10 w-10 place-items-center rounded-full",
            FOCUS_RING,
          )}
        >
          <UserAvatar />
        </button>
      </Tooltip>
      <Dropdown
        isOpen={open}
        anchorRef={anchorRef}
        placement="topRight"
        onClickOutside={() => setOpen(false)}
        onDismiss={() => setOpen(false)}
        autoFocus
        className="min-w-56 bg-surface-deep p-1"
      >
        <div id={menuId} role="menu" aria-label={displayName}>
          <p className="truncate px-2.5 pt-1.5 pb-1 font-medium text-ink-strong text-sm">
            {displayName}
          </p>
          <NavLink
            to="/settings/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={MENU_ITEM}
          >
            <UserCog aria-hidden="true" className="h-4 w-4" />
            {t("rail.profilePreferences")}
          </NavLink>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut({ redirectUrl: "/sign-in" });
            }}
            className={MENU_ITEM}
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            {t("sidebar.signOut")}
          </button>
        </div>
      </Dropdown>
    </>
  );
}

export function OrganizationRail() {
  const { t } = useTranslation();
  const organizations = useAppSelector(selectOrganizations);
  const personal = useAppSelector(selectPersonalOrganization);
  const active = useAppSelector(selectActiveOrganization);
  const switchTo = useSwitchOrganization();
  const [creating, setCreating] = useState(false);
  const teams = organizations.filter((organization) => !organization.personal);
  const personalActive = !active || active.personal;

  return (
    <nav
      aria-label={t("rail.label")}
      data-testid="organization-rail"
      className="flex h-full shrink-0 flex-col items-center gap-2 overflow-y-auto overflow-x-hidden border-white/10 border-r bg-black py-3"
      style={{ width: RAIL_WIDTH }}
    >
      <RailItem
        label={t("rail.personal")}
        active={personalActive}
        onClick={() => personal && switchTo(personal.id)}
        testId="rail-personal"
      >
        <UserAvatar className="h-10 w-10 rounded-xl" />
      </RailItem>

      {teams.length > 0 && (
        <span aria-hidden="true" className="my-0.5 h-px w-8 bg-white/15" />
      )}

      {teams.map((organization) => (
        <RailItem
          key={organization.id}
          label={organization.name}
          active={organization.id === active?.id}
          onClick={() => switchTo(organization.id)}
          testId={`rail-organization-${organization.id}`}
        >
          <OrganizationAvatar
            organization={organization}
            className="h-10 w-10 rounded-xl text-sm"
          />
        </RailItem>
      ))}

      <RailItem
        label={t("organization.switcher.create")}
        onClick={() => setCreating(true)}
        testId="rail-create"
      >
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/30 border-dashed text-white/80 transition-colors group-hover:border-white/60 group-hover:text-white">
          <Plus aria-hidden="true" className="h-5 w-5" />
        </span>
      </RailItem>

      <div className="mt-auto pt-2">
        <UserMenu />
      </div>

      {creating && (
        <Suspense fallback={null}>
          <CreateOrganizationModal isOpen onClose={() => setCreating(false)} />
        </Suspense>
      )}
    </nav>
  );
}
