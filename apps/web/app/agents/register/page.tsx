"use client";

import {
  type Provider,
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
  useAppKitProvider,
  useDisconnect,
} from "@reown/appkit/react";
import { useEffect, useMemo, useState } from "react";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  getContract,
  parseAbiItem,
  parseUnits,
} from "viem";
import { networks } from "@/config/appkit";
import Footer from "../../../components/Footer";
import Header from "../../../components/Header";
import {
  REGISTRATION_CONFIG,
  type RegistrationAssetKey,
  type RegistrationChainKey,
} from "../../../lib/registrationConfig";

const core4MicaAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "depositStablecoin",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const core4MicaReadAbi = [
  {
    type: "function",
    name: "getUserAllAssets",
    stateMutability: "view",
    inputs: [{ name: "userAddr", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "asset", type: "address" },
          { name: "collateral", type: "uint256" },
          { name: "withdrawalRequestTimestamp", type: "uint256" },
          { name: "withdrawalRequestAmount", type: "uint256" },
        ],
      },
    ],
  },
] as const;

const collateralDepositedEvent = parseAbiItem(
  "event CollateralDeposited(address indexed user, address indexed asset, uint256 amount)",
);

type TxStatus = "idle" | "approving" | "depositing" | "success" | "error";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
};

const formatAddress = (value: string) =>
  `${value.slice(0, 6)}...${value.slice(-4)}`;

const sanitizeErrorMessage = (message: string) => {
  const lower = message.toLowerCase();
  if (
    lower.includes("rpc") ||
    lower.includes("contract call") ||
    lower.includes("request was aborted") ||
    lower.includes("viem")
  ) {
    return "RPC error. Please try again.";
  }
  if (message.length > 160) {
    return "Something went wrong. Please try again.";
  }
  return message;
};

const parseError = (err: unknown) => {
  if (typeof err === "string") return sanitizeErrorMessage(err);
  if (err instanceof Error) return sanitizeErrorMessage(err.message);
  if (err && typeof err === "object") {
    const maybe = err as { shortMessage?: string; message?: string };
    if (maybe.shortMessage) return sanitizeErrorMessage(maybe.shortMessage);
    if (maybe.message) return sanitizeErrorMessage(maybe.message);
  }
  return "Something went wrong. Please try again.";
};

