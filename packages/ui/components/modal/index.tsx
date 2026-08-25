import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { type ReactNode, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { useModalA11y } from "./useModalA11y";

const SIZES = {
  sm: "w-[400px] max-w-[calc(100vw-2rem)]",
  md: "w-[460px] max-w-[calc(100vw-2rem)]",
  lg: "w-[640px] max-w-[calc(100vw-2rem)]",
} as const;

export interface ModalProps {
  isOpen: boolean;
  /** Called by the close button, Escape and the overlay, unless each is disabled. */
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Sits in a bordered strip below the body, for actions. */
  footer?: ReactNode;
  size?: keyof typeof SIZES;
  showClose?: boolean;
  disableOverlayClose?: boolean;
  disableEscapeClose?: boolean;
  /** Applied to the panel. */
  className?: string;
  /** Applied to the body between header and footer. */
  contentClassName?: string;
  "data-testid"?: string;
}

/**
 * A centred, portalled dialog.
 *
 * Sits at z-9990 rather than the z-9999 `Dropdown` uses, so a `Select` opened
 * inside a modal still paints above the panel. Toasts are also 9999 and so stay
 * on top, which is what we want for transient errors raised by a modal's own form.
 */
export const Modal = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  showClose = true,
  disableOverlayClose = false,
  disableEscapeClose = false,
  className,
  contentClassName,
  ...props
}: ModalProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  const prefix = props["data-testid"] ?? "modal";

  useModalA11y({ isOpen, panelRef, onClose, disableEscapeClose });

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-9990 flex items-center justify-center p-4">
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={disableOverlayClose ? undefined : onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            data-testid={`${prefix}-overlay`}
          />

          <motion.div
            key="panel"
            ref={panelRef}
            // -1 keeps the panel focusable as a fallback when it holds no
            // tabbable children, without making it a tab stop of its own.
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descriptionId : undefined}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "relative flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-xl border border-overlay/10 bg-surface shadow-2xl outline-none",
              SIZES[size],
              className,
            )}
            data-testid={`${prefix}-panel`}
          >
            {(title || showClose) && (
              <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
                <div className="min-w-0">
                  {title && (
                    <h2
                      id={titleId}
                      className="font-semibold text-base text-ink-strong"
                    >
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p
                      id={descriptionId}
                      className="mt-1 text-ink-muted text-sm"
                    >
                      {description}
                    </p>
                  )}
                </div>

                {showClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="-mt-1 -mr-1 shrink-0 rounded-md p-1 text-ink-subtle transition-colors hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-overlay/40"
                    data-testid={`${prefix}-close`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto px-6 pb-5",
                contentClassName,
              )}
              data-testid={`${prefix}-body`}
            >
              {children}
            </div>

            {footer && (
              <div
                className="flex shrink-0 items-center justify-end gap-2 border-overlay/10 border-t bg-overlay/5 px-6 py-3"
                data-testid={`${prefix}-footer`}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

Modal.displayName = "Modal";
