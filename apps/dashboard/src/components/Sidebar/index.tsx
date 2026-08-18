import { cn, Dropdown, Tooltip } from "@4mica/ui";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useAppSelector } from "@stores/hooks";
import { selectUser } from "@stores/user/selector";
import { motion } from "framer-motion";
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
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { links } from "@/lib/links";
import { FOOTER_ITEMS, NAV_SECTIONS, type NavItem, SETTINGS_NAV } from "@/nav";

const EXPANDED_WIDTH = 256;
const COLLAPSED_WIDTH = 60;
const WIDTH_TRANSITION = { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const };

const rowClass = (active: boolean) =>
  cn(
    "flex h-9 w-full items-center overflow-hidden rounded-md font-medium text-sm transition-colors",
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

function AvatarCircle() {
  const { t } = useTranslation();
  const { user } = useUser();

  if (user?.imageUrl) {
    return (
      <img
        src={user.imageUrl}
        alt=""
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-overlay/15 font-semibold text-sm text-white">
      {t("monogram")}
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
  const label = t(item.labelKey);
  return (
    <Tooltip title={label} placement="right" disabled={!collapsed} delay={80}>
      <span className="block w-full">
        <NavLink
          to={item.to}
          end={end}
          className={({ isActive }) => rowClass(isActive)}
        >
          <RowIcon icon={item.icon} />
          <Label collapsed={collapsed} className="pr-2.5">
            {label}
          </Label>
        </NavLink>
      </span>
    </Tooltip>
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
  const { user } = useUser();
  const currentUser = useAppSelector(selectUser);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const displayName =
    currentUser?.name ??
    currentUser?.email ??
    user?.fullName ??
    user?.primaryEmailAddress?.emailAddress ??
    t("org");

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center overflow-hidden rounded-lg text-left transition-colors hover:bg-overlay/5"
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
          <span className="min-w-0 truncate font-medium text-ink-strong text-sm">
            {displayName}
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.18 }}
            className="shrink-0 text-ink-subtle"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </span>
      </button>

      <Dropdown
        isOpen={open}
        anchorRef={anchorRef}
        placement="bottom"
        matchAnchorWidth={!collapsed}
        onClickOutside={() => setOpen(false)}
        className="min-w-50 bg-surface-deep p-1"
      >
        <NavLink
          to="/settings/profile"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-ink-body text-sm hover:bg-overlay/10"
        >
          <UserCog className="h-4 w-4" />
          {t("sidebar.preferences")}
        </NavLink>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            void signOut({ redirectUrl: "/sign-in" });
          }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-ink-body text-sm hover:bg-overlay/10"
        >
          <LogOut className="h-4 w-4" />
          {t("sidebar.signOut")}
        </button>
      </Dropdown>
    </>
  );
}

function StaticBrand({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-11 w-full items-center overflow-hidden rounded-lg">
      <span className="grid h-11 w-9 shrink-0 place-items-center">
        <AvatarCircle />
      </span>
      <Label
        collapsed={collapsed}
        className="pr-2 font-medium text-ink-strong text-sm"
      >
        {t("org")}
      </Label>
    </div>
  );
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const inSettings = useLocation().pathname.startsWith("/settings");
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const currentUser = useAppSelector(selectUser);

  // Null until the user loads and picks a handle in Settings → Profile. Both
  // actions fall back to that page rather than linking to a profile that
  // cannot exist.
  const profileUrl = currentUser?.username
    ? links.profile(currentUser.username)
    : null;

  const copyProfile = async () => {
    if (!profileUrl) {
      navigate("/settings/profile");
      return;
    }
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const viewProfile = () => {
    if (!profileUrl) {
      navigate("/settings/profile");
      return;
    }
    window.open(profileUrl, "_blank", "noopener,noreferrer");
  };

  const copyLabel = copied
    ? t("sidebar.copied")
    : t("sidebar.copyPublicProfile");

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      transition={WIDTH_TRANSITION}
      className="flex h-screen shrink-0 flex-col overflow-hidden border-overlay/10 border-r bg-surface-deep"
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
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-3 pb-3">
        {inSettings
          ? SETTINGS_NAV.map((item) => (
              <NavRow key={item.to} item={item} collapsed={collapsed} />
            ))
          : NAV_SECTIONS.map((section, i) => (
              <div key={section.titleKey ?? `section-${i}`} className="mb-1">
                {section.titleKey && (
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
                      key={item.to}
                      item={item}
                      collapsed={collapsed}
                      end={item.end}
                    />
                  ))}
                </div>
              </div>
            ))}
      </nav>

      <div className="p-3">
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
          {FOOTER_ITEMS.filter(
            (item) => !(inSettings && item.to === "/settings"),
          ).map((item) => (
            <NavRow key={item.to} item={item} collapsed={collapsed} />
          ))}
        </div>
        <div className="mt-1 flex justify-end px-2.5">
          <Label
            collapsed={collapsed}
            className="font-medium text-ink-muted text-xs"
          >
            {t("sidebar.version", { version: __APP_VERSION__ })}
          </Label>
        </div>
      </div>
    </motion.aside>
  );
}
