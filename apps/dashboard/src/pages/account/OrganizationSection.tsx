import { Button, Card, Modal } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  deleteOrganization,
  leaveOrganization,
  organizationPendingKeys,
  transferOrganization,
  updateOrganization,
} from "@stores/organization/actions";
import {
  allows,
  selectActiveOrganization,
  selectIsOrganizationPending,
  selectOrganizationIssues,
} from "@stores/organization/selector";
import {
  type OrganizationSummary,
  PERMISSION,
} from "@stores/organization/type";
import { fetchMembers, selectMembers } from "@stores/team";
import { selectUser } from "@stores/user/selector";
import { NAME_MAX_LENGTH, NAME_MIN_LENGTH } from "@utils/user-rules";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { EditableCard } from "@/components/EditableCard";
import { FieldRow, Select, TextInput } from "@/components/form";
import { SettingsSection } from "@/components/layout";
import { handleProblemKey } from "@/components/Organization/handle";
import { useDraft } from "@/hooks/useDraft";

function ActionRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <span className="font-medium text-ink-strong text-sm">{title}</span>
        <p className="mt-0.5 text-ink-muted text-xs">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </Card>
  );
}

function DetailsCard({ organization }: { organization: OrganizationSummary }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const canUpdate = allows(organization, PERMISSION.ORG_UPDATE);
  const isSaving = useAppSelector(
    selectIsOrganizationPending(organizationPendingKeys.update),
  );
  const issues = useAppSelector(selectOrganizationIssues);
  const initial = useMemo(
    () => ({ name: organization.name, handle: organization.handle ?? "" }),
    [organization.name, organization.handle],
  );
  const { draft, set, changes, isDirty, reset } = useDraft(initial);

  const name = draft.name.trim();
  const handle = draft.handle.trim().toLowerCase();
  const nameError =
    name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH
      ? t("organization.create.nameRequired")
      : undefined;
  const handleKey =
    !organization.personal && "handle" in changes
      ? handleProblemKey(handle)
      : null;
  const handleError = handleKey ? t(handleKey) : issues.handle;

  const save = () => {
    const patch: { name?: string; handle?: string } = {};
    if ("name" in changes) {
      patch.name = name;
    }
    if ("handle" in changes && !organization.personal) {
      patch.handle = handle;
    }
    dispatch(updateOrganization(patch));
  };

  return (
    <EditableCard
      isDirty={canUpdate && isDirty}
      isSaving={isSaving}
      isInvalid={Boolean(nameError || handleKey)}
      onSave={save}
      onReset={reset}
    >
      <FieldRow
        title={t("settings.organization.name")}
        htmlFor="organization-name"
        required
      >
        <TextInput
          id="organization-name"
          value={draft.name}
          maxLength={NAME_MAX_LENGTH}
          disabled={!canUpdate}
          error={nameError}
          onChange={(value) => set("name", value)}
        />
      </FieldRow>
      <FieldRow
        title={t("settings.organization.handle")}
        description={
          organization.personal
            ? t("settings.organization.handlePersonal")
            : undefined
        }
        htmlFor="organization-handle"
      >
        <TextInput
          id="organization-handle"
          value={draft.handle}
          prefix="4mica.io/"
          disabled={!canUpdate || organization.personal}
          spellCheck={false}
          autoComplete="off"
          error={handleError}
          onChange={(value) => set("handle", value.toLowerCase())}
        />
      </FieldRow>
    </EditableCard>
  );
}

