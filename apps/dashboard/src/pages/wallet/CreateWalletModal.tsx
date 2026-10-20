import {
  networkForChainId,
  PAYMENT_NETWORKS,
  shortenAddress,
} from "@4mica/rules";
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
import { blankToNull } from "@utils/format";
import {
  ArrowUpRight,
  Check,
  KeyRound,
  ShieldCheck,
  Wallet as WalletIcon,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  FieldRow,
  Form,
  FormSelect,
  FormTextArea,
  FormTextInput,
} from "@/components/form";
import { StepIndicator } from "@/components/Onboarding/StepIndicator";
import { useOnSuccess } from "@/hooks/useOnSuccess";
import { useServerIssues } from "@/hooks/useServerIssues";
import { firstStepWith, useStepWithIssue } from "@/hooks/useStepWithIssue";
import { links } from "@/lib/links";
import { chainDefinition, NETWORK_OPTIONS } from "@/lib/networks";
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
  CREATE_STEP_FIELDS,
  type CreateWalletValues,
  createWalletSchema,
  DESCRIPTION_MAX_LENGTH,
  LABEL_MAX_LENGTH,
} from "./validation";

const PENDING_KEY = "createWallet";
const TOTAL_STEPS = CREATE_STEP_FIELDS.length;
const ISSUE_STEPS: Record<string, number> = { signature: 0, nonce: 0 };

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
  useStepWithIssue(issues, CREATE_STEP_FIELDS, setStep, ISSUE_STEPS);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);

  const form = useForm<CreateWalletValues>({
    resolver: zodResolver(createWalletSchema),
    mode: "onTouched",
    defaultValues: {
      label: "",
      description: "",
      network: "BASE_SEPOLIA",
      role: "BOTH",
      address: "",
    },
  });

  const { handleSubmit, setValue, trigger, reset, setError, control } = form;
  const [address, network, label] = useWatch({
    control,
    name: ["address", "network", "label"],
  });
  const formId = useId();

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

  useServerIssues(issues, setError);

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
      setWalletChainId(PAYMENT_NETWORKS[network].chainId);
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
    if (step === 0 && !label && address) {
      setValue("label", suggestedLabel(address), {
        shouldValidate: true,
      });
    }
    setStep((current) => current + 1);
  };

  const onValid = (data: CreateWalletValues) => {
    dispatch(
      createWallet({
        label: data.label.trim(),
        description: blankToNull(data.description),
        address: data.address,
        network: data.network,
        role: data.role,
      }),
    );
  };

  const onInvalid = (invalid: Record<string, unknown>) => {
    const firstBadStep = firstStepWith(
      CREATE_STEP_FIELDS,
      Object.keys(invalid),
    );
    if (firstBadStep >= 0 && firstBadStep !== step) {
      setStep(firstBadStep);
    }
  };

  useOnSuccess(
    isSaving,
    Boolean(error) || Object.keys(issues).length > 0,
    onClose,
  );

  const detectedNetwork = networkForChainId(walletChainId);
  const isOnChosenChain = walletChainId === PAYMENT_NETWORKS[network].chainId;

  const alreadyLinked = existing.some(
    (item) =>
      item.address.toLowerCase() === address.toLowerCase() &&
      item.network === network,
  );

  const isLastStep = step === TOTAL_STEPS - 1;
  const canContinue = Boolean(address) && !alreadyLinked;
  const canSubmit = canContinue && Boolean(label?.trim()) && !isSaving;

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
                type="submit"
                form={formId}
                disabled={!canSubmit}
                aria-busy={isSaving}
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
                type="submit"
                form={formId}
                disabled={!canContinue}
                data-testid="create-wallet-continue"
              >
                {t("wallet.create.continue")}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <Form
        form={form}
        id={formId}
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isLastStep) {
            if (canContinue) {
              void continueToNext();
            }
            return;
          }
          if (canSubmit) {
            void handleSubmit(onValid, onInvalid)(event);
          }
        }}
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

            {address ? (
              <div className="flex flex-col gap-3 rounded-lg border border-overlay/10 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-success" />
                    <span
                      className="truncate font-mono text-ink-body text-sm"
                      data-testid="create-wallet-address"
                    >
                      {address}
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
                        PAYMENT_NETWORKS[detectedNetwork].isTestnet
                          ? "warning"
                          : "success"
                      }
                    >
                      {PAYMENT_NETWORKS[detectedNetwork].label}
                    </Tag>
                  ) : (
                    <Tag size="sm" variant="error">
                      {t("wallet.create.connect.unsupportedChain")}
                    </Tag>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <p
                    id={`${formId}-network-prompt`}
                    className="text-ink-muted text-xs"
                  >
                    {detectedNetwork
                      ? t("wallet.create.connect.networkPrompt")
                      : t("wallet.create.connect.switchPrompt")}
                  </p>
                  <fieldset
                    aria-labelledby={`${formId}-network-prompt`}
                    className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0"
                  >
                    {NETWORK_OPTIONS.map((option) => {
                      const value = option.value as PaymentNetwork;
                      const isCurrent = network === value;

                      return (
                        <Button
                          key={value}
                          type="button"
                          intent={isCurrent ? "soft" : "outline"}
                          size="sm"
                          className="btn-no-lift"
                          disabled={isSwitching}
                          aria-pressed={isCurrent}
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
                  </fieldset>
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

            {(issues.address || issues.network || issues.signature) && (
              <p className="text-danger text-xs" role="alert">
                {issues.address ?? issues.network ?? issues.signature}
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
                {shortenAddress(address)}
              </span>
              <span className="text-ink-subtle text-xs">·</span>
              <span className="text-ink-subtle text-xs">
                {PAYMENT_NETWORKS[network].label}
              </span>
            </div>

            <FieldRow
              title={t("wallet.create.fields.label.title")}
              htmlFor="wallet-label"
              description={t("wallet.create.fields.label.description")}
              required
            >
              <FormTextInput
                name="label"
                placeholder={t("wallet.create.fields.label.placeholder")}
                maxLength={LABEL_MAX_LENGTH}
                autoFocus
              />
            </FieldRow>

            <FieldRow
              title={t("wallet.create.fields.role.title")}
              htmlFor="wallet-role"
              description={t("wallet.create.fields.role.description")}
            >
              <FormSelect
                name="role"
                options={[
                  { value: "BOTH", title: t("wallet.role.both") },
                  { value: "PAYER", title: t("wallet.role.payer") },
                  { value: "RECIPIENT", title: t("wallet.role.recipient") },
                ]}
              />
            </FieldRow>

            <FieldRow
              title={t("wallet.create.fields.description.title")}
              htmlFor="wallet-description"
              description={t("wallet.create.fields.description.description")}
            >
              <FormTextArea
                name="description"
                placeholder={t("wallet.create.fields.description.placeholder")}
                maxLength={DESCRIPTION_MAX_LENGTH}
              />
            </FieldRow>

            {!isOnChosenChain && detectedNetwork && (
              <p className="mt-2 text-ink-subtle text-xs">
                {t("wallet.create.fields.network.mismatch", {
                  wallet: PAYMENT_NETWORKS[detectedNetwork].label,
                  chosen: PAYMENT_NETWORKS[network].label,
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
      </Form>
    </Modal>
  );
}
