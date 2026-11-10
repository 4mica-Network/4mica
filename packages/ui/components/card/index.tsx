import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card = ({ className, children, onClick, ...rest }: CardProps) => {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        {...(rest as HTMLAttributes<HTMLButtonElement>)}
        className={cn(
          "w-full rounded-lg border border-overlay/10 bg-surface px-6 py-5 text-left",
          "cursor-pointer transition-colors hover:bg-overlay/5",
          className,
        )}
      >
        {children}
      </button>
    );
  }

  return (
    <div
      {...rest}
      className={cn(
        "rounded-lg border border-overlay/10 bg-surface px-6 py-5",
        className,
      )}
    >
      {children}
    </div>
  );
};
