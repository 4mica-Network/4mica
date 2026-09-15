import { Button, Modal, Spinner } from "@4mica/ui";
import { useAppSelector } from "@stores/hooks";
import { selectIsWalletPending } from "@stores/wallet/selector";
import type { Wallet } from "@stores/wallet/type";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { shortenAddress } from "./constants";

/**
 * Confirms both the single and the batch delete. `wallet` is the single-row
 * target; `count` drives the batch copy when there is no single target.
 */
export function DeleteWalletDialog({
  wallet,
  count,
  isOpen,
  onConfirm,
  onClose,
}: {
  wallet: Wallet | null;
  count: number;
  isOpen: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const isPending = useAppSelector(
    selectIsWalletPending(
      wallet ? `wallet:${wallet.id}` : "batchDeleteWallets",
    ),
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        wallet
          ? t("wallet.delete.title")
          : t("wallet.delete.batchTitle", { count })
      }
      size="sm"
      data-testid="delete-wallet"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            intent="ghost"
            size="sm"
            onClick={onClose}
            disabled={isPending}
          >
            {t("wallet.delete.cancel")}
          </Button>
          <Button
            intent="primary"
            size="sm"
            className="btn-no-lift min-w-24 bg-danger text-surface-deep hover:bg-danger"
            disabled={isPending}
            onClick={onConfirm}
            data-testid="delete-wallet-confirm"
          >
            <span className="flex w-full items-center justify-center text-sm">
              {isPending ? <Spinner size="sm" /> : t("wallet.delete.confirm")}
            </span>
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="min-w-0">
          <p className="text-ink-body text-sm">
            {wallet
              ? t("wallet.delete.body", {
                  label: wallet.label,
                  address: shortenAddress(wallet.address),
                })
              : t("wallet.delete.batchBody", { count })}
          </p>
          <p className="mt-2 text-ink-subtle text-xs">
            {t("wallet.delete.hint")}
          </p>
        </div>
      </div>
    </Modal>
  );
}
