import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  selectActiveOrganization,
  selectCan,
} from "@stores/organization/selector";
import { PERMISSION } from "@stores/organization/type";
import { fetchSecurity, fetchSecuritySettings } from "@stores/security";
import { useEffect } from "react";
import { ReadOnlyNotice, Unavailable } from "@/components/SecurityNotice";
import { SettingsPage } from "@/components/SettingsPage";
import { DomainsSection } from "./DomainsSection";
import { PoliciesSection } from "./PoliciesSection";
import { SsoSection } from "./SsoSection";

function SecurityContent() {
  const dispatch = useAppDispatch();
  const canManage = useAppSelector(selectCan(PERMISSION.SECURITY_MANAGE));
  const canSeeMembers = useAppSelector(selectCan(PERMISSION.MEMBERS_MANAGE));

  useEffect(() => {
    dispatch(fetchSecuritySettings());
    if (canSeeMembers) {
      dispatch(fetchSecurity("domains"));
    }
    if (canManage) {
      dispatch(fetchSecurity("sso"));
    }
  }, [dispatch, canManage, canSeeMembers]);

  return (
    <div className="flex flex-col gap-6">
      {!canManage && <ReadOnlyNotice testId="security-read-only" />}
      {canSeeMembers && <DomainsSection canManage={canManage} />}
      {canSeeMembers && <SsoSection canManage={canManage} />}
      <PoliciesSection canManage={canManage} />
    </div>
  );
}

export function SecuritySettingsPage() {
  const organization = useAppSelector(selectActiveOrganization);
  const canRead = useAppSelector(
    (state) =>
      selectCan(PERMISSION.MEMBERS_MANAGE)(state) ||
      selectCan(PERMISSION.COMPLIANCE_READ)(state),
  );

  return (
    <SettingsPage
      titleKey="page.settings.security.title"
      descriptionKey="page.settings.security.description"
    >
      {!canRead || organization?.personal ? (
        <Unavailable
          personal={Boolean(organization?.personal)}
          testId="security-unavailable"
        />
      ) : (
        <SecurityContent />
      )}
    </SettingsPage>
  );
}
