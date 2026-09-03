import {
  type Account,
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  getContract,
  type Hex,
  http,
  parseGwei,
} from "viem";
import { clearingHouseAbi } from "@/abi/clearinghouse";
import { core4micaAbi } from "@/abi/core4mica";
import { getChain } from "@/chain";
import type {
  ClearingHouseContract,
  CoreContract,
  Erc20Contract,
  TPublicClient,
  TWalletClient,
  TxReceiptWaitOptions,
} from "@/contract/models";
import {
  AaveNotConfiguredError,
  AmountZeroError,
  ContractError,
  Erc20AllowanceRequiredError,
  GracePeriodNotElapsedError,
  InsufficientAvailableError,
  NoWithdrawalRequestedError,
  RevertedOnChainError,
  StablecoinWithdrawShortfallError,
  TransferFailedError,
  UnknownRevertError,
  UnsupportedAssetError,
  ValueMismatchError,
  ZeroCollateralCreditError,
} from "@/errors";
import { normalizeAddress, parseU256 } from "@/utils";

export type { TxReceiptWaitOptions } from "@/contract/models";

/**
 * Map a decoded Core4Mica / ClearingHouse custom error to its typed SDK
 * exception. Reverts with no matching decoder fall through to
 * {@link UnknownRevertError}; anything without revert data stays a plain
 * {@link ContractError} carrying the extracted message.
 */
function decodeRevert(error: unknown, context: string): ContractError | null {
  if (!(error instanceof BaseError)) return null;
  const revert = error.walk(
    (err) => err instanceof ContractFunctionRevertedError,
  );
  if (!(revert instanceof ContractFunctionRevertedError)) return null;

  const name = revert.data?.errorName;
  const args = revert.data?.args ?? [];
  switch (name) {
    case "AmountZero":
      return new AmountZeroError(`${context}: amount is zero`);
    case "InsufficientAvailable":
      return new InsufficientAvailableError(
        `${context}: insufficient available balance`,
      );
    case "NoWithdrawalRequested":
      return new NoWithdrawalRequestedError(
        `${context}: no withdrawal requested`,
      );
    case "GracePeriodNotElapsed":
      return new GracePeriodNotElapsedError(
        `${context}: withdrawal grace period has not elapsed`,
      );
    case "TransferFailed":
      return new TransferFailedError(`${context}: transfer failed`);
    case "UnsupportedAsset":
      return new UnsupportedAssetError(String(args[0] ?? "unknown"));
    case "StablecoinWithdrawShortfall":
      return new StablecoinWithdrawShortfallError(
        `${context}: stablecoin withdrawal delivered less than requested`,
      );
    case "AaveNotConfigured":
      return new AaveNotConfiguredError(`${context}: Aave is not configured`);
    case "ValueMismatch":
      return new ValueMismatchError(
        `${context}: token delivered a different amount than expected`,
      );
    case "ZeroCollateralCredit":
      return new ZeroCollateralCreditError(
        `${context}: deposit too small to mint scaled collateral`,
      );
    case undefined:
      break;
    default:
      return new ContractError(`${context}: reverted with ${name}`);
  }
  const raw = revert.raw;
  if (typeof raw === "string" && raw.length >= 10) {
    return new UnknownRevertError(raw.slice(0, 10), raw);
  }
  return null;
}

/**
 * Extract a human-readable message from a viem contract error, mapping known
 * custom errors to their typed exceptions.
 */
