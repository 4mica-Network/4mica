import { Button, Card, EmptyState, Spinner, Switch, Tag } from "@4mica/ui";
import {
  compliancePendingKeys,
  createOwner,
  deleteOwner,
  updateOwner,
} from "@stores/compliance/actions";
import {
  selectBeneficialOwners,
  selectComplianceError,
  selectComplianceIssues,
  selectIsComplianceLocked,
  selectIsCompliancePending,
  selectOwnershipAssigned,
} from "@stores/compliance/selector";
import {
  type BeneficialOwner,
  type BeneficialOwnerInput,
  OWNER_ROLE,
  type OwnerRole,
} from "@stores/compliance/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { formatDate } from "@utils/format";
import { Pencil, Trash2, Users } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { FieldRow, Select, SettingRow, TextInput } from "@/components/form";
import { SettingsSection } from "@/components/layout";
import { useOnSuccess } from "@/hooks/useOnSuccess";
import { type FieldError, type OwnerDraft, ownerErrors } from "./validation";

const BLANK: OwnerDraft = {
  fullName: "",
  role: OWNER_ROLE.OWNER,
  ownershipPercent: "",
  dateOfBirth: "",
  nationality: "",
  countryOfResidence: "",
  email: "",
  isPep: false,
};

const toDraft = (owner: BeneficialOwner): OwnerDraft => ({
  fullName: owner.fullName,
  role: owner.role,
  ownershipPercent:
    owner.ownershipPercent === null ? "" : String(owner.ownershipPercent),
  dateOfBirth: owner.dateOfBirth,
  nationality: owner.nationality,
  countryOfResidence: owner.countryOfResidence,
  email: owner.email ?? "",
  isPep: owner.isPep,
});

const toInput = (draft: OwnerDraft): BeneficialOwnerInput => ({
  fullName: draft.fullName.trim(),
  role: draft.role as OwnerRole,
  ownershipPercent:
    draft.ownershipPercent.trim() === ""
      ? null
      : Number(draft.ownershipPercent),
  dateOfBirth: draft.dateOfBirth,
  nationality: draft.nationality.trim().toUpperCase(),
  countryOfResidence: draft.countryOfResidence.trim().toUpperCase(),
  email: draft.email.trim() === "" ? null : draft.email.trim(),
  isPep: draft.isPep,
});

