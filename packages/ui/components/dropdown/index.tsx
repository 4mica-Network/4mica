import {
  forwardRef,
  type ReactNode,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

export type Placement =
  | "top"
  | "topRight"
  | "topLeft"
  | "bottom"
  | "bottomRight"
  | "bottomLeft"
  | "left"
  | "right";

export interface DropdownProps {
  isOpen: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  placement?: Placement;
  placementOffsetX?: number;
  placementOffsetY?: number;
  matchAnchorWidth?: boolean;
  flipOnOverflow?: boolean;
  className?: string;
  onClickOutside?: () => void;
  "data-testid"?: string;
}

const DEFAULT_FLIP_EDGE_PADDING = 40;

const inversePlacementMap: Record<Placement, Placement> = {
  top: "bottom",
  topRight: "bottomRight",
  topLeft: "bottomLeft",
  bottom: "top",
  bottomRight: "topRight",
  bottomLeft: "topLeft",
  left: "right",
  right: "left",
};

/**
 * A portal-rendered floating panel anchored to `anchorRef`. Positions itself
 * relative to the anchor, flips when it would overflow the viewport, and closes
 * on outside click. Styling uses the shared design tokens (popover surface).
 */
export const Dropdown = forwardRef<HTMLDivElement, DropdownProps>(
  function Dropdown(
    {
      isOpen,
      anchorRef,
      children,
      placement = "bottom",
      placementOffsetX = 0,
      placementOffsetY = 8,
      matchAnchorWidth = false,
      flipOnOverflow = true,
      className,
      onClickOutside,
      ...props
    },
    forwardedRef,
  ) {
    const internalRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number }>({
      top: 0,
      left: 0,
    });
    const [width, setWidth] = useState<number | undefined>(undefined);
    const [ready, setReady] = useState(false);

    const prefix = props["data-testid"]
      ? `${props["data-testid"]}-dropdown`
      : "dropdown";

    useImperativeHandle(
      forwardedRef,
      () => internalRef.current as HTMLDivElement,
      [],
    );

    useEffect(() => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setWidth(matchAnchorWidth ? rect.width : undefined);
    }, [anchorRef, matchAnchorWidth]);

    useLayoutEffect(() => {
      function updatePosition() {
        const anchor = anchorRef.current;
        const dropdown = internalRef.current;
        if (!anchor || !dropdown) return;

        const rect = anchor.getBoundingClientRect();
        const dropdownRect = dropdown.getBoundingClientRect();

        let top = 0;
        let left = 0;

        const anchorTop = rect.top;
        const anchorLeft = rect.left;
        const anchorRight = rect.right;
        const anchorBottom = rect.bottom;
        const anchorWidth = rect.width;
        const anchorHeight = rect.height;

        const dropdownWidth =
          dropdownRect.width || dropdown.offsetWidth || dropdown.scrollWidth;
        const dropdownHeight =
          dropdownRect.height || dropdown.offsetHeight || dropdown.scrollHeight;

        const availableTop = rect.top - DEFAULT_FLIP_EDGE_PADDING;
        const availableBottom =
          window.innerHeight - rect.bottom - DEFAULT_FLIP_EDGE_PADDING;
        const availableLeft = rect.left - DEFAULT_FLIP_EDGE_PADDING;
        const availableRight =
          window.innerWidth - rect.right - DEFAULT_FLIP_EDGE_PADDING;

        const requiredVerticalSpace = dropdownHeight + placementOffsetY;
        const requiredHorizontalSpace =
          (matchAnchorWidth ? rect.width : dropdownWidth) + placementOffsetX;

        const isTopPlacement =
          placement === "top" ||
          placement === "topLeft" ||
          placement === "topRight";
        const isBottomPlacement =
          placement === "bottom" ||
          placement === "bottomLeft" ||
          placement === "bottomRight";
        const isLeftPlacement = placement === "left";
        const isRightPlacement = placement === "right";

        let resolvedPlacement = placement;

        if (flipOnOverflow) {
          const shouldFlip =
            (isTopPlacement && availableTop < requiredVerticalSpace) ||
            (isBottomPlacement && availableBottom < requiredVerticalSpace) ||
            (isLeftPlacement && availableLeft < requiredHorizontalSpace) ||
            (isRightPlacement && availableRight < requiredHorizontalSpace);

          if (shouldFlip) {
            resolvedPlacement = inversePlacementMap[placement];
          }
        }

        switch (resolvedPlacement) {
          case "top":
            top = anchorTop - dropdownHeight - placementOffsetY;
            left = anchorLeft + anchorWidth / 2 - dropdownWidth / 2;
            break;
          case "topRight":
            top = anchorTop - dropdownHeight - placementOffsetY;
            left = anchorRight - dropdownWidth + placementOffsetX;
            break;
          case "topLeft":
            top = anchorTop - dropdownHeight - placementOffsetY;
            left = anchorLeft - placementOffsetX;
            break;
          case "bottom":
            top = anchorBottom + placementOffsetY;
            left =
              anchorLeft +
              anchorWidth / 2 -
              dropdownWidth / 2 +
              placementOffsetX;
            break;
          case "bottomRight":
            top = anchorBottom + placementOffsetY;
            left = anchorRight - dropdownWidth + placementOffsetX;
            break;
          case "bottomLeft":
            top = anchorBottom + placementOffsetY;
            left = anchorLeft - placementOffsetX;
            break;
          case "left":
            top = anchorTop + anchorHeight / 2 - dropdownHeight / 2;
            left = anchorLeft - dropdownWidth - placementOffsetX;
            break;
          case "right":
            top = anchorTop + anchorHeight / 2 - dropdownHeight / 2;
            left = anchorRight + placementOffsetX;
            break;
        }

        setPosition({ top, left });
        setReady(true);
      }

      let resizeObserver: ResizeObserver | undefined;

      if (isOpen) {
        setReady(false);
        updatePosition();
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);

        if (typeof ResizeObserver !== "undefined" && internalRef.current) {
          resizeObserver = new ResizeObserver(() => updatePosition());
          resizeObserver.observe(internalRef.current);
        }
      }

      return () => {
        window.removeEventListener("resize", updatePosition);
        window.removeEventListener("scroll", updatePosition, true);
        resizeObserver?.disconnect();
      };
    }, [
      isOpen,
      placement,
      width,
      placementOffsetX,
      placementOffsetY,
      matchAnchorWidth,
      flipOnOverflow,
      anchorRef,
    ]);

    useEffect(() => {
      function handleClickOutside(event: MouseEvent) {
        if (
          internalRef.current &&
          !internalRef.current.contains(event.target as Node) &&
          anchorRef.current &&
          !anchorRef.current.contains(event.target as Node)
        ) {
          onClickOutside?.();
        }
      }
      if (isOpen) {
        document.addEventListener("mousedown", handleClickOutside);
      }
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [isOpen, onClickOutside, anchorRef]);

    if (!isOpen) return null;

    return createPortal(
      <div
        ref={internalRef}
        className={cn(
          "fixed z-[9999] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg transition-opacity",
          ready ? "opacity-100" : "pointer-events-none opacity-0",
          className,
        )}
        style={{
          top: position.top,
          left: position.left,
          width: matchAnchorWidth ? width : undefined,
        }}
        data-testid={prefix}
      >
        {children}
      </div>,
      document.body,
    );
  },
);

Dropdown.displayName = "Dropdown";
