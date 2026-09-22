import { selectAgents } from "@stores/agent/selector";
import { selectApiListings } from "@stores/apiListing/selector";
import { selectApiKeys, selectWebhooks } from "@stores/developer/selector";
import { useAppSelector } from "@stores/hooks";
import { selectPaymentSummary } from "@stores/payment/selector";
import { selectBusiness, selectUser } from "@stores/user/selector";
import { selectWallets } from "@stores/wallet/selector";
import { useTranslation } from "react-i18next";
import { isProfileRenderable } from "@/lib/profile-gate";

export interface ChecklistItem {
  id: string;
  title: string;
  hint: string;
  to: string;
  done: boolean;
  /** KYB is reviewed out of band, so it has a third state the others lack. */
  pending?: boolean;
}

/**
 * Everything here is derived from slices the app already holds — no bespoke
 * "progress" endpoint, so the items tick the moment the underlying mutation
 * lands rather than on the next page load.
 *
 * Ordered as the journey actually runs: prove an address, put something behind
 * a paywall, make it reachable, then get paid. The developer items come after,
 * because an API key is only useful once there is a payment to report.
 */
export function useChecklist(): {
  items: ChecklistItem[];
  done: number;
  total: number;
} {
  const { t } = useTranslation();
  const apiKeys = useAppSelector(selectApiKeys);
  const webhooks = useAppSelector(selectWebhooks);
  const business = useAppSelector(selectBusiness);
  const wallets = useAppSelector(selectWallets);
  const listings = useAppSelector(selectApiListings);
  const agents = useAppSelector(selectAgents);
  const summary = useAppSelector(selectPaymentSummary);
  const user = useAppSelector(selectUser);

  const canReceive = wallets.some(
    (wallet) =>
      wallet.status === "ACTIVE" &&
      (wallet.role === "RECIPIENT" || wallet.role === "BOTH"),
  );

  const items: ChecklistItem[] = [
    {
      id: "wallet",
      title: t("checklist.wallet"),
      hint: t("checklist.walletHint"),
      to: "/wallet",
      done: wallets.length > 0,
    },
    {
      id: "receive",
      title: t("checklist.receive"),
      hint: t("checklist.receiveHint"),
      to: "/wallet",
      done: canReceive,
    },
    {
      id: "publish",
      title: t("checklist.publish"),
      hint: t("checklist.publishHint"),
      to: "/apps",
      done:
        listings.some((listing) => listing.visibility === "PUBLIC") ||
        agents.some((agent) => agent.visibility === "PUBLIC"),
    },
    {
      id: "profile",
      title: t("checklist.profile"),
      hint: t("checklist.profileHint"),
      to: "/settings/account",
      done: isProfileRenderable(user),
    },
    {
      id: "apiKey",
      title: t("checklist.apiKey"),
      hint: t("checklist.apiKeyHint"),
      to: "/settings/developer",
      done: apiKeys.some((key) => !key.revokedAt),
    },
    {
      id: "payment",
      title: t("checklist.payment"),
      hint: t("checklist.paymentHint"),
      to: "/payments",
      done: (summary?.received.settledCount ?? 0) > 0,
    },
    {
      id: "webhook",
      title: t("checklist.webhook"),
      hint: t("checklist.webhookHint"),
      to: "/settings/developer",
      done: webhooks.some((hook) => hook.status === "ENABLED"),
    },
    {
      id: "kyb",
      title: t("checklist.kyb"),
      hint: t("checklist.kybHint"),
      to: "/settings/business",
      // Onboarding already collected the legal name, so presence of a business
      // row would tick this for everyone on day one. Verification is the thing
      // that actually gates payouts, so that is what it tracks.
      done: business?.kybStatus === "VERIFIED",
      pending: business?.kybStatus === "PENDING",
    },
  ];

  return {
    items,
    done: items.filter((item) => item.done).length,
    total: items.length,
  };
}
