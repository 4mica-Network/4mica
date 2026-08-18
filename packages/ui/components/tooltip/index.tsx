import type React from "react";
import {
  type ButtonHTMLAttributes,
  cloneElement,
  type HTMLAttributes,
  isValidElement,
  type ReactElement,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

type Placement =
  | "top"
  | "topRight"
  | "topLeft"
  | "bottom"
  | "bottomRight"
  | "bottomLeft"
  | "left"
  | "right"
  | "center";

type Trigger = "hover" | "manual";

export interface TooltipProps {
  title?: string;
  content?: ReactNode;
  placement?: Placement;
  delay?: number;
  disabled?: boolean;
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  trigger?: Trigger;
  interactive?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type HTMLElementish = HTMLElement & { focus?: () => void };

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (value: T) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") ref(value);
      else (ref as React.MutableRefObject<T | null>).current = value;
    }
  };
}

function useStableEvent<TArgs extends unknown[]>(
  fn: ((...args: TArgs) => void) | undefined,
) {
  const ref = useRef<typeof fn>(fn);
  useEffect(() => {
    ref.current = fn;
  }, [fn]);
  return useCallback((...args: TArgs) => {
    ref.current?.(...args);
  }, []);
}

function isNativeElement(el: ReactElement): boolean {
  return typeof el.type === "string";
}

function TipBubble({
  anchor,
  node,
  placement = "top",
  visible,
  id,
  interactive = false,
  onBubbleMouseEnter,
  onBubbleMouseLeave,
}: {
  anchor: HTMLElementish | null;
  node: ReactNode;
  placement?: Placement;
  visible: boolean;
  id: string;
  interactive?: boolean;
  onBubbleMouseEnter?: () => void;
  onBubbleMouseLeave?: () => void;
}) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: -9999,
    left: -9999,
  });

  const update = useCallback(() => {
    if (!anchor || !bubbleRef.current) return;
    const rect = anchor.getBoundingClientRect();
    const tipRect = bubbleRef.current.getBoundingClientRect();
    const offset = 10;

    let top = 0;
    let left = 0;

    switch (placement) {
      case "top":
        top = rect.top - tipRect.height - offset;
        left = rect.left + rect.width / 2 - tipRect.width / 2;
        break;
      case "topRight":
        top = rect.top - tipRect.height - offset;
        left = rect.right - tipRect.width;
        break;
      case "topLeft":
        top = rect.top - tipRect.height - offset;
        left = rect.left;
        break;
      case "bottom":
        top = rect.bottom + offset;
        left = rect.left + rect.width / 2 - tipRect.width / 2;
        break;
      case "bottomRight":
        top = rect.bottom + offset;
        left = rect.right - tipRect.width;
        break;
      case "bottomLeft":
        top = rect.bottom + offset;
        left = rect.left;
        break;
      case "left":
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.left - tipRect.width - offset;
        break;
      case "right":
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.right + offset;
        break;
      case "center":
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.left + rect.width / 2 - tipRect.width / 2;
        break;
    }
    setPos({ top, left });
  }, [anchor, placement]);

  useEffect(() => {
    if (!visible) return;
    update();
    const onScroll = () => update();
    const onResize = () => update();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    const rafId = requestAnimationFrame(update);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafId);
    };
  }, [visible, update]);

  if (!visible) return null;

  return createPortal(
    <div
      id={id}
      ref={bubbleRef}
      role="tooltip"
      className={cn(
        "wrap-break-word fixed z-50 max-w-[min(320px,calc(100vw-24px))] whitespace-normal rounded-md border border-border bg-popover px-2.5 py-1.5 text-popover-foreground text-xs leading-relaxed shadow-md transition-opacity duration-150 ease-out",
        interactive ? "pointer-events-auto" : "pointer-events-none",
        visible ? "opacity-100" : "opacity-0",
      )}
      style={{ top: pos.top, left: pos.left }}
      onMouseEnter={interactive ? onBubbleMouseEnter : undefined}
      onMouseLeave={interactive ? onBubbleMouseLeave : undefined}
    >
      {node}
    </div>,
    document.body,
  );
}

