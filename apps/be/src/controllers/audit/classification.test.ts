import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BEST_EFFORT_AUDIT_ACTIONS,
  isMandatoryAuditAction,
  MANDATORY_AUDIT_ACTIONS,
} from "./classification";

const { $transaction, auditLog } = vi.hoisted(() => ({
  $transaction: vi.fn(),
  auditLog: { create: vi.fn() },
}));

vi.mock("@4mica/db", () => ({
  prisma: { $transaction, auditLog },
  disconnect: vi.fn(),
}));

const { audit, recordAudit, withAudit, withProjectAudit } = await import(
  "@controllers/shared"
);

const SRC = join(import.meta.dirname, "..", "..");

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sources(path);
    }
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });

const callArguments = (text: string, start: number): string => {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "(") {
      depth++;
    } else if (text[i] === ")") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i);
      }
    }
  }
  return text.slice(start);
};

const actionsIn = (args: string): string[] =>
  [...args.matchAll(/action:([\s\S]*?)(?=\n\s*[A-Za-z.]+[:,]|\n\s*[}\]])/g)]
    .flatMap((match) => [
      ...(match[1] ?? "").matchAll(/"([a-z_]+(?:\.[a-z_]+)+)"/g),
    ])
    .map((match) => match[1] as string);

const callsOf = (pattern: RegExp) =>
  sources(SRC).flatMap((path) => {
    const text = readFileSync(path, "utf8");
    return [...text.matchAll(pattern)].flatMap((match) =>
      actionsIn(
        callArguments(text, (match.index ?? 0) + match[0].length - 1),
      ).map((action) => ({ file: relative(SRC, path), action })),
    );
  });

const request = { ip: "203.0.113.9" } as Parameters<typeof audit>[0];
const actor = { orgId: "org", userId: "user" };

