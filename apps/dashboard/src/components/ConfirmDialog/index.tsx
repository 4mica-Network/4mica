import { Button, Modal } from "@4mica/ui";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function ConfirmDialog({
  isOpen,
  title,
  children,
  confirmLabel,
  intent = "danger",
  isPending,
  disabled,
  onConfirm,
  onClose,
  "data-testid": testId,
}: {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  intent?: "danger" | "invert";
  isPending?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  "data-testid"?: string;
}) {
  const { t } = useTranslation();

  return (
    <Modal
      closeLabel={t("modal.close")}
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      data-testid={testId}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            intent="ghost"
            size="sm"
            onClick={onClose}
            disabled={isPending}
          >
            {t("confirm.cancel")}
          </Button>
          <Button
            intent={intent}
            size="sm"
            className="btn-no-lift min-w-24 text-sm"
            loading={isPending}
            disabled={disabled}
            onClick={onConfirm}
            data-testid={testId ? `${testId}-confirm` : undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-warning"
        />
        <div className="flex min-w-0 flex-col gap-2 text-ink-body text-sm">
          {children}
        </div>
      </div>
    </Modal>
  );
}
