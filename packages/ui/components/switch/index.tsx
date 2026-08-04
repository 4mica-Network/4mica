import { cva } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { useEffect, useState } from "react";
import { cn } from "../../lib/cn";

export interface SwitchColors {
  backgroundOn?: string;
  backgroundOff?: string;
  circleOn?: string;
  circleOff?: string;
}

export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onToggle" | "type"> {
  initialState?: boolean;
  disabled?: boolean;
  colors?: SwitchColors;
  onToggle?: (state: boolean) => void;
  "data-testid"?: string;
}

const outer = cva(
  [
    "flex",
    "items-center",
    "rounded-full",
    "h-[24px]",
    "w-[44px]",
    "p-[2px]",
    "shrink-0",
    "transition-colors",
    "duration-300",
    "outline-none",
    "focus-visible:ring-2",
    "focus-visible:ring-overlay/40",
    "focus-visible:ring-offset-2",
    "focus-visible:ring-offset-surface-deep",
  ],
  {
    variants: {
      disabled: {
        true: "cursor-not-allowed opacity-50",
        false: "cursor-pointer",
      },
    },
    defaultVariants: { disabled: false },
  },
);

const circle = cva(
  [
    "h-[20px]",
    "w-[20px]",
    "rounded-full",
    "shadow-md",
    "transform",
    "transition-transform",
    "duration-300",
  ],
  {
    variants: {
      isOn: {
        true: "translate-x-[20px]",
        false: "translate-x-0",
      },
    },
  },
);

// Theme tokens rather than fixed hex, so the control tracks light and dark.
const DEFAULT_COLORS: Required<SwitchColors> = {
  backgroundOn: "rgb(var(--ink-strong))",
  backgroundOff: "rgb(var(--overlay) / 0.25)",
  circleOn: "rgb(var(--surface-deep))",
  circleOff: "rgb(var(--surface-deep))",
};

export const Switch = ({
  initialState = false,
  disabled = false,
  colors,
  className,
  onToggle,
  ...props
}: SwitchProps) => {
  const [isOn, setIsOn] = useState(initialState);
  const palette = { ...DEFAULT_COLORS, ...colors };

  const prefix = props["data-testid"]
    ? `${props["data-testid"]}-switch`
    : "switch";

  useEffect(() => {
    setIsOn(initialState);
  }, [initialState]);

  const handleToggle = () => {
    if (disabled) {
      return;
    }
    const next = !isOn;
    setIsOn(next);
    onToggle?.(next);
  };

  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={isOn}
      disabled={disabled}
      onClick={handleToggle}
      className={cn(outer({ disabled }), className)}
      style={{
        backgroundColor: isOn ? palette.backgroundOn : palette.backgroundOff,
      }}
      data-testid={prefix}
      data-state={isOn ? "on" : "off"}
    >
      <span
        className={circle({ isOn })}
        style={{
          backgroundColor: isOn ? palette.circleOn : palette.circleOff,
        }}
        data-testid={`${prefix}-thumb`}
      />
    </button>
  );
};

export default Switch;
