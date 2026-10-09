import type { Ref, RefCallback } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export const LAYER_ATTRIBUTE = "data-dismissable-layer";

const isHidden = (element: HTMLElement): boolean =>
  element.closest("[hidden]") !== null ||
  element.getAttribute("aria-hidden") === "true";

export const focusableWithin = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !isHidden(element),
  );

export const firstFocusable = (root: HTMLElement | null): HTMLElement | null =>
  root
    ? root.matches(FOCUSABLE)
      ? root
      : (focusableWithin(root)[0] ?? null)
    : null;

export const isInsideLayer = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(`[${LAYER_ATTRIBUTE}]`) !== null;

export const joinIds = (...ids: (string | undefined)[]): string | undefined =>
  ids.filter(Boolean).join(" ") || undefined;

export const isOpenKey = (key: string): boolean =>
  key === "ArrowDown" || key === "ArrowUp";

export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref && typeof ref === "object") {
        (ref as { current: T | null }).current = value;
      }
    }
  };
}
