import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import {
  formatEther,
  formatUnits,
  getContract,
  parseEther,
  parseUnits,
} from "viem";
import { afterAll, describe, expect, it } from "vitest";
import { erc20Abi } from "@/abi/erc20";
import { Client } from "@/client";
import { ConfigBuilder } from "@/config";
import { RpcError } from "@/errors";
import type { BLSCert } from "@/models";
import {
  PaymentGuaranteeRequestClaims,
  PaymentGuaranteeRequestClaimsV2,
  SigningScheme,
} from "@/models";
import {
  computeValidationRequestHash,
  computeValidationSubjectHash,
} from "@/validation";
import {
  type PaymentRequirementsV1,
  type PaymentRequirementsV2,
  type TabResponse,
  X402Flow,
  type X402PaymentEnvelopeV1,
  type X402PaymentEnvelopeV2,
  type X402PaymentRequired,
} from "@/x402";

const DEFAULT_RPC_URL = "http://127.0.0.1:3000/";
const DEFAULT_PAYER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEFAULT_RECIPIENT_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const DEFAULT_FACILITATOR_URL = "http://127.0.0.1:8080";

const e2eEnabled = process.env["4MICA_E2E"] === "1";
const describeE2E = e2eEnabled ? describe : describe.skip;
type E2EMode = "direct" | "facilitator";
type X402Envelope = X402PaymentEnvelopeV1 | X402PaymentEnvelopeV2;

interface FacilitatorTabResponse {
  tabId: string;
  userAddress?: string;
  recipientAddress?: string;
  assetAddress?: string;
  ttlSeconds?: number;
  nextReqId?: string;
}

let cachedE2EMode: E2EMode | undefined;

const resolveRpcUrl = (): string =>
  process.env["4MICA_RPC_URL"] ?? DEFAULT_RPC_URL;
const resolvePayerKey = (): string =>
  process.env["PAYER_PRIVATE_KEY"] ??
  process.env["4MICA_WALLET_PRIVATE_KEY"] ??
  DEFAULT_PAYER_KEY;
const resolveRecipientKey = (): string =>
  process.env["RECIPIENT_PRIVATE_KEY"] ?? DEFAULT_RECIPIENT_KEY;
const resolveFacilitatorUrl = (): string =>
  (process.env["FACILITATOR_URL"] ?? DEFAULT_FACILITATOR_URL).replace(
    /\/$/,
    "",
  );
const resolveTokenAddressOverride = (): `0x${string}` | undefined => {
  const value = process.env["E2E_TOKEN_ADDRESS"];
  return value ? (value as `0x${string}`) : undefined;
};
const resolveTokenDecimalsOverride = (): number | undefined => {
  const value = process.env["E2E_TOKEN_DECIMALS"];
  return value ? Number(value) : undefined;
};

const describeAmount = (amount: bigint, decimals: number): string =>
  `${formatUnits(amount, decimals)} (${amount.toString()})`;
const describeEthAmount = (amount: bigint): string =>
  `${formatEther(amount)} (${amount.toString()})`;
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
const toHex = (value: bigint): string => `0x${value.toString(16)}`;
const parseU256Like = (
  value: string | bigint | number | null | undefined,
  field: string,
): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && value.trim()) return BigInt(value);
  throw new Error(`invalid ${field}: ${String(value)}`);
};
const previewHex = (value: string, bytes = 16): string => {
  if (!value.startsWith("0x")) return value;
  const visible = 2 + bytes * 2;
  return value.length <= visible ? value : `${value.slice(0, visible)}…`;
};
const logStep = (
  title: string,
  details: Record<string, string | number | boolean>,
): void => {
  console.log(`\n[e2e] ${title}`);
  for (const [key, value] of Object.entries(details)) {
    console.log(`  ${key}: ${value}`);
  }
};
const minBigInt = (a: bigint, b: bigint): bigint => (a < b ? a : b);

const resolveE2EMode = async (): Promise<E2EMode> => {
  if (cachedE2EMode) return cachedE2EMode;

  const configured = process.env["4MICA_E2E_MODE"]?.trim().toLowerCase() ?? "";
  if (configured === "direct" || configured === "facilitator") {
    cachedE2EMode = configured;
    console.log(`[e2e] using configured mode: ${cachedE2EMode}`);
    return cachedE2EMode;
  }

  if (configured && configured !== "prompt") {
    throw new Error(
      "4MICA_E2E_MODE must be one of: direct, facilitator, prompt",
    );
  }

  if (input.isTTY && output.isTTY) {
    const rl = createInterface({ input, output });
    try {
      const answer = await rl.question(
        "\nSelect E2E mode: [d]irect core API or [f]acilitator via x402-4mica? ",
      );
      cachedE2EMode = answer.trim().toLowerCase().startsWith("f")
        ? "facilitator"
        : "direct";
    } finally {
      rl.close();
    }
  } else {
    cachedE2EMode = "direct";
  }

  console.log(`[e2e] selected mode: ${cachedE2EMode}`);
  return cachedE2EMode;
};

const decodePaymentHeader = (header: string): X402Envelope => {
  const decoded = Buffer.from(header, "base64").toString("utf8");
  return JSON.parse(decoded) as X402Envelope;
};

const claimsFromEnvelope = (
  envelope: X402Envelope,
): PaymentGuaranteeRequestClaims | PaymentGuaranteeRequestClaimsV2 => {
  const claims = envelope.payload.claims;
  if (claims.version === "v2") {
    return new PaymentGuaranteeRequestClaimsV2({
      userAddress: claims.user_address,
      recipientAddress: claims.recipient_address,
      tabId: parseU256Like(claims.tab_id, "tab_id"),
      reqId: parseU256Like(claims.req_id, "req_id"),
      amount: parseU256Like(claims.amount, "amount"),
      timestamp: claims.timestamp,
      assetAddress: claims.asset_address,
      validationRegistryAddress: claims.validation_registry_address,
      validationRequestHash: claims.validation_request_hash,
      validationChainId: claims.validation_chain_id,
      validatorAddress: claims.validator_address,
      validatorAgentId: parseU256Like(
        claims.validator_agent_id,
        "validator_agent_id",
      ),
      minValidationScore: claims.min_validation_score,
      validationSubjectHash: claims.validation_subject_hash,
      jobHash: claims.job_hash,
      requiredValidationTag: claims.required_validation_tag ?? "",
    });
  }

  return PaymentGuaranteeRequestClaims.new(
    claims.user_address,
    claims.recipient_address,
    parseU256Like(claims.tab_id, "tab_id"),
    parseU256Like(claims.amount, "amount"),
    claims.timestamp,
    claims.asset_address,
    parseU256Like(claims.req_id, "req_id"),
  );
};

