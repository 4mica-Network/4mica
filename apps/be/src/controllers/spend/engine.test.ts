import { toUnits } from "@utils/units";
import { describe, expect, it } from "vitest";
import {
  budgetCrossings,
  type EnginePolicy,
  evaluate,
  policyApplies,
  type SpendSubject,
  type UsageAuthorization,
  type UsageData,
  usageOf,
} from "./engine";

const NOW = new Date("2026-11-27T12:00:00.000Z");
const EARLIER_TODAY = new Date("2026-11-27T01:00:00.000Z");
const YESTERDAY = new Date("2026-11-26T23:59:59.000Z");
const LAST_MONTH = new Date("2026-10-31T23:59:59.000Z");
const LATER = new Date("2026-11-27T12:05:00.000Z");
const PAST = new Date("2026-11-27T11:55:00.000Z");

const USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const RECIPIENT = "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5";
const OTHER_RECIPIENT = "0x3d8e1f5a7c9b2d4e6a8c0f2b4d6e8a1c3f5b7d09";
const AGENT_WALLET = "0x1111111111111111111111111111111111111111";
const ORG_WALLET = "0x2222222222222222222222222222222222222222";

const u = (value: string) => toUnits(value);

const policy = (over: Partial<EnginePolicy> = {}): EnginePolicy => ({
  id: "policy_1",
  name: "Org budget",
  scope: "ORGANIZATION",
  projectId: null,
  agentId: null,
  apiKeyId: null,
  mode: "ENFORCE",
  network: "BASE_SEPOLIA",
  assetAddress: USDC,
  perPaymentLimit: null,
  dailyLimit: null,
  monthlyLimit: null,
  approvalThreshold: null,
  approvalsRequired: 1,
  allowedRecipients: [],
  alertThresholds: [80, 100],
  frozen: false,
  ...over,
});

const subject = (over: Partial<SpendSubject> = {}): SpendSubject => ({
  projectId: "project_1",
  agentId: "agent_1",
  apiKeyId: "key_1",
  network: "BASE_SEPOLIA",
  assetAddress: USDC,
  amount: u("10"),
  recipientAddress: RECIPIENT,
  ...over,
});

let seq = 0;
const auth = (over: Partial<UsageAuthorization> = {}): UsageAuthorization => {
  seq += 1;
  return {
    id: `auth_${seq}`,
    reqId: null,
    status: "CONSUMED",
    amount: u("10"),
    createdAt: EARLIER_TODAY,
    expiresAt: LATER,
    projectId: "project_1",
    agentId: "agent_1",
    apiKeyId: "key_1",
    ...over,
  };
};

const data = (over: Partial<UsageData> = {}): UsageData => ({
  authorizations: [],
  payments: [],
  agentWallets: { agent_1: [AGENT_WALLET] },
  ...over,
});