export function Tooltip({
  title,
  content,
  placement = "top",
  delay = 200,
  disabled = false,
  children,
  onOpenChange,
  open,
  defaultOpen = false,
  trigger = "hover",
  interactive = false,
}: TooltipProps) {
  const tooltipId = useId().replace(/:/g, "_");
  const anchorRef = useRef<HTMLElementish | null>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = typeof open === "boolean";
  const currentOpen = isControlled ? open : uncontrolledOpen;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emitOpenChange = useStableEvent(onOpenChange);

  const setOpenSafe = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      emitOpenChange?.(next);
    },
    [isControlled, emitOpenChange],
  );

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const show = useCallback(() => {
    if (disabled || trigger !== "hover") return;
    clearTimer();
    timerRef.current = setTimeout(() => setOpenSafe(true), delay);
  }, [delay, disabled, trigger, setOpenSafe]);

  const hide = useCallback(() => {
    if (trigger !== "hover") return;
    clearTimer();
    setOpenSafe(false);
  }, [trigger, setOpenSafe]);

  useEffect(() => {
    if (!currentOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && trigger === "hover") hide();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [currentOpen, hide, trigger]);

  const composedChild = useMemo(() => {
    const wrap = (node: ReactNode) => {
      const isInteractive = trigger === "hover";
      return (
        // biome-ignore lint/a11y/noStaticElementInteractions: <TODO: fix this>
        <span
          ref={anchorRef}
          onMouseEnter={isInteractive ? show : undefined}
          onMouseLeave={isInteractive ? hide : undefined}
          onFocus={isInteractive ? show : undefined}
          onBlur={isInteractive ? hide : undefined}
          tabIndex={isInteractive ? (disabled ? -1 : 0) : undefined}
          aria-describedby={currentOpen ? tooltipId : undefined}
          aria-disabled={disabled || undefined}
          className="inline-block align-middle"
        >
          {node}
        </span>
      );
    };

    if (!isValidElement(children)) return wrap(children);

    type NativeProps = HTMLAttributes<HTMLElement> & {
      ref?: Ref<HTMLElement>;
      tabIndex?: number;
    };

    const child = children as ReactElement<NativeProps>;
    const isNative = isNativeElement(child);

    const isDisabledButton =
      isNative &&
      child.type === "button" &&
      Boolean(
        (child.props as ButtonHTMLAttributes<HTMLButtonElement>).disabled,
      );

    if (!isNative || isDisabledButton) {
      return wrap(child);
    }

    const {
      onMouseEnter: childOnMouseEnter,
      onMouseLeave: childOnMouseLeave,
      onFocus: childOnFocus,
      onBlur: childOnBlur,
      ref: childRef,
      ...rest
    } = child.props;

    const isInteractive = trigger === "hover";

    return cloneElement(child, {
      ...rest,
      ref: mergeRefs(childRef, anchorRef),
      onMouseEnter: isInteractive
        ? (e: ReactMouseEvent<HTMLElement>) => {
            childOnMouseEnter?.(e);
            show();
          }
        : childOnMouseEnter,
      onMouseLeave: isInteractive
        ? (e: ReactMouseEvent<HTMLElement>) => {
            childOnMouseLeave?.(e);
            hide();
          }
        : childOnMouseLeave,
      onFocus: isInteractive
        ? (e: ReactFocusEvent<HTMLElement>) => {
            childOnFocus?.(e);
            show();
          }
        : childOnFocus,
      onBlur: isInteractive
        ? (e: ReactFocusEvent<HTMLElement>) => {
            childOnBlur?.(e);
            hide();
          }
        : childOnBlur,
      tabIndex: isInteractive
        ? (rest.tabIndex ?? (disabled ? -1 : 0))
        : rest.tabIndex,
      "aria-describedby": currentOpen ? tooltipId : undefined,
      "aria-disabled": disabled || undefined,
    });
  }, [children, disabled, hide, show, trigger, currentOpen, tooltipId]);

  useEffect(() => {
    if (disabled && currentOpen) setOpenSafe(false);
  }, [disabled, currentOpen, setOpenSafe]);

  const node = content ?? title;

  const bubbleEnter = useCallback(() => {
    if (trigger === "hover" && interactive) {
      clearTimer();
      setOpenSafe(true);
    }
  }, [trigger, interactive, setOpenSafe]);

  const bubbleLeave = useCallback(() => {
    if (trigger === "hover" && interactive) {
      setOpenSafe(false);
    }
  }, [trigger, interactive, setOpenSafe]);

  return (
    <>
      {composedChild}
      {!disabled && node && (
        <TipBubble
          id={tooltipId}
          anchor={anchorRef.current}
          node={node}
          placement={placement}
          visible={!!currentOpen}
          interactive={interactive}
          onBubbleMouseEnter={bubbleEnter}
          onBubbleMouseLeave={bubbleLeave}
        />
      )}
    </>
  );
}
