"use client";

import Link from "next/link";
import { useState } from "react";
import DropdownMenuItem from "./DropdownMenuItem";
import { NAV_ITEMS } from "./navData";

export default function MobileNav({ onNavigate }: { onNavigate: () => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (label: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  return (
    <div className="space-y-1">
      {NAV_ITEMS.map((item) =>
        item.children ? (
          <div key={item.label}>
            <button
              type="button"
              onClick={() => toggle(item.label)}
              className="flex w-full items-center justify-between rounded-lg p-3 font-medium text-ink-strong transition-colors hover:bg-overlay/5"
            >
              <span>{item.label}</span>
              <i
                className={`ri-arrow-down-s-line text-ink-muted text-xl transition-transform duration-200 ${
                  open.has(item.label) ? "-rotate-180" : ""
                }`}
              />
            </button>
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                open.has(item.label)
                  ? "max-h-[1400px] opacity-100"
                  : "max-h-0 opacity-0"
              }`}
            >
              <div className="space-y-0.5 py-1">
                {item.children
                  .flatMap((section) => section.items)
                  .map((subItem) => (
                    <DropdownMenuItem
                      key={subItem.title}
                      item={subItem}
                      onClick={onNavigate}
                    />
                  ))}
              </div>
            </div>
          </div>
        ) : (
          <Link
            key={item.label}
            href={item.href ?? "#"}
            onClick={onNavigate}
            className="flex w-full items-center rounded-lg p-3 font-medium text-ink-strong transition-colors hover:bg-overlay/5"
          >
            {item.label}
          </Link>
        ),
      )}
    </div>
  );
}
