import { Button, EmptyState } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  selectActiveOrganization,
  selectCan,
} from "@stores/organization/selector";
import { PERMISSION } from "@stores/organization/type";
import { fetchSecurity, selectSecurityCollection } from "@stores/security";
import {
  fetchInvitations,
  fetchMembers,
  selectInvitations,
  selectMembers,
  selectMembersError,
  selectMembersStatus,
} from "@stores/team";
import { selectUser } from "@stores/user/selector";
import { TriangleAlert, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsSection } from "@/components/layout";
import { CreateOrganizationModal } from "@/components/Organization/CreateOrganizationModal";
import { RoleRestrictedNotice } from "@/components/Organization/RoleRestricted";
import { PageSpinner } from "@/components/PageSpinner";
import { SettingsPage } from "@/components/SettingsPage";
import { InvitationRow } from "./InvitationRow";
import { InviteMembersModal } from "./InviteMembersModal";
import { MemberRow } from "./MemberRow";

function PersonalWorkspace() {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <EmptyState
        icon={<Users className="h-5 w-5" />}
        title={t("team.personal.title")}
        description={t("team.personal.description")}
        action={{
          label: t("organization.switcher.create"),
          onClick: () => setCreating(true),
        }}
        data-testid="team-personal"
      />
      <CreateOrganizationModal
        isOpen={creating}
        onClose={() => setCreating(false)}
      />
    </>
  );
}

function Members() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const organization = useAppSelector(selectActiveOrganization);
  const user = useAppSelector(selectUser);
  const canManage = useAppSelector(selectCan(PERMISSION.MEMBERS_MANAGE));
  const members = useAppSelector(selectMembers);
  const status = useAppSelector(selectMembersStatus);
  const error = useAppSelector(selectMembersError);
  const invitations = useAppSelector(selectInvitations);
  const roles = useAppSelector(selectSecurityCollection("roles"));
  const domains = useAppSelector(selectSecurityCollection("domains"));
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    dispatch(fetchMembers());
    if (canManage) {
      dispatch(fetchInvitations());
      dispatch(fetchSecurity("roles"));
      dispatch(fetchSecurity("domains"));
    }
  }, [dispatch, canManage]);

  const verifiedDomains = useMemo(
    () =>
      domains.status === "loaded"
        ? domains.items
            .filter((domain) => domain.verified)
            .map((domain) => domain.domain)
        : null,
    [domains],
  );

  return (
    <>
      {!canManage && <RoleRestrictedNotice />}

      <SettingsSection
        title={t("team.members.title")}
        description={t("team.members.description", {
          name: organization?.name ?? "",
        })}
        action={
          canManage && (
            <Button
              type="button"
              intent="invert"
              size="sm"
              className="btn-no-lift"
              icon={<UserPlus aria-hidden="true" className="h-4 w-4" />}
              onClick={() => setInviting(true)}
              data-testid="team-invite"
            >
              {t("team.members.invite")}
            </Button>
          )
        }
      >
        {status === "loading" || status === "idle" ? (
          <PageSpinner />
        ) : status === "failed" ? (
          <EmptyState
            icon={<TriangleAlert className="h-5 w-5" />}
            title={t("team.members.loadFailed")}
            description={error ?? undefined}
            action={{
              label: t("team.retry"),
              onClick: () => dispatch(fetchMembers()),
            }}
            data-testid="team-members-error"
          />
        ) : (
          <div
            className="divide-y divide-overlay/10 overflow-hidden rounded-lg border border-overlay/10"
            data-testid="team-members"
          >
            {members.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                isSelf={member.userId === user?.id}
                viewerRole={organization?.role}
                canManage={canManage}
                customRoles={roles.items}
                verifiedDomains={verifiedDomains}
              />
            ))}
          </div>
        )}
      </SettingsSection>

      {canManage && (
        <SettingsSection
          title={t("team.invitations.title")}
          description={t("team.invitations.description")}
        >
          {invitations.length === 0 ? (
            <EmptyState
              variant="dashed"
              size="sm"
              title={t("team.invitations.empty")}
              data-testid="team-invitations-empty"
            />
          ) : (
            <div
              className="divide-y divide-overlay/10 overflow-hidden rounded-lg border border-overlay/10"
              data-testid="team-invitations"
            >
              {invitations.map((invitation) => (
                <InvitationRow key={invitation.id} invitation={invitation} />
              ))}
            </div>
          )}
        </SettingsSection>
      )}

      <InviteMembersModal
        isOpen={inviting}
        organizationName={organization?.name ?? ""}
        viewerRole={organization?.role}
        onClose={() => setInviting(false)}
      />
    </>
  );
}

export function TeamSettings() {
  const organization = useAppSelector(selectActiveOrganization);

  return (
    <SettingsPage
      titleKey="page.settings.team.title"
      descriptionKey="page.settings.team.description"
    >
      {organization?.personal ? <PersonalWorkspace /> : <Members />}
    </SettingsPage>
  );
}
