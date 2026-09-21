import { Button, Modal, Spinner } from "@4mica/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { clearAgentIssues, updateAgent } from "@stores/agent/actions";
import {
  selectAgentError,
  selectAgentIssues,
  selectIsAgentPending,
} from "@stores/agent/selector";
import type { Agent } from "@stores/agent/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { fetchActiveWallets } from "@stores/wallet/actions";
import {
  selectPayerWallets,
  selectSellerWallets,
} from "@stores/wallet/selector";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { AgentFormFields } from "./AgentFormFields";
import { type AgentValues, agentSchema, blankToNull } from "./validation";

export function EditAgentModal({
  agent,
  onClose,
}: {
  agent: Agent | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const pendingKey = agent ? `agent:${agent.id}` : "";
  const isSaving = useAppSelector(selectIsAgentPending(pendingKey));
  const error = useAppSelector(selectAgentError);
  const issues = useAppSelector(selectAgentIssues);
  const sellerWallets = useAppSelector(selectSellerWallets);
  const payerWallets = useAppSelector(selectPayerWallets);

  const {
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<AgentValues>({
    resolver: zodResolver(agentSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      slug: "",
      headline: "",
      description: "",
      network: "BASE_SEPOLIA",
      status: "PENDING",
      visibility: "PRIVATE",
      payerWalletId: "",
      creditLimit: "",
      walletId: "",
      assetAddress: "",
      priceAmount: "",
      priceCurrency: "",
      priceLabel: "",
      endpointUrl: "",
      x402Endpoint: "",
      docsUrl: "",
      avatarUrl: "",
    },
  });

  const values = watch();

  useEffect(() => {
    if (!agent) {
      return;
    }
    dispatch(clearAgentIssues());
    dispatch(fetchActiveWallets());
    reset({
      name: agent.name,
      slug: agent.slug ?? "",
      headline: agent.headline ?? "",
      description: agent.description ?? "",
      network: agent.network,
      status: agent.status === "SUSPENDED" ? "PENDING" : agent.status,
      visibility: agent.visibility,
      payerWalletId: agent.payerWalletId ?? "",
      creditLimit: agent.creditLimit,
      walletId: agent.walletId ?? "",
      assetAddress: agent.assetAddress ?? "",
      priceAmount: agent.priceAmount ?? "",
      priceCurrency: agent.priceCurrency ?? "",
      priceLabel: agent.priceLabel ?? "",
      endpointUrl: agent.endpointUrl ?? "",
      x402Endpoint: agent.x402Endpoint ?? "",
      docsUrl: agent.docsUrl ?? "",
      avatarUrl: agent.avatarUrl ?? "",
    });
  }, [agent, reset, dispatch]);

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

  const fieldError = (field: keyof AgentValues) => {
    if (issues[field]) {
      return issues[field];
    }
    const message = errors[field]?.message;
    return message ? t(message) : undefined;
  };

  const networkLocked = Boolean(agent?.walletId || agent?.payerWalletId);

  const eligibleSellers = sellerWallets.filter(
    (wallet) => wallet.network === values.network,
  );
  const eligiblePayers = payerWallets.filter(
    (wallet) => wallet.network === values.network,
  );

  const onValid = (data: AgentValues) => {
    if (!agent) {
      return;
    }
    dispatch(
      updateAgent({
        id: agent.id,
        data: {
          name: data.name.trim(),
          slug: data.slug || undefined,
          headline: blankToNull(data.headline),
          description: blankToNull(data.description),
          avatarUrl: blankToNull(data.avatarUrl),
          docsUrl: blankToNull(data.docsUrl),
          ...(agent.status === "SUSPENDED" ? {} : { status: data.status }),
          visibility: data.visibility,
          ...(networkLocked ? {} : { network: data.network }),

          payerWalletId: blankToNull(data.payerWalletId),
          creditLimit: data.creditLimit?.trim() || "0",

          walletId: blankToNull(data.walletId),
          assetAddress: blankToNull(data.assetAddress),
          priceAmount: blankToNull(data.priceAmount),
          priceCurrency: blankToNull(data.priceCurrency),
          priceLabel: blankToNull(data.priceLabel),
          endpointUrl: blankToNull(data.endpointUrl),
          x402Endpoint: blankToNull(data.x402Endpoint),
        },
      }),
    );
  };

  return (
    <Modal
      isOpen={Boolean(agent)}
      onClose={onClose}
      title={t("agent.edit.title")}
      description={t("agent.edit.description")}
      size="lg"
      data-testid="edit-agent"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            intent="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
          >
            {t("agent.edit.cancel")}
          </Button>
          <Button
            intent="invert"
            size="sm"
            className="btn-no-lift min-w-24"
            disabled={isSaving}
            onClick={handleSubmit(onValid)}
            data-testid="edit-agent-submit"
          >
            <span className="flex w-full items-center justify-center text-sm">
              {isSaving ? <Spinner size="sm" /> : t("agent.edit.save")}
            </span>
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <AgentFormFields
          t={t}
          values={values}
          setValue={setValue}
          fieldError={fieldError}
          wallets={eligibleSellers}
          payerWallets={eligiblePayers}
          idPrefix="edit-agent"
          networkLocked={networkLocked}
        />

        {error && <p className="text-danger text-sm">{error}</p>}
      </div>
    </Modal>
  );
}
