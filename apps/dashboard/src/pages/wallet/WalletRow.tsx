import {
  Button,
  Checkbox,
  cn,
  Dropdown,
  Spinner,
  Tag,
  Tooltip,
} from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { toggleWalletSelected, updateWallet } from "@stores/wallet/actions";
import {
  selectIsWalletPending,
  selectIsWalletSelected,
} from "@stores/wallet/selector";
import type { Wallet } from "@stores/wallet/type";
import {
  Check,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  explorerAddressUrl,
  NETWORKS,
  ROLE_LABEL_KEYS,
  STATUS_LABEL_KEYS,
  STATUS_TAG_VARIANT,
  shortenAddress,
} from "./constants";

const menuItem =
  "flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-overlay/5";

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
    selectIsWalletPending(`wallet:${wallet.id}`),
  );
  const isSelected = useAppSelector(selectIsWalletSelected(wallet.id));

  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnchor = useRef<HTMLSpanElement>(null);

  const network = NETWORKS[wallet.network];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied (insecure origin, permissions policy).
      // The address is already on screen, so failing quietly is enough.
    }
  };

  return (
    // No border or rounding of its own: the list container draws one frame
    // around the whole group and `divide-y` supplies the separators, so rows
    // read as one table rather than a stack of cards.
    <div
      className={cn(
        "group flex w-full items-start gap-3 bg-surface px-4 py-3.5 transition-colors sm:items-center",
        isSelected ? "bg-overlay/10" : "hover:bg-overlay/5",
      )}
      data-testid={`wallet-row-${wallet.id}`}
    >
      {/*
        w-auto overrides the component's own `w-full`, which as a flex item
        would otherwise claim the whole row and starve everything beside it of
        width — collapsing the tags to slivers and wrapping the address.
      */}
      <Checkbox
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

        {/* Secondary: present but visibly subordinate to the name. */}
        {wallet.description && (
          <p className="min-w-0 truncate text-ink-muted text-sm">
            {wallet.description}
          </p>
        )}

        {/* Every attribute as a tag, on one wrapping line below the text. */}
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

      {/*
        Visible by default and hover-revealed only from `lg` up: a tablet has no
        hover, so hiding the controls behind one would leave them unreachable.
        focus-within keeps them available to keyboard users on wide screens.
      */}
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

        {/* The ref lives on a wrapper: Button renders a plain <button> and does
            not forward one, and Dropdown only needs an element to anchor to. */}
        <span ref={menuAnchor} className="inline-flex">
          <Button
            type="button"
            intent="ghost"
            size="sm"
            className="btn-no-lift px-2"
            aria-label={t("wallet.row.more")}
            aria-expanded={menuOpen}
            disabled={isPending}
            onClick={() => setMenuOpen((open) => !open)}
            data-testid={`wallet-more-${wallet.id}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </span>

        <Dropdown
          isOpen={menuOpen}
          anchorRef={menuAnchor}
          placement="bottomRight"
          onClickOutside={() => setMenuOpen(false)}
        >
          <div className="flex w-56 flex-col py-1">
            <button
              type="button"
              className={cn(menuItem, "text-ink-body")}
              onClick={() => {
                onEdit(wallet);
                setMenuOpen(false);
              }}
              data-testid={`wallet-edit-${wallet.id}`}
            >
              <Pencil className="h-4 w-4" />
              {t("wallet.row.edit")}
            </button>

            <a
              href={explorerAddressUrl(wallet.network, wallet.address)}
              target="_blank"
              rel="noreferrer noopener"
              className={cn(menuItem, "text-ink-body")}
              onClick={() => setMenuOpen(false)}
            >
              <ExternalLink className="h-4 w-4" />
              {t("wallet.row.viewOnExplorer")}
            </a>

            {/* Only an active wallet can be a payment destination, which is
                what the server enforces too. */}
            {!wallet.isDefault && wallet.status === "ACTIVE" && (
              <button
                type="button"
                className={cn(menuItem, "text-ink-body")}
                onClick={() => {
                  dispatch(
                    updateWallet({
                      id: wallet.id,
                      data: { isDefault: true },
                    }),
                  );
                  setMenuOpen(false);
                }}
                data-testid={`wallet-make-default-${wallet.id}`}
              >
                <Check className="h-4 w-4" />
                {t("wallet.row.makeDefault")}
              </button>
            )}

            {wallet.status !== "RETIRED" && (
              <button
                type="button"
                className={cn(menuItem, "text-ink-body")}
                onClick={() => {
                  dispatch(
                    updateWallet({
                      id: wallet.id,
                      data: {
                        status:
                          wallet.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                      },
                    }),
                  );
                  setMenuOpen(false);
                }}
                data-testid={`wallet-toggle-status-${wallet.id}`}
              >
                {wallet.status === "ACTIVE" ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {wallet.status === "ACTIVE"
                  ? t("wallet.row.pause")
                  : t("wallet.row.resume")}
              </button>
            )}

            <button
              type="button"
              className={cn(menuItem, "text-danger")}
              onClick={() => {
                onDelete(wallet);
                setMenuOpen(false);
              }}
              data-testid={`wallet-delete-${wallet.id}`}
            >
              <Trash2 className="h-4 w-4" />
              {t("wallet.row.delete")}
            </button>
          </div>
        </Dropdown>
      </div>
    </div>
  );
}
