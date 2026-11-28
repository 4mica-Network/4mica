import { Avatar, Button, Tag } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  ORGANIZATION_ROLE,
  type OrganizationRole,
} from "@stores/organization/type";
import type { CustomRole } from "@stores/security/type";
import {
  removeMember,
  revokeMemberSessions,
  selectIsTeamPending,
  suspendMember,
  teamPendingKeys,
  updateMemberRole,
} from "@stores/team";
import type { Member } from "@stores/team/type";
import { LogOut, PauseCircle, PlayCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Select } from "@/components/form";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { Spinner } from "@/components/Spinner";
import {
  assignableRoles,
  CUSTOM_ROLE_PREFIX,
  isManagedIdentity,
  roleValue,
} from "./roles";

type Confirming = "suspend" | "sessions" | null;

export function MemberRow({
  member,
  isSelf,
  viewerRole,
  canManage,
  customRoles = [],
  verifiedDomains = null,
}: {
  member: Member;
  isSelf: boolean;
  viewerRole: OrganizationRole | undefined;
  canManage: boolean;
  customRoles?: CustomRole[];
  verifiedDomains?: string[] | null;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isPending = useAppSelector(
    selectIsTeamPending(teamPendingKeys.member(member.userId)),
  );
  const [confirming, setConfirming] = useState<Confirming>(null);

  const outranksViewer =
    member.role === ORGANIZATION_ROLE.OWNER &&
    viewerRole !== ORGANIZATION_ROLE.OWNER;
  const editable = canManage && !isSelf && !outranksViewer;
  const suspended = Boolean(member.suspendedAt);
  const displayName = member.name || member.email || member.username || "";
  const options = [
    ...assignableRoles(viewerRole).map((role) => ({
      value: role,
      title: t(`organization.role.${role}`),
    })),
    ...(member.role === ORGANIZATION_ROLE.OWNER ? [] : customRoles).map(
      (role) => ({
        value: `${CUSTOM_ROLE_PREFIX}${role.id}`,
        title: t("team.members.customRoleOption", { name: role.name }),
      }),
    ),
  ];
  const showSessions = isManagedIdentity(member.email, verifiedDomains);

  const assign = (value: string) => {
    if (value === roleValue(member)) {
      return;
    }
    dispatch(
      value.startsWith(CUSTOM_ROLE_PREFIX)
        ? updateMemberRole({
            userId: member.userId,
            customRoleId: value.slice(CUSTOM_ROLE_PREFIX.length),
          })
        : updateMemberRole({
            userId: member.userId,
            role: value as OrganizationRole,
          }),
    );
  };

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
        {(suspended || member.source) && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {suspended && (
              <Tag
                size="sm"
                variant="warning"
                data-testid={`member-suspended-${member.userId}`}
              >
                {t("team.members.suspended")}
              </Tag>
            )}
            {member.source && member.source !== "OWNER" && (
              <Tag
                size="sm"
                variant="neutral"
                data-testid={`member-source-${member.userId}`}
              >
                {t(`team.members.source.${member.source}`, {
                  defaultValue: member.source,
                })}
              </Tag>
            )}
          </span>
        )}
      </div>

      {isPending && <Spinner size="sm" className="text-ink-subtle" />}

      {editable ? (
        <div className="w-40 shrink-0">
          <Select
            id={`member-role-${member.userId}`}
            aria-label={t("team.members.role", { name: displayName })}
            value={roleValue(member)}
            options={options}
            disabled={isPending}
            onChange={assign}
          />
        </div>
      ) : (
        <Tag
          size="sm"
          variant="neutral"
          className="shrink-0"
          data-testid={`member-role-${member.userId}`}
        >
          {member.customRole
            ? member.customRole.name
            : t(`organization.role.${member.role}`)}
        </Tag>
      )}

      {editable && (
        <RowActionsMenu
          label={t("team.members.actions", { name: displayName })}
          disabled={isPending}
          data-testid={`member-actions-${member.userId}`}
        >
          {suspended ? (
            <RowActionsMenu.Item
              icon={PlayCircle}
              onSelect={() =>
                dispatch(
                  suspendMember({ userId: member.userId, suspended: false }),
                )
              }
              data-testid={`member-reactivate-${member.userId}`}
            >
              {t("team.members.reactivate")}
            </RowActionsMenu.Item>
          ) : (
            <RowActionsMenu.Item
              icon={PauseCircle}
              tone="danger"
              onSelect={() => setConfirming("suspend")}
              data-testid={`member-suspend-${member.userId}`}
            >
              {t("team.members.suspend")}
            </RowActionsMenu.Item>
          )}
          {showSessions && (
            <RowActionsMenu.Item
              icon={LogOut}
              tone="danger"
              onSelect={() => setConfirming("sessions")}
              data-testid={`member-sessions-${member.userId}`}
            >
              {t("team.members.revokeSessions")}
            </RowActionsMenu.Item>
          )}
        </RowActionsMenu>
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

      <ConfirmDialog
        isOpen={confirming !== null}
        title={
          confirming === "sessions"
            ? t("team.members.revokeSessionsTitle", { name: displayName })
            : t("team.members.suspendTitle", { name: displayName })
        }
        confirmLabel={
          confirming === "sessions"
            ? t("team.members.revokeSessions")
            : t("team.members.suspend")
        }
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          dispatch(
            confirming === "sessions"
              ? revokeMemberSessions({ userId: member.userId })
              : suspendMember({ userId: member.userId, suspended: true }),
          );
          setConfirming(null);
        }}
        data-testid={`member-confirm-${member.userId}`}
      >
        <p>
          {confirming === "sessions"
            ? t("team.members.revokeSessionsBody")
            : t("team.members.suspendBody")}
        </p>
      </ConfirmDialog>
    </div>
  );
}
