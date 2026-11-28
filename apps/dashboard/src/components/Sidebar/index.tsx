import { Avatar, cn, Dropdown, Tooltip } from "@4mica/ui";
import { useCopyToClipboard } from "@4mica/ui/hooks";
import { useClerk, useUser } from "@clerk/clerk-react";
import { fetchFinanceBadges } from "@stores/financeBadge/actions";
import { selectFinanceBadges } from "@stores/financeBadge/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  allows,
  selectActiveOrganization,
} from "@stores/organization/selector";
import { PERMISSION, type Permission } from "@stores/organization/type";
import { selectUser } from "@stores/user/selector";
import { m } from "framer-motion";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Eye,
  LogOut,
  type LucideIcon,
  UserCog,
} from "lucide-react";
import {
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { OrganizationSwitcher } from "@/components/Organization/OrganizationSwitcher";
import { EnvironmentToggle } from "@/components/Project/EnvironmentToggle";
import { ProjectSwitcher } from "@/components/Project/ProjectSwitcher";
import { SidebarBanners } from "@/components/SidebarBanners";
import { showsProjects, useWorkspaceMode } from "@/hooks/useWorkspaceMode";
import { links } from "@/lib/links";
import {
  FOOTER_ITEMS,
  NAV_SECTIONS,
  type NavItem,
  type NavSection,
  resolveNav,
  SETTINGS_SECTIONS,
} from "@/nav";
import { preloadPage } from "@/routes";

const CreateOrganizationModal = lazy(() =>
  import("@/components/Organization/CreateOrganizationModal").then(
    (module) => ({
      default: module.CreateOrganizationModal,
    }),
  ),
);

const EXPANDED_WIDTH = 256;
export const COLLAPSED_WIDTH = 60;
const WIDTH_TRANSITION = { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const };

const rowClass = (active: boolean) =>
  cn(
    "flex h-9 w-full items-center overflow-hidden rounded-md font-medium text-sm",
    active
      ? "bg-overlay/10 text-ink-strong"
      : "text-ink-muted hover:bg-overlay/5 hover:text-ink-body",
  );

function RowIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center">
      <Icon className="h-4 w-4" strokeWidth={2} />
    </span>
  );
}

function Label({
  collapsed,
  children,
  className,
}: {
  collapsed: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "min-w-0 truncate transition-opacity duration-200",
        collapsed ? "opacity-0" : "opacity-100",
        className,
      )}
    >
      {children}
    </span>
  );
}

const firstNonBlank = (
  ...values: (string | null | undefined)[]
): string | undefined => values.find((value) => value?.trim())?.trim();

function useDisplayName(): string {
  const { t } = useTranslation();
  const { user } = useUser();
  const currentUser = useAppSelector(selectUser);

  return (
    firstNonBlank(
      currentUser?.name,
      user?.fullName,
      currentUser?.email,
      user?.primaryEmailAddress?.emailAddress,
    ) ?? t("sidebar.newUser")
  );
}

function AvatarCircle() {
  const { t } = useTranslation();
  const { user } = useUser();
  const imageUrl = user?.imageUrl;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  return (
    <Avatar
      src={imageUrl && imageUrl !== failedUrl ? imageUrl : null}
      onError={() => setFailedUrl(imageUrl ?? null)}
      name={t("monogram")}
      alt=""
      size="xs"
      className="border-0 bg-overlay/15 text-ink-strong"
    />
  );
}

const BADGE_REFRESH_MS = 60_000;

function useFinanceBadgeRefresh() {
  const dispatch = useAppDispatch();
  const organization = useAppSelector(selectActiveOrganization);
  const enabled =
    organization !== null &&
    !organization.personal &&
    allows(organization, PERMISSION.FINANCE_READ);
  const organizationId = organization?.id;

  useEffect(() => {
    if (!enabled || !organizationId) {
      return;
    }
    dispatch(fetchFinanceBadges());
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") {
        dispatch(fetchFinanceBadges());
      }
    }, BADGE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [dispatch, enabled, organizationId]);
}

function NavBadge({
  kind,
  collapsed,
}: {
  kind: NonNullable<NavItem["badge"]>;
  collapsed: boolean;
}) {
  const { t } = useTranslation();
  const badges = useAppSelector(selectFinanceBadges);
  const count =
    kind === "approvals"
      ? badges.pendingApprovals
      : badges.unacknowledgedAlerts;
  const more =
    kind === "approvals" ? badges.more.approvals : badges.more.alerts;
  if (count === 0) {
    return null;
  }
  const label = more ? `${count}+` : String(count);
  return (
    <span
      className={cn(
        "grid min-w-5 place-items-center rounded-full bg-brand px-1.5 font-semibold text-2xs text-surface-deep tabular-nums",
        collapsed
          ? "absolute top-0.5 left-6 h-3.5 min-w-3.5 px-1"
          : "mr-2 ml-auto h-5",
      )}
      data-testid={`nav-badge-${kind}`}
    >
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">{t(`nav.badge.${kind}`, { count })}</span>
    </span>
  );
}