function wrapViemError(error: unknown, context: string): ContractError {
  if (error instanceof ContractError) return error;
  const decoded = decodeRevert(error, context);
  if (decoded) return decoded;
  if (error instanceof Error) {
    const e = error as unknown as Record<string, unknown>;
    const cause = e.cause as Record<string, unknown> | undefined;
    const reason =
      cause?.reason ?? cause?.message ?? e.shortMessage ?? error.message;
    const details = e.details ?? cause?.details;
    const suffix = details ? ` (${details})` : "";
    return new ContractError(`${context}: ${reason}${suffix}`);
  }
  return new ContractError(`${context}: ${String(error)}`);
}

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

  /** Wait for the receipt and refuse a mined-but-reverted transaction. */
  private async waitChecked(
    hash: Hex,
    receiptOptions: { timeout?: number; pollingInterval?: number },
  ) {
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash,
      ...receiptOptions,
    });
    if (receipt.status !== "success") {
      throw new RevertedOnChainError(hash);
    }
    return receipt;
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

  async erc20Allowance(token: string, spender?: string): Promise<bigint> {
    const account = this.walletClient.account;
    if (!account) {
      throw new ContractError("wallet client has no account configured");
    }
    const erc20 = this.erc20(token);
    try {
      return (await erc20.read.allowance([
        account.address,
        (spender ?? this.contract.address) as Hex,
      ])) as bigint;
    } catch (error) {
      throw wrapViemError(error, "ERC20 allowance read failed");
    }
  }

  async approveErc20(
    token: string,
    amount: number | bigint | string,
    waitOptions?: TxReceiptWaitOptions,
    spender?: string,
  ) {
    const { receipt } = this.splitWaitOptions(waitOptions);
    const erc20 = this.erc20(token);
    const spenderAddress = (spender ?? this.contract.address) as Hex;
    const targetAllowance = parseU256(amount);
    const account = this.walletClient.account;

    if (account) {
      const currentAllowance = (await (erc20 as Erc20Contract).read.allowance([
        account.address,
        spenderAddress,
      ])) as bigint;
      if (currentAllowance >= targetAllowance) {
        return undefined;
      }
    }

    const sendApprove = async (value: bigint) => {
      const hash = await this.enqueueTx(() =>
        erc20.write.approve([spenderAddress, value], this.defaultFeeParams()),
      );
      return this.waitChecked(hash, receipt);
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
        spenderAddress,
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
        const allowance = (await (erc20 as Erc20Contract).read.allowance([
          account.address,
          this.contract.address,
        ])) as bigint;
        if (allowance < parsedAmount) {
          throw new Erc20AllowanceRequiredError({
            token: erc20Token,
            spender: this.contract.address,
            allowance,
            needed: parsedAmount,
          });
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

    return this.waitChecked(hash, receipt);
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

  private async view<T>(fn: () => Promise<T>, context: string): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw wrapViemError(error, context);
    }
  }

  async principalBalance(user: string, asset: string): Promise<bigint> {
    return this.view(
      () =>
        this.contract.read.principalBalance([
          normalizeAddress(user) as Hex,
          normalizeAddress(asset) as Hex,
        ]) as Promise<bigint>,
      "principalBalance failed",
    );
  }

  async withdrawableBalance(user: string, asset: string): Promise<bigint> {
    return this.view(
      () =>
        this.contract.read.withdrawableBalance([
          normalizeAddress(user) as Hex,
          normalizeAddress(asset) as Hex,
        ]) as Promise<bigint>,
      "withdrawableBalance failed",
    );
  }

  async guaranteeCapacity(user: string, asset: string): Promise<bigint> {
    return this.view(
      () =>
        this.contract.read.guaranteeCapacity([
          normalizeAddress(user) as Hex,
          normalizeAddress(asset) as Hex,
        ]) as Promise<bigint>,
      "guaranteeCapacity failed",
    );
  }

  async grossYield(user: string, asset: string): Promise<bigint> {
    return this.view(
      () =>
        this.contract.read.grossYield([
          normalizeAddress(user) as Hex,
          normalizeAddress(asset) as Hex,
        ]) as Promise<bigint>,
      "grossYield failed",
    );
  }

  async protocolYieldShare(user: string, asset: string): Promise<bigint> {
    return this.view(
      () =>
        this.contract.read.protocolYieldShare([
          normalizeAddress(user) as Hex,
          normalizeAddress(asset) as Hex,
        ]) as Promise<bigint>,
      "protocolYieldShare failed",
    );
  }

  async userNetYield(user: string, asset: string): Promise<bigint> {
    return this.view(
      () =>
        this.contract.read.userNetYield([
          normalizeAddress(user) as Hex,
          normalizeAddress(asset) as Hex,
        ]) as Promise<bigint>,
      "userNetYield failed",
    );
  }

  async totalUserScaledBalance(token: string): Promise<bigint> {
    return this.view(
      () =>
        this.contract.read.totalUserScaledBalance([
          normalizeAddress(token) as Hex,
        ]) as Promise<bigint>,
      "totalUserScaledBalance failed",
    );
  }

  async protocolScaledBalance(token: string): Promise<bigint> {
    return this.view(
      () =>
        this.contract.read.protocolScaledBalance([
          normalizeAddress(token) as Hex,
        ]) as Promise<bigint>,
      "protocolScaledBalance failed",
    );
  }

  async surplusScaledBalance(token: string): Promise<bigint> {
    return this.view(
      () =>
        this.contract.read.surplusScaledBalance([
          normalizeAddress(token) as Hex,
        ]) as Promise<bigint>,
      "surplusScaledBalance failed",
    );
  }

  async contractScaledATokenBalance(token: string): Promise<bigint> {
    return this.view(
      () =>
        this.contract.read.contractScaledATokenBalance([
          normalizeAddress(token) as Hex,
        ]) as Promise<bigint>,
      "contractScaledATokenBalance failed",
    );
  }

  async stablecoinAToken(token: string): Promise<string> {
    return this.view(
      () =>
        this.contract.read.stablecoinAToken([
          normalizeAddress(token) as Hex,
        ]) as Promise<string>,
      "stablecoinAToken failed",
    );
  }

  async requestWithdrawal(
    amount: number | bigint | string,
    erc20Token?: string,
    waitOptions?: TxReceiptWaitOptions,
  ) {
    const { receipt } = this.splitWaitOptions(waitOptions);
    const value = parseU256(amount);

    let hash: Hex;
    try {
      if (erc20Token) {
        hash = await this.enqueueTx(() =>
          this.contract.write.requestWithdrawal(
            [erc20Token as Hex, value],
            this.defaultFeeParams(),
          ),
        );
      } else {
        hash = await this.enqueueTx(() =>
          this.contract.write.requestWithdrawal(
            [value],
            this.defaultFeeParams(),
          ),
        );
      }
    } catch (error) {
      throw wrapViemError(error, "requestWithdrawal failed");
    }

    return this.waitChecked(hash, receipt);
  }

  async cancelWithdrawal(
    erc20Token?: string,
    waitOptions?: TxReceiptWaitOptions,
  ) {
    const { receipt } = this.splitWaitOptions(waitOptions);
    let hash: Hex;
    try {
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
    } catch (error) {
      throw wrapViemError(error, "cancelWithdrawal failed");
    }

    return this.waitChecked(hash, receipt);
  }

  async finalizeWithdrawal(
    erc20Token?: string,
    waitOptions?: TxReceiptWaitOptions,
  ) {
    const { receipt } = this.splitWaitOptions(waitOptions);
    let hash: Hex;
    try {
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
    } catch (error) {
      throw wrapViemError(error, "finalizeWithdrawal failed");
    }

    return this.waitChecked(hash, receipt);
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
    let hash: Hex;
    try {
      hash = await this.enqueueTx(() =>
        ch.write.payNetDebit([cycleId, netDebit, proof], {
          value: payableValue,
          gas: gas ?? DEFAULT_CLEARING_GAS_LIMIT,
          ...this.defaultFeeParams(),
        }),
      );
    } catch (error) {
      throw wrapViemError(error, "payNetDebit failed");
    }
    return this.waitChecked(hash, receipt);
  }

  /**
   * Claim a net credit committed for a settlement cycle (`claimNetCreditFor`).
   *
   * The payout goes to `creditor` — the address the committed Merkle leaf
   * names — whoever submits the transaction.
   */
  async claimNetCreditFor(
    contractAddress: string,
    creditor: string,
    cycleId: Hex,
    netCredit: bigint,
    proof: Hex[],
    waitOptions?: TxReceiptWaitOptions,
  ) {
    const { gas, receipt } = this.splitWaitOptions(waitOptions);
    const ch = this.clearingHouse(contractAddress);
    let hash: Hex;
    try {
      hash = await this.enqueueTx(() =>
        ch.write.claimNetCreditFor(
          [normalizeAddress(creditor) as Hex, cycleId, netCredit, proof],
          {
            gas: gas ?? DEFAULT_CLEARING_GAS_LIMIT,
            ...this.defaultFeeParams(),
          },
        ),
      );
    } catch (error) {
      throw wrapViemError(error, "claimNetCreditFor failed");
    }
    return this.waitChecked(hash, receipt);
  }
}
