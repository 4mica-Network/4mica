"use client";

import { cn } from "@4mica/ui";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import NavDropdown from "./NavDropdown";
import { NAV_ITEMS } from "./navData";

const panelBase =
  "absolute top-full left-0 z-50 pt-2 transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100";

export default function DesktopNav() {
  const [open, setOpen] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) {
        setOpen(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(null);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <nav ref={navRef} className="hidden items-center gap-1 md:flex">
      {NAV_ITEMS.map((item) =>
        item.children ? (
          <div
            key={item.label}
            className="group relative"
            data-open={open === item.label ? "" : undefined}
          >
            <button
              type="button"
              aria-expanded={open === item.label}
              aria-haspopup="true"
              onClick={() =>
                setOpen((current) =>
                  current === item.label ? null : item.label,
                )
              }
              className="flex items-center gap-1 rounded-md px-3 py-2 font-medium text-ink-body text-md transition-colors group-hover:text-ink-strong group-data-open:text-ink-strong"
            >
              {item.label}
              <i className="ri-arrow-down-s-line text-md transition-transform duration-200 group-hover:rotate-180 group-data-open:rotate-180" />
            </button>
            <div
              className={cn(
                panelBase,
                open === item.label
                  ? "visible translate-y-0 opacity-100"
                  : "invisible translate-y-1 opacity-0",
                item.align === "left"
                  ? "lg:left-1/2 lg:-translate-x-1/4"
                  : "lg:left-1/2 lg:-translate-x-1/2",
              )}
            >
              <NavDropdown
                sections={item.children}
                onItemClick={() => setOpen(null)}
              />
            </div>
          </div>
        ) : (
          <Link
            key={item.label}
            href={item.href ?? "#"}
            className="rounded-md px-3 py-2 font-medium text-ink-body text-md transition-colors hover:text-ink-strong"
          >
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
