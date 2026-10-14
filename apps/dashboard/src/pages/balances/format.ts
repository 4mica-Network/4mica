import { trimAmount } from "@4mica/rules";
import { formatUnits } from "viem";

export const formatBalance = (value: string, decimals: number): string =>
  trimAmount(formatUnits(BigInt(value), decimals));
