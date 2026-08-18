import { type RefObject, useEffect } from "react";

/**
 * Selector for the elements a focus trap has to cycle through. `[tabindex="-1"]`
 * is excluded because those are programmatically focusable but not tab stops.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Attribute-based, deliberately not layout-based.
 *
 * The obvious check here is `offsetParent !== null`, and it is wrong: per spec
 * `offsetParent` is null for an element inside a `position: fixed` ancestor,
 * which the modal panel always is. That filter would strip every candidate and
 * leave the trap with nothing to cycle, disabling Tab inside the dialog. This
 * also keeps the hook working under jsdom, which performs no layout at all.
 */
const isHidden = (element: HTMLElement): boolean =>
  element.closest("[hidden]") !== null ||
  element.getAttribute("aria-hidden") === "true";

const focusableWithin = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !isHidden(element),
  );

export interface ModalA11yOptions {
  isOpen: boolean;
  panelRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  disableEscapeClose?: boolean;
}

/**
 * Everything a portalled dialog needs that the platform does not give us:
 * focus trap, Escape, background scroll lock, and focus restore.
 *
 * Deliberately not exported from the package barrel — `scripts/preserve-use-client`
 * marks any built chunk whose source names a `use*` identifier, so a hook in the
 * barrel would stamp `"use client"` on dist/index.js and drag every server-safe
 * export along with it.
 */
export const useModalA11y = ({
  isOpen,
  panelRef,
  onClose,
  disableEscapeClose = false,
}: ModalA11yOptions): void => {
  // Scroll lock. Restores the caller's own overflow rather than clearing it, so
  // nesting a modal inside an already-locked page does not unlock the page.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  // Move focus in on open, put it back where it came from on close.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const returnTo = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    if (panel) {
      const [first] = focusableWithin(panel);
      (first ?? panel).focus();
    }

    return () => {
      returnTo?.focus?.();
    };
  }, [isOpen, panelRef]);

  // Escape to close, and Tab cycling clamped to the panel.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !disableEscapeClose) {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const focusable = focusableWithin(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      // Wrap at both ends, and pull focus back in if it escaped the panel
      // entirely (browser chrome, or a click on the overlay).
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, disableEscapeClose, onClose, panelRef]);
};