describe("evaluate: deny reasons", () => {
  it("denies a frozen policy before anything else", () => {
    const decision = evaluate(
      subject({ recipientAddress: OTHER_RECIPIENT }),
      [
        policy({
          frozen: true,
          allowedRecipients: [RECIPIENT],
          perPaymentLimit: u("1"),
        }),
      ],
      data(),
      NOW,
    );
    expect(decision).toMatchObject({ kind: "deny", reason: "frozen" });
  });

  it("denies a recipient outside a non-empty allow list", () => {
    expect(
      evaluate(
        subject({ recipientAddress: OTHER_RECIPIENT }),
        [policy({ allowedRecipients: [RECIPIENT] })],
        data(),
        NOW,
      ),
    ).toMatchObject({ kind: "deny", reason: "recipient_not_allowed" });
    expect(
      evaluate(
        subject(),
        [policy({ allowedRecipients: [RECIPIENT] })],
        data(),
        NOW,
      ),
    ).toEqual({ kind: "reserve" });
  });

  it("denies above the per-payment limit but allows exactly at it", () => {
    expect(
      evaluate(
        subject({ amount: u("10.000000000000000001") }),
        [policy({ perPaymentLimit: u("10") })],
        data(),
        NOW,
      ),
    ).toMatchObject({ kind: "deny", reason: "per_payment_limit" });
    expect(
      evaluate(subject(), [policy({ perPaymentLimit: u("10") })], data(), NOW),
    ).toEqual({ kind: "reserve" });
  });

  it("denies when usage plus amount exceeds the daily limit", () => {
    const usage = data({ authorizations: [auth({ amount: u("95") })] });
    expect(
      evaluate(subject(), [policy({ dailyLimit: u("100") })], usage, NOW),
    ).toMatchObject({ kind: "deny", reason: "daily_limit" });
    expect(
      evaluate(
        subject({ amount: u("5") }),
        [policy({ dailyLimit: u("100") })],
        usage,
        NOW,
      ),
    ).toEqual({ kind: "reserve" });
  });

  it("denies when usage plus amount exceeds the monthly limit", () => {
    const usage = data({
      authorizations: [auth({ amount: u("95"), createdAt: YESTERDAY })],
    });
    expect(
      evaluate(
        subject(),
        [policy({ dailyLimit: u("100"), monthlyLimit: u("100") })],
        usage,
        NOW,
      ),
    ).toMatchObject({ kind: "deny", reason: "monthly_limit" });
  });

  it("reports the first failing policy in order", () => {
    const decision = evaluate(
      subject({ amount: u("50") }),
      [
        policy({ id: "a", perPaymentLimit: u("100") }),
        policy({ id: "b", perPaymentLimit: u("20") }),
        policy({ id: "c", frozen: true }),
      ],
      data(),
      NOW,
    );
    expect(decision).toMatchObject({
      kind: "deny",
      reason: "per_payment_limit",
      policy: { id: "b" },
    });
  });

  it("never lets a MONITOR policy deny or ask for approval", () => {
    expect(
      evaluate(
        subject({ amount: u("1000"), recipientAddress: OTHER_RECIPIENT }),
        [
          policy({
            mode: "MONITOR",
            frozen: true,
            allowedRecipients: [RECIPIENT],
            perPaymentLimit: u("1"),
            dailyLimit: u("1"),
            monthlyLimit: u("1"),
            approvalThreshold: u("1"),
          }),
        ],
        data(),
        NOW,
      ),
    ).toEqual({ kind: "reserve" });
  });

  it("ignores amount limits on a policy without a network", () => {
    expect(
      evaluate(
        subject({ amount: u("1000") }),
        [
          policy({
            network: null,
            assetAddress: null,
            perPaymentLimit: u("1"),
          }),
        ],
        data(),
        NOW,
      ),
    ).toEqual({ kind: "reserve" });
  });
});

describe("evaluate: approvals", () => {
  it("asks for approval above a threshold, with the most approvals any trigger needs", () => {
    const decision = evaluate(
      subject({ amount: u("30") }),
      [
        policy({ id: "a", approvalThreshold: u("25"), approvalsRequired: 1 }),
        policy({ id: "b", approvalThreshold: u("20"), approvalsRequired: 3 }),
        policy({ id: "c", approvalThreshold: u("50"), approvalsRequired: 5 }),
      ],
      data(),
      NOW,
    );
    expect(decision).toMatchObject({ kind: "approval", requiredApprovals: 3 });
    expect(
      decision.kind === "approval" && decision.policies.map((p) => p.id),
    ).toEqual(["a", "b"]);
  });

  it("reserves at exactly the threshold", () => {
    expect(
      evaluate(
        subject({ amount: u("25") }),
        [policy({ approvalThreshold: u("25") })],
        data(),
        NOW,
      ),
    ).toEqual({ kind: "reserve" });
  });

  it("denies before asking for approval", () => {
    expect(
      evaluate(
        subject({ amount: u("30") }),
        [policy({ approvalThreshold: u("25"), perPaymentLimit: u("29") })],
        data(),
        NOW,
      ),
    ).toMatchObject({ kind: "deny", reason: "per_payment_limit" });
  });

  it("re-checks without the threshold and without counting itself", () => {
    const pending = auth({
      status: "PENDING_APPROVAL",
      amount: u("30"),
      createdAt: PAST,
    });
    const options = {
      ignoreApprovalThreshold: true,
      excludeId: pending.id,
    };
    const policies = [
      policy({ approvalThreshold: u("25"), dailyLimit: u("50") }),
    ];
    expect(
      evaluate(
        subject({ amount: u("30") }),
        policies,
        data({ authorizations: [pending] }),
        NOW,
        options,
      ),
    ).toEqual({ kind: "reserve" });
    expect(
      evaluate(
        subject({ amount: u("30") }),
        policies,
        data({ authorizations: [pending, auth({ amount: u("25") })] }),
        NOW,
        options,
      ),
    ).toMatchObject({ kind: "deny", reason: "daily_limit" });
  });
});

