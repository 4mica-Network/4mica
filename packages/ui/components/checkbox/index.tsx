import { cva, type VariantProps } from "class-variance-authority";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

const checkboxStyles = cva(
  [
    "relative flex flex-shrink-0 items-center justify-center transition-colors duration-200",
    "h-5 w-5",
  ],
  {
    variants: {
      variant: {
        rounded: "rounded-full",
        square: "rounded-md",
      },
      checked: {
        true: "bg-ink-strong text-surface-deep",
        false: "border border-overlay/20 bg-transparent text-transparent",
      },
      disabled: {
        true: "pointer-events-none opacity-50",
        false: "",
      },
    },
    defaultVariants: {
      variant: "rounded",
      checked: false,
      disabled: false,
    },
  },
);

export type CheckboxProps = {
  className?: string;
  labelClassName?: string;
  checked?: boolean;
  disabled?: boolean;
  name?: string;
  children?: ReactNode;
  onChange?: (checked: boolean) => void;
  "data-testid"?: string;
} & VariantProps<typeof checkboxStyles>;

export const Checkbox = ({
  className,
  labelClassName,
  checked = false,
  disabled = false,
  children,
  variant = "rounded",
  name,
  onChange,
  ...props
}: CheckboxProps) => {
  const prefix = props["data-testid"]
    ? `${props["data-testid"]}-checkbox`
    : "checkbox";

  return (
    <button
      type="button"
      role="checkbox"
      name={name}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-overlay/40",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      data-testid={prefix}
    >
      <span
        className={checkboxStyles({ variant, checked, disabled })}
        data-testid={`${prefix}-box`}
      >
        <AnimatePresence>
          {checked && (
            <motion.span
              key="check-icon"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center justify-center"
              data-testid={`${prefix}-icon`}
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>

      {children && (
        <span
          className={cn("text-ink-body text-sm", labelClassName)}
          data-testid={`${prefix}-label`}
        >
          {children}
        </span>
      )}
    </button>
  );
};

Checkbox.displayName = "Checkbox";
