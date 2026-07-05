import {
  type Account,
  type Chain,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  type GetContractReturnType,
  getContract,
  type Hex,
  type HttpTransport,
  http,
  parseGwei,
} from "viem";
import { clearingHouseAbi } from "./abi/clearinghouse";
import { core4micaAbi } from "./abi/core4mica";
import { getChain } from "./chain";
import { ContractError } from "./errors";
import { parseU256 } from "./utils";

/**
 * Extract a human-readable message from a viem contract error, falling back
 * to the raw message if no structured reason is available.
 */
function wrapViemError(error: unknown, context: string): ContractError {
  if (error instanceof ContractError) return error;
  if (error instanceof Error) {
    const e = error as unknown as Record<string, unknown>;
    const cause = e["cause"] as Record<string, unknown> | undefined;
    const reason =
      cause?.["reason"] ??
      cause?.["message"] ??
      e["shortMessage"] ??
      error.message;
    const details = e["details"] ?? cause?.["details"];
    const suffix = details ? ` (${details})` : "";
    return new ContractError(`${context}: ${reason}${suffix}`);
  }
  return new ContractError(`${context}: ${String(error)}`);
}

type TPublicClient = ReturnType<typeof createPublicClient>;
type TWalletClient = ReturnType<
  typeof createWalletClient<HttpTransport, Chain, Account>
>;

type CoreContract = GetContractReturnType<
  typeof core4micaAbi,
  {
    public: ReturnType<typeof createPublicClient>;
    wallet: TWalletClient;
  }
>;

type Erc20Contract = GetContractReturnType<
  typeof erc20Abi,
  {
    public: ReturnType<typeof createPublicClient>;
    wallet: TWalletClient;
  }
>;

type ClearingHouseContract = GetContractReturnType<
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

