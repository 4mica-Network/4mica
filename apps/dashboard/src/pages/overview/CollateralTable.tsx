import { shortenAddress } from "@4mica/rules";
import { cn, Segmented, Tooltip } from "@4mica/ui";
import type { WalletBalance } from "@stores/balance/type";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ROLE_LABEL_KEYS } from "@/pages/wallet/constants";
import { type AssetTotal, collateralRows, formatBalance } from "./metrics";
import { Panel } from "./Panel";

const SHARE_TINTS = [
  "bg-ink-strong",
  "bg-ink-strong/70",
  "bg-ink-strong/50",
  "bg-ink-strong/35",
  "bg-ink-strong/20",
];

export function CollateralTable({
  wallets,
  assets,
}: {
  wallets: WalletBalance[];
  assets: AssetTotal[];
}) {
  const { t } = useTranslation();
  const [assetAddress, setAssetAddress] = useState(
    assets[0]?.assetAddress ?? "",
  );

  const asset =
    assets.find((entry) => entry.assetAddress === assetAddress) ?? assets[0];
  const rows = asset ? collateralRows(wallets, asset.assetAddress) : [];

  return (
    <Panel
      title={t("overview.collateral.title")}
      description={t("overview.collateral.description")}
      testId="overview-collateral"
      action={
        assets.length > 1 && asset ? (
          <Segmented
            label={t("overview.collateral.asset")}
            value={asset.assetAddress}
            options={assets.map((entry) => ({
              value: entry.assetAddress,
              label: entry.symbol,
            }))}
            onChange={setAssetAddress}
            data-testid="overview-collateral-asset"
          />
        ) : undefined
      }
    >
      <div className="px-5 pt-4">
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-overlay/10">
          {rows
            .filter((row) => row.share > 0)
            .map((row, index) => (
              <span
                key={row.wallet.id}
                className={SHARE_TINTS[index % SHARE_TINTS.length]}
                style={{ width: `${row.share * 100}%` }}
              />
            ))}
        </div>
      </div>

      <div className="overflow-x-auto px-2 pt-3 pb-2">
        <table className="w-full min-w-120 text-sm">
          <thead>
            <tr className="text-left text-ink-subtle text-xs">
              <th className="px-3 py-2 font-normal">
                {t("overview.collateral.wallet")}
              </th>
              <th className="px-3 py-2 text-right font-normal">
                {t("overview.collateral.available")}
              </th>
              <th className="px-3 py-2 text-right font-normal">
                {t("overview.collateral.locked")}
              </th>
              <th className="w-40 px-3 py-2 font-normal">
                {t("overview.collateral.share")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.wallet.id}
                className="border-overlay/5 border-t transition-colors hover:bg-overlay/5"
                data-testid={`balance-row-${row.wallet.id}`}
              >
                <td className="px-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        row.share > 0
                          ? SHARE_TINTS[index % SHARE_TINTS.length]
                          : "bg-overlay/15",
                      )}
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-ink-strong">
                        {row.wallet.label}
                      </span>
                      <span className="flex items-center gap-1.5 text-ink-subtle text-xs">
                        <Tooltip title={row.wallet.address} placement="bottom">
                          <span className="font-mono">
                            {shortenAddress(row.wallet.address)}
                          </span>
                        </Tooltip>
                        <span aria-hidden="true">·</span>
                        {t(ROLE_LABEL_KEYS[row.wallet.role])}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-right font-mono text-ink-strong tabular-nums">
                  {asset && row.total > 0n ? (
                    <>
                      {formatBalance(row.available, asset.decimals)}{" "}
                      <span className="text-ink-subtle text-xs">
                        {asset.symbol}
                      </span>
                    </>
                  ) : (
                    <span className="font-sans text-ink-subtle text-xs">
                      {t("overview.collateral.none")}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {asset && row.locked > 0n ? (
                    <span className="text-ink-body">
                      {formatBalance(row.locked, asset.decimals)}
                    </span>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-overlay/10">
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width] duration-500",
                          SHARE_TINTS[index % SHARE_TINTS.length],
                        )}
                        style={{ width: `${row.share * 100}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-ink-muted text-xs tabular-nums">
                      {Math.round(row.share * 100)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
