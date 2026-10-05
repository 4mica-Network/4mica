import { Tag, Link as UiLink } from "@4mica/ui";
import { ArrowUpRight, Check, Wallet } from "lucide-react";
import { messages, t } from "@/i18n";
import { networkInfo } from "@/lib/snippets/networks";
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
  const chain = network ? networkInfo(network).label : null;

  if (state.step === "ready") {
    return (
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-4 py-3"
        data-testid="pay-with-4mica-ready"
      >
        <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-success" />
        <span className="text-ink-body text-sm">
          {messages.payWith.readyTitle}
        </span>
        <Tag size="sm" variant="neutral" className="font-mono">
          {`${state.address.slice(0, 6)}…${state.address.slice(-4)}`}
        </Tag>
        <UiLink className="text-sm" external href={`${links.app}/balances`}>
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
                  .map((entry) => networkInfo(entry).label)
                  .join(", "),
              }),
            },
          ];

  const cta =
    state.step === "signed-out"
      ? { href: links.signup, label: messages.payWith.signedOut.cta }
      : { href: `${links.app}/wallet`, label: messages.payWith.noWallet.cta };

  return (
    <section
      className="flex flex-col gap-4 rounded-lg border border-overlay/10 bg-surface p-4"
      data-testid="pay-with-4mica"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-overlay/10">
          <Wallet aria-hidden="true" className="h-4 w-4 text-ink-muted" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-ink-strong text-sm">
            {messages.payWith.heading}
          </h2>
          <p className="mt-0.5 text-ink-muted text-sm">
            {messages.payWith.lead}
          </p>
        </div>
      </div>

      <ol className="flex flex-col gap-3">
        {steps.map((step) => (
          <li className="flex items-start gap-3" key={step.index}>
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-overlay/20 text-ink-subtle text-xs">
              {step.index}
            </span>
            <div className="min-w-0">
              <p className="font-medium text-ink-strong text-sm">
                {step.title}
              </p>
              <p className="text-ink-muted text-xs">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <UiLink
        className="text-sm"
        external
        href={cta.href}
        icon={<ArrowUpRight aria-hidden="true" className="h-4 w-4" />}
      >
        {cta.label}
      </UiLink>
    </section>
  );
}