describe("audit classification", () => {
  it("classifies every action exactly once", () => {
    const both = MANDATORY_AUDIT_ACTIONS.filter((action) =>
      (BEST_EFFORT_AUDIT_ACTIONS as readonly string[]).includes(action),
    );
    expect(both).toEqual([]);
    expect(new Set(MANDATORY_AUDIT_ACTIONS).size).toBe(
      MANDATORY_AUDIT_ACTIONS.length,
    );
  });

  it("writes no mandatory event through the best-effort path", () => {
    const bestEffort = callsOf(/(?<![\w.])(?:audit|auditProject)\(/g);
    const offending = bestEffort
      .filter(({ action }) => isMandatoryAuditAction(action))
      .map(({ file, action }) => `${file}:${action}`);

    expect(bestEffort.length).toBeGreaterThan(0);
    expect([...new Set(offending)].sort()).toEqual([]);
  });

  it("names only classified actions on the best-effort path", () => {
    const unclassified = callsOf(/(?<![\w.])(?:audit|auditProject)\(/g)
      .map(({ action }) => action)
      .filter(
        (action) =>
          !isMandatoryAuditAction(action) &&
          !(BEST_EFFORT_AUDIT_ACTIONS as readonly string[]).includes(action),
      );

    expect(unclassified).toEqual([]);
  });

  it("classifies limit, policy, compliance and ownership changes as mandatory", () => {
    for (const action of [
      "beneficial_owner.added",
      "beneficial_owner.removed",
      "beneficial_owner.updated",
      "business.updated",
      "compliance.submitted",
      "compliance.updated",
      "customer.deleted",
      "customer.identity_changed",
      "customer.limits_updated",
      "customer.status_changed",
      "resource_policy.updated",
    ]) {
      expect(isMandatoryAuditAction(action), action).toBe(true);
    }
    expect(isMandatoryAuditAction("customer.updated")).toBe(false);
  });

  it("treats every spend lifecycle transition as mandatory and writes it transactionally", () => {
    const lifecycle = [
      "spend.approval_requested",
      "spend.consumed",
      "spend.denied",
      "spend.reconciled",
      "spend.reconciliation_unmatched",
      "spend.released",
    ];
    for (const action of lifecycle) {
      expect(isMandatoryAuditAction(action), action).toBe(true);
    }
    const spend = sources(join(SRC, "controllers", "spend"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(spend).not.toContain("writeAudit(prisma");
    for (const action of lifecycle) {
      expect(spend, action).toContain(`"${action}"`);
    }
  });

  it("never writes a mandatory event outside a transaction", () => {
    const direct = callsOf(/writeAudit\(prisma,/g).filter(({ action }) =>
      isMandatoryAuditAction(action),
    );

    expect(direct).toEqual([]);
  });

  it("routes every converted mandatory event through the transactional helpers", () => {
    const transactional = new Set(
      callsOf(/(?<![\w.])(?:withAudit|withProjectAudit|recordAudit)\(/g).map(
        ({ action }) => action,
      ),
    );

    for (const action of [
      "api_key.created",
      "api_key.rotated",
      "approval.approved",
      "approval.requested",
      "beneficial_owner.added",
      "beneficial_owner.removed",
      "beneficial_owner.updated",
      "business.updated",
      "compliance.submitted",
      "compliance.updated",
      "customer.credit_adjusted",
      "customer.deleted",
      "customer.identity_changed",
      "customer.limits_updated",
      "customer.status_changed",
      "resource_policy.updated",
      "domain.removed",
      "governance.updated",
      "member.sessions_revoked",
      "report.exported",
      "scim_token.created",
      "security.updated",
      "service_account.suspended",
      "spending_policy.created",
      "sso.updated",
      "wallet.removed",
      "webhook.secret_rotated",
    ]) {
      expect(transactional, action).toContain(action);
    }
    for (const action of transactional) {
      expect(isMandatoryAuditAction(action), action).toBe(true);
    }
  });
});

describe("audit helpers", () => {
  afterEach(() => {
    $transaction.mockReset();
    auditLog.create.mockReset();
  });

  const inTransaction = (tx: object) =>
    $transaction.mockImplementation(async (work: (client: object) => unknown) =>
      work(tx),
    );

  it("writes a mandatory event inside the mutation's transaction", async () => {
    const tx = { auditLog: { create: vi.fn().mockResolvedValue({ id: "a" }) } };
    inTransaction(tx);

    const result = await withAudit(
      request,
      actor,
      async (client) => {
        expect(client).toBe(tx);
        return { id: "key" };
      },
      (row) => ({ action: "api_key.created", targetId: row.id }),
    );

    expect(result).toEqual({ id: "key" });
    expect(tx.auditLog.create.mock.calls[0]?.[0].data).toMatchObject({
      organizationId: "org",
      actorUserId: "user",
      action: "api_key.created",
      targetId: "key",
      ip: "203.0.113.9",
    });
    expect(auditLog.create).not.toHaveBeenCalled();
  });

  it("fails the whole change when the audit write fails", async () => {
    const failure = new Error("audit store unavailable");
    inTransaction({ auditLog: { create: vi.fn().mockRejectedValue(failure) } });

    await expect(
      withAudit(request, actor, async () => true, {
        action: "wallet.removed",
      }),
    ).rejects.toBe(failure);
  });

  it("skips the entry when the mutation found nothing to change", async () => {
    const tx = { auditLog: { create: vi.fn() } };
    inTransaction(tx);

    await withAudit(
      request,
      actor,
      async () => null,
      (row) => row && { action: "api_key.revoked" },
    );

    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("passes the isolation level through and tags project events", async () => {
    const tx = { auditLog: { create: vi.fn().mockResolvedValue({ id: "a" }) } };
    inTransaction(tx);
    const scope = {
      orgId: "org",
      userId: "user",
      projectId: "project",
      environment: "SANDBOX",
    } as Parameters<typeof withProjectAudit>[1];

    await withProjectAudit(
      request,
      scope,
      async () => undefined,
      { action: "customer.credit_adjusted", metadata: { kind: "reset" } },
      { isolationLevel: "Serializable" },
    );

    expect($transaction.mock.calls[0]?.[1]).toEqual({
      isolationLevel: "Serializable",
    });
    expect(tx.auditLog.create.mock.calls[0]?.[0].data).toMatchObject({
      projectId: "project",
      metadata: { projectId: "project", environment: "SANDBOX", kind: "reset" },
    });
  });

  it("propagates a failed record of an event with no local write", async () => {
    const failure = new Error("audit store unavailable");
    inTransaction({ auditLog: { create: vi.fn().mockRejectedValue(failure) } });

    await expect(
      recordAudit(request, actor, { action: "report.exported" }),
    ).rejects.toBe(failure);
  });

  it("keeps the best-effort path from throwing", async () => {
    auditLog.create.mockRejectedValue(new Error("audit store unavailable"));

    await expect(
      audit(request, actor, { action: "support_request.created" }),
    ).resolves.toBeUndefined();
    expect($transaction).not.toHaveBeenCalled();
  });
});
