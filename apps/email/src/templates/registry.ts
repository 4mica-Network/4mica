import type { TemplateId, TemplateProps } from "@4mica/email-client";
import { brand, formatMoney } from "@components/index";
import Announcement from "@emails/marketing/Announcement";
import WeeklyReport from "@emails/marketing/WeeklyReport";
import AccountVerification from "@emails/onboarding/AccountVerification";
import ActionRequired from "@emails/onboarding/ActionRequired";
import ApiKeys from "@emails/onboarding/steps/ApiKeys";
import AutomaticPaidRequests from "@emails/onboarding/steps/AutomaticPaidRequests";
import BilateralNetting from "@emails/onboarding/steps/BilateralNetting";
import BudgetsAndLimits from "@emails/onboarding/steps/BudgetsAndLimits";
import BusinessAndKyb from "@emails/onboarding/steps/BusinessAndKyb";
import BuyerQuickStart from "@emails/onboarding/steps/BuyerQuickStart";
import CliAndExamples from "@emails/onboarding/steps/CliAndExamples";
import CollateralRatios from "@emails/onboarding/steps/CollateralRatios";
import DepositsAndWithdrawals from "@emails/onboarding/steps/DepositsAndWithdrawals";
import EarningYield from "@emails/onboarding/steps/EarningYield";
import Facilitator from "@emails/onboarding/steps/Facilitator";
import FinishSetup from "@emails/onboarding/steps/FinishSetup";
import FrameworkQuickstarts from "@emails/onboarding/steps/FrameworkQuickstarts";
import GoLiveAndSupport from "@emails/onboarding/steps/GoLiveAndSupport";
import HowPaymentsWork from "@emails/onboarding/steps/HowPaymentsWork";
import Microtransactions from "@emails/onboarding/steps/Microtransactions";
import NoCustodialRisk from "@emails/onboarding/steps/NoCustodialRisk";
import PaymentMiddleware from "@emails/onboarding/steps/PaymentMiddleware";
import PaymentProofAndAudit from "@emails/onboarding/steps/PaymentProofAndAudit";
import PricingAndMonetization from "@emails/onboarding/steps/PricingAndMonetization";
import ProfileAndHandle from "@emails/onboarding/steps/ProfileAndHandle";
import ProofAndDisputes from "@emails/onboarding/steps/ProofAndDisputes";
import SafetyAndPermissions from "@emails/onboarding/steps/SafetyAndPermissions";
import SellerQuickStart from "@emails/onboarding/steps/SellerQuickStart";
import Settlements from "@emails/onboarding/steps/Settlements";
import TestInSandbox from "@emails/onboarding/steps/TestInSandbox";
import TransactionLifecycle from "@emails/onboarding/steps/TransactionLifecycle";
import TypescriptSdk from "@emails/onboarding/steps/TypescriptSdk";
import Webhooks from "@emails/onboarding/steps/Webhooks";
import Welcome from "@emails/onboarding/steps/Welcome";
import AccountDeleted from "@emails/platform/AccountDeleted";
import AgentCreated from "@emails/platform/AgentCreated";
import CreditLimitChanged from "@emails/platform/CreditLimitChanged";
import DisputeCreated from "@emails/platform/DisputeCreated";
import PaymentSucceeded from "@emails/platform/PaymentSucceeded";
import PayoutPaid from "@emails/platform/PayoutPaid";
import Receipt from "@emails/platform/Receipt";
import SubscriptionExpiration from "@emails/platform/SubscriptionExpiration";
import SubscriptionRenewed from "@emails/platform/SubscriptionRenewed";
import WaitlistConfirmation from "@emails/platform/WaitlistConfirmation";
import WaitlistInvitation from "@emails/platform/WaitlistInvitation";
import WorkspaceInvite from "@emails/platform/WorkspaceInvite";
import type { ReactElement } from "react";

export interface TemplateDefinition<K extends TemplateId> {
  summary: string;
  subject: (props: TemplateProps<K>) => string;
  component: (props: TemplateProps<K>) => ReactElement;
  replyTo?: string;
}

const define = <K extends TemplateId>(
  definition: TemplateDefinition<K>,
): TemplateDefinition<K> => definition;