describe("policy applicability", () => {
  it("selects by scope: organization, project, agent and key", () => {
    const s = subject();
    expect(policyApplies(policy(), s)).toBe(true);
    expect(
      policyApplies(policy({ scope: "PROJECT", projectId: "project_1" }), s),
    ).toBe(true);
    expect(
      policyApplies(policy({ scope: "PROJECT", projectId: "project_2" }), s),
    ).toBe(false);
    expect(
      policyApplies(policy({ scope: "AGENT", agentId: "agent_1" }), s),
    ).toBe(true);
    expect(
      policyApplies(policy({ scope: "AGENT", agentId: "agent_2" }), s),
    ).toBe(false);
    expect(
      policyApplies(
        policy({ scope: "AGENT", agentId: "agent_1" }),
        subject({ agentId: null }),
      ),
    ).toBe(false);
    expect(
      policyApplies(policy({ scope: "API_KEY", apiKeyId: "key_1" }), s),
    ).toBe(true);
    expect(
      policyApplies(policy({ scope: "API_KEY", apiKeyId: "key_2" }), s),
    ).toBe(false);
  });

  it("matches network and asset exactly, and a null network matches all", () => {
    const s = subject();
    expect(policyApplies(policy({ network: "BASE" }), s)).toBe(false);
    expect(policyApplies(policy({ assetAddress: null }), s)).toBe(false);
    expect(
      policyApplies(policy({ network: null, assetAddress: null }), s),
    ).toBe(true);
    expect(
      policyApplies(
        policy({ assetAddress: null }),
        subject({ assetAddress: null }),
      ),
    ).toBe(true);
  });

  it("does not let a policy for another scope or asset deny", () => {
    expect(
      evaluate(
        subject(),
        [
          policy({ scope: "PROJECT", projectId: "project_2", frozen: true }),
          policy({ network: "BASE", frozen: true }),
        ],
        data(),
        NOW,
      ),
    ).toEqual({ kind: "reserve" });
  });
});

