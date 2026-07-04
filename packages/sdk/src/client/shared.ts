import type { TabPaymentStatus } from "../models";
import { parseU256 } from "../utils";

export const isNumericLike = (
  value: unknown,
): value is number | bigint | string =>
  typeof value === "number" ||
  typeof value === "bigint" ||
  typeof value === "string";

export type RpcTabStatus = {
  paid?: number | bigint | string;
  paidAmount?: number | bigint | string;
  remunerated?: boolean;
  paidOut?: boolean;
  asset?: string;
  assetAddress?: string;
};

export function tabStatusFromRpc(status: RpcTabStatus): TabPaymentStatus {
  const paid =
    status.paid !== undefined ? status.paid : (status.paidAmount ?? 0);
  const remunerated = status.remunerated ?? status.paidOut ?? false;
  const asset = status.asset ?? status.assetAddress ?? "";
  return {
    paid: parseU256(paid),
    remunerated: Boolean(remunerated),
    asset,
  };
}
