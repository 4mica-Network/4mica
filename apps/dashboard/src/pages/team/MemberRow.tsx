import { Avatar, Button, Tag } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  ORGANIZATION_ROLE,
  type OrganizationRole,
} from "@stores/organization/type";
import {
  removeMember,
  selectIsTeamPending,
  teamPendingKeys,
  updateMemberRole,
} from "@stores/team";
import type { Member } from "@stores/team/type";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Select } from "@/components/form";
import { Spinner } from "@/components/Spinner";
import { assignableRoles } from "./roles";

export function MemberRow({
  member,
  isSelf,
  viewerRole,
  canManage,
}: {
  member: Member;
  isSelf: boolean;
  viewerRole: OrganizationRole | undefined;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isPending = useAppSelector(
    selectIsTeamPending(teamPendingKeys.member(member.userId)),
  );

  const outranksViewer =
    member.role === ORGANIZATION_ROLE.OWNER &&
    viewerRole !== ORGANIZATION_ROLE.OWNER;
  const editable = canManage && !isSelf && !outranksViewer;
  const displayName = member.name || member.email || member.username || "";
  const options = assignableRoles(viewerRole).map((role) => ({
    value: role,
    title: t(`organization.role.${role}`),
  }));

  return (
    <div
      className="flex items-center gap-3 bg-surface px-4 py-3"
      data-testid={`member-row-${member.userId}`}
    >
      <Avatar
        src={member.avatarUrl}
        name={displayName}
        alt=""
        size="xs"
        className="shrink-0 border-0 bg-overlay/15 text-ink-strong"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-ink-strong text-sm">
          {displayName}
          {isSelf && (
            <span className="ml-1.5 font-normal text-ink-subtle">
              {t("team.members.you")}
            </span>
          )}
        </span>
        {member.email && (
          <span className="truncate text-ink-muted text-xs">
            {member.email}
          </span>
        )}
      </div>

      {isPending && <Spinner size="sm" className="text-ink-subtle" />}

      {editable ? (
        <div className="w-32 shrink-0">
          <Select
            id={`member-role-${member.userId}`}
            aria-label={t("team.members.role", { name: displayName })}
            value={member.role}
            options={options}
            disabled={isPending}
            onChange={(role) =>
              role !== member.role &&
              dispatch(
                updateMemberRole({
                  userId: member.userId,
                  role: role as OrganizationRole,
                }),
              )
            }
          />
        </div>
      ) : (
        <Tag
          size="sm"
          variant="neutral"
          className="shrink-0"
          data-testid={`member-role-${member.userId}`}
        >
          {t(`organization.role.${member.role}`)}
        </Tag>
      )}

      {editable && (
        <ConfirmAction
          title={t("team.members.removeTitle", { name: displayName })}
          description={t("team.members.removeBody")}
          confirmLabel={t("team.members.remove")}
          onConfirm={() => dispatch(removeMember({ userId: member.userId }))}
          data-testid={`member-remove-confirm-${member.userId}`}
        >
          <Button
            type="button"
            intent="ghost"
            size="sm"
            className="btn-no-lift px-2"
            aria-label={t("team.members.removeLabel", { name: displayName })}
            disabled={isPending}
            data-testid={`member-remove-${member.userId}`}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </Button>
        </ConfirmAction>
      )}
    </div>
  );
}
