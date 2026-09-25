import { Button, Modal, Spinner, Tag } from "@4mica/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { clearWalletIssues, createWallet } from "@stores/wallet/actions";
import {
  selectIsWalletPending,
  selectWalletError,
  selectWalletIssues,
  selectWallets,
} from "@stores/wallet/selector";
import type { PaymentNetwork } from "@stores/wallet/type";
import {
  ArrowUpRight,
  Check,
  KeyRound,
  ShieldCheck,
  Wallet as WalletIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FieldRow, Select, TextArea, TextInput } from "@/components/form";
import { StepIndicator } from "@/components/Onboarding/StepIndicator";
import { links } from "@/lib/links";
import {
  connectWallet,
  currentAccount,
  currentChainId,
  hasInjectedWallet,
  NoWalletError,
  requestAccountSwitch,
  switchChain,
  WalletRejectedError,
  watchWallet,
} from "@/lib/wallet-signer";
import {
  chainDefinition,
  NETWORK_OPTIONS,
  NETWORKS,
  networkForChainId,
  shortenAddress,
} from "./constants";
import {
  CREATE_STEP_FIELDS,
  type CreateWalletValues,
  createWalletSchema,
  DESCRIPTION_MAX_LENGTH,
  LABEL_MAX_LENGTH,
} from "./validation";

const PENDING_KEY = "createWallet";
const TOTAL_STEPS = CREATE_STEP_FIELDS.length;

const suggestedLabel = (address: string) => `Wallet ${shortenAddress(address)}`;

