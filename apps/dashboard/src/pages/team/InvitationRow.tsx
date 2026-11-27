import { Button, Tag } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  resendInvitation,
  revokeInvitation,
  selectIsTeamPending,
  teamPendingKeys,
} from "@stores/team";
import type { PendingInvitation } from "@stores/team/type";
import { formatDate } from "@utils/format";
import { Mail, RotateCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Spinner } from "@/components/Spinner";

export function InvitationRow({
  invitation,
}: {
  invitation: PendingInvitation;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isPending = useAppSelector(
    selectIsTeamPending(teamPendingKeys.invitation(invitation.id)),
  );

  return (
    <div
      className="flex items-center gap-3 bg-surface px-4 py-3"
      data-testid={`invitation-row-${invitation.id}`}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-overlay/10 text-ink-muted">
        <Mail aria-hidden="true" className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-ink-strong text-sm">
          {invitation.email}
        </span>
        <span className="truncate text-ink-muted text-xs">
          {invitation.expired
            ? t("team.invitations.expired")
            : t("team.invitations.expires", {
                date: formatDate(invitation.expiresAt),
              })}
        </span>
      </div>

      {isPending && <Spinner size="sm" className="text-ink-subtle" />}

      <Tag size="sm" variant="neutral" className="shrink-0">
        {t(`organization.role.${invitation.role}`)}
      </Tag>

      <Button
        type="button"
        intent="ghost"
        size="sm"
        className="btn-no-lift"
        icon={<RotateCw aria-hidden="true" className="h-4 w-4" />}
        disabled={isPending}
        onClick={() => dispatch(resendInvitation({ id: invitation.id }))}
        data-testid={`invitation-resend-${invitation.id}`}
      >
        {t("team.invitations.resend")}
      </Button>

      <ConfirmAction
        title={t("team.invitations.revokeTitle", { email: invitation.email })}
        description={t("team.invitations.revokeBody")}
        confirmLabel={t("team.invitations.revoke")}
        onConfirm={() => dispatch(revokeInvitation({ id: invitation.id }))}
      >
        <Button
          type="button"
          intent="ghost"
          size="sm"
          className="btn-no-lift"
          icon={<X aria-hidden="true" className="h-4 w-4" />}
          disabled={isPending}
          data-testid={`invitation-revoke-${invitation.id}`}
        >
          {t("team.invitations.revoke")}
        </Button>
      </ConfirmAction>
    </div>
  );
}
