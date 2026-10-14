import { PAYMENT_NETWORKS, shortenAddress } from "@4mica/rules";
import { Button, Modal, Spinner } from "@4mica/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  clearWalletIssues,
  updateWallet,
  walletPendingKeys,
} from "@stores/wallet/actions";
import {
  selectIsWalletPending,
  selectWalletError,
  selectWalletIssues,
} from "@stores/wallet/selector";
import type { Wallet } from "@stores/wallet/type";
import { useEffect, useId } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  FieldRow,
  Form,
  FormSelect,
  FormTextArea,
  FormTextInput,
} from "@/components/form";
import { useOnSuccess } from "@/hooks/useOnSuccess";
import { useServerIssues } from "@/hooks/useServerIssues";
import {
  DESCRIPTION_MAX_LENGTH,
  type EditWalletValues,
  editWalletSchema,
  LABEL_MAX_LENGTH,
} from "./validation";

export function EditWalletModal({
  wallet,
  onClose,
}: {
  wallet: Wallet | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isSaving = useAppSelector(
    selectIsWalletPending(walletPendingKeys.row(wallet?.id ?? "")),
  );
  const error = useAppSelector(selectWalletError);
  const issues = useAppSelector(selectWalletIssues);

  const form = useForm<EditWalletValues>({
    resolver: zodResolver(editWalletSchema),
    mode: "onTouched",
    defaultValues: {
      label: "",
      description: "",
      role: "BOTH",
      status: "ACTIVE",
    },
  });

  const { handleSubmit, reset, setError } = form;
  const formId = useId();

  useEffect(() => {
    if (wallet) {
      reset({
        label: wallet.label,
        description: wallet.description ?? "",
        role: wallet.role,
        status: wallet.status,
      });
      dispatch(clearWalletIssues());
    }
  }, [wallet, reset, dispatch]);

  useServerIssues(issues, setError);

  useOnSuccess(
    isSaving,
    Boolean(error) || Object.keys(issues).length > 0,
    onClose,
  );

  const onValid = (data: EditWalletValues) => {
    if (!wallet) {
      return;
    }
    dispatch(
      updateWallet({
        id: wallet.id,
        data: {
          label: data.label.trim(),
          description: data.description?.trim()
            ? data.description.trim()
            : null,
          role: data.role,
          status: data.status,
        },
      }),
    );
  };

  const isRetired = wallet?.status === "RETIRED";

  return (
    <Modal
      isOpen={Boolean(wallet)}
      onClose={onClose}
      title={t("wallet.edit.title")}
      description={t("wallet.edit.description")}
      size="lg"
      data-testid="edit-wallet"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            intent="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
          >
            {t("wallet.edit.cancel")}
          </Button>
          <Button
            intent="invert"
            size="sm"
            className="btn-no-lift min-w-24"
            type="submit"
            form={formId}
            disabled={isSaving}
            aria-busy={isSaving}
            data-testid="edit-wallet-submit"
          >
            <span className="flex w-full items-center justify-center text-sm">
              {isSaving ? <Spinner size="sm" /> : t("wallet.edit.save")}
            </span>
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        id={formId}
        className="flex flex-col gap-1"
        onSubmit={handleSubmit(onValid)}
      >
        {wallet && (
          <div className="mb-3 rounded-lg border border-overlay/10 bg-overlay/5 px-4 py-3">
            <p className="font-mono text-ink-body text-xs">
              {shortenAddress(wallet.address)}
            </p>
            <p className="mt-0.5 text-ink-subtle text-xs">
              {t("wallet.edit.immutable", {
                network: PAYMENT_NETWORKS[wallet.network].label,
              })}
            </p>
          </div>
        )}

        <FieldRow
          title={t("wallet.create.fields.label.title")}
          htmlFor="edit-wallet-label"
          required
        >
          <FormTextInput name="label" maxLength={LABEL_MAX_LENGTH} />
        </FieldRow>

        <FieldRow
          title={t("wallet.create.fields.description.title")}
          htmlFor="edit-wallet-description"
        >
          <FormTextArea name="description" maxLength={DESCRIPTION_MAX_LENGTH} />
        </FieldRow>

        <FieldRow
          title={t("wallet.create.fields.role.title")}
          htmlFor="edit-wallet-role"
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
          title={t("wallet.edit.status.title")}
          htmlFor="edit-wallet-status"
          description={
            isRetired
              ? t("wallet.edit.status.retiredHint")
              : t("wallet.edit.status.description")
          }
        >
          <FormSelect
            name="status"
            disabled={isRetired}
            options={
              isRetired
                ? [{ value: "RETIRED", title: t("wallet.status.retired") }]
                : [
                    { value: "ACTIVE", title: t("wallet.status.active") },
                    { value: "PAUSED", title: t("wallet.status.paused") },
                    { value: "RETIRED", title: t("wallet.status.retired") },
                  ]
            }
          />
        </FieldRow>

        {error && (
          <p className="mt-2 text-danger text-xs" role="alert">
            {error}
          </p>
        )}
      </Form>
    </Modal>
  );
}
