import {
  type Account,
  type Chain,
  createPublicClient,
  erc20Abi,
  type GetContractReturnType,
  type HttpTransport,
  type WalletClient,
} from "viem";
import { clearingHouseAbi } from "@/abi/clearinghouse";
import { core4micaAbi } from "@/abi/core4mica";

export type TPublicClient = ReturnType<typeof createPublicClient>;
export type TWalletClient = WalletClient<HttpTransport, Chain, Account>;

export type CoreContract = GetContractReturnType<
  typeof core4micaAbi,
  {
    public: ReturnType<typeof createPublicClient>;
    wallet: TWalletClient;
  }
>;

export type Erc20Contract = GetContractReturnType<
  typeof erc20Abi,
  {
    public: ReturnType<typeof createPublicClient>;
    wallet: TWalletClient;
  }
>;

export type ClearingHouseContract = GetContractReturnType<
  typeof clearingHouseAbi,
  {
    public: ReturnType<typeof createPublicClient>;
    wallet: TWalletClient;
  }
>;

export type TxReceiptWaitOptions = {
  timeout?: number;
  pollingInterval?: number;
  gas?: bigint;
};