function OwnerForm({
  id,
  initial,
  isSaving,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  id: string;
  initial: OwnerDraft;
  isSaving: boolean;
  submitLabel: string;
  onSubmit: (input: BeneficialOwnerInput) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const issues = useAppSelector(selectComplianceIssues);
  const [draft, setDraft] = useState(initial);
  const errors = ownerErrors(draft);

  const roles = useMemo(
    () =>
      Object.values(OWNER_ROLE).map((role) => ({
        title: t(`compliance.role.${role}`),
        value: role,
      })),
    [t],
  );

  const set = <K extends keyof OwnerDraft>(key: K, value: OwnerDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const message = (key: keyof OwnerDraft) => {
    const error: FieldError | undefined = errors[key];
    return error ? t(error.key, error.values) : issues[key];
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (Object.keys(errors).length > 0 || isSaving) {
      return;
    }
    onSubmit(toInput(draft));
  };

  return (
    <form onSubmit={handleSubmit}>
      <FieldRow
        title={t("compliance.people.fullName")}
        description={t("compliance.people.fullNameHint")}
        htmlFor={`${id}-name`}
      >
        <TextInput
          id={`${id}-name`}
          autoComplete="off"
          value={draft.fullName}
          error={draft.fullName === "" ? undefined : message("fullName")}
          maxLength={120}
          onChange={(v) => set("fullName", v)}
        />
      </FieldRow>

      <FieldRow
        title={t("compliance.people.role")}
        description={t("compliance.people.roleHint")}
        htmlFor={`${id}-role`}
      >
        <Select
          id={`${id}-role`}
          value={draft.role}
          options={roles}
          onChange={(v) => set("role", v)}
        />
      </FieldRow>

      <FieldRow
        title={t("compliance.people.ownership")}
        description={t("compliance.people.ownershipHint")}
        htmlFor={`${id}-ownership`}
      >
        <TextInput
          id={`${id}-ownership`}
          inputMode="numeric"
          value={draft.ownershipPercent}
          error={message("ownershipPercent")}
          maxLength={3}
          placeholder="25"
          onChange={(v) => set("ownershipPercent", v.replace(/\D/g, ""))}
        />
      </FieldRow>

      <FieldRow
        title={t("compliance.people.dateOfBirth")}
        description={t("compliance.people.dateOfBirthHint")}
        htmlFor={`${id}-dob`}
      >
        <TextInput
          id={`${id}-dob`}
          type="date"
          value={draft.dateOfBirth}
          error={draft.dateOfBirth === "" ? undefined : message("dateOfBirth")}
          onChange={(v) => set("dateOfBirth", v)}
        />
      </FieldRow>

      <FieldRow
        title={t("compliance.people.nationality")}
        description={t("compliance.people.nationalityHint")}
        htmlFor={`${id}-nationality`}
      >
        <TextInput
          id={`${id}-nationality`}
          value={draft.nationality}
          error={draft.nationality === "" ? undefined : message("nationality")}
          maxLength={2}
          placeholder="GB"
          format="uppercase"
          onChange={(v) => set("nationality", v.slice(0, 2))}
        />
      </FieldRow>

      <FieldRow
        title={t("compliance.people.residence")}
        description={t("compliance.people.residenceHint")}
        htmlFor={`${id}-residence`}
      >
        <TextInput
          id={`${id}-residence`}
          value={draft.countryOfResidence}
          error={
            draft.countryOfResidence === ""
              ? undefined
              : message("countryOfResidence")
          }
          maxLength={2}
          placeholder="GB"
          format="uppercase"
          onChange={(v) => set("countryOfResidence", v.slice(0, 2))}
        />
      </FieldRow>

      <FieldRow
        title={t("compliance.people.email")}
        description={t("compliance.people.emailHint")}
        htmlFor={`${id}-email`}
      >
        <TextInput
          id={`${id}-email`}
          type="email"
          inputMode="email"
          autoComplete="off"
          value={draft.email}
          error={message("email")}
          maxLength={255}
          onChange={(v) => set("email", v)}
        />
      </FieldRow>

      <SettingRow
        title={t("compliance.people.isPep")}
        description={t("compliance.people.isPepHint")}
        htmlFor={`${id}-pep`}
      >
        <Switch
          id={`${id}-pep`}
          initialState={draft.isPep}
          onToggle={(next) => set("isPep", next)}
        />
      </SettingRow>

      <div className="-mx-6 mt-5 flex items-center justify-end gap-2 border-overlay/10 border-t px-6 pt-4">
        <Button
          type="button"
          intent="ghost"
          size="sm"
          disabled={isSaving}
          onClick={onCancel}
        >
          {t("compliance.people.cancel")}
        </Button>
        <Button
          type="submit"
          size="sm"
          intent="invert"
          className="btn-no-lift min-w-20 text-sm"
          loading={isSaving}
          disabled={Object.keys(errors).length > 0}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function OwnerRow({
  owner,
  locked,
}: {
  owner: BeneficialOwner;
  locked: boolean;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const error = useAppSelector(selectComplianceError);
  const isPending = useAppSelector(
    selectIsCompliancePending(compliancePendingKeys.owner(owner.id)),
  );
  const [editing, setEditing] = useState(false);

  useOnSuccess(isPending, error !== null, () => setEditing(false));

  if (editing) {
    return (
      <Card>
        <OwnerForm
          id={`owner-${owner.id}`}
          initial={toDraft(owner)}
          isSaving={isPending}
          submitLabel={t("compliance.people.save")}
          onSubmit={(data) => dispatch(updateOwner({ id: owner.id, data }))}
          onCancel={() => setEditing(false)}
        />
      </Card>
    );
  }

  return (
    <Card className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium text-ink-strong text-sm">
            {owner.fullName}
          </p>
          <Tag size="sm" variant="neutral">
            {t(`compliance.role.${owner.role}`)}
          </Tag>
          {owner.ownershipPercent !== null && (
            <Tag size="sm" variant="default">
              {t("compliance.people.share", {
                percent: owner.ownershipPercent,
              })}
            </Tag>
          )}
          {owner.isPep && (
            <Tag size="sm" variant="warning">
              {t("compliance.people.pep")}
            </Tag>
          )}
        </div>
        <p className="mt-1 text-ink-muted text-xs">
          {[
            owner.nationality,
            owner.countryOfResidence,
            t("compliance.people.born", {
              date: formatDate(owner.dateOfBirth),
            }),
          ].join(" · ")}
        </p>
      </div>

      {!locked && (
        <div className="flex shrink-0 items-center gap-1">
          {isPending && <Spinner size="sm" className="text-ink-subtle" />}
          <Button
            type="button"
            size="sm"
            intent="ghost"
            aria-label={t("compliance.people.editLabel", {
              name: owner.fullName,
            })}
            disabled={isPending}
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
          </Button>
          <ConfirmAction
            title={t("compliance.people.deleteConfirm", {
              name: owner.fullName,
            })}
            onConfirm={() => dispatch(deleteOwner({ id: owner.id }))}
          >
            <Button
              type="button"
              size="sm"
              intent="ghost"
              aria-label={t("compliance.people.delete", {
                name: owner.fullName,
              })}
              disabled={isPending}
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </Button>
          </ConfirmAction>
        </div>
      )}
    </Card>
  );
}

export function OwnersCard() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const owners = useAppSelector(selectBeneficialOwners);
  const assigned = useAppSelector(selectOwnershipAssigned);
  const locked = useAppSelector(selectIsComplianceLocked);
  const error = useAppSelector(selectComplianceError);
  const isCreating = useAppSelector(
    selectIsCompliancePending(compliancePendingKeys.createOwner),
  );
  const [adding, setAdding] = useState(false);

  useOnSuccess(isCreating, error !== null, () => setAdding(false));

  return (
    <SettingsSection
      id="compliance-people"
      title={t("compliance.people.title")}
      description={t("compliance.people.description")}
      action={
        !locked && !adding ? (
          <Button
            type="button"
            size="sm"
            intent="soft"
            onClick={() => setAdding(true)}
          >
            {t("compliance.people.add")}
          </Button>
        ) : undefined
      }
    >
      {adding && (
        <Card>
          <OwnerForm
            id="owner-new"
            initial={BLANK}
            isSaving={isCreating}
            submitLabel={t("compliance.people.add")}
            onSubmit={(input) => dispatch(createOwner(input))}
            onCancel={() => setAdding(false)}
          />
        </Card>
      )}

      {owners.length === 0 && !adding ? (
        <EmptyState
          icon={<Users size={20} />}
          title={t("compliance.people.emptyTitle")}
          description={t("compliance.people.emptyDescription")}
          data-testid="compliance-people"
        />
      ) : (
        <>
          {owners.map((owner) => (
            <OwnerRow key={owner.id} owner={owner} locked={locked} />
          ))}
          {owners.length > 0 && (
            <p className="text-ink-muted text-xs">
              {t("compliance.people.assigned", { percent: assigned })}
            </p>
          )}
        </>
      )}
    </SettingsSection>
  );
}