describe("usage", () => {
  it("splits UTC day and month windows", () => {
    const usage = usageOf(
      policy(),
      data({
        authorizations: [
          auth({ amount: u("1"), createdAt: EARLIER_TODAY }),
          auth({ amount: u("2"), createdAt: YESTERDAY }),
          auth({ amount: u("4"), createdAt: LAST_MONTH }),
        ],
      }),
      NOW,
    );
    expect(usage).toEqual({ day: u("1"), month: u("3"), reserved: 0n });
  });

  it("starts a new day at UTC midnight regardless of offsets", () => {
    const justAfterMidnight = new Date("2026-11-28T00:00:01.000Z");
    const usage = usageOf(
      policy(),
      data({
        authorizations: [
          auth({ amount: u("7"), createdAt: new Date("2026-11-27T23:59:00Z") }),
        ],
      }),
      justAfterMidnight,
    );
    expect(usage.day).toBe(0n);
    expect(usage.month).toBe(u("7"));
  });

  it("counts live reservations and pending approvals but not expired ones", () => {
    const usage = usageOf(
      policy(),
      data({
        authorizations: [
          auth({ status: "RESERVED", amount: u("1"), expiresAt: LATER }),
          auth({ status: "RESERVED", amount: u("2"), expiresAt: PAST }),
          auth({
            status: "PENDING_APPROVAL",
            amount: u("4"),
            expiresAt: LATER,
          }),
          auth({ status: "PENDING_APPROVAL", amount: u("8"), expiresAt: PAST }),
          auth({ status: "CONSUMED", amount: u("16"), expiresAt: PAST }),
          auth({ status: "RELEASED", amount: u("32") }),
          auth({ status: "DENIED", amount: u("64") }),
          auth({ status: "EXPIRED", amount: u("128") }),
        ],
      }),
      NOW,
    );
    expect(usage).toEqual({ day: u("21"), month: u("21"), reserved: u("5") });
  });

  it("scopes authorizations to the policy's project, agent or key", () => {
    const rows = data({
      authorizations: [
        auth({ amount: u("1") }),
        auth({ amount: u("2"), projectId: "project_2", agentId: null }),
        auth({ amount: u("4"), agentId: "agent_2", apiKeyId: "key_2" }),
      ],
    });
    expect(usageOf(policy(), rows, NOW).day).toBe(u("7"));
    expect(
      usageOf(policy({ scope: "PROJECT", projectId: "project_1" }), rows, NOW)
        .day,
    ).toBe(u("5"));
    expect(
      usageOf(policy({ scope: "AGENT", agentId: "agent_1" }), rows, NOW).day,
    ).toBe(u("1"));
    expect(
      usageOf(policy({ scope: "API_KEY", apiKeyId: "key_2" }), rows, NOW).day,
    ).toBe(u("4"));
  });

  it("counts unmatched reported payments for organization and agent scopes only", () => {
    const rows = data({
      authorizations: [auth({ amount: u("1"), reqId: "0xmatched" })],
      payments: [
        {
          reqId: "0xmatched",
          amount: u("1"),
          createdAt: EARLIER_TODAY,
          payerAddress: AGENT_WALLET,
        },
        {
          reqId: "0xagent",
          amount: u("10"),
          createdAt: EARLIER_TODAY,
          payerAddress: AGENT_WALLET,
        },
        {
          reqId: "0xorg",
          amount: u("100"),
          createdAt: EARLIER_TODAY,
          payerAddress: ORG_WALLET,
        },
        {
          reqId: "0xorg",
          amount: u("100"),
          createdAt: EARLIER_TODAY,
          payerAddress: ORG_WALLET,
        },
      ],
    });

    expect(usageOf(policy(), rows, NOW).day).toBe(u("111"));
    expect(
      usageOf(policy({ scope: "AGENT", agentId: "agent_1" }), rows, NOW).day,
    ).toBe(u("11"));
    expect(
      usageOf(policy({ scope: "PROJECT", projectId: "project_1" }), rows, NOW)
        .day,
    ).toBe(u("1"));
    expect(
      usageOf(policy({ scope: "API_KEY", apiKeyId: "key_1" }), rows, NOW).day,
    ).toBe(u("1"));
  });

  it("counts a payment its authorization does not cover, and one matching only an expired reservation", () => {
    const rows = data({
      authorizations: [
        auth({ amount: u("1"), reqId: "0xover" }),
        auth({
          status: "RESERVED",
          amount: u("5"),
          reqId: "0xstale",
          expiresAt: PAST,
        }),
      ],
      payments: [
        {
          reqId: "0xover",
          amount: u("50"),
          createdAt: EARLIER_TODAY,
          payerAddress: ORG_WALLET,
        },
        {
          reqId: "0xstale",
          amount: u("5"),
          createdAt: EARLIER_TODAY,
          payerAddress: ORG_WALLET,
        },
      ],
    });
    expect(usageOf(policy(), rows, NOW).day).toBe(u("56"));
  });

  it("denies when unmatched payments have used the budget", () => {
    expect(
      evaluate(
        subject(),
        [policy({ dailyLimit: u("100") })],
        data({
          payments: [
            {
              reqId: "0xrogue",
              amount: u("95"),
              createdAt: EARLIER_TODAY,
              payerAddress: ORG_WALLET,
            },
          ],
        }),
        NOW,
      ),
    ).toMatchObject({ kind: "deny", reason: "daily_limit" });
  });
});

describe("budget crossings", () => {
  it("reports every threshold reached, per window and period, for any mode", () => {
    const crossings = budgetCrossings(
      [
        policy({
          id: "p",
          mode: "MONITOR",
          dailyLimit: u("100"),
          monthlyLimit: u("1000"),
          alertThresholds: [50, 80, 100],
        }),
      ],
      data({ authorizations: [auth({ amount: u("80") })] }),
      NOW,
    );
    expect(
      crossings.map((c) => [c.window, c.period, c.percent, c.used]),
    ).toEqual([
      ["daily", "2026-11-27", 50, u("80")],
      ["daily", "2026-11-27", 80, u("80")],
    ]);
  });

  it("skips policies without limits, thresholds or a network", () => {
    expect(
      budgetCrossings(
        [
          policy({ alertThresholds: [1] }),
          policy({ dailyLimit: u("1"), alertThresholds: [] }),
          policy({ network: null, dailyLimit: u("1") }),
        ],
        data({ authorizations: [auth({ amount: u("80") })] }),
        NOW,
      ),
    ).toEqual([]);
  });

  it("uses the month as the monthly period", () => {
    const [crossing] = budgetCrossings(
      [policy({ monthlyLimit: u("10"), alertThresholds: [100] })],
      data({
        authorizations: [auth({ amount: u("10"), createdAt: YESTERDAY })],
      }),
      NOW,
    );
    expect(crossing).toMatchObject({ window: "monthly", period: "2026-11" });
  });
});
