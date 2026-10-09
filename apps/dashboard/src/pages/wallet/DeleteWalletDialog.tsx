import { shortenAddress } from "@4mica/rules";
import { useAppSelector } from "@stores/hooks";
import { walletPendingKeys } from "@stores/wallet/actions";
import { selectIsWalletPending } from "@stores/wallet/selector";
import type { Wallet } from "@stores/wallet/type";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

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
  const isPending = useAppSelector(
    selectIsWalletPending(
      wallet ? walletPendingKeys.row(wallet.id) : walletPendingKeys.batchDelete,
    ),
  );

  return (
    <DeleteConfirmDialog
      ns="wallet"
      data-testid="delete-wallet"
      item={
        wallet
          ? { label: wallet.label, address: shortenAddress(wallet.address) }
          : null
      }
      count={count}
      isOpen={isOpen}
      isPending={isPending}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
