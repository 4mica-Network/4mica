import { Button, Modal } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  ORGANIZATION_ROLE,
  type OrganizationRole,
} from "@stores/organization/type";
import {
  clearTeamIssues,
  inviteMembers,
  selectIsTeamPending,
  selectTeamError,
  teamPendingKeys,
} from "@stores/team";
import { isEmail } from "@utils/validation";
import { type FormEvent, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { FieldRow, Select, TextArea } from "@/components/form";
import { useOnSuccess } from "@/hooks/useOnSuccess";
import { assignableRoles, MAX_INVITES, parseEmails } from "./roles";

export function InviteMembersModal({
  isOpen,
  organizationName,
  viewerRole,
  onClose,
}: {
  isOpen: boolean;
  organizationName: string;
  viewerRole: OrganizationRole | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const formId = useId();
  const isSaving = useAppSelector(selectIsTeamPending(teamPendingKeys.invite));
  const failed = Boolean(useAppSelector(selectTeamError));

  const [raw, setRaw] = useState("");
  const [role, setRole] = useState<OrganizationRole>(ORGANIZATION_ROLE.MEMBER);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setRaw("");
    setRole(ORGANIZATION_ROLE.MEMBER);
    setSubmitted(false);
    dispatch(clearTeamIssues());
  }, [dispatch, isOpen]);

  useOnSuccess(isSaving, failed, onClose);

  const emails = parseEmails(raw);
  const invalid = emails.filter((email) => !isEmail(email));
  const emailsError =
    emails.length === 0
      ? t("team.invite.required")
      : invalid.length > 0
        ? t("team.invite.invalid", { emails: invalid.join(", ") })
        : emails.length > MAX_INVITES
          ? t("team.invite.tooMany", { max: MAX_INVITES })
          : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (emailsError || isSaving) {
      return;
    }
    dispatch(inviteMembers({ emails, role }));
  };

  return (
    <Modal
      closeLabel={t("modal.close")}
      isOpen={isOpen}
      onClose={onClose}
      title={t("team.invite.title")}
      description={t("team.invite.description", { name: organizationName })}
      size="md"
      data-testid="invite-members-modal"
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
            data-testid="invite-members-submit"
          >
            {t("team.invite.submit")}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <FieldRow
          title={t("team.invite.emails")}
          description={t("team.invite.emailsHint", { max: MAX_INVITES })}
          htmlFor="invite-emails"
          required
        >
          <TextArea
            id="invite-emails"
            value={raw}
            rows={4}
            spellCheck={false}
            autoFocus
            placeholder={t("team.invite.emailsPlaceholder")}
            error={submitted ? emailsError : undefined}
            onChange={setRaw}
          />
        </FieldRow>
        <FieldRow title={t("team.invite.role")} htmlFor="invite-role">
          <Select
            id="invite-role"
            value={role}
            options={assignableRoles(viewerRole).map((option) => ({
              value: option,
              title: t(`organization.role.${option}`),
            }))}
            onChange={(value) => setRole(value as OrganizationRole)}
          />
        </FieldRow>
      </form>
    </Modal>
  );
}