const DEFAULT_CLEARING_GAS_LIMIT = 1_000_000n;
const DEFAULT_MAX_FEE_PER_GAS = parseGwei("0.1");
const DEFAULT_MAX_PRIORITY_FEE_PER_GAS = parseGwei("0.1");
const DEFAULT_RECEIPT_TIMEOUT_MS = 60_000;
const DEFAULT_RECEIPT_POLLING_INTERVAL_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ContractGateway {
  readonly publicClient: TPublicClient;
  readonly walletClient: TWalletClient;
  readonly contract: CoreContract;
  private erc20Cache = new Map<string, Erc20Contract>();
  private clearingHouseCache = new Map<string, ClearingHouseContract>();
  private txQueue: Promise<void> = Promise.resolve();

  private constructor(
    publicClient: TPublicClient,
    walletClient: TWalletClient,
    contract: CoreContract,
  ) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.contract = contract;
  }

  static async create(
    rpcUrl: string,
    signer: Account,
    contractAddress: Hex,
    chainId: number,
  ) {
    const chain = getChain(chainId, rpcUrl);

    const publicClient = createPublicClient({
      transport: http(rpcUrl),
      pollingInterval: 2_000,
    });

    const rpcChainId = await publicClient.getChainId();
    if (rpcChainId !== Number(chainId)) {
      throw new ContractError(
        `Connected to chain ${rpcChainId}, expected ${chainId}`,
      );
    }

    const walletClient = createWalletClient({
      transport: http(rpcUrl),
      account: signer,
      chain,
    });

    const contract = getContract({
      address: contractAddress,
      abi: core4micaAbi,
      client: {
        public: publicClient,
        wallet: walletClient,
      },
    });

    return new ContractGateway(publicClient, walletClient, contract);
  }

  private erc20(token: string): Erc20Contract {
    if (!this.erc20Cache.has(token)) {
      this.erc20Cache.set(
        token,
        getContract({
          address: token as Hex,
          abi: erc20Abi,
          client: { public: this.publicClient, wallet: this.walletClient },
        }),
      );
    }
    return this.erc20Cache.get(token)!;
  }

  private clearingHouse(address: string): ClearingHouseContract {
    if (!this.clearingHouseCache.has(address)) {
      this.clearingHouseCache.set(
        address,
        getContract({
          address: address as Hex,
          abi: clearingHouseAbi,
          client: { public: this.publicClient, wallet: this.walletClient },
        }),
      );
    }
    return this.clearingHouseCache.get(address)!;
  }

  private enqueueTx<T>(fn: () => Promise<T>): Promise<T> {
    // Serialize transaction submissions to avoid nonce collisions.
    const run = this.txQueue.then(fn, fn);
    this.txQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private defaultFeeParams() {
    return {
      maxFeePerGas: DEFAULT_MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: DEFAULT_MAX_PRIORITY_FEE_PER_GAS,
    } as const;
  }

  private splitWaitOptions(waitOptions?: TxReceiptWaitOptions): {
    receipt: { timeout?: number; pollingInterval?: number };
    gas?: bigint;
  } {
    if (!waitOptions) {
      return { receipt: { timeout: DEFAULT_RECEIPT_TIMEOUT_MS } };
    }
    const { gas, timeout, pollingInterval } = waitOptions;
    return {
      gas,
      receipt: {
        ...(timeout !== undefined ? { timeout } : {}),
        ...(pollingInterval !== undefined ? { pollingInterval } : {}),
      },
    };
  }

  async getGuaranteeDomain(): Promise<string> {
    return this.contract.read.guaranteeDomainSeparator();
  }

  async getGuaranteeVersionConfig(
    version: number,
  ): Promise<{ domainSeparator: string; decoder: string; enabled: boolean }> {
    const [, domainSeparator, decoder, enabled] =
      await this.contract.read.getGuaranteeVersionConfig([BigInt(version)]);
    return {
      domainSeparator: domainSeparator as string,
      decoder: decoder as string,
      enabled,
    };
  }

  async approveErc20(
    token: string,
    amount: number | bigint | string,
    waitOptions?: TxReceiptWaitOptions,
  ) {
    const { receipt } = this.splitWaitOptions(waitOptions);
    const erc20 = this.erc20(token);
    const spender = this.contract.address;
    const targetAllowance = parseU256(amount);
    const account = this.walletClient.account;

    if (account) {
      const currentAllowance = (await (erc20 as Erc20Contract).read.allowance([
        account.address,
        spender,
      ])) as bigint;
      if (currentAllowance >= targetAllowance) {
        return undefined;
      }
    }

    const sendApprove = async (value: bigint) => {
      const hash = await this.enqueueTx(() =>
        erc20.write.approve([spender, value], this.defaultFeeParams()),
      );
      const txReceipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        ...receipt,
      });
      if (txReceipt.status !== "success") {
        throw new ContractError(`approve transaction reverted: ${hash}`);
      }
      return txReceipt;
    };

    let txReceipt: Awaited<ReturnType<typeof sendApprove>>;
    try {
      txReceipt = await sendApprove(targetAllowance);
    } catch (error) {
      // Some ERC20s (e.g. USDT) require resetting allowance to zero before
      // setting a new non-zero value.
      if (targetAllowance === 0n) {
        throw wrapViemError(error, "ERC20 approve failed");
      }
      try {
        await sendApprove(0n);
        txReceipt = await sendApprove(targetAllowance);
      } catch (retryError) {
        throw wrapViemError(
          retryError,
          "ERC20 approve failed after allowance reset",
        );
      }
    }

    if (account) {
      const actual = await this.waitForErc20Allowance(
        erc20,
        account.address,
        spender,
        targetAllowance,
        receipt,
      );
      if (actual < targetAllowance) {
        throw new ContractError(
          `ERC20 allowance verification failed: on-chain allowance is ${actual} but expected ${targetAllowance}. ` +
            `Try calling approveErc20 again.`,
        );
      }
    }

    return txReceipt;
  }

  private async waitForErc20Allowance(
    erc20: Erc20Contract,
    owner: string,
    spender: string,
    targetAllowance: bigint,
    receiptOptions: { timeout?: number; pollingInterval?: number },
  ): Promise<bigint> {
    const timeout = receiptOptions.timeout ?? DEFAULT_RECEIPT_TIMEOUT_MS;
    const pollingInterval =
      receiptOptions.pollingInterval ?? DEFAULT_RECEIPT_POLLING_INTERVAL_MS;
    const deadline = Date.now() + timeout;
    let actual = 0n;

    while (Date.now() <= deadline) {
      actual = (await erc20.read.allowance([
        owner as Hex,
        spender as Hex,
      ])) as bigint;
      if (actual >= targetAllowance) {
        return actual;
      }
      await sleep(
        Math.min(pollingInterval, Math.max(0, deadline - Date.now())),
      );
    }
    return actual;
  }

  async deposit(
    amount: number | bigint | string,
    erc20Token?: string,
    waitOptions?: TxReceiptWaitOptions,
  ) {
    const { receipt } = this.splitWaitOptions(waitOptions);
    const parsedAmount = parseU256(amount);
    let hash: Hex;

    if (erc20Token) {
      // Pre-check allowance to surface a clear error before hitting the contract.
      const account = this.walletClient.account;
      if (account) {
        const erc20 = this.erc20(erc20Token);
        const allowance = await (erc20 as Erc20Contract).read.allowance([
          account.address,
          this.contract.address,
        ]);
        if ((allowance as bigint) < parsedAmount) {
          throw new ContractError(
            `Insufficient ERC20 allowance: ${allowance} approved but ${parsedAmount} required. ` +
              `Call approveErc20("${erc20Token}", ${parsedAmount}) before depositing.`,
          );
        }
      }

      try {
        hash = await this.enqueueTx(() =>
          this.contract.write.depositStablecoin(
            [erc20Token as Hex, parsedAmount],
            this.defaultFeeParams(),
          ),
        );
      } catch (error) {
        throw wrapViemError(error, "depositStablecoin failed");
      }
    } else {
      try {
        hash = await this.enqueueTx(() =>
          this.contract.write.deposit({
            value: parsedAmount,
            ...this.defaultFeeParams(),
          }),
        );
      } catch (error) {
        throw wrapViemError(error, "deposit failed");
      }
    }

    return this.publicClient.waitForTransactionReceipt({ hash, ...receipt });
  }

  async getUserAssets(opts?: { blockNumber?: bigint }) {
    const account = this.walletClient.account;
    if (!account) {
      throw new ContractError("wallet client has no account configured");
    }
    const addr = account.address;
    const result = await this.contract.read.getUserAllAssets([addr], opts);
    return result.map((a) => ({
      asset: a.asset,
      collateral: a.collateral,
      withdrawalRequestTimestamp: a.withdrawalRequestTimestamp,
      withdrawalRequestAmount: a.withdrawalRequestAmount,
    }));
  }

  async requestWithdrawal(
    amount: number | bigint | string,
    erc20Token?: string,
    waitOptions?: TxReceiptWaitOptions,
  ) {
    const { receipt } = this.splitWaitOptions(waitOptions);
    const value = parseU256(amount);

    let hash: Hex;
    if (erc20Token) {
      hash = await this.enqueueTx(() =>
        this.contract.write.requestWithdrawal(
          [erc20Token as Hex, value],
          this.defaultFeeParams(),
        ),
      );
    } else {
      hash = await this.enqueueTx(() =>
        this.contract.write.requestWithdrawal([value], this.defaultFeeParams()),
      );
    }

    return this.publicClient.waitForTransactionReceipt({ hash, ...receipt });
  }

  async cancelWithdrawal(
    erc20Token?: string,
    waitOptions?: TxReceiptWaitOptions,
  ) {
    const { receipt } = this.splitWaitOptions(waitOptions);
    let hash: Hex;
    if (erc20Token) {
      hash = await this.enqueueTx(() =>
        this.contract.write.cancelWithdrawal(
          [erc20Token as Hex],
          this.defaultFeeParams(),
        ),
      );
    } else {
      hash = await this.enqueueTx(() =>
        this.contract.write.cancelWithdrawal(this.defaultFeeParams()),
      );
    }

    return this.publicClient.waitForTransactionReceipt({ hash, ...receipt });
  }

  async finalizeWithdrawal(
    erc20Token?: string,
    waitOptions?: TxReceiptWaitOptions,
  ) {
    const { receipt } = this.splitWaitOptions(waitOptions);
    let hash: Hex;
    if (erc20Token) {
      hash = await this.enqueueTx(() =>
        this.contract.write.finalizeWithdrawal(
          [erc20Token as Hex],
          this.defaultFeeParams(),
        ),
      );
    } else {
      hash = await this.enqueueTx(() =>
        this.contract.write.finalizeWithdrawal(this.defaultFeeParams()),
      );
    }

    return this.publicClient.waitForTransactionReceipt({ hash, ...receipt });
  }

  /**
   * Claim a net credit committed for a settlement cycle (`claimNetCredit`).
   *
   * @param contractAddress - ClearingHouse contract address (from the clearing action).
   * @param cycleId - On-chain `bytes32` cycle identifier.
   * @param netCredit - Net credit amount committed for the caller.
   * @param proof - Merkle proof of the caller's committed leaf.
   */
  async claimNetCredit(
    contractAddress: string,
    cycleId: Hex,
    netCredit: bigint,
    proof: Hex[],
    waitOptions?: TxReceiptWaitOptions,
  ) {
    const { gas, receipt } = this.splitWaitOptions(waitOptions);
    const ch = this.clearingHouse(contractAddress);
    const hash = await this.enqueueTx(() =>
      ch.write.claimNetCredit([cycleId, netCredit, proof], {
        gas: gas ?? DEFAULT_CLEARING_GAS_LIMIT,
        ...this.defaultFeeParams(),
      }),
    );
    return this.publicClient.waitForTransactionReceipt({ hash, ...receipt });
  }

  /**
   * Pay a net debit committed for a settlement cycle (`payNetDebit`).
   *
   * @param payableValue - Native value to attach (non-zero only for native-asset debtors).
   */
  async payNetDebit(
    contractAddress: string,
    cycleId: Hex,
    netDebit: bigint,
    proof: Hex[],
    payableValue: bigint,
    waitOptions?: TxReceiptWaitOptions,
  ) {
    const { gas, receipt } = this.splitWaitOptions(waitOptions);
    const ch = this.clearingHouse(contractAddress);
    const hash = await this.enqueueTx(() =>
      ch.write.payNetDebit([cycleId, netDebit, proof], {
        value: payableValue,
        gas: gas ?? DEFAULT_CLEARING_GAS_LIMIT,
        ...this.defaultFeeParams(),
      }),
    );
    return this.publicClient.waitForTransactionReceipt({ hash, ...receipt });
  }

  /**
   * Mark a debtor defaulted after the clearing payment finality deadline
   * (`markDefaulted`).
   */
  async markDefaulted(
    contractAddress: string,
    cycleId: Hex,
    debtor: Hex,
    netDebit: bigint,
    proof: Hex[],
    waitOptions?: TxReceiptWaitOptions,
  ) {
    const { gas, receipt } = this.splitWaitOptions(waitOptions);
    const ch = this.clearingHouse(contractAddress);
    const hash = await this.enqueueTx(() =>
      ch.write.markDefaulted([cycleId, debtor, netDebit, proof], {
        gas: gas ?? DEFAULT_CLEARING_GAS_LIMIT,
        ...this.defaultFeeParams(),
      }),
    );
    return this.publicClient.waitForTransactionReceipt({ hash, ...receipt });
  }
}