const postFacilitatorJson = async <T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> => {
  const response = await fetch(`${resolveFacilitatorUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body, (_, value) =>
      typeof value === "bigint" ? `0x${value.toString(16)}` : value,
    ),
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T) : ({} as T);
  if (!response.ok) {
    throw new Error(`facilitator ${path} returned ${response.status}: ${text}`);
  }
  return payload;
};

class FacilitatorX402Flow extends X402Flow {
  lastTab?: TabResponse & { assetAddress: string; ttlSeconds?: number };

  protected override async requestTab(
    x402Version: number,
    paymentRequirements: PaymentRequirementsV1 | PaymentRequirementsV2,
    userAddress: string,
  ): Promise<TabResponse> {
    const tab = await postFacilitatorJson<FacilitatorTabResponse>("/tabs", {
      x402Version,
      userAddress,
      recipientAddress: paymentRequirements.payTo,
      network: paymentRequirements.network,
      erc20Token: paymentRequirements.asset,
      ttlSeconds: paymentRequirements.maxTimeoutSeconds,
    });

    this.lastTab = {
      tabId: tab.tabId,
      userAddress: tab.userAddress ?? userAddress,
      nextReqId: tab.nextReqId ?? "0x0",
      assetAddress: tab.assetAddress ?? paymentRequirements.asset,
      ttlSeconds: tab.ttlSeconds,
    };
    return this.lastTab;
  }
}

const issueGuaranteeViaFacilitator = async (
  x402Version: 1 | 2,
  paymentHeader: string,
  envelope: X402Envelope,
  paymentRequirements: PaymentRequirementsV1 | PaymentRequirementsV2,
): Promise<BLSCert | null> => {
  const verifyPayload = await postFacilitatorJson<{
    isValid?: boolean;
    error?: string;
  }>("/verify", {
    x402Version,
    paymentHeader,
    paymentPayload: envelope,
    paymentRequirements,
  });
  if (verifyPayload.isValid !== true) {
    throw new Error(
      `facilitator verify failed: ${verifyPayload.error ?? "invalid payment"}`,
    );
  }

  const settlePayload = await postFacilitatorJson<{
    success?: boolean;
    error?: string;
    errorReason?: string;
    error_reason?: string;
    message?: string;
    certificate?: { claims?: string; signature?: string };
  }>("/settle", {
    x402Version,
    paymentHeader,
    paymentPayload: envelope,
    paymentRequirements,
  });
  const success = settlePayload.success ?? !settlePayload.error;
  if (!success) {
    const reason =
      settlePayload.errorReason ??
      settlePayload.error_reason ??
      settlePayload.error ??
      settlePayload.message ??
      "unknown error";
    if (x402Version === 1 && reason.includes("guarantee domain mismatch")) {
      logStep("Facilitator V1 flow unavailable", { reason });
      return null;
    }
    throw new Error(`facilitator settle failed: ${reason}`);
  }

  const certificate = settlePayload.certificate;
  if (!certificate?.claims || !certificate.signature) {
    throw new Error(
      `facilitator certificate is malformed: ${JSON.stringify(settlePayload)}`,
    );
  }
  return {
    claims: certificate.claims,
    signature: certificate.signature,
  };
};

describeE2E("credit flow e2e", () => {
  let payerClient: Client | undefined;
  let recipientClient: Client | undefined;
  let payerAddress = "";
  let recipientAddress = "";
  let tokenAddress = "" as `0x${string}`;
  let tokenDecimals = 0;
  let tabTtlSeconds = 0;

  const waitUntilUnixTs = async (
    label: string,
    targetUnixTs: number,
  ): Promise<void> => {
    let printed = false;
    while (true) {
      const now = Math.floor(Date.now() / 1000);
      const remaining = targetUnixTs - now;
      if (remaining <= 0) {
        if (printed) {
          process.stdout.write(`\r[e2e] ${label}: ready${" ".repeat(16)}\n`);
        } else {
          console.log(`[e2e] ${label}: ready`);
        }
        return;
      }
      process.stdout.write(`\r[e2e] ${label}: waiting ${remaining}s   `);
      printed = true;
      await sleep(Math.min(remaining, 1) * 1000);
    }
  };

  const getCoreAssetBalance = async () => {
    if (!recipientClient || !payerAddress || !tokenAddress) {
      throw new Error("asset balance context not initialised");
    }
    const balance = await recipientClient.recipient.getUserAssetBalance(
      payerAddress,
      tokenAddress,
    );
    if (!balance) {
      throw new Error(
        `core asset balance not available yet for ${payerAddress} / ${tokenAddress}`,
      );
    }
    return balance;
  };

  const getCoreAssetBalanceOrZero = async () => {
    if (!recipientClient || !payerAddress || !tokenAddress) {
      throw new Error("asset balance context not initialised");
    }
    const balance = await recipientClient.recipient.getUserAssetBalance(
      payerAddress,
      tokenAddress,
    );
    return {
      total: balance?.total ?? 0n,
      locked: balance?.locked ?? 0n,
      version: balance?.version ?? 0,
      updatedAt: balance?.updatedAt ?? 0,
    };
  };

  const getTokenBalance = async (address: `0x${string}`): Promise<bigint> => {
    if (!payerClient || !tokenAddress) {
      throw new Error("token balance context not initialised");
    }
    const erc20 = getContract({
      address: tokenAddress,
      abi: erc20Abi,
      client: {
        public: payerClient.gateway.publicClient,
        wallet: payerClient.gateway.walletClient,
      },
    });
    return erc20.read.balanceOf([address]);
  };

  const ensureRecipientNativeGas = async (
    recipient: `0x${string}`,
    minimumBalance = parseEther("0.01"),
    topUpAmount = parseEther("0.05"),
  ): Promise<void> => {
    if (!payerClient) {
      throw new Error("payer client not initialised");
    }

    const balance = await payerClient.gateway.publicClient.getBalance({
      address: recipient,
    });
    if (balance >= minimumBalance) {
      logStep("Recipient native balance", {
        address: recipient,
        balance: describeEthAmount(balance),
      });
      return;
    }

    const hash = await payerClient.gateway.walletClient.sendTransaction({
      to: recipient,
      value: topUpAmount,
      account: payerClient.gateway.walletClient.account,
    });
    await payerClient.gateway.publicClient.waitForTransactionReceipt({ hash });
    const fundedBalance = await payerClient.gateway.publicClient.getBalance({
      address: recipient,
    });
    logStep("Fund recipient native gas", {
      address: recipient,
      previousBalance: describeEthAmount(balance),
      fundedAmount: describeEthAmount(topUpAmount),
      newBalance: describeEthAmount(fundedBalance),
      transactionHash: hash,
    });
  };

  const getUserPosition = async () => {
    if (!payerClient || !tokenAddress) {
      throw new Error("user position context not initialised");
    }
    const assets = await payerClient.user.getUser();
    return (
      assets.find(
        (asset) => asset.asset.toLowerCase() === tokenAddress.toLowerCase(),
      ) ?? null
    );
  };

  const waitForCoreAssetBalance = async (
    label: string,
    predicate: (
      balance: Awaited<ReturnType<typeof getCoreAssetBalance>>,
    ) => boolean,
    timeoutMs = 90_000,
    pollMs = 1_000,
    options?: { mineOnPoll?: boolean },
  ) => {
    const deadline = Date.now() + timeoutMs;
    let loggedProgressMine = false;
    while (true) {
      let balance: Awaited<ReturnType<typeof getCoreAssetBalance>> | null =
        null;
      try {
        balance = await getCoreAssetBalance();
      } catch (error) {
        if (Date.now() >= deadline) {
          throw error;
        }
      }

      if (balance && predicate(balance)) {
        return balance;
      }

      if (Date.now() >= deadline) {
        throw new Error(
          balance
            ? `${label} timed out; last total=${balance.total.toString()} locked=${balance.locked.toString()}`
            : `${label} timed out; core asset balance never became available`,
        );
      }
      if (options?.mineOnPoll) {
        await mineConfirmationBlock(`${label} progress block`, {
          silent: loggedProgressMine,
        });
        loggedProgressMine = true;
      }
      await sleep(pollMs);
    }
  };

  const waitForTabPaymentStatus = async (
    label: string,
    predicate: (
      status: Awaited<ReturnType<Client["user"]["getTabPaymentStatus"]>>,
    ) => boolean,
    tabId: bigint,
    timeoutMs = 90_000,
    pollMs = 1_000,
    options?: { mineOnPoll?: boolean },
  ) => {
    if (!payerClient) {
      throw new Error("payer client not initialised");
    }

    const deadline = Date.now() + timeoutMs;
    let status = await payerClient.user.getTabPaymentStatus(tabId);
    let loggedProgressMine = false;
    while (!predicate(status)) {
      if (Date.now() >= deadline) {
        throw new Error(
          `${label} timed out; last paid=${status.paid.toString()} remunerated=${status.remunerated} asset=${status.asset}`,
        );
      }
      if (options?.mineOnPoll) {
        await mineConfirmationBlock(`${label} progress block`, {
          silent: loggedProgressMine,
        });
        loggedProgressMine = true;
      }
      await sleep(pollMs);
      status = await payerClient.user.getTabPaymentStatus(tabId);
    }
    return status;
  };

  const mineConfirmationBlock = async (
    label: string,
    options?: { silent?: boolean },
  ): Promise<void> => {
    if (!payerClient) {
      throw new Error("payer client not initialised");
    }

    const methods = ["anvil_mine", "evm_mine"] as const;
    for (const method of methods) {
      try {
        if (method === "anvil_mine") {
          await payerClient.gateway.publicClient.request({
            method,
            params: [1],
          });
        } else {
          await payerClient.gateway.publicClient.request({
            method,
            params: [],
          });
        }
        if (!options?.silent) {
          logStep(label, { method });
        }
        return;
      } catch {}
    }

    if (!options?.silent) {
      logStep(label, { method: "unsupported" });
    }
  };

  const resolveTokenMetadata = async (): Promise<{
    address: `0x${string}`;
    decimals: number;
  }> => {
    if (!payerClient) {
      throw new Error("payer client not initialised");
    }

    const envAddress = resolveTokenAddressOverride();
    const envDecimals = resolveTokenDecimalsOverride();
    if (envAddress && envDecimals !== undefined) {
      return { address: envAddress, decimals: envDecimals };
    }

    let discoveredAddress: `0x${string}` | undefined;
    try {
      const supportedTokens = await payerClient.rpc.getSupportedTokens();
      const preferredToken =
        supportedTokens.tokens.find(
          (token) => token.symbol.toUpperCase() === "USDC",
        ) ?? supportedTokens.tokens[0];
      discoveredAddress = preferredToken?.address as `0x${string}` | undefined;
      if (preferredToken?.decimals !== undefined) {
        return {
          address: discoveredAddress!,
          decimals: Number(preferredToken.decimals),
        };
      }
    } catch (err) {
      if (!(err instanceof RpcError)) {
        throw err;
      }
      if (!envAddress) {
        throw new Error(
          `GET /core/tokens failed (${err.message}). Set E2E_TOKEN_ADDRESS and E2E_TOKEN_DECIMALS in .env.e2e to bypass token discovery.`,
        );
      }
      discoveredAddress = envAddress;
    }

    const address = envAddress ?? discoveredAddress;
    if (!address) {
      throw new Error("could not resolve an ERC20 token address for e2e");
    }

    if (envDecimals !== undefined) {
      return { address, decimals: envDecimals };
    }

    const erc20 = getContract({
      address,
      abi: erc20Abi,
      client: {
        public: payerClient.gateway.publicClient,
        wallet: payerClient.gateway.walletClient,
      },
    });
    const decimals = Number(await erc20.read.decimals());
    return { address, decimals };
  };

  const resolveEffectiveTabTtlSeconds = async (): Promise<number> => {
    if (!payerClient) {
      throw new Error("payer client not initialised");
    }

    const tabExpirationTime = Number(
      await payerClient.gateway.contract.read.tabExpirationTime(),
    );
    const configuredTtlSeconds = Number(
      process.env["TAB_TTL_SECONDS"] ?? "300",
    );
    const ttlSeconds =
      configuredTtlSeconds > 0
        ? Math.min(configuredTtlSeconds, Math.max(1, tabExpirationTime - 1))
        : Math.max(1, tabExpirationTime - 1);

    logStep("Resolved tab ttl", {
      configuredTtlSeconds,
      ttlSeconds,
      tabExpirationTime,
    });

    return ttlSeconds;
  };

  afterAll(async () => {
    await payerClient?.aclose();
    if (recipientClient !== payerClient) {
      await recipientClient?.aclose();
    }
  });

  it("tracks lock, unlock, remuneration, and withdrawal against the user deposit", async () => {
    const rpcUrl = resolveRpcUrl();
    const mode = await resolveE2EMode();
    const payerCfg = new ConfigBuilder()
      .rpcUrl(rpcUrl)
      .walletPrivateKey(resolvePayerKey())
      .enableAuth()
      .build();
    const recipientCfg = new ConfigBuilder()
      .rpcUrl(rpcUrl)
      .walletPrivateKey(resolveRecipientKey())
      .enableAuth()
      .build();

    payerClient = await Client.new(payerCfg);
    recipientClient = await Client.new(recipientCfg);

    if (
      recipientCfg.signer.address.toLowerCase() ===
      payerCfg.signer.address.toLowerCase()
    ) {
      throw new Error(
        "recipient address matches payer address; set RECIPIENT_PRIVATE_KEY to a different funded local key",
      );
    }

    await payerClient.login();
    await recipientClient.login();

    const token = await resolveTokenMetadata();
    tokenAddress = token.address;
    tokenDecimals = token.decimals;
    const depositAmount = parseUnits(
      process.env["DEPOSIT_AMOUNT"] ?? "1.0",
      tokenDecimals,
    );
    const guaranteeAmount = parseUnits(
      process.env["GUARANTEE_AMOUNT"] ?? "0.001",
      tokenDecimals,
    );
    const network = `eip155:${payerClient.params.chainId}`;
    const facilitatorFlow =
      mode === "facilitator"
        ? new FacilitatorX402Flow(payerClient.user)
        : undefined;
    payerAddress = payerCfg.signer.address;
    recipientAddress = recipientCfg.signer.address;

    await ensureRecipientNativeGas(recipientAddress as `0x${string}`);

    logStep("Setup", {
      rpcUrl,
      payerAddress,
      recipientAddress,
      mode,
      facilitatorUrl: mode === "facilitator" ? resolveFacilitatorUrl() : "n/a",
      tokenAddress,
      tokenDecimals,
      depositAmount: describeAmount(depositAmount, tokenDecimals),
      guaranteeAmount: describeAmount(guaranteeAmount, tokenDecimals),
    });

    const preDepositPosition = await getUserPosition();
    const preDepositCollateral = preDepositPosition?.collateral ?? 0n;
    const preDepositWithdrawalRequestAmount =
      preDepositPosition?.withdrawalRequestAmount ?? 0n;
    const preDepositWithdrawalRequestTimestamp =
      preDepositPosition?.withdrawalRequestTimestamp ?? 0;
    const preDepositCoreBalance = await getCoreAssetBalanceOrZero();

    const approveReceipt = await payerClient.user.approveErc20(
      tokenAddress,
      depositAmount,
    );
    logStep("Approve ERC20", {
      tokenAddress,
      amount: describeAmount(depositAmount, tokenDecimals),
      transactionHash: approveReceipt.transactionHash,
    });

    const depositReceipt = await payerClient.user.deposit(
      depositAmount,
      tokenAddress,
    );
    logStep("Deposit collateral", {
      tokenAddress,
      amount: describeAmount(depositAmount, tokenDecimals),
      transactionHash: depositReceipt.transactionHash,
    });

    const userAssets = await payerClient.user.getUser();
    const position = userAssets.find(
      (asset) => asset.asset.toLowerCase() === tokenAddress.toLowerCase(),
    );
    expect(
      position,
      `expected user asset position for ${tokenAddress}`,
    ).toBeDefined();
    expect(position!.collateral).toBe(preDepositCollateral + depositAmount);
    expect(position!.withdrawalRequestAmount).toBe(
      preDepositWithdrawalRequestAmount,
    );
    expect(position!.withdrawalRequestTimestamp).toBe(
      preDepositWithdrawalRequestTimestamp,
    );
    logStep("User collateral", {
      assetAddress: position!.asset,
      collateral: describeAmount(position!.collateral, tokenDecimals),
      withdrawalRequestAmount: describeAmount(
        position!.withdrawalRequestAmount,
        tokenDecimals,
      ),
      withdrawalRequestTimestamp: position!.withdrawalRequestTimestamp,
    });

    const depositBalance = await waitForCoreAssetBalance(
      "core balance after deposit",
      (balance) =>
        balance.total === preDepositCoreBalance.total + depositAmount &&
        balance.locked === preDepositCoreBalance.locked,
      90_000,
      1_000,
      { mineOnPoll: true },
    );
    logStep("Core asset balance after deposit", {
      total: describeAmount(depositBalance.total, tokenDecimals),
      locked: describeAmount(depositBalance.locked, tokenDecimals),
      version: depositBalance.version,
    });

    const tabExpirationTime = Number(
      await payerClient.gateway.contract.read.tabExpirationTime(),
    );
    tabTtlSeconds = await resolveEffectiveTabTtlSeconds();

    let paidTab:
      | {
          tabId: bigint;
          nextReqId: bigint;
          assetAddress: string;
        }
      | undefined;
    let paidClaims: PaymentGuaranteeRequestClaims;
    let paidSignature: string;
    let paidScheme: SigningScheme;
    let paidHeader: string | undefined;
    let paidEnvelope: X402Envelope | undefined;
    if (mode === "facilitator") {
      const paidRequirements: PaymentRequirementsV1 = {
        scheme: "4mica-credit",
        network,
        maxAmountRequired: guaranteeAmount.toString(),
        payTo: recipientAddress,
        asset: tokenAddress,
        maxTimeoutSeconds: tabTtlSeconds,
      };
      const signed = await facilitatorFlow!.signPayment(
        paidRequirements,
        payerAddress,
      );
      paidHeader = signed.header;
      paidEnvelope = decodePaymentHeader(signed.header);
      const claims = claimsFromEnvelope(paidEnvelope);
      if (claims instanceof PaymentGuaranteeRequestClaimsV2) {
        throw new Error("expected V1 claims from facilitator signPayment");
      }
      paidClaims = claims;
      paidSignature = signed.signature.signature;
      paidScheme = signed.signature.scheme;
      if (!facilitatorFlow?.lastTab) {
        throw new Error("facilitator did not return a tab");
      }
      paidTab = {
        tabId: paidClaims.tabId,
        nextReqId: paidClaims.reqId,
        assetAddress: facilitatorFlow.lastTab.assetAddress,
      };
    } else {
      const createdTab = await recipientClient.recipient.createTab(
        payerAddress,
        recipientAddress,
        tokenAddress,
        tabTtlSeconds || null,
      );
      paidTab = {
        tabId: createdTab.tabId,
        nextReqId: createdTab.nextReqId,
        assetAddress: createdTab.assetAddress,
      };
      paidClaims = PaymentGuaranteeRequestClaims.new(
        payerAddress,
        recipientAddress,
        paidTab.tabId,
        guaranteeAmount,
        Math.floor(Date.now() / 1000),
        paidTab.assetAddress,
        paidTab.nextReqId,
      );
      const signed = await payerClient.user.signPayment(
        paidClaims,
        SigningScheme.EIP712,
      );
      paidSignature = signed.signature;
      paidScheme = signed.scheme;
    }
    expect(paidTab.tabId > 0n).toBe(true);
    expect(paidTab.assetAddress.toLowerCase()).toBe(tokenAddress.toLowerCase());
    logStep("Create pay tab", {
      tabId: toHex(paidTab.tabId),
      nextReqId: toHex(paidTab.nextReqId),
      assetAddress: paidTab.assetAddress,
      ttlSeconds: tabTtlSeconds,
      tabExpirationTime,
    });
    logStep("Build pay V1 claims", {
      tabId: toHex(paidClaims.tabId),
      reqId: toHex(paidClaims.reqId),
      amount: toHex(paidClaims.amount),
      timestamp: paidClaims.timestamp,
      assetAddress: paidClaims.assetAddress,
      userAddress: paidClaims.userAddress,
      recipientAddress: paidClaims.recipientAddress,
    });

    logStep("Sign pay V1 claims", {
      scheme: paidScheme,
      signature: previewHex(paidSignature),
    });

    const paidCert =
      mode === "facilitator"
        ? await issueGuaranteeViaFacilitator(1, paidHeader!, paidEnvelope!, {
            scheme: "4mica-credit",
            network,
            maxAmountRequired: guaranteeAmount.toString(),
            payTo: recipientAddress,
            asset: tokenAddress,
            maxTimeoutSeconds: tabTtlSeconds,
          })
        : await recipientClient.recipient.issuePaymentGuarantee(
            paidClaims,
            paidSignature,
            paidScheme,
          );
    if (!paidCert) {
      return;
    }
    logStep("Issue pay V1 guarantee", {
      claims: previewHex(paidCert.claims, 24),
      blsSignature: previewHex(paidCert.signature, 24),
    });

    const paidDecoded =
      await recipientClient.recipient.verifyPaymentGuarantee(paidCert);
    logStep("Verify pay V1 guarantee", {
      version: paidDecoded.version,
      tabId: toHex(paidDecoded.tabId),
      reqId: toHex(paidDecoded.reqId),
      amount: toHex(paidDecoded.amount),
      totalAmount: toHex(paidDecoded.totalAmount),
      domain: previewHex(
        `0x${Buffer.from(paidDecoded.domain).toString("hex")}`,
        16,
      ),
    });

    expect(paidDecoded.version).toBe(1);
    expect(paidDecoded.tabId).toBe(paidTab.tabId);
    expect(paidDecoded.reqId).toBe(paidTab.nextReqId);
    expect(paidDecoded.amount).toBe(guaranteeAmount);
    expect(paidDecoded.totalAmount).toBe(guaranteeAmount);

    const lockedAfterGuarantee = await waitForCoreAssetBalance(
      "lock after guarantee issuance",
      (balance) =>
        balance.total === depositBalance.total &&
        balance.locked === depositBalance.locked + paidDecoded.amount,
    );
    logStep("Core asset balance after guarantee lock", {
      total: describeAmount(lockedAfterGuarantee.total, tokenDecimals),
      locked: describeAmount(lockedAfterGuarantee.locked, tokenDecimals),
      expectedLockedIncrease: describeAmount(paidDecoded.amount, tokenDecimals),
    });

    const payApproveReceipt = await payerClient.user.approveErc20(
      tokenAddress,
      paidDecoded.amount,
    );
    logStep("Approve ERC20 for payTab", {
      tokenAddress,
      amount: describeAmount(paidDecoded.amount, tokenDecimals),
      transactionHash: payApproveReceipt.transactionHash,
    });

    const recipientTokenBalanceBefore = await getTokenBalance(
      recipientAddress as `0x${string}`,
    );
    const payReceipt = await payerClient.user.payTab(
      paidTab.tabId,
      paidTab.nextReqId,
      paidDecoded.amount,
      recipientAddress,
      tokenAddress,
    );
    logStep("Pay tab in ERC20", {
      transactionHash: payReceipt.transactionHash,
      tabId: toHex(paidTab.tabId),
      reqId: toHex(paidTab.nextReqId),
      amount: describeAmount(paidDecoded.amount, tokenDecimals),
    });

    await mineConfirmationBlock("Mine confirmation block after payTab");

    const recipientTokenBalanceAfter = await getTokenBalance(
      recipientAddress as `0x${string}`,
    );
    logStep("Recipient ERC20 balance after payTab", {
      before: describeAmount(recipientTokenBalanceBefore, tokenDecimals),
      after: describeAmount(recipientTokenBalanceAfter, tokenDecimals),
      increase: describeAmount(
        recipientTokenBalanceAfter - recipientTokenBalanceBefore,
        tokenDecimals,
      ),
    });
    expect(recipientTokenBalanceAfter - recipientTokenBalanceBefore).toBe(
      paidDecoded.amount,
    );

    const paymentSyncTimeoutMs = Number(
      process.env["PAYMENT_SYNC_TIMEOUT_MS"] ?? "150000",
    );
    const requirePaymentFinalization =
      process.env["4MICA_REQUIRE_PAYMENT_FINALIZATION"] !== "0";
    const paymentFinalizationTimeoutMs = Number(
      process.env["PAYMENT_FINALIZATION_TIMEOUT_MS"] ??
        (requirePaymentFinalization ? "210000" : "15000"),
    );
    const synchronizedStatus = await waitForTabPaymentStatus(
      "payment is recorded",
      (status) =>
        status.paid === paidDecoded.amount &&
        !status.remunerated &&
        status.asset.toLowerCase() === tokenAddress.toLowerCase(),
      paidTab.tabId,
      paymentSyncTimeoutMs,
      1_000,
      { mineOnPoll: true },
    );
    logStep("Paid tab payment status", {
      paid: describeAmount(synchronizedStatus.paid, tokenDecimals),
      remunerated: synchronizedStatus.remunerated,
      asset: synchronizedStatus.asset,
    });
    expect(synchronizedStatus.paid).toBe(paidDecoded.amount);
    expect(synchronizedStatus.remunerated).toBe(false);

    const recipientPayments =
      await recipientClient.recipient.listRecipientPayments();
    const recordedPayment = recipientPayments.find(
      (payment) =>
        payment.txHash.toLowerCase() ===
        payReceipt.transactionHash.toLowerCase(),
    );
    expect(
      recordedPayment,
      `expected recipient payment row for ${payReceipt.transactionHash}`,
    ).toBeDefined();
    expect(recordedPayment!.amount).toBe(paidDecoded.amount);
    expect(recordedPayment!.failed).toBe(false);
    logStep("Recipient payment row", {
      txHash: recordedPayment!.txHash,
      amount: describeAmount(recordedPayment!.amount, tokenDecimals),
      verified: recordedPayment!.verified,
      finalized: recordedPayment!.finalized,
      failed: recordedPayment!.failed,
    });

    try {
      const unlockedAfterPayment = await waitForCoreAssetBalance(
        "unlock after ERC20 payment is finalized",
        (balance) =>
          balance.total === lockedAfterGuarantee.total &&
          balance.locked === lockedAfterGuarantee.locked - paidDecoded.amount,
        paymentFinalizationTimeoutMs,
        1_000,
        { mineOnPoll: true },
      );
      logStep("Core asset balance after payment unlock", {
        total: describeAmount(unlockedAfterPayment.total, tokenDecimals),
        locked: describeAmount(unlockedAfterPayment.locked, tokenDecimals),
      });
    } catch (error) {
      const coreBalance = await getCoreAssetBalance();
      logStep("Payment finalization not observed within timeout", {
        timeoutMs: paymentFinalizationTimeoutMs,
        requirePaymentFinalization,
        coreTotal: describeAmount(coreBalance.total, tokenDecimals),
        coreLocked: describeAmount(coreBalance.locked, tokenDecimals),
        reason: error instanceof Error ? error.message : String(error),
      });
      if (requirePaymentFinalization) {
        throw error;
      }
    }

    const remunerationFlowStartBalance = await getCoreAssetBalance();

    let tab:
      | {
          tabId: bigint;
          nextReqId: bigint;
          assetAddress: string;
        }
      | undefined;
    let claims: PaymentGuaranteeRequestClaims;
    let signature: string;
    let scheme: SigningScheme;
    let header: string | undefined;
    let envelope: X402Envelope | undefined;
    if (mode === "facilitator") {
      const requirements: PaymentRequirementsV1 = {
        scheme: "4mica-credit",
        network,
        maxAmountRequired: guaranteeAmount.toString(),
        payTo: recipientAddress,
        asset: tokenAddress,
        maxTimeoutSeconds: tabTtlSeconds,
      };
      const signed = await facilitatorFlow!.signPayment(
        requirements,
        payerAddress,
      );
      header = signed.header;
      envelope = decodePaymentHeader(signed.header);
      const builtClaims = claimsFromEnvelope(envelope);
      if (builtClaims instanceof PaymentGuaranteeRequestClaimsV2) {
        throw new Error("expected V1 claims from facilitator signPayment");
      }
      claims = builtClaims;
      signature = signed.signature.signature;
      scheme = signed.signature.scheme;
      if (!facilitatorFlow?.lastTab) {
        throw new Error("facilitator did not return a tab");
      }
      tab = {
        tabId: claims.tabId,
        nextReqId: claims.reqId,
        assetAddress: facilitatorFlow.lastTab.assetAddress,
      };
    } else {
      const createdTab = await recipientClient.recipient.createTab(
        payerAddress,
        recipientAddress,
        tokenAddress,
        tabTtlSeconds || null,
      );
      tab = {
        tabId: createdTab.tabId,
        nextReqId: createdTab.nextReqId,
        assetAddress: createdTab.assetAddress,
      };
      claims = PaymentGuaranteeRequestClaims.new(
        payerAddress,
        recipientAddress,
        tab.tabId,
        guaranteeAmount,
        Math.floor(Date.now() / 1000),
        tab.assetAddress,
        tab.nextReqId,
      );
      const signed = await payerClient.user.signPayment(
        claims,
        SigningScheme.EIP712,
      );
      signature = signed.signature;
      scheme = signed.scheme;
    }
    expect(tab.tabId > 0n).toBe(true);
    expect(tab.assetAddress.toLowerCase()).toBe(tokenAddress.toLowerCase());
    logStep("Create remunerated tab", {
      tabId: toHex(tab.tabId),
      nextReqId: toHex(tab.nextReqId),
      assetAddress: tab.assetAddress,
      ttlSeconds: tabTtlSeconds,
      tabExpirationTime,
    });
    logStep("Build remunerated V1 claims", {
      tabId: toHex(claims.tabId),
      reqId: toHex(claims.reqId),
      amount: toHex(claims.amount),
      timestamp: claims.timestamp,
      assetAddress: claims.assetAddress,
      userAddress: claims.userAddress,
      recipientAddress: claims.recipientAddress,
    });

    logStep("Sign remunerated V1 claims", {
      scheme,
      signature: previewHex(signature),
    });

    const cert =
      mode === "facilitator"
        ? await issueGuaranteeViaFacilitator(1, header!, envelope!, {
            scheme: "4mica-credit",
            network,
            maxAmountRequired: guaranteeAmount.toString(),
            payTo: recipientAddress,
            asset: tokenAddress,
            maxTimeoutSeconds: tabTtlSeconds,
          })
        : await recipientClient.recipient.issuePaymentGuarantee(
            claims,
            signature,
            scheme,
          );
    if (!cert) {
      return;
    }
    logStep("Issue remunerated V1 guarantee", {
      claims: previewHex(cert.claims, 24),
      blsSignature: previewHex(cert.signature, 24),
    });

    const decoded =
      await recipientClient.recipient.verifyPaymentGuarantee(cert);
    logStep("Verify remunerated V1 guarantee", {
      version: decoded.version,
      tabId: toHex(decoded.tabId),
      reqId: toHex(decoded.reqId),
      amount: toHex(decoded.amount),
      totalAmount: toHex(decoded.totalAmount),
      domain: previewHex(
        `0x${Buffer.from(decoded.domain).toString("hex")}`,
        16,
      ),
    });

    expect(decoded.version).toBe(1);
    expect(decoded.tabId).toBe(tab.tabId);
    expect(decoded.reqId).toBe(tab.nextReqId);
    expect(decoded.amount).toBe(guaranteeAmount);
    expect(decoded.totalAmount).toBe(decoded.amount);

    const balanceAfterRemGuarantee = await waitForCoreAssetBalance(
      "lock before remuneration",
      (balance) =>
        balance.total === remunerationFlowStartBalance.total &&
        balance.locked === remunerationFlowStartBalance.locked + decoded.amount,
    );
    logStep("Core asset balance before remuneration", {
      total: describeAmount(balanceAfterRemGuarantee.total, tokenDecimals),
      locked: describeAmount(balanceAfterRemGuarantee.locked, tokenDecimals),
    });
    expect(balanceAfterRemGuarantee.total).toBe(
      remunerationFlowStartBalance.total,
    );

    const remunerationGracePeriod = Number(
      await payerClient.gateway.contract.read.remunerationGracePeriod(),
    );
    const synchronizationDelay = Number(
      await payerClient.gateway.contract.read.synchronizationDelay(),
    );
    const withdrawalGracePeriod = Number(
      await payerClient.gateway.contract.read.withdrawalGracePeriod(),
    );
    logStep("Contract timings", {
      remunerationGracePeriod,
      tabExpirationTime,
      synchronizationDelay,
      withdrawalGracePeriod,
    });

    const preRemunerationAssets = await payerClient.user.getUser();
    const preRemunerationPosition = preRemunerationAssets.find(
      (asset) => asset.asset.toLowerCase() === tokenAddress.toLowerCase(),
    );
    expect(preRemunerationPosition).toBeDefined();

    const remunerateAt = claims.timestamp + remunerationGracePeriod + 1;
    await waitUntilUnixTs("Remuneration grace period", remunerateAt);

    const recipientTokenBalanceBeforeRemuneration = await getTokenBalance(
      recipientAddress as `0x${string}`,
    );
    const remunerateReceipt = await recipientClient.recipient.remunerate(cert);
    logStep("Remunerate", {
      transactionHash: remunerateReceipt.transactionHash,
      tabId: toHex(decoded.tabId),
      totalAmount: describeAmount(decoded.totalAmount, tokenDecimals),
    });

    const paymentStatus = await payerClient.user.getTabPaymentStatus(tab.tabId);
    logStep("Tab payment status", {
      paid: describeAmount(paymentStatus.paid, tokenDecimals),
      remunerated: paymentStatus.remunerated,
      asset: paymentStatus.asset,
    });
    expect(paymentStatus.paid).toBe(0n);
    expect(paymentStatus.remunerated).toBe(true);
    expect(paymentStatus.asset.toLowerCase()).toBe(tokenAddress.toLowerCase());

    const recipientTokenBalanceAfterRemuneration = await getTokenBalance(
      recipientAddress as `0x${string}`,
    );
    expect(
      recipientTokenBalanceAfterRemuneration -
        recipientTokenBalanceBeforeRemuneration,
    ).toBe(decoded.totalAmount);

    const postRemunerationCoreBalance = await waitForCoreAssetBalance(
      "core balance after remuneration",
      (balance) =>
        balance.total ===
          balanceAfterRemGuarantee.total - decoded.totalAmount &&
        balance.locked ===
          balanceAfterRemGuarantee.locked - decoded.totalAmount,
      90_000,
      1_000,
      { mineOnPoll: true },
    );
    logStep("Core asset balance after remuneration", {
      total: describeAmount(postRemunerationCoreBalance.total, tokenDecimals),
      locked: describeAmount(postRemunerationCoreBalance.locked, tokenDecimals),
    });

    const postRemunerationPosition = await getUserPosition();
    expect(postRemunerationPosition).toBeDefined();
    expect(preRemunerationPosition!.collateral >= decoded.totalAmount).toBe(
      true,
    );
    expect(postRemunerationPosition!.collateral).toBe(
      preRemunerationPosition!.collateral - decoded.totalAmount,
    );

    const configuredWithdrawAmount = parseUnits(
      process.env["WITHDRAW_AMOUNT"] ?? "0.0005",
      tokenDecimals,
    );
    const withdrawalAmount = minBigInt(
      configuredWithdrawAmount,
      postRemunerationPosition!.collateral,
    );
    expect(withdrawalAmount > 0n).toBe(true);

    const payerTokenBalanceBeforeWithdrawal = await getTokenBalance(
      payerAddress as `0x${string}`,
    );
    const requestReceipt = await payerClient.user.requestWithdrawal(
      withdrawalAmount,
      tokenAddress,
    );
    logStep("Request withdrawal", {
      transactionHash: requestReceipt.transactionHash,
      assetAddress: tokenAddress,
      amount: describeAmount(withdrawalAmount, tokenDecimals),
    });

    const requestedAssets = await payerClient.user.getUser();
    const requestedPosition = requestedAssets.find(
      (asset) => asset.asset.toLowerCase() === tokenAddress.toLowerCase(),
    );
    expect(requestedPosition).toBeDefined();
    expect(requestedPosition!.collateral).toBe(
      postRemunerationPosition!.collateral,
    );
    expect(requestedPosition!.withdrawalRequestAmount).toBe(withdrawalAmount);
    expect(requestedPosition!.withdrawalRequestTimestamp > 0).toBe(true);
    logStep("Pending withdrawal state", {
      collateral: describeAmount(requestedPosition!.collateral, tokenDecimals),
      withdrawalRequestAmount: describeAmount(
        requestedPosition!.withdrawalRequestAmount,
        tokenDecimals,
      ),
      withdrawalRequestTimestamp: requestedPosition!.withdrawalRequestTimestamp,
    });

    const finalizeAt =
      requestedPosition!.withdrawalRequestTimestamp + withdrawalGracePeriod + 1;
    await waitUntilUnixTs("Withdrawal grace period", finalizeAt);

    const expectedWithdrawalExecuted = minBigInt(
      requestedPosition!.collateral,
      requestedPosition!.withdrawalRequestAmount,
    );
    const finalizeReceipt =
      await payerClient.user.finalizeWithdrawal(tokenAddress);
    logStep("Finalize withdrawal", {
      transactionHash: finalizeReceipt.transactionHash,
      assetAddress: tokenAddress,
      amount: describeAmount(expectedWithdrawalExecuted, tokenDecimals),
    });

    const payerTokenBalanceAfterWithdrawal = await getTokenBalance(
      payerAddress as `0x${string}`,
    );
    expect(
      payerTokenBalanceAfterWithdrawal - payerTokenBalanceBeforeWithdrawal,
    ).toBe(expectedWithdrawalExecuted);

    const finalAssets = await payerClient.user.getUser();
    const finalPosition = finalAssets.find(
      (asset) => asset.asset.toLowerCase() === tokenAddress.toLowerCase(),
    );
    expect(finalPosition).toBeDefined();
    expect(finalPosition!.collateral).toBe(
      requestedPosition!.collateral - expectedWithdrawalExecuted,
    );
    expect(finalPosition!.withdrawalRequestAmount).toBe(0n);
    expect(finalPosition!.withdrawalRequestTimestamp).toBe(0);
    logStep("Final user state", {
      collateral: describeAmount(finalPosition!.collateral, tokenDecimals),
      withdrawalRequestAmount: describeAmount(
        finalPosition!.withdrawalRequestAmount,
        tokenDecimals,
      ),
      withdrawalRequestTimestamp: finalPosition!.withdrawalRequestTimestamp,
    });

    const finalCoreBalance = await waitForCoreAssetBalance(
      "core balance after withdrawal finalize",
      (balance) =>
        balance.total ===
          postRemunerationCoreBalance.total - expectedWithdrawalExecuted &&
        balance.locked === postRemunerationCoreBalance.locked,
      90_000,
      1_000,
      { mineOnPoll: true },
    );
    logStep("Core asset balance after withdrawal finalize", {
      total: describeAmount(finalCoreBalance.total, tokenDecimals),
      locked: describeAmount(finalCoreBalance.locked, tokenDecimals),
    });
  }, 420_000);

  it("issues and verifies a V2 guarantee when validation config is available", async () => {
    if (!payerClient || !recipientClient) {
      throw new Error("V1 e2e setup must run before V2 e2e");
    }
    const mode = await resolveE2EMode();
    if (!tokenAddress || tokenDecimals === 0) {
      return;
    }
    if (!payerClient.params.acceptedGuaranteeVersions.includes(2)) {
      return;
    }

    const validationRegistryAddress =
      process.env["VALIDATION_REGISTRY"] ??
      payerClient.params.trustedValidationRegistries[0];
    const validatorAddress = process.env["VALIDATOR_ADDRESS"];
    if (!validationRegistryAddress || !validatorAddress) {
      return;
    }

    const effectiveTabTtlSeconds =
      tabTtlSeconds > 0 ? tabTtlSeconds : await resolveEffectiveTabTtlSeconds();

    try {
      await waitForCoreAssetBalance(
        "v2 precondition core balance",
        () => true,
        15_000,
        1_000,
        {
          mineOnPoll: true,
        },
      );
    } catch {
      return;
    }

    const guaranteeAmount = parseUnits(
      process.env["V2_GUARANTEE_AMOUNT"] ?? "0.001",
      tokenDecimals,
    );
    const validationChainId = Number(payerClient.params.chainId);
    const validatorAgentId = BigInt(process.env["VALIDATOR_AGENT_ID"] ?? "1");
    const minValidationScore = Number(
      process.env["MIN_VALIDATION_SCORE"] ?? "80",
    );
    const requiredValidationTag = process.env["VALIDATION_TAG"] ?? "";
    const jobHash = "0x" + "11".repeat(32);
    const network = `eip155:${payerClient.params.chainId}`;
    const facilitatorFlow =
      mode === "facilitator"
        ? new FacilitatorX402Flow(payerClient.user)
        : undefined;
    let tab:
      | {
          tabId: bigint;
          nextReqId: bigint;
          assetAddress: string;
        }
      | undefined;
    let claims: PaymentGuaranteeRequestClaimsV2;
    let signature: string;
    let scheme: SigningScheme;
    let header: string | undefined;
    let envelope: X402Envelope | undefined;
    let timestamp = Math.floor(Date.now() / 1000);
    if (mode === "facilitator") {
      const requirements: PaymentRequirementsV2 = {
        scheme: "4mica-credit",
        network,
        asset: tokenAddress,
        amount: guaranteeAmount.toString(),
        payTo: recipientAddress,
        maxTimeoutSeconds: effectiveTabTtlSeconds,
        extra: {
          validationRegistryAddress,
          validationChainId,
          validatorAddress,
          validatorAgentId: toHex(validatorAgentId),
          minValidationScore,
          jobHash,
          requiredValidationTag,
        },
      };
      const paymentRequired: X402PaymentRequired = {
        x402Version: 2,
        resource: {
          url: `${resolveFacilitatorUrl()}/resource/e2e-v2`,
          description: "e2e-v2",
          mimeType: "application/json",
        },
        accepts: [requirements],
      };
      const signed = await facilitatorFlow!.signPaymentV2(
        paymentRequired,
        requirements,
        payerAddress,
      );
      header = signed.header;
      envelope = decodePaymentHeader(signed.header);
      const builtClaims = claimsFromEnvelope(envelope);
      if (!(builtClaims instanceof PaymentGuaranteeRequestClaimsV2)) {
        throw new Error("expected V2 claims from facilitator signPaymentV2");
      }
      claims = builtClaims;
      signature = signed.signature.signature;
      scheme = signed.signature.scheme;
      timestamp = claims.timestamp;
      if (!facilitatorFlow?.lastTab) {
        throw new Error("facilitator did not return a tab");
      }
      tab = {
        tabId: claims.tabId,
        nextReqId: claims.reqId,
        assetAddress: facilitatorFlow.lastTab.assetAddress,
      };
    } else {
      const createdTab = await recipientClient.recipient.createTab(
        payerAddress,
        recipientAddress,
        tokenAddress,
        effectiveTabTtlSeconds,
      );
      tab = {
        tabId: createdTab.tabId,
        nextReqId: createdTab.nextReqId,
        assetAddress: createdTab.assetAddress,
      };
      const baseClaims = PaymentGuaranteeRequestClaims.new(
        payerAddress,
        recipientAddress,
        tab.tabId,
        guaranteeAmount,
        timestamp,
        tab.assetAddress,
        tab.nextReqId,
      );
      const validationSubjectHash = computeValidationSubjectHash(baseClaims);
      logStep("Build V2 base claims", {
        tabId: toHex(baseClaims.tabId),
        reqId: toHex(baseClaims.reqId),
        amount: toHex(baseClaims.amount),
        assetAddress: baseClaims.assetAddress,
        validationSubjectHash,
      });

      const partial = new PaymentGuaranteeRequestClaimsV2({
        userAddress: baseClaims.userAddress,
        recipientAddress: baseClaims.recipientAddress,
        tabId: baseClaims.tabId,
        reqId: baseClaims.reqId,
        amount: baseClaims.amount,
        timestamp: baseClaims.timestamp,
        assetAddress: baseClaims.assetAddress,
        validationRegistryAddress,
        validationRequestHash: "0x" + "00".repeat(32),
        validationChainId,
        validatorAddress,
        validatorAgentId,
        minValidationScore,
        validationSubjectHash,
        jobHash,
        requiredValidationTag,
      });
      const validationRequestHash = computeValidationRequestHash(partial);
      claims = new PaymentGuaranteeRequestClaimsV2({
        ...partial,
        validationRequestHash,
      });
      const signed = await payerClient.user.signPayment(
        claims,
        SigningScheme.EIP712,
      );
      signature = signed.signature;
      scheme = signed.scheme;
    }
    logStep("Prepare V2 inputs", {
      tabId: toHex(tab.tabId),
      nextReqId: toHex(tab.nextReqId),
      guaranteeAmount: describeAmount(guaranteeAmount, tokenDecimals),
      ttlSeconds: effectiveTabTtlSeconds,
      validationRegistryAddress,
      validatorAddress,
      validatorAgentId: toHex(validatorAgentId),
      validationChainId,
      minValidationScore,
      jobHash,
      requiredValidationTag,
      timestamp,
    });

    logStep("Finalize V2 claims", {
      tabId: toHex(claims.tabId),
      reqId: toHex(claims.reqId),
      validationRequestHash: claims.validationRequestHash,
      validationSubjectHash: claims.validationSubjectHash,
      validatorAgentId: toHex(claims.validatorAgentId),
    });

    logStep("Sign V2 claims", {
      scheme,
      signature: previewHex(signature),
    });

    const cert =
      mode === "facilitator"
        ? await issueGuaranteeViaFacilitator(2, header!, envelope!, {
            scheme: "4mica-credit",
            network,
            asset: tokenAddress,
            amount: guaranteeAmount.toString(),
            payTo: recipientAddress,
            maxTimeoutSeconds: effectiveTabTtlSeconds,
            extra: {
              validationRegistryAddress,
              validationChainId,
              validatorAddress,
              validatorAgentId: toHex(validatorAgentId),
              minValidationScore,
              jobHash,
              requiredValidationTag,
            },
          })
        : await recipientClient.recipient.issuePaymentGuarantee(
            claims,
            signature,
            scheme,
          );
    if (!cert) {
      return;
    }
    logStep("Issue V2 guarantee", {
      claims: previewHex(cert.claims, 24),
      blsSignature: previewHex(cert.signature, 24),
    });

    const decoded =
      await recipientClient.recipient.verifyPaymentGuarantee(cert);
    logStep("Verify V2 guarantee", {
      version: decoded.version,
      tabId: toHex(decoded.tabId),
      reqId: toHex(decoded.reqId),
      amount: toHex(decoded.amount),
      totalAmount: toHex(decoded.totalAmount),
      validationRegistryAddress:
        decoded.validationPolicy?.validationRegistryAddress ?? "",
      validatorAddress: decoded.validationPolicy?.validatorAddress ?? "",
      validatorAgentId: decoded.validationPolicy
        ? toHex(decoded.validationPolicy.validatorAgentId)
        : "",
      validationRequestHash:
        decoded.validationPolicy?.validationRequestHash ?? "",
      validationSubjectHash:
        decoded.validationPolicy?.validationSubjectHash ?? "",
      blsDomain: previewHex(
        `0x${Buffer.from(decoded.domain).toString("hex")}`,
        16,
      ),
    });

    expect(decoded.version).toBe(2);
    expect(decoded.validationPolicy).toBeDefined();
    expect(
      decoded.validationPolicy?.validationRegistryAddress.toLowerCase(),
    ).toBe(validationRegistryAddress.toLowerCase());
    expect(decoded.validationPolicy?.validatorAddress.toLowerCase()).toBe(
      validatorAddress.toLowerCase(),
    );
    expect(decoded.validationPolicy?.validatorAgentId).toBe(validatorAgentId);
  }, 60_000);
});
