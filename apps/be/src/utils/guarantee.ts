import type { PaymentGuaranteeClaims } from "@4mica/sdk";
import { zeroAddress } from "viem";

export interface ReportedGuarantee {
  reqId: string;
  payerAddress: string;
  recipientAddress: string;
  assetAddress?: string | null;
  amount: string;
}

const toUnits = (amount: string, decimals: number): bigint | null => {
  const [whole, fraction = ""] = amount.split(".");
  if (!/^0*$/.test(fraction.slice(decimals))) {
    return null;
  }
  return BigInt(whole + fraction.slice(0, decimals).padEnd(decimals, "0"));
};

export const guaranteeMismatch = (
  claims: PaymentGuaranteeClaims,
  report: ReportedGuarantee,
  decimals: number,
): keyof ReportedGuarantee | null => {
  if (claims.reqId !== BigInt(report.reqId)) {
    return "reqId";
  }
  if (claims.userAddress.toLowerCase() !== report.payerAddress.toLowerCase()) {
    return "payerAddress";
  }
  if (
    claims.recipientAddress.toLowerCase() !==
    report.recipientAddress.toLowerCase()
  ) {
    return "recipientAddress";
  }
  if (
    claims.assetAddress.toLowerCase() !==
    (report.assetAddress ?? zeroAddress).toLowerCase()
  ) {
    return "assetAddress";
  }
  if (
    claims.amount !== toUnits(report.amount, 0) &&
    claims.amount !== toUnits(report.amount, decimals)
  ) {
    return "amount";
  }
  return null;
};
