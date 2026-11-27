"use client";

import { cn } from "@4mica/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";

export interface AppBarProps {
  title?: string;
  nav?: ReactNode;
  actions?: ReactNode;
  account?: ReactNode;
  accountOnMobile?: boolean;
}

export function AppBar({
  title,
  nav,
  actions,
  account,
  accountOnMobile = true,
}: AppBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [showTitle, setShowTitle] = useState(false);

  useEffect(() => {
    const heading = barRef.current?.parentElement?.querySelector("h1");
    if (!heading || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setShowTitle(!entry.isIntersecting),
      { rootMargin: "-56px 0px 0px 0px" },
    );
    observer.observe(heading);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="sticky top-0 z-30 border-overlay/10 border-b bg-surface-deep pt-[env(safe-area-inset-top)] md:contents"
      data-app-bar
      ref={barRef}
    >
      <div className="flex h-14 items-center gap-2 pr-2 pl-4 md:contents">
        {nav && (
          <div className="min-w-0 max-w-[45%] shrink-0 md:absolute md:top-6 md:left-8 md:z-20 md:max-w-none">
            {nav}
          </div>
        )}

        <p
          aria-hidden="true"
          className={cn(
            "min-w-0 flex-1 truncate font-semibold text-ink-strong text-sm transition-opacity duration-200 motion-reduce:transition-none md:hidden",
            showTitle ? "opacity-100" : "opacity-0",
          )}
        >
          {title}
        </p>

        <div className="flex shrink-0 items-center gap-1 md:contents">
          {actions && (
            <div className="max-md:contents md:flex md:justify-end">
              {actions}
            </div>
          )}
          {account && (
            <div
              className={cn(
                "max-md:contents md:absolute md:top-6 md:right-8 md:z-20 md:flex md:justify-end",
                !accountOnMobile && "max-md:hidden",
              )}
            >
              {account}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
