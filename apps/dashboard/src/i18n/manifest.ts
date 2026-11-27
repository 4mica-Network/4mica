import { type Collection, withTranslations } from "@/i18n";

export const LAZY_TRANSLATIONS = {
  "pages/account": ["settings"],
  "pages/agent-advanced": [],
  "pages/agent-detail": ["agents", "resource", "developer"],
  "pages/agents": ["agents", "wallet"],
  "pages/api-detail": ["apis", "resource", "developer", "wallet"],
  "pages/apis": ["apis", "wallet"],
  "pages/business": ["settings"],
  "pages/cli-authorize": ["developer"],
  "pages/compliance": ["compliance", "settings"],
  "pages/customer-detail": ["customers", "payments"],
  "pages/customers": ["customers"],
  "pages/developer": ["developer"],
  "pages/disputes": [],
  "pages/help": ["help"],
  "pages/help-request": ["help"],
  "pages/notification": ["settings"],
  "pages/overview": ["overview", "payments"],
  "pages/payments": ["payments", "wallet"],
  "pages/plans": ["settings"],
  "pages/profile": ["settings", "onboarding"],
  "pages/team": ["settings"],
  "pages/wallet": ["wallet"],
  "components/Onboarding/Wizard": ["onboarding"],
  "components/IntegrationChecklist": [
    "checklist",
    "agents",
    "apis",
    "payments",
    "wallet",
  ],
} as const satisfies Record<string, readonly Collection[]>;

export type TranslatedModule = keyof typeof LAZY_TRANSLATIONS;

export const translated = <Value>(
  module: TranslatedModule,
  load: () => Promise<Value>,
) => withTranslations(load, LAZY_TRANSLATIONS[module]);