export function CreateWalletModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isSaving = useAppSelector(selectIsWalletPending(PENDING_KEY));
  const error = useAppSelector(selectWalletError);
  const issues = useAppSelector(selectWalletIssues);
  const existing = useAppSelector(selectWallets);

  const [step, setStep] = useState(0);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);

  const {
    handleSubmit,
    setValue,
    watch,
    trigger,
    reset,
    formState: { errors },
  } = useForm<CreateWalletValues>({
    resolver: zodResolver(createWalletSchema),
    mode: "onBlur",
    defaultValues: {
      label: "",
      description: "",
      network: "BASE_SEPOLIA",
      role: "BOTH",
      address: "",
    },
  });

  const values = watch();

  const adopt = useCallback(
    (address: string, chainId: number | null) => {
      setValue("address", address, { shouldValidate: true, shouldDirty: true });
      setWalletChainId(chainId);

      const detected = networkForChainId(chainId);
      if (detected) {
        setValue("network", detected, { shouldValidate: true });
      }
    },
    [setValue],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    reset();
    setStep(0);
    setConnectError(null);
    setWalletChainId(null);
    dispatch(clearWalletIssues());

    void (async () => {
      const [account, chainId] = await Promise.all([
        currentAccount(),
        currentChainId(),
      ]);
      if (account) {
        adopt(account, chainId);
      } else {
        setWalletChainId(chainId);
      }
    })();
  }, [isOpen, reset, dispatch, adopt]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    return watchWallet({
      onAccountsChanged: (accounts) => {
        const [next] = accounts ?? [];
        if (next) {
          void currentChainId().then((chainId) => adopt(next, chainId));
        } else {
          setValue("address", "", { shouldValidate: false });
          setWalletChainId(null);
        }
      },
      onChainChanged: (chainIdHex) => {
        const parsed = Number.parseInt(chainIdHex, 16);
        const chainId = Number.isNaN(parsed) ? null : parsed;
        setWalletChainId(chainId);
        const detected = networkForChainId(chainId);
        if (detected) {
          setValue("network", detected, { shouldValidate: true });
        }
      },
    });
  }, [isOpen, adopt, setValue]);

  const handleConnect = async () => {
    setConnectError(null);
    setIsConnecting(true);
    try {
      const address = await connectWallet();
      adopt(address, await currentChainId());
    } catch (cause) {
      if (cause instanceof NoWalletError) {
        setConnectError(t("wallet.create.verify.noWallet"));
      } else if (cause instanceof WalletRejectedError) {
        setConnectError(t("wallet.create.verify.rejected"));
      } else {
        setConnectError(t("wallet.create.verify.connectFailed"));
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSwitchAccount = async () => {
    setConnectError(null);
    setIsConnecting(true);
    try {
      const address = await requestAccountSwitch();
      adopt(address, await currentChainId());
    } catch (cause) {
      if (cause instanceof WalletRejectedError) {
        setConnectError(t("wallet.create.verify.rejected"));
      } else {
        setConnectError(t("wallet.create.verify.connectFailed"));
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSwitchChain = async (network: PaymentNetwork) => {
    setConnectError(null);
    setIsSwitching(true);
    try {
      await switchChain(chainDefinition(network));
      setWalletChainId(NETWORKS[network].chainId);
      setValue("network", network, { shouldValidate: true });
    } catch (cause) {
      setConnectError(
        cause instanceof WalletRejectedError
          ? t("wallet.create.verify.switchRejected")
          : t("wallet.create.verify.switchFailed"),
      );
    } finally {
      setIsSwitching(false);
    }
  };

  const continueToNext = async () => {
    const valid = await trigger([...CREATE_STEP_FIELDS[step]]);
    if (!valid) {
      return;
    }
    if (step === 0 && !values.label && values.address) {
      setValue("label", suggestedLabel(values.address), {
        shouldValidate: true,
      });
    }
    setStep((current) => current + 1);
  };

  const onValid = (data: CreateWalletValues) => {
    dispatch(
      createWallet({
        label: data.label.trim(),
        description: data.description?.trim() ? data.description.trim() : null,
        address: data.address,
        network: data.network,
        role: data.role,
      }),
    );
  };

  const onInvalid = (invalid: Record<string, unknown>) => {
    const firstBadStep = CREATE_STEP_FIELDS.findIndex((fields) =>
      fields.some((field) => field in invalid),
    );
    if (firstBadStep >= 0 && firstBadStep !== step) {
      setStep(firstBadStep);
    }
  };

  const sawSaving = useRef(false);
  useEffect(() => {
    if (isSaving) {
      sawSaving.current = true;
      return;
    }
    if (!sawSaving.current) {
      return;
    }
    sawSaving.current = false;
    if (!error && Object.keys(issues).length === 0) {
      onClose();
    }
  }, [isSaving, error, issues, onClose]);

  const fieldError = (field: keyof CreateWalletValues) => {
    if (issues[field]) {
      return issues[field];
    }
    const message = errors[field]?.message;
    return message ? t(message) : undefined;
  };

  const detectedNetwork = networkForChainId(walletChainId);
  const isOnChosenChain = walletChainId === NETWORKS[values.network].chainId;

  const alreadyLinked = existing.some(
    (item) =>
      item.address.toLowerCase() === values.address.toLowerCase() &&
      item.network === values.network,
  );

  const isLastStep = step === TOTAL_STEPS - 1;
  const canContinue = Boolean(values.address) && !alreadyLinked;
  const canSubmit = canContinue && Boolean(values.label?.trim()) && !isSaving;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("wallet.create.title")}
      description={t("wallet.create.description")}
      size="lg"
      disableOverlayClose
      data-testid="create-wallet"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <a
            href={links.docsWallet}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1 rounded-md text-ink-subtle text-xs transition-colors hover:text-ink-body"
          >
            {t("wallet.create.learnMore")}
            <ArrowUpRight className="h-3 w-3" />
          </a>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                intent="ghost"
                size="sm"
                disabled={isSaving}
                onClick={() => setStep((current) => current - 1)}
              >
                {t("wallet.create.back")}
              </Button>
            )}

            {isLastStep ? (
              <Button
                intent="invert"
                size="sm"
                className="btn-no-lift min-w-32"
                disabled={!canSubmit}
                onClick={handleSubmit(onValid, onInvalid)}
                data-testid="create-wallet-submit"
              >
                <span className="flex w-full items-center justify-center text-sm">
                  {isSaving ? <Spinner size="sm" /> : t("wallet.create.finish")}
                </span>
              </Button>
            ) : (
              <Button
                intent="invert"
                size="sm"
                className="btn-no-lift min-w-24"
                disabled={!canContinue}
                onClick={continueToNext}
                data-testid="create-wallet-continue"
              >
                {t("wallet.create.continue")}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={handleSubmit(onValid, onInvalid)}
        noValidate
      >
        <StepIndicator current={step} total={TOTAL_STEPS} />

        {step === 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-lg border border-overlay/10 bg-overlay/5 px-4 py-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <div className="min-w-0">
                <p className="font-medium text-ink-strong text-sm">
                  {t("wallet.create.connect.title")}
                </p>
                <p className="mt-0.5 text-ink-muted text-xs">
                  {t("wallet.create.connect.description")}
                </p>
              </div>
            </div>

            {values.address ? (
              <div className="flex flex-col gap-3 rounded-lg border border-overlay/10 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-success" />
                    <span
                      className="truncate font-mono text-ink-body text-sm"
                      data-testid="create-wallet-address"
                    >
                      {values.address}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSwitchAccount}
                    disabled={isConnecting}
                    className="shrink-0 rounded-md text-ink-subtle text-xs transition-colors hover:text-ink-body disabled:opacity-50"
                    data-testid="create-wallet-switch-account"
                  >
                    {t("wallet.create.verify.change")}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink-subtle text-xs">
                    {t("wallet.create.connect.networkLabel")}
                  </span>
                  {detectedNetwork ? (
                    <Tag
                      size="sm"
                      variant={
                        NETWORKS[detectedNetwork].isTestnet
                          ? "warning"
                          : "success"
                      }
                    >
                      {NETWORKS[detectedNetwork].label}
                    </Tag>
                  ) : (
                    <Tag size="sm" variant="error">
                      {t("wallet.create.connect.unsupportedChain")}
                    </Tag>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-ink-muted text-xs">
                    {detectedNetwork
                      ? t("wallet.create.connect.networkPrompt")
                      : t("wallet.create.connect.switchPrompt")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {NETWORK_OPTIONS.map((option) => {
                      const value = option.value as PaymentNetwork;
                      const isCurrent = values.network === value;

                      return (
                        <Button
                          key={value}
                          type="button"
                          intent={isCurrent ? "soft" : "outline"}
                          size="sm"
                          className="btn-no-lift"
                          disabled={isSwitching}
                          onClick={() => handleSwitchChain(value)}
                          data-testid={`create-wallet-network-${value}`}
                        >
                          <span className="flex items-center gap-1.5 text-xs">
                            {isSwitching && isCurrent && <Spinner size="sm" />}
                            {option.title}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {alreadyLinked && (
                  <p className="text-ink-muted text-xs" role="alert">
                    {t("wallet.create.connect.alreadyLinked")}
                  </p>
                )}
              </div>
            ) : hasInjectedWallet() ? (
              <Button
                type="button"
                intent="outline"
                size="md"
                block
                onClick={handleConnect}
                disabled={isConnecting}
                data-testid="create-wallet-connect"
              >
                <span className="flex items-center justify-center gap-2 text-sm">
                  {isConnecting ? (
                    <Spinner size="sm" />
                  ) : (
                    <WalletIcon className="h-4 w-4" />
                  )}
                  {t("wallet.create.verify.connect")}
                </span>
              </Button>
            ) : (
              <div className="flex flex-col gap-2 rounded-lg border border-overlay/10 border-dashed px-4 py-4 text-center">
                <p className="text-ink-body text-sm">
                  {t("wallet.create.verify.noWallet")}
                </p>
                <div className="flex justify-center gap-4">
                  <a
                    href="https://metamask.io/download"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1 text-brand text-xs hover:underline"
                  >
                    MetaMask
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                  <a
                    href="https://rabby.io"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1 text-brand text-xs hover:underline"
                  >
                    Rabby
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}

            {connectError && (
              <p className="text-danger text-xs" role="alert">
                {connectError}
              </p>
            )}

            <div className="flex items-start gap-2 text-ink-subtle text-xs">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                {t("wallet.create.connect.safety")}{" "}
                <a
                  href={links.docsNoCustody}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-brand hover:underline"
                >
                  {t("wallet.create.connect.safetyLink")}
                </a>
              </p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-1">
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-overlay/10 bg-overlay/5 px-4 py-2.5">
              <span className="font-mono text-ink-body text-xs">
                {shortenAddress(values.address)}
              </span>
              <span className="text-ink-subtle text-xs">·</span>
              <span className="text-ink-subtle text-xs">
                {NETWORKS[values.network].label}
              </span>
            </div>

            <FieldRow
              title={t("wallet.create.fields.label.title")}
              htmlFor="wallet-label"
              description={t("wallet.create.fields.label.description")}
            >
              <TextInput
                id="wallet-label"
                value={values.label}
                onChange={(value) =>
                  setValue("label", value, { shouldValidate: true })
                }
                placeholder={t("wallet.create.fields.label.placeholder")}
                error={fieldError("label")}
                maxLength={LABEL_MAX_LENGTH}
                autoFocus
              />
            </FieldRow>

            <FieldRow
              title={t("wallet.create.fields.role.title")}
              htmlFor="wallet-role"
              description={t("wallet.create.fields.role.description")}
            >
              <Select
                id="wallet-role"
                value={values.role}
                onChange={(value) =>
                  setValue("role", value as CreateWalletValues["role"], {
                    shouldValidate: true,
                  })
                }
                options={[
                  { value: "BOTH", title: t("wallet.role.both") },
                  { value: "PAYER", title: t("wallet.role.payer") },
                  { value: "RECIPIENT", title: t("wallet.role.recipient") },
                ]}
                error={fieldError("role")}
              />
            </FieldRow>

            <FieldRow
              title={t("wallet.create.fields.description.title")}
              htmlFor="wallet-description"
              description={t("wallet.create.fields.description.description")}
            >
              <TextArea
                id="wallet-description"
                value={values.description ?? ""}
                onChange={(value) =>
                  setValue("description", value, { shouldValidate: true })
                }
                placeholder={t("wallet.create.fields.description.placeholder")}
                error={fieldError("description")}
                maxLength={DESCRIPTION_MAX_LENGTH}
              />
            </FieldRow>

            {!isOnChosenChain && detectedNetwork && (
              <p className="mt-2 text-ink-subtle text-xs">
                {t("wallet.create.fields.network.mismatch", {
                  wallet: NETWORKS[detectedNetwork].label,
                  chosen: NETWORKS[values.network].label,
                })}
              </p>
            )}

            <p className="mt-3 text-ink-subtle text-xs">
              {t("wallet.create.verify.signHint")}
            </p>
          </div>
        )}

        {error && (
          <p className="text-danger text-xs" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
