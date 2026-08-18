import { selectApiKeys, selectWebhooks } from "@stores/developer/selector";
import { useAppSelector } from "@stores/hooks";
import { selectBusiness } from "@stores/user/selector";
import { useTranslation } from "react-i18next";

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

  const items: ChecklistItem[] = [
    {
      id: "apiKey",
      title: t("checklist.apiKey"),
      hint: t("checklist.apiKeyHint"),
      to: "/settings/developer",
      done: apiKeys.some((key) => !key.revokedAt),
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
