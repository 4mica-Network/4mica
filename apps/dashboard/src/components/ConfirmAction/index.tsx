import { PopupConfirm } from "@4mica/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function ConfirmAction({
  title,
  description,
  confirmLabel,
  onConfirm,
  children,
  "data-testid": testId,
}: {
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  children: ReactNode;
  "data-testid"?: string;
}) {
  const { t } = useTranslation();

  return (
    <PopupConfirm
      placement="bottomRight"
      title={title}
      description={description ?? t("confirm.irreversible")}
      confirmLabel={confirmLabel ?? t("confirm.delete")}
      cancelLabel={t("confirm.cancel")}
      confirmButtonProps={{
        className: "bg-danger text-surface-deep hover:bg-danger",
      }}
      onConfirm={onConfirm}
      data-testid={testId}
    >
      {children}
    </PopupConfirm>
  );
}
