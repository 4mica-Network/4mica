import { shortenAddress } from "@4mica/rules";
import { Tag, Tooltip } from "@4mica/ui";
import type { WalletBalance } from "@stores/balance/type";
import { Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ROLE_LABEL_KEYS } from "@/pages/wallet/constants";
import { formatBalance } from "./format";

export function WalletBalanceRow({ wallet }: { wallet: WalletBalance }) {
  const { t } = useTranslation();

  const funded = wallet.assets.filter((asset) => BigInt(asset.total) > 0n);

  return (
    <div
      className="flex w-full items-start gap-3 bg-surface px-4 py-3.5 transition-colors hover:bg-overlay/5"
      data-testid={`balance-row-${wallet.id}`}
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10">
        <Wallet className="h-4 w-4 text-brand" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="min-w-0 truncate font-medium text-ink-strong text-sm">
          {wallet.label}
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Tooltip title={wallet.address} placement="bottom">
            <span className="font-mono text-ink-subtle text-xs">
              {shortenAddress(wallet.address)}
            </span>
          </Tooltip>
          <Tag size="sm" variant="neutral">
            {t(ROLE_LABEL_KEYS[wallet.role])}
          </Tag>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {funded.length === 0 ? (
          <span className="text-ink-subtle text-xs">
            {t("balance.row.empty")}
          </span>
        ) : (
          funded.map((asset) => (
            <div
              key={asset.assetAddress}
              className="flex flex-col items-end"
              data-testid={`balance-${wallet.id}-${asset.symbol}`}
            >
              <span className="font-mono font-semibold text-ink-strong text-sm tabular-nums">
                {formatBalance(asset.available, asset.decimals)}{" "}
                <span className="font-normal text-ink-subtle text-xs">
                  {asset.symbol}
                </span>
              </span>
              {BigInt(asset.locked) > 0n && (
                <span className="text-warning text-xs">
                  {t("balance.locked", {
                    amount: formatBalance(asset.locked, asset.decimals),
                  })}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