export const registry = {
  // --- Onboarding drip, in send order. The order itself lives in
  // --- `ONBOARDING_STEP_IDS` (@4mica/email-client); `onboarding.test.ts`
  // --- fails if these ids drift from it.
  welcome: define<"welcome">({
    summary: "Step 1 — welcome a newly registered user",
    subject: () => `Welcome to ${brand.name}`,
    component: Welcome,
  }),

  "onboarding-finish-setup": define<"onboarding-finish-setup">({
    summary: "Step 2 — the integration checklist",
    subject: () => "Three things to finish your integration",
    component: FinishSetup,
  }),

  "onboarding-api-keys": define<"onboarding-api-keys">({
    summary: "Step 3 — API keys",
    subject: () => "Creating and protecting your API key",
    component: ApiKeys,
  }),

  "onboarding-profile-and-handle": define<"onboarding-profile-and-handle">({
    summary: "Step 4 — profile and username",
    subject: () => "Your handle and public profile",
    component: ProfileAndHandle,
  }),

  "onboarding-business-and-kyb": define<"onboarding-business-and-kyb">({
    summary: "Step 5 — business details and KYB",
    subject: () => "Verify your business before you take payouts",
    component: BusinessAndKyb,
  }),

  "onboarding-how-payments-work": define<"onboarding-how-payments-work">({
    summary: "Step 6 — the x402 protocol and the 4mica-credit scheme",
    subject: () => "How x402 payments actually work",
    component: HowPaymentsWork,
  }),

  "onboarding-transaction-lifecycle":
    define<"onboarding-transaction-lifecycle">({
      summary: "Step 7 — the transaction lifecycle",
      subject: () => "The life of a single payment",
      component: TransactionLifecycle,
    }),

  "onboarding-deposits-and-withdrawals":
    define<"onboarding-deposits-and-withdrawals">({
      summary: "Step 8 — deposits and withdrawals",
      subject: () => "Deposit once, withdraw when you need to",
      component: DepositsAndWithdrawals,
    }),

  "onboarding-no-custodial-risk": define<"onboarding-no-custodial-risk">({
    summary: "Step 9 — the non-custodial model",
    subject: () => `${brand.name} cannot move your funds`,
    component: NoCustodialRisk,
  }),

  "onboarding-collateral-ratios": define<"onboarding-collateral-ratios">({
    summary: "Step 10 — collateral ratios",
    subject: () => "How much credit your collateral backs",
    component: CollateralRatios,
  }),

  "onboarding-bilateral-netting": define<"onboarding-bilateral-netting">({
    summary: "Step 11 — bilateral netting",
    subject: () => "Why thousands of payments become one",
    component: BilateralNetting,
  }),

  "onboarding-settlements": define<"onboarding-settlements">({
    summary: "Step 12 — settlement",
    subject: () => "How a cycle settles on-chain",
    component: Settlements,
  }),

  "onboarding-earning-yield": define<"onboarding-earning-yield">({
    summary: "Step 13 — yield on collateral",
    subject: () => "Your collateral does not sit idle",
    component: EarningYield,
  }),

  "onboarding-buyer-quick-start": define<"onboarding-buyer-quick-start">({
    summary: "Step 14 — buyer quick start",
    subject: () => "Make your first paid request",
    component: BuyerQuickStart,
  }),

  "onboarding-budgets-and-limits": define<"onboarding-budgets-and-limits">({
    summary: "Step 15 — budgets and spending limits",
    subject: () => "Putting limits on what an agent can spend",
    component: BudgetsAndLimits,
  }),

  "onboarding-safety-and-permissions":
    define<"onboarding-safety-and-permissions">({
      summary: "Step 16 — safety and permissions",
      subject: () => "What your agent is allowed to do",
      component: SafetyAndPermissions,
    }),

  "onboarding-payment-proof-and-audit":
    define<"onboarding-payment-proof-and-audit">({
      summary: "Step 17 — payment proof and audit",
      subject: () => "Proving what you paid for",
      component: PaymentProofAndAudit,
    }),

  "onboarding-automatic-paid-requests":
    define<"onboarding-automatic-paid-requests">({
      summary: "Step 18 — automatic paid requests",
      subject: () => "Let payment happen automatically",
      component: AutomaticPaidRequests,
    }),

  "onboarding-seller-quick-start": define<"onboarding-seller-quick-start">({
    summary: "Step 19 — seller quick start",
    subject: () => "Charge for your first route",
    component: SellerQuickStart,
  }),

  "onboarding-payment-middleware": define<"onboarding-payment-middleware">({
    summary: "Step 20 — payment middleware",
    subject: () => "Payment middleware for your framework",
    component: PaymentMiddleware,
  }),

  "onboarding-pricing-and-monetization":
    define<"onboarding-pricing-and-monetization">({
      summary: "Step 21 — pricing and monetization",
      subject: () => "Deciding what to charge",
      component: PricingAndMonetization,
    }),

  "onboarding-microtransactions": define<"onboarding-microtransactions">({
    summary: "Step 22 — microtransactions",
    subject: () => "Charging fractions of a cent",
    component: Microtransactions,
  }),

  "onboarding-proof-and-disputes": define<"onboarding-proof-and-disputes">({
    summary: "Step 23 — proof and disputes",
    subject: () => "When a payment is disputed",
    component: ProofAndDisputes,
  }),

  "onboarding-typescript-sdk": define<"onboarding-typescript-sdk">({
    summary: "Step 24 — the TypeScript SDK",
    subject: () => "The TypeScript SDK",
    component: TypescriptSdk,
  }),

  "onboarding-framework-quickstarts":
    define<"onboarding-framework-quickstarts">({
      summary: "Step 25 — framework and language quick starts",
      subject: () => "A quick start for your stack",
      component: FrameworkQuickstarts,
    }),

  "onboarding-cli-and-examples": define<"onboarding-cli-and-examples">({
    summary: "Step 26 — the CLI and example projects",
    subject: () => "Scaffold a working project in one command",
    component: CliAndExamples,
  }),

  "onboarding-facilitator": define<"onboarding-facilitator">({
    summary: "Step 27 — the facilitator",
    subject: () => "The facilitator, and running your own",
    component: Facilitator,
  }),

  "onboarding-webhooks": define<"onboarding-webhooks">({
    summary: "Step 28 — webhooks",
    subject: () => "Know when things happen",
    component: Webhooks,
  }),

  "onboarding-test-in-sandbox": define<"onboarding-test-in-sandbox">({
    summary: "Step 29 — testing in the sandbox",
    subject: () => "Test everything before it costs anything",
    component: TestInSandbox,
  }),

  "onboarding-go-live-and-support": define<"onboarding-go-live-and-support">({
    summary: "Step 30 — go-live checklist and support",
    subject: () => "Going live, and where to find us",
    component: GoLiveAndSupport,
  }),

  "action-required": define<"action-required">({
    summary: "Ask the user to complete a required step",
    subject: ({ actionText }) => `Action required: ${actionText}`,
    component: ActionRequired,
  }),

  "account-verification": define<"account-verification">({
    summary: "Ask a user to confirm their email address",
    subject: () => `Verify your email for ${brand.name}`,
    component: AccountVerification,
  }),

  "waitlist-confirmation": define<"waitlist-confirmation">({
    summary: "Confirm a waitlist signup",
    subject: () => `You're on the ${brand.name} waitlist`,
    component: WaitlistConfirmation,
  }),

  "waitlist-invitation": define<"waitlist-invitation">({
    summary: "Invite a waitlisted user to sign up",
    subject: () => `Your ${brand.name} invite is ready`,
    component: WaitlistInvitation,
  }),

  "workspace-invite": define<"workspace-invite">({
    summary: "Invite someone to a workspace",
    subject: ({ workspaceName }) => `Join ${workspaceName} on ${brand.name}`,
    component: WorkspaceInvite,
  }),

  receipt: define<"receipt">({
    summary: "Send a purchase receipt",
    subject: ({ orderNumber }) => `Your ${brand.name} receipt ${orderNumber}`,
    component: Receipt,
    replyTo: "billing@4mica.io",
  }),

  "subscription-expiration": define<"subscription-expiration">({
    summary: "Warn that a subscription is about to expire",
    subject: ({ planName }) => `Your ${planName} plan expires soon`,
    component: SubscriptionExpiration,
    replyTo: "billing@4mica.io",
  }),

  "subscription-renewed": define<"subscription-renewed">({
    summary: "Confirm a subscription renewal",
    subject: ({ planName }) => `Your ${planName} plan renewed`,
    component: SubscriptionRenewed,
    replyTo: "billing@4mica.io",
  }),

  "payment-succeeded": define<"payment-succeeded">({
    summary: "Notify that a payment settled",
    subject: ({ amount }) =>
      `Payment of ${formatMoney(amount.amount, amount.currency)} succeeded`,
    component: PaymentSucceeded,
  }),

  "payout-paid": define<"payout-paid">({
    summary: "Notify that a payout was sent",
    subject: ({ amount }) =>
      `Payout of ${formatMoney(amount.amount, amount.currency)} is on its way`,
    component: PayoutPaid,
  }),

  "dispute-created": define<"dispute-created">({
    summary: "Alert that a dispute was opened",
    subject: ({ amount }) =>
      `Action needed: dispute on ${formatMoney(amount.amount, amount.currency)}`,
    component: DisputeCreated,
  }),

  "credit-limit-changed": define<"credit-limit-changed">({
    summary: "Notify that a credit limit changed",
    subject: ({ newLimit }) =>
      `Your credit limit is now ${formatMoney(newLimit.amount, newLimit.currency)}`,
    component: CreditLimitChanged,
  }),

  "agent-created": define<"agent-created">({
    summary: "Confirm that an agent was registered",
    subject: ({ agentName }) => `${agentName} is registered and ready`,
    component: AgentCreated,
  }),

  "account-deleted": define<"account-deleted">({
    summary: "Confirm that an account was deleted",
    subject: () => `Your ${brand.name} account has been deleted`,
    component: AccountDeleted,
  }),

  "weekly-report": define<"weekly-report">({
    summary: "Send the weekly activity digest",
    subject: () => `Your week on ${brand.name}`,
    component: WeeklyReport,
  }),

  announcement: define<"announcement">({
    summary: "Send a product announcement",
    subject: ({ title }) => title,
    component: Announcement,
  }),
} satisfies { [K in TemplateId]: TemplateDefinition<K> };

export type Registry = typeof registry;

export const getTemplate = <K extends TemplateId>(
  id: K,
): TemplateDefinition<K> => registry[id] as TemplateDefinition<K>;