function NavRow({
  item,
  collapsed,
  end,
}: {
  item: NavItem;
  collapsed: boolean;
  end?: boolean;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const label = t(item.labelKey);
  const childActive = Boolean(
    item.children?.some((child) => child.to === pathname),
  );
  return (
    <Tooltip title={label} placement="right" disabled={!collapsed} delay={80}>
      <span className="block w-full">
        <NavLink
          to={item.to}
          end={end}
          onMouseEnter={() => preloadPage(item.to)}
          onFocus={() => preloadPage(item.to)}
          className={({ isActive }) =>
            cn(rowClass(isActive || childActive), "relative")
          }
        >
          <RowIcon icon={item.icon} />
          <Label collapsed={collapsed} className="pr-2.5">
            {label}
          </Label>
          {item.badge && <NavBadge kind={item.badge} collapsed={collapsed} />}
        </NavLink>
      </span>
    </Tooltip>
  );
}

function NavGroup({
  section,
  collapsed,
  titled,
}: {
  section: NavSection;
  collapsed: boolean;
  titled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-1">
      {titled && section.titleKey && (
        <Label
          collapsed={collapsed}
          className="block px-2.5 pt-2 pb-0.5 text-2xs text-ink-subtle uppercase tracking-wide"
        >
          {t(section.titleKey)}
        </Label>
      )}
      <div className="flex flex-col gap-0.5">
        {section.items.map((item) => (
          <NavRow
            key={`${item.to}:${item.labelKey}`}
            item={item}
            collapsed={collapsed}
            end={item.end}
          />
        ))}
      </div>
    </div>
  );
}

function ActionRow({
  icon,
  label,
  tooltip,
  onClick,
  collapsed,
}: {
  icon: LucideIcon;
  label: string;
  tooltip?: string;
  onClick: () => void;
  collapsed: boolean;
}) {
  return (
    <Tooltip
      title={tooltip ?? label}
      placement="right"
      disabled={!collapsed}
      delay={80}
    >
      <span className="block w-full">
        <button type="button" onClick={onClick} className={rowClass(false)}>
          <RowIcon icon={icon} />
          <Label collapsed={collapsed} className="pr-2.5">
            {label}
          </Label>
        </button>
      </span>
    </Tooltip>
  );
}

function AvatarMenu({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const displayName = useDisplayName();
  const organization = useAppSelector(selectActiveOrganization);
  const { hasTeamOrganizations } = useWorkspaceMode();

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={collapsed ? displayName : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-11 w-full items-center overflow-hidden rounded-lg text-left transition-[background-color,padding] duration-200 hover:bg-overlay/5",
          collapsed ? "pl-0" : "pl-1.5",
        )}
      >
        <span className="mr-1 grid h-11 w-9 shrink-0 place-items-center">
          <AvatarCircle />
        </span>
        <span
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1 pr-2 transition-opacity duration-200",
            collapsed ? "opacity-0" : "opacity-100",
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="min-w-0 truncate font-medium text-ink-strong text-sm">
              {displayName}
            </span>
            {organization && (
              <span
                className="min-w-0 truncate text-2xs text-ink-subtle"
                data-testid="active-organization"
              >
                {organization.name}
              </span>
            )}
          </span>
          <m.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.18 }}
            className="shrink-0 text-ink-subtle"
          >
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          </m.span>
        </span>
      </button>

      <Dropdown
        isOpen={open}
        anchorRef={anchorRef}
        placement="bottom"
        matchAnchorWidth={!collapsed}
        onClickOutside={() => setOpen(false)}
        autoFocus
        className="min-w-50 bg-surface-deep p-1"
      >
        <div id={menuId} role="menu" aria-label={displayName}>
          <OrganizationSwitcher
            showOrganizations={hasTeamOrganizations}
            onDone={() => setOpen(false)}
            onCreate={() => setCreating(true)}
          />
          <NavLink
            to="/settings/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2.5 py-2 text-ink-body text-sm outline-none hover:bg-overlay/10 focus-visible:bg-overlay/10 focus-visible:ring-1 focus-visible:ring-overlay/60 focus-visible:ring-inset"
          >
            <UserCog aria-hidden="true" className="h-4 w-4" />
            {t("sidebar.preferences")}
          </NavLink>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut({ redirectUrl: "/sign-in" });
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-ink-body text-sm outline-none hover:bg-overlay/10 focus-visible:bg-overlay/10 focus-visible:ring-1 focus-visible:ring-overlay/60 focus-visible:ring-inset"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            {t("sidebar.signOut")}
          </button>
        </div>
      </Dropdown>

      {creating && (
        <Suspense fallback={null}>
          <CreateOrganizationModal isOpen onClose={() => setCreating(false)} />
        </Suspense>
      )}
    </>
  );
}

