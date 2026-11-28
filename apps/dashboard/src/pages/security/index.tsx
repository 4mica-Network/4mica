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

type SecuritySection = "policies" | "sso";

function SecurityContent({ section }: { section: SecuritySection }) {
  const dispatch = useAppDispatch();
  const canManage = useAppSelector(selectCan(PERMISSION.SECURITY_MANAGE));
  const canSeeMembers = useAppSelector(selectCan(PERMISSION.MEMBERS_MANAGE));

  useEffect(() => {
    if (section === "policies") {
      dispatch(fetchSecuritySettings());
      return;
    }
    if (canSeeMembers) {
      dispatch(fetchSecurity("domains"));
    }
    if (canManage) {
      dispatch(fetchSecurity("sso"));
    }
  }, [dispatch, section, canManage, canSeeMembers]);

  return (
    <div className="flex flex-col gap-6">
      {!canManage && <ReadOnlyNotice testId="security-read-only" />}
      {section === "sso" && canSeeMembers && (
        <DomainsSection canManage={canManage} />
      )}
      {section === "sso" && canSeeMembers && (
        <SsoSection canManage={canManage} />
      )}
      {section === "policies" && <PoliciesSection canManage={canManage} />}
    </div>
  );
}

function SecurityPage({
  section,
  titleKey,
  descriptionKey,
}: {
  section: SecuritySection;
  titleKey: string;
  descriptionKey: string;
}) {
  const organization = useAppSelector(selectActiveOrganization);
  const canRead = useAppSelector(
    (state) =>
      selectCan(PERMISSION.MEMBERS_MANAGE)(state) ||
      selectCan(PERMISSION.COMPLIANCE_READ)(state),
  );

  return (
    <SettingsPage titleKey={titleKey} descriptionKey={descriptionKey}>
      {!canRead || organization?.personal ? (
        <Unavailable
          personal={Boolean(organization?.personal)}
          testId="security-unavailable"
        />
      ) : (
        <SecurityContent section={section} />
      )}
    </SettingsPage>
  );
}

export function SecuritySettingsPage() {
  return (
    <SecurityPage
      section="policies"
      titleKey="page.settings.security.title"
      descriptionKey="page.settings.security.description"
    />
  );
}

export function DomainsSsoSettings() {
  return (
    <SecurityPage
      section="sso"
      titleKey="page.settings.sso.title"
      descriptionKey="page.settings.sso.description"
    />
  );
}