function TransferRow({ organization }: { organization: OrganizationSummary }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const members = useAppSelector(selectMembers);
  const isPending = useAppSelector(
    selectIsOrganizationPending(organizationPendingKeys.transfer),
  );
  const [target, setTarget] = useState("");

  useEffect(() => {
    dispatch(fetchMembers());
  }, [dispatch]);

  const candidates = members.filter((member) => member.userId !== user?.id);
  const chosen = candidates.find((member) => member.userId === target);

  return (
    <ActionRow
      title={t("settings.organization.transfer.title")}
      description={
        candidates.length > 0
          ? t("settings.organization.transfer.description")
          : t("settings.organization.transfer.noMembers")
      }
    >
      <div className="w-44">
        <Select
          id="organization-transfer-member"
          aria-label={t("settings.organization.transfer.member")}
          value={target}
          disabled={candidates.length === 0}
          options={candidates.map((member) => ({
            value: member.userId,
            title: member.name || member.email || member.userId,
          }))}
          onChange={setTarget}
        />
      </div>
      <ConfirmAction
        title={t("settings.organization.transfer.confirm", {
          name: chosen?.name ?? "",
          organization: organization.name,
        })}
        description={t("settings.organization.transfer.description")}
        confirmLabel={t("settings.organization.transfer.action")}
        onConfirm={() =>
          chosen && dispatch(transferOrganization(chosen.userId))
        }
      >
        <Button
          type="button"
          intent="outline"
          size="sm"
          className="btn-no-lift"
          loading={isPending}
          disabled={!chosen}
          data-testid="organization-transfer"
        >
          {t("settings.organization.transfer.action")}
        </Button>
      </ConfirmAction>
    </ActionRow>
  );
}

function DeleteRow({ organization }: { organization: OrganizationSummary }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isPending = useAppSelector(
    selectIsOrganizationPending(organizationPendingKeys.remove),
  );
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const expected = organization.handle ?? organization.name;

  useEffect(() => {
    if (open) {
      setTyped("");
    }
  }, [open]);

  return (
    <ActionRow
      title={t("settings.organization.delete.title")}
      description={t("settings.organization.delete.description", {
        name: organization.name,
      })}
    >
      <Button
        type="button"
        intent="danger"
        size="sm"
        className="btn-no-lift"
        onClick={() => setOpen(true)}
        data-testid="organization-delete"
      >
        {t("settings.organization.delete.action")}
      </Button>
      <Modal
        closeLabel={t("modal.close")}
        isOpen={open}
        onClose={() => setOpen(false)}
        title={t("settings.organization.delete.confirmTitle", {
          name: organization.name,
        })}
        size="sm"
        data-testid="organization-delete-modal"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              intent="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              {t("confirm.cancel")}
            </Button>
            <Button
              intent="danger"
              size="sm"
              className="btn-no-lift min-w-24 text-sm"
              loading={isPending}
              disabled={typed.trim() !== expected}
              onClick={() => dispatch(deleteOrganization())}
              data-testid="organization-delete-confirm"
            >
              {t("settings.organization.delete.confirm")}
            </Button>
          </div>
        }
      >
        <FieldRow
          title={t("settings.organization.delete.confirmBody", {
            handle: expected,
          })}
          htmlFor="organization-delete-handle"
        >
          <TextInput
            id="organization-delete-handle"
            value={typed}
            autoComplete="off"
            spellCheck={false}
            onChange={setTyped}
          />
        </FieldRow>
      </Modal>
    </ActionRow>
  );
}

export function OrganizationSection() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const organization = useAppSelector(selectActiveOrganization);
  const isLeaving = useAppSelector(
    selectIsOrganizationPending(organizationPendingKeys.leave),
  );

  if (!organization) {
    return null;
  }

  return (
    <SettingsSection
      id="organization"
      title={t("settings.organization.title")}
      description={t("settings.organization.description", {
        name: organization.name,
        role: t(`organization.role.${organization.role}`),
      })}
    >
      <DetailsCard organization={organization} />

      {!organization.personal &&
        allows(organization, PERMISSION.ORG_TRANSFER) && (
          <TransferRow organization={organization} />
        )}

      {!organization.personal && (
        <ActionRow
          title={t("settings.organization.leave.title")}
          description={t("settings.organization.leave.description", {
            name: organization.name,
          })}
        >
          <ConfirmAction
            title={t("settings.organization.leave.confirm", {
              name: organization.name,
            })}
            confirmLabel={t("settings.organization.leave.action")}
            onConfirm={() => dispatch(leaveOrganization())}
          >
            <Button
              type="button"
              intent="outline"
              size="sm"
              className="btn-no-lift"
              loading={isLeaving}
              data-testid="organization-leave"
            >
              {t("settings.organization.leave.action")}
            </Button>
          </ConfirmAction>
        </ActionRow>
      )}

      {!organization.personal &&
        allows(organization, PERMISSION.ORG_DELETE) && (
          <DeleteRow organization={organization} />
        )}
    </SettingsSection>
  );
}
