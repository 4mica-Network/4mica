import {
  explorerAddressUrl,
  PAYMENT_NETWORKS,
  shortenAddress,
} from "@4mica/rules";
import { Button, Checkbox, cn, Spinner, Tag, Tooltip } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  toggleWalletSelected,
  updateWallet,
  walletPendingKeys,
} from "@stores/wallet/actions";
import {
  selectIsWalletPending,
  selectIsWalletSelected,
} from "@stores/wallet/selector";
import type { Wallet } from "@stores/wallet/type";
import {
  Check,
  Copy,
  ExternalLink,
  Pause,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import {
  ROLE_LABEL_KEYS,
  STATUS_LABEL_KEYS,
  STATUS_TAG_VARIANT,
} from "./constants";

export function WalletRow({
  wallet,
  onEdit,
  onDelete,
}: {
  wallet: Wallet;
  onEdit: (wallet: Wallet) => void;
  onDelete: (wallet: Wallet) => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isPending = useAppSelector(
    selectIsWalletPending(walletPendingKeys.row(wallet.id)),
  );
  const isSelected = useAppSelector(selectIsWalletSelected(wallet.id));

  const { copied, copy } = useCopyToClipboard();

  const network = PAYMENT_NETWORKS[wallet.network];

  const handleCopy = () => copy(wallet.address);

  return (
    <div
      className={cn(
        "group flex w-full items-start gap-3 bg-surface px-4 py-3.5 transition-colors sm:items-center",
        isSelected ? "bg-overlay/10" : "hover:bg-overlay/5",
      )}
      data-testid={`wallet-row-${wallet.id}`}
    >
      <Checkbox
        aria-label={t("wallet.row.select", { name: wallet.label })}
        variant="square"
        className="mt-0.5 w-auto shrink-0 sm:mt-0"
        checked={isSelected}
        onChange={() => dispatch(toggleWalletSelected(wallet.id))}
        data-testid={`wallet-select-${wallet.id}`}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          className="min-w-0 truncate font-semibold text-base text-ink-strong"
          data-testid={`wallet-label-${wallet.id}`}
        >
          {wallet.label}
        </span>

        {wallet.description && (
          <p className="min-w-0 truncate text-ink-muted text-sm">
            {wallet.description}
          </p>
        )}

        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
          {wallet.isDefault && (
            <Tag size="sm" variant="default">
              {t("wallet.row.default")}
            </Tag>
          )}

          <Tag size="sm" variant={STATUS_TAG_VARIANT[wallet.status]}>
            {t(STATUS_LABEL_KEYS[wallet.status])}
          </Tag>

          <Tag size="sm" variant="neutral">
            {t(ROLE_LABEL_KEYS[wallet.role])}
          </Tag>

          <Tooltip title={wallet.address} placement="bottom">
            <Tag
              size="sm"
              variant="neutral"
              className="font-mono"
              data-testid={`wallet-address-${wallet.id}`}
            >
              {shortenAddress(wallet.address)}
            </Tag>
          </Tooltip>

          <Tag size="sm" variant="neutral">
            {network.label}
          </Tag>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
        {isPending && <Spinner size="sm" className="mr-1 text-ink-subtle" />}

        <Tooltip title={t("wallet.row.copy")} placement="bottom">
          <Button
            type="button"
            intent="ghost"
            size="sm"
            className="btn-no-lift px-2"
            aria-label={t("wallet.row.copy")}
            onClick={handleCopy}
            data-testid={`wallet-copy-${wallet.id}`}
          >
            {copied ? (
              <Check className="h-4 w-4 text-success" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </Tooltip>

        <RowActionsMenu
          label={t("wallet.row.more", { name: wallet.label })}
          disabled={isPending}
          width="w-56"
          data-testid={`wallet-more-${wallet.id}`}
        >
          <RowActionsMenu.Item
            icon={Pencil}
            onSelect={() => onEdit(wallet)}
            data-testid={`wallet-edit-${wallet.id}`}
          >
            {t("wallet.row.edit")}
          </RowActionsMenu.Item>

          <RowActionsMenu.ExternalItem
            icon={ExternalLink}
            href={explorerAddressUrl(wallet.network, wallet.address)}
          >
            {t("wallet.row.viewOnExplorer")}
          </RowActionsMenu.ExternalItem>

          {!wallet.isDefault && wallet.status === "ACTIVE" && (
            <RowActionsMenu.Item
              icon={Check}
              onSelect={() =>
                dispatch(
                  updateWallet({ id: wallet.id, data: { isDefault: true } }),
                )
              }
              data-testid={`wallet-make-default-${wallet.id}`}
            >
              {t("wallet.row.makeDefault")}
            </RowActionsMenu.Item>
          )}

          {wallet.status !== "RETIRED" && (
            <RowActionsMenu.Item
              icon={wallet.status === "ACTIVE" ? Pause : Play}
              onSelect={() =>
                dispatch(
                  updateWallet({
                    id: wallet.id,
                    data: {
                      status: wallet.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                    },
                  }),
                )
              }
              data-testid={`wallet-toggle-status-${wallet.id}`}
            >
              {wallet.status === "ACTIVE"
                ? t("wallet.row.pause")
                : t("wallet.row.resume")}
            </RowActionsMenu.Item>
          )}

          <RowActionsMenu.Item
            icon={Trash2}
            tone="danger"
            onSelect={() => onDelete(wallet)}
            data-testid={`wallet-delete-${wallet.id}`}
          >
            {t("wallet.row.delete")}
          </RowActionsMenu.Item>
        </RowActionsMenu>
      </div>
    </div>
  );
}
