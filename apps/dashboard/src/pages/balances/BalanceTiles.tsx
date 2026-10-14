import type { WalletBalance } from "@stores/balance/type";
import { useTranslation } from "react-i18next";
import { formatBalance } from "./format";

interface AssetTotal {
  assetAddress: string;
  symbol: string;
  decimals: number;
  total: bigint;
  locked: bigint;
}

const totalsByAsset = (wallets: WalletBalance[]): AssetTotal[] => {
  const totals = new Map<string, AssetTotal>();

  for (const asset of wallets.flatMap((wallet) => wallet.assets)) {
    const entry = totals.get(asset.assetAddress) ?? {
      assetAddress: asset.assetAddress,
      symbol: asset.symbol,
      decimals: asset.decimals,
      total: 0n,
      locked: 0n,
    };
    entry.total += BigInt(asset.total);
    entry.locked += BigInt(asset.locked);
    totals.set(asset.assetAddress, entry);
  }

  return [...totals.values()];
};

export function BalanceTiles({ wallets }: { wallets: WalletBalance[] }) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {totalsByAsset(wallets).map((asset) => (
        <div
          key={asset.assetAddress}
          className="flex flex-col gap-2 rounded-lg border border-overlay/10 bg-surface px-4 py-3.5"
          data-testid={`balance-tile-${asset.symbol}`}
        >
          <span className="text-ink-subtle text-xs uppercase tracking-wide">
            {asset.symbol}
          </span>

          <span className="font-mono font-semibold text-ink-strong text-lg tabular-nums">
            {formatBalance(
              (asset.total - asset.locked).toString(),
              asset.decimals,
            )}{" "}
            <span className="font-normal text-ink-subtle text-xs">
              {t("balance.available")}
            </span>
          </span>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-warning">
              {t("balance.locked", {
                amount: formatBalance(asset.locked.toString(), asset.decimals),
              })}
            </span>
            <span className="text-ink-muted">
              {t("balance.total", {
                amount: formatBalance(asset.total.toString(), asset.decimals),
              })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
