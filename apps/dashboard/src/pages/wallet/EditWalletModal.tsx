import { Button, Modal, Spinner } from "@4mica/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { clearWalletIssues, updateWallet } from "@stores/wallet/actions";
import {
  selectIsWalletPending,
  selectWalletError,
  selectWalletIssues,
} from "@stores/wallet/selector";
import type { Wallet } from "@stores/wallet/type";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FieldRow, Select, TextArea, TextInput } from "@/components/form";
import { NETWORKS, shortenAddress } from "./constants";
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
    selectIsWalletPending(`wallet:${wallet?.id ?? ""}`),
  );
  const error = useAppSelector(selectWalletError);
  const issues = useAppSelector(selectWalletIssues);

  const {
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<EditWalletValues>({
    resolver: zodResolver(editWalletSchema),
    mode: "onBlur",
    defaultValues: {
      label: "",
      description: "",
      role: "BOTH",
      status: "ACTIVE",
    },
  });

  const values = watch();

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

  const fieldError = (field: keyof EditWalletValues) => {
    if (issues[field]) {
      return issues[field];
    }
    const message = errors[field]?.message;
    return message ? t(message) : undefined;
  };

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

  // A retired wallet is terminal — bringing one back needs a fresh signature,
  // which is a link, not an edit. The server enforces this too.
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
            disabled={isSaving}
            onClick={handleSubmit(onValid)}
            data-testid="edit-wallet-submit"
          >
            <span className="flex w-full items-center justify-center text-sm">
              {isSaving ? <Spinner size="sm" /> : t("wallet.edit.save")}
            </span>
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-1"
        onSubmit={handleSubmit(onValid)}
        noValidate
      >
        {wallet && (
          <div className="mb-3 rounded-lg border border-overlay/10 bg-overlay/5 px-4 py-3">
            <p className="font-mono text-ink-body text-xs">
              {shortenAddress(wallet.address)}
            </p>
            <p className="mt-0.5 text-ink-subtle text-xs">
              {t("wallet.edit.immutable", {
                network: NETWORKS[wallet.network].label,
              })}
            </p>
          </div>
        )}

        <FieldRow
          title={t("wallet.create.fields.label.title")}
          htmlFor="edit-wallet-label"
        >
          <TextInput
            id="edit-wallet-label"
            value={values.label}
            onChange={(value) =>
              setValue("label", value, { shouldValidate: true })
            }
            error={fieldError("label")}
            maxLength={LABEL_MAX_LENGTH}
          />
        </FieldRow>

        <FieldRow
          title={t("wallet.create.fields.description.title")}
          htmlFor="edit-wallet-description"
        >
          <TextArea
            id="edit-wallet-description"
            value={values.description ?? ""}
            onChange={(value) =>
              setValue("description", value, { shouldValidate: true })
            }
            error={fieldError("description")}
            maxLength={DESCRIPTION_MAX_LENGTH}
          />
        </FieldRow>

        <FieldRow
          title={t("wallet.create.fields.role.title")}
          htmlFor="edit-wallet-role"
        >
          <Select
            id="edit-wallet-role"
            value={values.role}
            onChange={(value) =>
              setValue("role", value as EditWalletValues["role"], {
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
          title={t("wallet.edit.status.title")}
          htmlFor="edit-wallet-status"
          description={
            isRetired
              ? t("wallet.edit.status.retiredHint")
              : t("wallet.edit.status.description")
          }
        >
          <Select
            id="edit-wallet-status"
            value={values.status}
            disabled={isRetired}
            onChange={(value) =>
              setValue("status", value as EditWalletValues["status"], {
                shouldValidate: true,
              })
            }
            options={
              isRetired
                ? [{ value: "RETIRED", title: t("wallet.status.retired") }]
                : [
                    { value: "ACTIVE", title: t("wallet.status.active") },
                    { value: "PAUSED", title: t("wallet.status.paused") },
                    { value: "RETIRED", title: t("wallet.status.retired") },
                  ]
            }
            error={fieldError("status")}
          />
        </FieldRow>

        {error && (
          <p className="mt-2 text-danger text-xs" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
