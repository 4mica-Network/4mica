export interface PageMeta {
  titleKey: string;
  descriptionKey: string;
  path?: string;
  index?: boolean;
}

export const APP_PAGES: PageMeta[] = [
  {
    index: true,
    titleKey: "page.overview.title",
    descriptionKey: "page.overview.description",
  },
  {
    path: "balances",
    titleKey: "page.balances.title",
    descriptionKey: "page.balances.description",
  },
  {
    path: "transactions",
    titleKey: "page.transactions.title",
    descriptionKey: "page.transactions.description",
  },
  {
    path: "payments",
    titleKey: "page.payments.title",
    descriptionKey: "page.payments.description",
  },
  {
    path: "payments/disputes",
    titleKey: "page.disputes.title",
    descriptionKey: "page.disputes.description",
  },
  {
    path: "wallet",
    titleKey: "page.wallet.title",
    descriptionKey: "page.wallet.description",
  },
  {
    path: "customers",
    titleKey: "page.customers.title",
    descriptionKey: "page.customers.description",
  },
  {
    path: "agents",
    titleKey: "page.agents.title",
    descriptionKey: "page.agents.description",
  },
  {
    path: "agents/:id",
    titleKey: "page.agent.title",
    descriptionKey: "page.agent.description",
  },
  {
    path: "agents/:id/advanced",
    titleKey: "page.advanced.title",
    descriptionKey: "page.advanced.description",
  },
  {
    path: "whitelist",
    titleKey: "page.whitelist.title",
    descriptionKey: "page.whitelist.description",
  },
  {
    path: "apps",
    titleKey: "page.apps.title",
    descriptionKey: "page.apps.description",
  },
  {
    path: "reports",
    titleKey: "page.reports.title",
    descriptionKey: "page.reports.description",
  },
  {
    path: "identity",
    titleKey: "page.identity.title",
    descriptionKey: "page.identity.description",
  },
  {
    path: "create-invoice",
    titleKey: "page.invoice.title",
    descriptionKey: "page.invoice.description",
  },
  {
    path: "help",
    titleKey: "page.help.title",
    descriptionKey: "page.help.description",
  },
];

export interface SettingsPageMeta {
  path: string;
  titleKey: string;
  descriptionKey: string;
}

export const SETTINGS_PAGES: SettingsPageMeta[] = [
  {
    path: "account",
    titleKey: "page.settings.account.title",
    descriptionKey: "page.settings.account.description",
  },
  {
    path: "profile",
    titleKey: "page.settings.profile.title",
    descriptionKey: "page.settings.profile.description",
  },
  {
    path: "business",
    titleKey: "page.settings.business.title",
    descriptionKey: "page.settings.business.description",
  },
  {
    path: "team",
    titleKey: "page.settings.team.title",
    descriptionKey: "page.settings.team.description",
  },
  {
    path: "notifications",
    titleKey: "page.settings.notifications.title",
    descriptionKey: "page.settings.notifications.description",
  },
  {
    path: "plans",
    titleKey: "page.settings.plans.title",
    descriptionKey: "page.settings.plans.description",
  },
  {
    path: "compliance",
    titleKey: "page.settings.compliance.title",
    descriptionKey: "page.settings.compliance.description",
  },
  {
    path: "developer",
    titleKey: "page.settings.developer.title",
    descriptionKey: "page.settings.developer.description",
  },
];
