import { PAYMENT_NETWORKS, shortenAddress } from "@4mica/rules";
import { Tag, Link as UiLink } from "@4mica/ui";
import { ArrowUpRight, Check } from "lucide-react";
import { messages, t } from "@/i18n";
import type { PaymentNetwork } from "@/schema/params";
import { links } from "@/services/links";
import type { PayerState } from "@/services/payer";

export interface PayWithFourMicaProps {
  state: PayerState;
  network: PaymentNetwork | null;
}

interface StepCopy {
  index: number;
  title: string;
  body: string;
}

export function PayWithFourMica({ state, network }: PayWithFourMicaProps) {
  const chain = network ? PAYMENT_NETWORKS[network].label : null;

  if (state.step === "ready") {
    return (
      <div className="flex flex-col gap-4" data-testid="pay-with-4mica-ready">
        <p className="text-ink-body text-sm leading-relaxed">
          {messages.payWith.lead}
        </p>
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-overlay/4 px-4 py-3">
          <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-success" />
          <span className="text-ink-body text-sm">
            {messages.payWith.readyTitle}
          </span>
          <Tag size="sm" variant="neutral" className="font-mono">
            {shortenAddress(state.address)}
          </Tag>
        </div>
        <UiLink
          className="self-start text-sm"
          external
          href={links.app}
          icon={<ArrowUpRight aria-hidden="true" className="h-4 w-4" />}
        >
          {messages.payWith.readyAction}
        </UiLink>
      </div>
    );
  }

  const steps: StepCopy[] =
    state.step === "signed-out"
      ? [
          {
            index: 1,
            title: messages.payWith.signedOut.accountTitle,
            body: messages.payWith.signedOut.accountBody,
          },
          {
            index: 2,
            title: messages.payWith.signedOut.walletTitle,
            body: chain
              ? t(messages.payWith.signedOut.walletBodyOn, { network: chain })
              : messages.payWith.signedOut.walletBody,
          },
          {
            index: 3,
            title: messages.payWith.signedOut.payTitle,
            body: messages.payWith.signedOut.payBody,
          },
        ]
      : state.step === "no-wallet"
        ? [
            {
              index: 1,
              title: messages.payWith.noWallet.walletTitle,
              body: chain
                ? t(messages.payWith.noWallet.walletBodyOn, { network: chain })
                : messages.payWith.noWallet.walletBody,
            },
            {
              index: 2,
              title: messages.payWith.noWallet.fundTitle,
              body: messages.payWith.noWallet.fundBody,
            },
          ]
        : [
            {
              index: 1,
              title: chain
                ? t(messages.payWith.wrongNetwork.title, { network: chain })
                : messages.payWith.noWallet.walletTitle,
              body: t(messages.payWith.wrongNetwork.body, {
                networks: state.networks
                  .map((entry) => PAYMENT_NETWORKS[entry].label)
                  .join(", "),
              }),
            },
          ];

  const cta =
    state.step === "signed-out"
      ? { href: links.signup, label: messages.payWith.signedOut.cta }
      : { href: `${links.app}/wallet`, label: messages.payWith.noWallet.cta };

  return (
    <div className="flex flex-col gap-5" data-testid="pay-with-4mica">
      <p className="text-ink-body text-sm leading-relaxed">
        {messages.payWith.lead}
      </p>

      <ol className="flex flex-col gap-4">
        {steps.map((step) => (
          <li className="flex items-start gap-3" key={step.index}>
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-overlay/6 text-2xs text-ink-muted tabular-nums">
              {step.index}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="font-medium text-ink-strong text-sm">
                {step.title}
              </p>
              <p className="text-ink-muted text-sm leading-relaxed">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <UiLink
        className="self-start text-sm"
        external
        href={cta.href}
        icon={<ArrowUpRight aria-hidden="true" className="h-4 w-4" />}
      >
        {cta.label}
      </UiLink>
    </div>
  );
}
