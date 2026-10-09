import { Button, cn, Dropdown } from "@4mica/ui";
import { type LucideIcon, MoreHorizontal } from "lucide-react";
import {
  createContext,
  type ReactNode,
  use,
  useId,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";

const ITEM_CLASS =
  "flex items-center gap-2 px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-overlay/5 focus-visible:bg-overlay/10";

type Tone = "default" | "danger";

const TONE_CLASS: Record<Tone, string> = {
  default: "text-ink-body",
  danger: "text-danger",
};

const CloseContext = createContext<() => void>(() => {});

function Root({
  label,
  disabled,
  width = "w-60",
  children,
  "data-testid": testId,
}: {
  label: string;
  disabled?: boolean;
  width?: string;
  children: ReactNode;
  "data-testid"?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = () => {
    setIsOpen(false);
    trigger.current?.focus();
  };

  return (
    <>
      <Button
        ref={trigger}
        intent="ghost"
        size="sm"
        className="btn-no-lift px-2"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        data-testid={testId}
      >
        <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
      </Button>

      {isOpen && (
        <Dropdown
          isOpen
          anchorRef={trigger}
          placement="bottomRight"
          onClickOutside={close}
          autoFocus
        >
          <div
            id={menuId}
            role="menu"
            aria-label={label}
            className={cn("flex flex-col py-1", width)}
          >
            <CloseContext value={close}>{children}</CloseContext>
          </div>
        </Dropdown>
      )}
    </>
  );
}

function ItemContent({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <>
      <Icon aria-hidden="true" className="h-4 w-4" />
      {children}
    </>
  );
}

function Item({
  icon,
  tone = "default",
  disabled,
  onSelect,
  children,
  "data-testid": testId,
}: {
  icon: LucideIcon;
  tone?: Tone;
  disabled?: boolean;
  onSelect: () => void;
  children: ReactNode;
  "data-testid"?: string;
}) {
  const close = use(CloseContext);
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        ITEM_CLASS,
        disabled ? "cursor-not-allowed opacity-50" : TONE_CLASS[tone],
      )}
      disabled={disabled}
      onClick={() => {
        close();
        onSelect();
      }}
      data-testid={testId}
    >
      <ItemContent icon={icon}>{children}</ItemContent>
    </button>
  );
}

function RouteItem({
  icon,
  to,
  children,
  "data-testid": testId,
}: {
  icon: LucideIcon;
  to: string;
  children: ReactNode;
  "data-testid"?: string;
}) {
  const close = use(CloseContext);
  return (
    <Link
      role="menuitem"
      className={cn(ITEM_CLASS, TONE_CLASS.default)}
      to={to}
      onClick={close}
      data-testid={testId}
    >
      <ItemContent icon={icon}>{children}</ItemContent>
    </Link>
  );
}

function ExternalItem({
  icon,
  href,
  children,
  "data-testid": testId,
}: {
  icon: LucideIcon;
  href: string;
  children: ReactNode;
  "data-testid"?: string;
}) {
  const close = use(CloseContext);
  return (
    <a
      role="menuitem"
      className={cn(ITEM_CLASS, TONE_CLASS.default)}
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={close}
      data-testid={testId}
    >
      <ItemContent icon={icon}>{children}</ItemContent>
    </a>
  );
}

export const RowActionsMenu = Object.assign(Root, {
  Item,
  RouteItem,
  ExternalItem,
});
