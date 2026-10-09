"use client";

import { type ReactNode, type RefObject, useId, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { Button, type ButtonProps } from "../button";
import { Dropdown, type Placement } from "../dropdown";

export interface ConfirmPopupProps {
  isOpen: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  placement?: Placement;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  className?: string;
  confirmButtonProps?: ButtonProps;
  cancelButtonProps?: ButtonProps;
  closeOnOutsideClick?: boolean;
  onConfirm?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onCancel?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onRequestClose?: () => void;
  "data-testid"?: string;
}

export const ConfirmPopup = ({
  isOpen,
  anchorRef,
  placement = "bottom",
  title = "Are you sure?",
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  className,
  confirmButtonProps,
  cancelButtonProps,
  closeOnOutsideClick = true,
  onConfirm,
  onCancel,
  onRequestClose,
  ...props
}: ConfirmPopupProps) => {
  const prefix = props["data-testid"]
    ? `${props["data-testid"]}-confirm-popup`
    : "confirm-popup";
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Dropdown
      isOpen={isOpen}
      anchorRef={anchorRef}
      placement={placement}
      className={cn("w-72 p-4", className)}
      onClickOutside={closeOnOutsideClick ? onRequestClose : undefined}
      onDismiss={onRequestClose}
      autoFocus
      data-testid={prefix}
    >
      <div
        role="alertdialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1">
          <span
            id={titleId}
            className="font-semibold text-ink-strong text-sm"
            data-testid={`${prefix}-title`}
          >
            {title}
          </span>
          {description && (
            <p
              id={descriptionId}
              className="text-ink-muted text-sm"
              data-testid={`${prefix}-description`}
            >
              {description}
            </p>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2"
          data-testid={`${prefix}-actions`}
        >
          <Button
            intent="ghost"
            size="sm"
            {...cancelButtonProps}
            onClick={onCancel}
            data-testid={`${prefix}-cancel`}
          >
            {cancelLabel}
          </Button>
          <Button
            intent="primary"
            size="sm"
            {...confirmButtonProps}
            onClick={onConfirm}
            data-testid={`${prefix}-confirm`}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dropdown>
  );
};

export interface PopupConfirmProps {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  placement?: Placement;
  closeOnOutsideClick?: boolean;
  children: ReactNode;
  className?: string;
  confirmButtonProps?: ButtonProps;
  cancelButtonProps?: ButtonProps;
  onConfirm?: () => void;
  onRequestClose?: () => void;
  "data-testid"?: string;
}

export const PopupConfirm = ({
  title = "Are you sure?",
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  placement = "bottom",
  closeOnOutsideClick = true,
  children,
  className,
  confirmButtonProps,
  cancelButtonProps,
  onConfirm,
  onRequestClose,
  ...props
}: PopupConfirmProps) => {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const prefix = props["data-testid"]
    ? `${props["data-testid"]}-popup-confirm`
    : "popup-confirm";

  const close = () => {
    setIsOpen(false);
    onRequestClose?.();
  };

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex"
        onClickCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen((open) => !open);
        }}
        data-testid={prefix}
      >
        {children}
      </span>

      <ConfirmPopup
        isOpen={isOpen}
        anchorRef={anchorRef}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        placement={placement}
        className={className}
        closeOnOutsideClick={closeOnOutsideClick}
        confirmButtonProps={confirmButtonProps}
        cancelButtonProps={cancelButtonProps}
        onConfirm={(event) => {
          event.stopPropagation();
          onConfirm?.();
          setIsOpen(false);
        }}
        onCancel={(event) => {
          event.stopPropagation();
          close();
        }}
        onRequestClose={close}
        data-testid={prefix}
      />
    </>
  );
};
