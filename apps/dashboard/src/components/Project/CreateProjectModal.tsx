import { isValidSlug, SLUG_MAX_LENGTH, slugify } from "@4mica/rules";
import { Button, Modal } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  clearProjectIssues,
  createProject,
  projectPendingKeys,
} from "@stores/project/actions";
import {
  selectIsProjectPending,
  selectProjectIssues,
} from "@stores/project/selector";
import { type FormEvent, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Disclosure } from "@/components/Disclosure";
import { FieldRow, SwitchCard, TextArea, TextInput } from "@/components/form";

export const PROJECT_NAME_MAX_LENGTH = 120;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 280;

export function CreateProjectModal({
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
    selectIsProjectPending(projectPendingKeys.create),
  );
  const issues = useAppSelector(selectProjectIssues);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [restricted, setRestricted] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setName("");
    setSlug("");
    setSlugEdited(false);
    setDescription("");
    setRestricted(false);
    setSubmitted(false);
    dispatch(clearProjectIssues());
  }, [dispatch, isOpen]);

  const trimmedName = name.trim();
  const candidate = slug.trim().toLowerCase();
  const nameError = trimmedName ? undefined : t("project.create.nameRequired");
  const slugError =
    candidate && !isValidSlug(candidate)
      ? t("project.create.slugInvalid")
      : (issues.slug ?? undefined);

  const changeName = (value: string) => {
    setName(value);
    if (!slugEdited) {
      setSlug(slugify(value));
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (nameError || slugError || isSaving) {
      return;
    }
    dispatch(
      createProject({
        name: trimmedName,
        ...(candidate ? { slug: candidate } : {}),
        description: description.trim() || null,
        restricted,
      }),
    );
  };

  return (
    <Modal
      closeLabel={t("modal.close")}
      isOpen={isOpen}
      onClose={onClose}
      title={t("project.create.title")}
      description={t("project.create.description")}
      size="md"
      data-testid="create-project-modal"
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
            data-testid="create-project-submit"
          >
            {t("project.create.submit")}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <FieldRow
          title={t("project.create.name")}
          htmlFor="create-project-name"
          required
        >
          <TextInput
            id="create-project-name"
            value={name}
            maxLength={PROJECT_NAME_MAX_LENGTH}
            autoFocus
            placeholder={t("project.create.namePlaceholder")}
            error={submitted ? (nameError ?? issues.name) : issues.name}
            onChange={changeName}
          />
        </FieldRow>
        <Disclosure
          label={t("project.create.moreOptions")}
          forceOpen={Boolean(slugError || issues.description)}
          data-testid="create-project-more"
        >
          <FieldRow
            title={t("project.create.slug")}
            description={t("project.create.slugHint")}
            htmlFor="create-project-slug"
          >
            <TextInput
              id="create-project-slug"
              value={slug}
              maxLength={SLUG_MAX_LENGTH}
              autoComplete="off"
              spellCheck={false}
              error={slugError}
              onChange={(value) => {
                setSlug(value.toLowerCase());
                setSlugEdited(true);
                if (issues.slug) {
                  dispatch(clearProjectIssues());
                }
              }}
            />
          </FieldRow>
          <FieldRow
            title={t("project.create.descriptionLabel")}
            htmlFor="create-project-description"
          >
            <TextArea
              id="create-project-description"
              value={description}
              rows={2}
              maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
              error={issues.description}
              onChange={setDescription}
            />
          </FieldRow>
          <div className="pt-3">
            <SwitchCard
              id="create-project-restricted"
              title={t("project.create.restricted")}
              description={t("project.create.restrictedHint")}
              checked={restricted}
              onToggle={setRestricted}
            />
          </div>
        </Disclosure>
      </form>
    </Modal>
  );
}
