import { cn, Dropdown, Tooltip } from "@4mica/ui";
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
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { FOOTER_ITEMS, NAV_SECTIONS, type NavItem, SETTINGS_NAV } from "../nav";

const EXPANDED_WIDTH = 256;
const COLLAPSED_WIDTH = 68;
const WIDTH_TRANSITION = { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const };
const PUBLIC_PROFILE_URL = "https://4mica.io/@4mica-workspace";

const rowClass = (active: boolean) =>
  cn(
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 font-medium text-sm transition-colors",
    active
      ? "bg-overlay/10 text-ink-strong"
      : "text-ink-muted hover:bg-overlay/5 hover:text-ink-body",
  );

/** Label that fades (rather than unmounts) so collapse/expand stays smooth. */
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
        "truncate transition-opacity duration-200",
        collapsed ? "opacity-0" : "opacity-100",
        className,
      )}
    >
      {children}
    </span>
  );
}

function AvatarCircle() {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-overlay/15 font-semibold text-sm text-white">
      4M
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
  const Icon = item.icon;
  return (
    <Tooltip
      title={item.label}
      placement="right"
      disabled={!collapsed}
      delay={80}
    >
      <span className="block w-full">
        <NavLink
          to={item.to}
          end={end}
          className={({ isActive }) => rowClass(isActive)}
        >
          <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
          <Label collapsed={collapsed}>{item.label}</Label>
        </NavLink>
      </span>
    </Tooltip>
  );
}

function ActionRow({
  icon: Icon,
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
          <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
          <Label collapsed={collapsed}>{label}</Label>
        </button>
      </span>
    </Tooltip>
  );
}

/** Main-mode workspace switcher: avatar + name + chevron opening a dropdown. */
function AvatarMenu({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-overlay/5"
      >
        <AvatarCircle />
        <span
          className={cn(
            "flex min-w-0 items-center gap-1 transition-opacity duration-200",
            collapsed ? "opacity-0" : "opacity-100",
          )}
        >
          <span className="truncate font-medium text-ink-strong text-sm">
            4Mica Workspace
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
        className="min-w-50 p-1"
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

/** Settings-mode header: static avatar + name, no chevron/dropdown. */
function StaticBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg p-2">
      <AvatarCircle />
      <Label
        collapsed={collapsed}
        className="font-medium text-ink-strong text-sm"
      >
        4Mica Workspace
      </Label>
    </div>
  );
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const inSettings = useLocation().pathname.startsWith("/settings");
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const copyProfile = async () => {
    try {
      await navigator.clipboard.writeText(PUBLIC_PROFILE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — ignore.
    }
  };

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
            <ActionRow
              icon={ArrowLeft}
              label="Back to app"
              onClick={() => navigate("/")}
              collapsed={collapsed}
            />
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
              <div key={section.title ?? `section-${i}`} className="mb-1">
                {section.title && (
                  <Label
                    collapsed={collapsed}
                    className="block px-2.5 pt-2 pb-0.5 text-2xs text-ink-subtle uppercase tracking-wide"
                  >
                    {section.title}
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
            label="View public profile"
            onClick={() => navigate("/settings/4mica-profile")}
            collapsed={collapsed}
          />
          <ActionRow
            icon={copied ? Check : Copy}
            label={copied ? "Copied!" : "Copy public profile"}
            tooltip={copied ? "Copied!" : "Copy public profile"}
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
            v{__APP_VERSION__}
          </Label>
        </div>
      </div>
    </motion.aside>
  );
}