export default function AgentRegistrationPage() {
  const [selectedChainKey, setSelectedChainKey] =
    useState<RegistrationChainKey>("ethereumSepolia");
  const [selectedAssetKey, setSelectedAssetKey] =
    useState<RegistrationAssetKey>("usdc");
  const [amount, setAmount] = useState("");
  const [_balance, setBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);

  const eip155Account = useAppKitAccount({ namespace: "eip155" });
  const { open } = useAppKit();
  const { chainId, switchNetwork } = useAppKitNetwork();
  const { walletProvider } = useAppKitProvider<Provider>("eip155");
  const { disconnect } = useDisconnect();

  const chain = REGISTRATION_CONFIG.chains[selectedChainKey];
  const asset = chain.assets[selectedAssetKey];
  const coreContractAddress = chain.coreContractAddress || null;
  const contractEnvVar =
    chain.key === "ethereumSepolia"
      ? "NEXT_PUBLIC_4MICA_CORE_CONTRACT_ETH_SEPOLIA"
      : "NEXT_PUBLIC_4MICA_CORE_CONTRACT_BASE_SEPOLIA";
  const account = (eip155Account.address as Address | undefined) ?? null;
  const isConnected = Boolean(eip155Account.isConnected && account);
  const activeChainId = typeof chainId === "string" ? Number(chainId) : chainId;
  const isWrongNetwork = Boolean(
    isConnected && activeChainId && activeChainId !== chain.id,
  );
  const missingContract = !coreContractAddress;
  const activeProvider =
    (walletProvider as EthereumProvider | undefined) ?? null;

  const parsedAmount = useMemo(() => {
    if (!amount.trim()) return null;
    try {
      return parseUnits(amount.trim(), asset.decimals);
    } catch {
      return null;
    }
  }, [amount, asset.decimals]);

  const amountError = useMemo(() => {
    if (!amount.trim()) return null;
    if (!parsedAmount) return "Enter a valid numeric amount.";
    if (parsedAmount <= 0n) return "Amount must be greater than zero.";
    return null;
  }, [amount, parsedAmount]);

  const needsApproval =
    asset.type === "erc20" &&
    parsedAmount !== null &&
    allowance !== null &&
    allowance < parsedAmount;

  const canDeposit =
    !amountError &&
    !isWrongNetwork &&
    !missingContract &&
    txStatus !== "approving" &&
    txStatus !== "depositing" &&
    parsedAmount !== null &&
    (asset.type === "native" || !needsApproval);

  useEffect(() => {
    setTxStatus("idle");
    setTxHash(null);
    setError(null);
  }, [selectedChainKey, selectedAssetKey, amount]);

  useEffect(() => {
    let canceled = false;

    const checkRegistration = async () => {
      if (
        !activeProvider ||
        !account ||
        isWrongNetwork ||
        !coreContractAddress
      ) {
        if (!canceled) setIsRegistered(false);
        return;
      }

      try {
        const transport = custom(activeProvider);
        const publicClient = createPublicClient({
          chain: chain.viemChain,
          transport,
        });

        const assets = (await publicClient.readContract({
          address: coreContractAddress,
          abi: core4MicaReadAbi,
          functionName: "getUserAllAssets",
          args: [account],
        })) as Array<{
          asset: Address;
          collateral: bigint;
          withdrawalRequestTimestamp: bigint;
          withdrawalRequestAmount: bigint;
        }>;

        const hasLiveCollateral = assets.some(
          (item) =>
            item.collateral > 0n ||
            item.withdrawalRequestAmount > 0n ||
            item.withdrawalRequestTimestamp > 0n,
        );

        if (hasLiveCollateral) {
          if (!canceled) setIsRegistered(true);
          return;
        }

        const logs = await publicClient.getLogs({
          address: coreContractAddress,
          event: collateralDepositedEvent,
          args: { user: account },
          fromBlock: 0n,
          toBlock: "latest",
        });

        if (!canceled) {
          setIsRegistered(logs.length > 0);
        }
      } catch {
        if (!canceled) setIsRegistered(false);
      }
    };

    checkRegistration();

    return () => {
      canceled = true;
    };
  }, [
    account,
    activeProvider,
    chain.viemChain,
    coreContractAddress,
    isWrongNetwork,
  ]);

  useEffect(() => {
    const refreshBalances = async () => {
      if (!activeProvider || !account) return;
      if (isWrongNetwork) return;

      try {
        const transport = custom(activeProvider);
        const publicClient = createPublicClient({
          chain: chain.viemChain,
          transport,
        });

        if (asset.type === "native") {
          const nativeBalance = await publicClient.getBalance({
            address: account,
          });
          setBalance(nativeBalance);
          setAllowance(null);
          return;
        }

        if (!asset.address || !coreContractAddress) {
          setBalance(null);
          setAllowance(null);
          return;
        }

        const tokenContract = getContract({
          address: asset.address,
          abi: erc20Abi,
          client: publicClient,
        });

        const [tokenBalance, tokenAllowance] = await Promise.all([
          tokenContract.read.balanceOf([account]),
          tokenContract.read.allowance([account, coreContractAddress]),
        ]);

        setBalance(tokenBalance);
        setAllowance(tokenAllowance);
      } catch (err) {
        setError(parseError(err));
      }
    };

    refreshBalances();
  }, [
    account,
    activeProvider,
    asset.address,
    asset.type,
    coreContractAddress,
    chain.viemChain,
    isWrongNetwork,
    missingContract,
  ]);

  const disconnectWallet = async () => {
    try {
      await disconnect({ namespace: "eip155" });
    } catch {
      // ignore disconnect errors
    }
  };

  const _handleSwitchNetwork = async () => {
    const targetNetwork = networks.find(
      (item) => (item as { id?: number }).id === chain.id,
    );
    if (!targetNetwork) {
      setError("Selected network is not available in AppKit.");
      return;
    }
    setError(null);
    try {
      await switchNetwork(targetNetwork);
    } catch (err) {
      setError(parseError(err));
    }
  };

  const handleApprove = async () => {
    if (
      !activeProvider ||
      !account ||
      !parsedAmount ||
      asset.type !== "erc20" ||
      !asset.address
    )
      return;
    if (!coreContractAddress) return;
    setError(null);
    setTxStatus("approving");
    setTxHash(null);

    try {
      const transport = custom(activeProvider);
      const publicClient = createPublicClient({
        chain: chain.viemChain,
        transport,
      });
      const walletClient = createWalletClient({
        chain: chain.viemChain,
        transport,
        account,
      });
      const tokenContract = getContract({
        address: asset.address,
        abi: erc20Abi,
        client: { public: publicClient, wallet: walletClient },
      });

      const hash = await tokenContract.write.approve([
        coreContractAddress,
        parsedAmount,
      ]);
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setTxStatus("idle");
      const allowanceValue = await tokenContract.read.allowance([
        account,
        coreContractAddress,
      ]);
      setAllowance(allowanceValue);
    } catch (err) {
      setTxStatus("error");
      setError(parseError(err));
    }
  };

  const handleDeposit = async () => {
    if (!activeProvider || !account || !parsedAmount) return;
    if (!coreContractAddress) return;
    setError(null);
    setTxStatus("depositing");
    setTxHash(null);

    try {
      const transport = custom(activeProvider);
      const publicClient = createPublicClient({
        chain: chain.viemChain,
        transport,
      });
      const walletClient = createWalletClient({
        chain: chain.viemChain,
        transport,
        account,
      });
      const coreContract = getContract({
        address: coreContractAddress,
        abi: core4MicaAbi,
        client: { public: publicClient, wallet: walletClient },
      });

      const hash =
        asset.type === "native"
          ? await coreContract.write.deposit({ value: parsedAmount })
          : await coreContract.write.depositStablecoin([
              asset.address!,
              parsedAmount,
            ]);

      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setTxStatus("success");
      setIsRegistered(true);
      const updatedBalance =
        asset.type === "native"
          ? await publicClient.getBalance({ address: account })
          : await getContract({
              address: asset.address!,
              abi: erc20Abi,
              client: publicClient,
            }).read.balanceOf([account]);
      setBalance(updatedBalance);
    } catch (err) {
      setTxStatus("error");
      setError(parseError(err));
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="min-h-screen pt-20 text-ink-body">
        <div className="container mx-auto px-6">
          <div className="mb-12"></div>

          <div className="flex justify-center">
            <div className="glass-panel w-full max-w-2xl space-y-6 rounded-lg p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-ink-strong text-xl">
                    Deposit Details
                  </h2>
                  <p className="mt-1 text-ink-muted text-xs">
                    Wallet authorization required
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs ${
                    txStatus === "success" || isRegistered
                      ? "bg-emerald-500/20 text-emerald-200"
                      : "bg-white/10 text-ink-muted"
                  }`}
                >
                  {txStatus === "success" || isRegistered
                    ? "Registered"
                    : "Not registered"}
                </span>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-200 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div className="text-ink-muted text-xs uppercase tracking-[0.3em]">
                  Allowed Chain
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {Object.values(REGISTRATION_CONFIG.chains).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setSelectedChainKey(item.key)}
                      className={`rounded-lg border px-4 py-3 text-left text-sm transition ${
                        selectedChainKey === item.key
                          ? "border-brand bg-surface-solid text-ink-strong"
                          : "border-white/10 text-ink-muted hover:border-brand/40"
                      }`}
                    >
                      <div className="font-semibold">{item.shortLabel}</div>
                      <div className="text-xs">{item.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="text-ink-muted text-xs uppercase tracking-[0.3em]">
                  Asset
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {(["usdc", "usdt", "native"] as RegistrationAssetKey[]).map(
                    (key) => {
                      const item = chain.assets[key];
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setSelectedAssetKey(item.key)}
                          className={`rounded-lg border px-3 py-3 text-center text-sm transition ${
                            selectedAssetKey === item.key
                              ? "border-brand bg-surface-solid text-ink-strong"
                              : "border-white/10 text-ink-muted hover:border-brand/40"
                          }`}
                        >
                          <div className="font-semibold">{item.symbol}</div>
                          <div className="text-[11px] text-ink-muted">
                            {item.label}
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <label
                  htmlFor="registration-amount"
                  className="text-ink-muted text-xs uppercase tracking-[0.3em]"
                >
                  Amount
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="registration-amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder={`0.0 ${asset.symbol}`}
                    className="form-field-dark flex-1 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                  />
                </div>
                {needsApproval && asset.type === "erc20" && (
                  <div className="text-amber-200 text-xs">
                    Approval required
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {!isConnected ? (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => open()}
                      className="btn btn-outline btn-md"
                    >
                      Connect Wallet
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3 text-ink-muted text-xs">
                      <span>Connected</span>
                      <span className="text-ink-strong">
                        {account ? formatAddress(account) : "--"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3 text-ink-muted text-xs">
                      <span>Network</span>
                      <span className="text-ink-strong">
                        {chain.shortLabel}
                      </span>
                      <button
                        type="button"
                        onClick={disconnectWallet}
                        className="text-brand text-xs hover:text-brand-soft"
                      >
                        Disconnect
                      </button>
                    </div>

                    {missingContract && (
                      <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-amber-100 text-xs">
                        Core contract address is not configured for{" "}
                        {chain.shortLabel}. Set
                        <span className="ml-1 font-mono text-amber-200">
                          {contractEnvVar}
                        </span>
                        .
                      </div>
                    )}

                    {asset.type === "erc20" && needsApproval && (
                      <button
                        type="button"
                        onClick={handleApprove}
                        disabled={
                          txStatus === "approving" || Boolean(amountError)
                        }
                        className="btn btn-outline btn-md w-full disabled:opacity-50"
                      >
                        {txStatus === "approving" ? "Approving…" : "Approve"}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleDeposit}
                      disabled={!canDeposit}
                      className="btn btn-primary btn-md w-full disabled:opacity-40"
                    >
                      {txStatus === "depositing"
                        ? "Depositing…"
                        : txStatus === "success"
                          ? "Deposit Complete"
                          : "Deposit & Register"}
                    </button>
                  </div>
                )}
                {amountError && (
                  <div className="text-amber-200 text-xs">{amountError}</div>
                )}
              </div>

              {txHash && (
                <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-4 text-ink-muted text-xs">
                  <div className="flex items-center justify-between">
                    <span>Transaction</span>
                    <a
                      href={`${chain.explorerUrl}/tx/${txHash}`}
                      className="text-brand hover:text-brand-soft"
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on explorer
                    </a>
                  </div>
                </div>
              )}

              {txStatus === "success" && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100 text-sm">
                  Registration complete. Check the docs to see how to use 4Mica
                  and get instant credit.
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
