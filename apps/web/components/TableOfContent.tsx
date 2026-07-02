"use client";

import { useEffect, useRef, useState } from "react";

export type TocItem = { id: string; text: string };

const SCROLL_OFFSET = 110;

export default function TableOfContent({ toc }: { toc: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>(toc[0]?.id ?? "");
  const isScrollingRef = useRef(false);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror activeId in a ref so the scroll listener can read it without being a
  // dependency of the effect — otherwise the listener tears down and re-attaches
  // on every active-section change.
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (isScrollingRef.current) return;

      const scrollPosition = window.scrollY + SCROLL_OFFSET;
      let currentSectionId = "";

      if (window.scrollY === 0 && toc.length > 0) {
        currentSectionId = toc[0].id;
      } else {
        for (const { id } of toc) {
          const element = document.getElementById(id);
          if (element && element.offsetTop <= scrollPosition) {
            currentSectionId = id;
          }
        }
      }

      if (currentSectionId && currentSectionId !== activeIdRef.current) {
        setActiveId(currentSectionId);
        window.history.replaceState(null, "", `#${currentSectionId}`);
      }
    };

    // Coalesce scroll events into one layout-read per frame to avoid thrash.
    const handleScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    measure();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [toc]);

  const handleClick = (
    event: React.MouseEvent<HTMLAnchorElement>,
    id: string,
  ) => {
    event.preventDefault();
    setActiveId(id);
    isScrollingRef.current = true;

    const target = document.getElementById(id);
    if (target) {
      const targetTop =
        target.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
      window.scrollTo({ top: targetTop, behavior: "smooth" });
      window.history.pushState(null, "", `#${id}`);
    }

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
    }, 1000);
  };

  if (toc.length === 0) return null;

  return (
    <aside className="hidden h-fit w-56 shrink-0 lg:sticky lg:top-28 lg:block">
      <h5 className="mb-4 font-medium text-ink-strong text-md">
        Table of Contents
      </h5>
      <div className="relative">
        <div className="absolute top-0 bottom-0 left-[3px] w-px bg-overlay/10" />
        <ul className="list-inside space-y-2 pl-4">
          {toc.map(({ id, text }) => (
            <li key={id} className="relative">
              {activeId === id && (
                <div className="absolute top-1/2 left-[-14px] h-full w-[3px] -translate-y-1/2 rounded-full bg-overlay" />
              )}
              <a
                href={`#${id}`}
                onClick={(event) => handleClick(event, id)}
                className={`text-md transition-colors hover:text-ink-strong ${
                  activeId === id ? "text-ink-strong" : "text-ink-muted"
                }`}
              >
                {text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
