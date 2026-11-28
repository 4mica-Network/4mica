import { vi } from "vitest";

interface Transactional {
  $transaction: ReturnType<typeof vi.fn>;
}

type Callback = (tx: unknown) => unknown;

export const AUDIT_DOWN = new Error("audit store unavailable");

export const runTransactionsOn = (db: object) => {
  (db as Transactional).$transaction.mockReset();
  (db as Transactional).$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as Callback)(db)
      : Promise.all(arg as Promise<unknown>[]),
  );
};

export const failAuditInTransaction = <T extends object>(
  db: object,
  models: T,
) => {
  const tx = {
    ...models,
    auditLog: { create: vi.fn().mockRejectedValue(AUDIT_DOWN) },
  };
  (db as Transactional).$transaction.mockImplementationOnce(
    async (arg: unknown) => (arg as Callback)(tx),
  );
  return tx;
};
