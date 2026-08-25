import type { KeyboardEventHandler } from "react";
import { cn } from "../../lib/cn";
import { useTabContext } from "./context";
import type { Tab as TabType } from "./type";

export interface TabProps {
  tab: TabType;
  disabled?: boolean;
  onClick?: () => void;
  "data-testid"?: string;
}

export const Tab = ({ tab, disabled, onClick, ...props }: TabProps) => {
  const { activeTab, setActiveTab } = useTabContext();
  const isActive = activeTab === tab.id;
  const isDisabled = disabled ?? tab.disabled ?? false;

  const handleClick = () => {
    if (isDisabled) return;
    if (onClick) onClick();
    else setActiveTab(tab.id);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLButtonElement> = (e) => {
    if (isDisabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  const prefix = props["data-testid"]
    ? `${props["data-testid"]}-tab-${tab.id}`
    : `tab-${tab.id}`;

  return (
    <button
      type="button"
      role="tab"
      id={`tab-${tab.id}`}
      aria-selected={isActive}
      aria-controls={`panel-${tab.id}`}
      aria-disabled={isDisabled}
      disabled={isDisabled}
      tabIndex={isDisabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      title={isDisabled ? "Unavailable" : undefined}
      className={cn(
        "relative rounded-md px-2 py-1 text-ink-muted text-sm transition-colors duration-300 hover:text-ink-strong focus:outline-none",
        isActive && "bg-overlay/10 text-ink-strong",
        isDisabled && "cursor-not-allowed opacity-50 hover:text-ink-muted",
      )}
      {...props}
      data-testid={prefix}
      data-state={isActive ? "active" : "inactive"}
    >
      {tab.label}
    </button>
  );
};

Tab.displayName = "Tab";

export default Tab;
