import { describe, expect, it } from "vitest";
import {
  emptyDraft,
  type PolicyDraft,
  toPolicyInput,
  validatePolicy,
} from "./form";

const t = (key: string) => key;
const draft = (over: Partial<PolicyDraft> = {}): PolicyDraft => ({
  ...emptyDraft(),
  name: "Research",
  ...over,
});

describe("spending policy form", () => {
  it("accepts a policy with no limits and no token", () => {
    expect(validatePolicy(draft(), t)).toEqual({});
  });

  it("requires a token as soon as any limit is set", () => {
    for (const field of [
      "perPaymentLimit",
      "dailyLimit",
      "monthlyLimit",
      "approvalThreshold",
    ] as const) {
      expect(validatePolicy(draft({ [field]: "5" }), t)).toEqual({
        token: "finance.policy.errors.tokenRequired",
      });
    }
    expect(
      validatePolicy(draft({ dailyLimit: "5", token: "BASE_SEPOLIA:" }), t),
    ).toEqual({});
  });

  it("needs the target that the scope names", () => {
    expect(validatePolicy(draft({ scope: "PROJECT" }), t)).toHaveProperty(
      "projectId",
    );
    expect(validatePolicy(draft({ scope: "AGENT" }), t)).toHaveProperty(
      "agentId",
    );
    expect(validatePolicy(draft({ scope: "API_KEY" }), t)).toHaveProperty(
      "apiKeyId",
    );
  });

  it("rejects bad amounts, recipients, approvals and thresholds", () => {
    const errors = validatePolicy(
      draft({
        token: "BASE_SEPOLIA:",
        dailyLimit: "-1",
        approvalsRequired: "6",
        allowedRecipients: "0x123",
        alertThresholds: "10, 20, 30, 40, 50, 60",
      }),
      t,
    );
    expect(Object.keys(errors).sort()).toEqual([
      "alertThresholds",
      "allowedRecipients",
      "approvalsRequired",
      "dailyLimit",
    ]);
  });

  it("builds the request with the token split into network and asset", () => {
    const input = toPolicyInput(
      draft({
        scope: "PROJECT",
        projectId: "proj_1",
        token: "BASE_SEPOLIA:0x036cbd53842c5426634e7929541ec2318f3dcf7e",
        dailyLimit: "10",
        allowedRecipients: "0xABCDEFabcdef0123456789012345678901234567\n",
        alertThresholds: "100, 50",
      }),
    );
    expect(input).toMatchObject({
      projectId: "proj_1",
      agentId: null,
      network: "BASE_SEPOLIA",
      assetAddress: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
      dailyLimit: "10",
      monthlyLimit: null,
      allowedRecipients: ["0xabcdefabcdef0123456789012345678901234567"],
      alertThresholds: [50, 100],
    });
  });
});
