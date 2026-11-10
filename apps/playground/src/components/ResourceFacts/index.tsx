import { PAYMENT_NETWORKS, shortenAddress } from "@4mica/rules";
import { Coins, type LucideIcon, Network, ReceiptText } from "lucide-react";
import type { ReactNode } from "react";
import { CopyValue } from "@/components/CopyValue";
import { messages } from "@/i18n";
import type { PaymentNetwork } from "@/schema/params";
import { FactHint } from "./FactHint";

export interface Fact {
  id: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  value: ReactNode;
}

export function ResourceFacts({ facts }: { facts: Fact[] }) {
  return (
    <dl className="flex flex-col gap-4">
      {facts.map(({ id, icon: Icon, label, hint, value }) => (
        <div className="flex items-center gap-3" key={id}>
          <dt className="shrink-0">
            <FactHint hint={hint}>
              <Icon aria-hidden="true" className="h-4 w-4" />
            </FactHint>
            <span className="sr-only">{label}</span>
          </dt>
          <dd className="min-w-0 flex-1 text-ink-body text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const paymentFacts = ({
  network,
  assetAddress,
  note,
}: {
  network: PaymentNetwork | null;
  assetAddress: string | null;
  note: string | null;
}): Fact[] => [
  ...(network
    ? [
        {
          id: "network",
          hint: messages.facts.hint.network,
          icon: Network,
          label: messages.facts.network,
          value: PAYMENT_NETWORKS[network].label,
        },
      ]
    : []),
  {
    id: "asset",
    hint: messages.facts.hint.asset,
    icon: Coins,
    label: messages.facts.asset,
    value: assetAddress ? (
      <CopyValue
        label={`${messages.integration.erc20} ${shortenAddress(assetAddress)}`}
        mono
        value={assetAddress}
      />
    ) : (
      messages.integration.nativeAsset
    ),
  },
  ...(note
    ? [
        {
          id: "pricing",
          hint: messages.facts.hint.pricing,
          icon: ReceiptText,
          label: messages.api.pricing,
          value: note,
        },
      ]
    : []),
];
