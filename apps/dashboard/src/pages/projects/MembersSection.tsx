import { Avatar, EmptyState, Tag } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  fetchProjectMembers,
  projectPendingKeys,
  setProjectMemberRole,
} from "@stores/project/actions";
import {
  selectIsProjectPending,
  selectProjectCan,
  selectProjectMembers,
  selectProjectMembersError,
  selectProjectMembersStatus,
} from "@stores/project/selector";
import {
  PROJECT_PERMISSION,
  PROJECT_ROLES,
  type ProjectMember,
  type ProjectRole,
} from "@stores/project/type";
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Select } from "@/components/form";
import { SettingsSection } from "@/components/layout";
import { PageSpinner } from "@/components/PageSpinner";
import { Spinner } from "@/components/Spinner";

const INHERITED = "INHERITED";

const ORG_ADMIN_ROLES = new Set(["OWNER", "ADMIN"]);

function MemberRow({
  member,
  canManage,
}: {
  member: ProjectMember;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isPending = useAppSelector(
    selectIsProjectPending(projectPendingKeys.member(member.userId)),
  );
  const displayName = member.name || member.email || member.username || "";
  const editable = canManage && !ORG_ADMIN_ROLES.has(member.orgRole);

  return (
    <div
      className="flex items-center gap-3 bg-surface px-4 py-3"
      data-testid={`project-member-${member.userId}`}
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
        </span>
        <span className="truncate text-ink-muted text-xs">
          {t("projects.members.orgRole", {
            role: t(`organization.role.${member.orgRole}`),
          })}
        </span>
      </div>

      {isPending && <Spinner size="sm" className="text-ink-subtle" />}

      {editable ? (
        <div className="w-36 shrink-0">
          <Select
            id={`project-role-${member.userId}`}
            aria-label={t("projects.members.role", { name: displayName })}
            value={member.projectRole ?? INHERITED}
            disabled={isPending}
            options={[
              { value: INHERITED, title: t("projects.members.inherited") },
              ...PROJECT_ROLES.map((role) => ({
                value: role,
                title: t(`project.role.${role}`),
              })),
            ]}
            onChange={(value) => {
              const role = value === INHERITED ? null : (value as ProjectRole);
              if (role !== member.projectRole) {
                dispatch(setProjectMemberRole({ userId: member.userId, role }));
              }
            }}
          />
        </div>
      ) : (
        <Tag size="sm" variant="neutral" className="shrink-0">
          {member.projectRole
            ? t(`project.role.${member.projectRole}`)
            : t("projects.members.inherited")}
        </Tag>
      )}

      <Tag
        size="sm"
        variant={member.effectiveRole ? "default" : "neutral"}
        className="w-24 shrink-0 justify-center"
        data-testid={`project-member-effective-${member.userId}`}
      >
        {member.effectiveRole
          ? t(`project.role.${member.effectiveRole}`)
          : t("projects.members.noAccess")}
      </Tag>
    </div>
  );
}

export function MembersSection() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const members = useAppSelector(selectProjectMembers);
  const status = useAppSelector(selectProjectMembersStatus);
  const error = useAppSelector(selectProjectMembersError);
  const canManage = useAppSelector(
    selectProjectCan(PROJECT_PERMISSION.PROJECT_MEMBERS_MANAGE),
  );

  useEffect(() => {
    dispatch(fetchProjectMembers());
  }, [dispatch]);

  return (
    <SettingsSection
      title={t("projects.members.title")}
      description={t("projects.members.description")}
    >
      {status === "idle" || status === "loading" ? (
        <PageSpinner />
      ) : status === "failed" ? (
        <EmptyState
          icon={<TriangleAlert className="h-5 w-5" />}
          title={t("projects.members.loadFailed")}
          description={error ?? undefined}
          action={{
            label: t("projects.retry"),
            onClick: () => dispatch(fetchProjectMembers()),
          }}
        />
      ) : (
        <div
          className="divide-y divide-overlay/10 overflow-hidden rounded-lg border border-overlay/10"
          data-testid="project-members"
        >
          <div className="flex items-center gap-3 bg-overlay/5 px-4 py-2 text-2xs text-ink-subtle uppercase tracking-wide">
            <span className="flex-1">{t("projects.members.member")}</span>
            <span className="w-36">{t("projects.members.projectRole")}</span>
            <span className="w-24 text-center">
              {t("projects.members.effective")}
            </span>
          </div>
          {members.map((member) => (
            <MemberRow
              key={member.userId}
              member={member}
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
