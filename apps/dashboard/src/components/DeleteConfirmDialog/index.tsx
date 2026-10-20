import { Button, Modal, Spinner } from "@4mica/ui";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

export function DeleteConfirmDialog({
  ns,
  item,
  count,
  isOpen,
  isPending,
  onConfirm,
  onClose,
  "data-testid": testId,
}: {
  ns: string;
  item: Record<string, string> | null;
  count: number;
  isOpen: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
  "data-testid": string;
}) {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        item ? t(`${ns}.delete.title`) : t(`${ns}.delete.batchTitle`, { count })
      }
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
            intent="primary"
            size="sm"
            className="btn-no-lift min-w-24 bg-danger text-surface-deep hover:bg-danger"
            disabled={isPending}
            aria-busy={isPending}
            onClick={onConfirm}
            data-testid={`${testId}-confirm`}
          >
            <span className="flex w-full items-center justify-center text-sm">
              {isPending ? <Spinner size="sm" /> : t(`${ns}.delete.confirm`)}
            </span>
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-danger"
        />
        <div className="min-w-0">
          <p className="text-ink-body text-sm">
            {item
              ? t(`${ns}.delete.body`, item)
              : t(`${ns}.delete.batchBody`, { count })}
          </p>
          <p className="mt-2 text-ink-subtle text-xs">
            {t(`${ns}.delete.hint`)}
          </p>
        </div>
      </div>
    </Modal>
  );
}
