import {
  type PaymentNetwork,
  Prisma,
  type SpendAuthorizationStatus,
} from "@4mica/db";
import { amountText } from "@utils/amount";
import { toUnits } from "@utils/units";

type Db = Prisma.TransactionClient;
type Amount = Prisma.Decimal | string;

export interface MatchableAuthorization {
  id: string;
  reqId: string | null;
  network: PaymentNetwork;
  assetAddress: string | null;
  payerAddress: string;
  recipientAddress: string;
  amount: Amount;
  authorizedAmount: Amount | null;
  paymentId: string | null;
}

export interface MatchablePayment {
  id: string;
  reqId: string;
  network: PaymentNetwork;
  assetAddress: string | null;
  payerAddress: string;
  recipientAddress: string;
  amount: Amount;
  status: string;
}

export type PaymentMismatch =
  | "payment_failed"
  | "req_id_mismatch"
  | "network_mismatch"
  | "asset_mismatch"
  | "payer_mismatch"
  | "recipient_mismatch"
  | "exceeds_authorization"
  | "already_settled";

export const grantedAmount = (authorization: MatchableAuthorization): Amount =>
  authorization.authorizedAmount ?? authorization.amount;

export const paymentMismatch = (
  authorization: MatchableAuthorization,
  payment: MatchablePayment,
): PaymentMismatch | null => {
  if (payment.status === "FAILED") {
    return "payment_failed";
  }
  if (authorization.reqId !== payment.reqId) {
    return "req_id_mismatch";
  }
  if (authorization.network !== payment.network) {
    return "network_mismatch";
  }
  if (authorization.assetAddress !== payment.assetAddress) {
    return "asset_mismatch";
  }
  if (authorization.payerAddress !== payment.payerAddress) {
    return "payer_mismatch";
  }
  if (authorization.recipientAddress !== payment.recipientAddress) {
    return "recipient_mismatch";
  }
  if (toUnits(payment.amount) > toUnits(grantedAmount(authorization))) {
    return "exceeds_authorization";
  }
  if (
    authorization.paymentId !== null &&
    authorization.paymentId !== payment.id
  ) {
    return "already_settled";
  }
  return null;
};

export const paymentMatchSql = (): Prisma.Sql => Prisma.sql`(a.req_id = p.req_id
       AND a.network = p.network
       AND a.asset_address IS NOT DISTINCT FROM p.asset_address
       AND a.payer_address = p.payer_address
       AND a.recipient_address = p.recipient_address
       AND p.amount <= COALESCE(a.authorized_amount, a.amount)
       AND p.status <> 'FAILED'
       AND (a.payment_id IS NULL OR a.payment_id = p.id))`;

export const coversPayment = (
  authorization: MatchableAuthorization,
  payment: MatchablePayment,
): boolean =>
  paymentMismatch(authorization, payment) === null ||
  (payment.status !== "FAILED" &&
    authorization.paymentId !== null &&
    authorization.reqId === payment.reqId &&
    authorization.network === payment.network &&
    authorization.assetAddress === payment.assetAddress &&
    authorization.payerAddress === payment.payerAddress);

export const coversPaymentSql =
  (): Prisma.Sql => Prisma.sql`(a.req_id = p.req_id
       AND a.network = p.network
       AND a.asset_address IS NOT DISTINCT FROM p.asset_address
       AND a.payer_address = p.payer_address
       AND p.status <> 'FAILED'
       AND (a.payment_id IS NOT NULL
            OR (a.recipient_address = p.recipient_address
                AND p.amount <= COALESCE(a.authorized_amount, a.amount))))`;

export const LINKABLE_STATUSES: SpendAuthorizationStatus[] = [
  "RESERVED",
  "EXPIRED",
  "RELEASED",
  "CONSUMED",
];

export const MATCH_PAYMENT_SELECT = {
  id: true,
  reqId: true,
  network: true,
  assetAddress: true,
  payerAddress: true,
  recipientAddress: true,
  amount: true,
  status: true,
} satisfies Prisma.PaymentSelect;

export const linkPayment = async (
  db: Pick<Db, "spendAuthorization">,
  authorization: MatchableAuthorization & { consumedAt: Date | null },
  payment: MatchablePayment,
  now: Date,
): Promise<boolean> => {
  if (
    authorization.paymentId !== null ||
    paymentMismatch(authorization, payment) !== null
  ) {
    return false;
  }
  const amount = amountText(payment.amount);
  const { count } = await db.spendAuthorization.updateMany({
    where: {
      id: authorization.id,
      paymentId: null,
      reqId: payment.reqId,
      status: { in: LINKABLE_STATUSES },
    },
    data: {
      status: "CONSUMED",
      paymentId: payment.id,
      amount,
      settledAmount: amount,
      matchedAt: now,
      consumedAt: authorization.consumedAt ?? now,
    },
  });
  return count > 0;
};
