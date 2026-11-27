import { Button, Modal } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  clearOrganizationIssues,
  createOrganization,
  organizationPendingKeys,
} from "@stores/organization/actions";
import {
  selectIsOrganizationPending,
  selectOrganizationIssues,
} from "@stores/organization/selector";
import { NAME_MAX_LENGTH, NAME_MIN_LENGTH } from "@utils/user-rules";
import { type FormEvent, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { FieldRow, TextInput } from "@/components/form";
import { handleProblemKey, suggestHandle } from "./handle";

export function CreateOrganizationModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const formId = useId();
  const isSaving = useAppSelector(
    selectIsOrganizationPending(organizationPendingKeys.create),
  );
  const issues = useAppSelector(selectOrganizationIssues);

  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleEdited, setHandleEdited] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setName("");
    setHandle("");
    setHandleEdited(false);
    setSubmitted(false);
    dispatch(clearOrganizationIssues());
  }, [dispatch, isOpen]);

  const trimmedName = name.trim();
  const candidate = handle.trim().toLowerCase();
  const nameError =
    trimmedName.length < NAME_MIN_LENGTH || trimmedName.length > NAME_MAX_LENGTH
      ? t("organization.create.nameRequired")
      : undefined;
  const problemKey = candidate ? handleProblemKey(candidate) : null;
  const handleError = problemKey
    ? t(problemKey)
    : !candidate && submitted
      ? t("organization.create.handleInvalid")
      : (issues.handle ?? undefined);

  const changeName = (value: string) => {
    setName(value);
    if (!handleEdited) {
      setHandle(suggestHandle(value));
    }
  };

  const changeHandle = (value: string) => {
    setHandle(value.toLowerCase());
    setHandleEdited(true);
    if (issues.handle) {
      dispatch(clearOrganizationIssues());
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (nameError || problemKey || !candidate || isSaving) {
      return;
    }
    dispatch(createOrganization({ name: trimmedName, handle: candidate }));
  };

  return (
    <Modal
      closeLabel={t("modal.close")}
      isOpen={isOpen}
      onClose={onClose}
      title={t("organization.create.title")}
      description={t("organization.create.description")}
      size="md"
      data-testid="create-organization-modal"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            intent="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
          >
            {t("confirm.cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            intent="invert"
            size="sm"
            className="btn-no-lift min-w-24 text-sm"
            loading={isSaving}
            data-testid="create-organization-submit"
          >
            {t("organization.create.submit")}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <FieldRow
          title={t("organization.create.name")}
          htmlFor="create-organization-name"
          required
        >
          <TextInput
            id="create-organization-name"
            value={name}
            maxLength={NAME_MAX_LENGTH}
            autoFocus
            placeholder={t("organization.create.namePlaceholder")}
            error={submitted ? nameError : undefined}
            onChange={changeName}
          />
        </FieldRow>
        <FieldRow
          title={t("organization.create.handle")}
          description={t("organization.create.handleHint")}
          htmlFor="create-organization-handle"
          required
        >
          <TextInput
            id="create-organization-handle"
            value={handle}
            prefix="4mica.io/"
            autoComplete="off"
            spellCheck={false}
            error={handleError}
            onChange={changeHandle}
          />
        </FieldRow>
      </form>
    </Modal>
  );
}
