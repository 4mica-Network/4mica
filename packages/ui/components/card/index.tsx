import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

/**
 * Stacked by default: bottom border only, square bottom corners, so a run of
 * cards reads as one surface. Pass `border rounded-lg` for a standalone card.
 */
export const Card = ({ className, children, onClick, ...rest }: CardProps) => {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        {...(rest as HTMLAttributes<HTMLButtonElement>)}
        className={cn(
          "flex w-full flex-col gap-2.5 rounded-lg rounded-b-none border-overlay/10 border-b px-6 py-5 text-left",
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
        "flex flex-col gap-2.5 rounded-lg rounded-b-none border-overlay/10 border-b px-6 py-5",
        className,
      )}
    >
      {children}
    </div>
  );
};
