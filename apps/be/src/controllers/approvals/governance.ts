export const GOVERNED_ACTIONS = [
  "spending_policy.change",
  "api_key.create_production",
  "wallet.remove",
  "member.role_grant",
] as const;

export type GovernedAction = (typeof GOVERNED_ACTIONS)[number];

export const APPROVAL_HEADER = "x-approval-id";