function StaticBrand({ collapsed }: { collapsed: boolean }) {
  const displayName = useDisplayName();
  return (
    <div
      className={cn(
        "flex h-11 w-full items-center overflow-hidden rounded-lg transition-[padding] duration-200",
        collapsed ? "pl-0" : "pl-1.5",
      )}
    >
      <span className="mr-1 grid h-11 w-9 shrink-0 place-items-center">
        <AvatarCircle />
      </span>
      <Label
        collapsed={collapsed}
        className="pr-2 font-medium text-ink-strong text-sm"
      >
        {displayName}
      </Label>
    </div>
  );
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const inSettings = useLocation().pathname.startsWith("/settings");
  const navigate = useNavigate();
  const { copied, copy } = useCopyToClipboard();
  const currentUser = useAppSelector(selectUser);
  const profileUrl = currentUser?.username
    ? links.profile(currentUser.username)
    : null;

  const copyProfile = async () => {
    if (!profileUrl) {
      navigate("/settings/profile");
      return;
    }
    await copy(profileUrl);
  };

  const viewProfile = () => {
    if (!profileUrl) {
      navigate("/settings/profile");
      return;
    }
    window.open(profileUrl, "_blank", "noopener,noreferrer");
  };

  const [settled, setSettled] = useState(!collapsed);
  const organization = useAppSelector(selectActiveOrganization);
  const mode = useWorkspaceMode();
  const permitted = (permission: Permission) =>
    allows(organization, permission);
  const sections = resolveNav(
    inSettings ? SETTINGS_SECTIONS : NAV_SECTIONS,
    mode,
    permitted,
  );
  const showProjects = showsProjects(mode);
  useFinanceBadgeRefresh();

  useEffect(() => {
    if (collapsed) {
      setSettled(false);
    }
  }, [collapsed]);

  const copyLabel = copied
    ? t("sidebar.copied")
    : t("sidebar.copyPublicProfile");

  return (
    <m.aside
      initial={false}
      animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      transition={WIDTH_TRANSITION}
      onAnimationComplete={() => setSettled(!collapsed)}
      className="flex h-dvh shrink-0 flex-col overflow-hidden border-overlay/10 border-r bg-surface-deep"
    >
      <div className="flex flex-col gap-0.5 p-3">
        {inSettings ? (
          <>
            <div className="mb-2">
              <ActionRow
                icon={ArrowLeft}
                label={t("sidebar.backToApp")}
                onClick={() => navigate("/")}
                collapsed={collapsed}
              />
            </div>
            <StaticBrand collapsed={collapsed} />
          </>
        ) : (
          <AvatarMenu collapsed={collapsed} />
        )}
        <div className="mt-1 flex flex-col gap-1.5">
          {showProjects && <ProjectSwitcher collapsed={collapsed} />}
          <EnvironmentToggle collapsed={collapsed} />
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-3 pb-3">
        {sections.map((section, i) => (
          <NavGroup
            key={section.titleKey ?? `section-${i}`}
            section={section}
            collapsed={collapsed}
            titled={!inSettings || sections.length > 1}
          />
        ))}
      </nav>

      <div className="p-3">
        {!inSettings && (
          <>
            {!collapsed && settled && (
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
              >
                <SidebarBanners />
              </m.div>
            )}
            <div className="flex flex-col gap-0.5">
              <ActionRow
                icon={Eye}
                label={t("sidebar.viewPublicProfile")}
                onClick={viewProfile}
                collapsed={collapsed}
              />
              <ActionRow
                icon={copied ? Check : Copy}
                label={copyLabel}
                tooltip={copyLabel}
                onClick={copyProfile}
                collapsed={collapsed}
              />
              {FOOTER_ITEMS.map((item) => (
                <NavRow key={item.to} item={item} collapsed={collapsed} />
              ))}
            </div>
          </>
        )}
        <div className="mt-1 flex justify-end px-2.5">
          <Label
            collapsed={collapsed}
            className="font-medium text-ink-muted text-xs"
          >
            {t("sidebar.version", { version: __APP_VERSION__ })}
          </Label>
        </div>
      </div>
    </m.aside>
  );
}
