import i18n from "@i18n";
import type { AccessError } from "@/lib/accessErrors";
import { notifyError } from "@/lib/notify";

export type SignInReason = "sso_required" | "session_too_old";

export const currentPath = (): string =>
  `${window.location.pathname}${window.location.search}`;

export const signInPath = ({
  reason,
  domain,
  redirect = currentPath(),
}: {
  reason?: SignInReason | null;
  domain?: string | null;
  redirect?: string;
} = {}): string => {
  const params = new URLSearchParams();
  if (reason) {
    params.set("reason", reason);
  }
  if (domain) {
    params.set("domain", domain);
  }
  params.set("redirect_url", redirect);
  return `/sign-in?${params.toString()}`;
};

export interface AccessHandlingDeps {
  signOutTo: (path: string) => void;
  openUserProfile: () => void;
  personalOrganizationId: () => string | null;
  activeOrganizationIsPersonal: () => boolean;
  switchOrganization: (id: string) => void;
}

const sticky = { autoClose: false as const };

export const handleAccessError = (
  access: AccessError,
  deps: AccessHandlingDeps,
): void => {
  const t = i18n.t.bind(i18n);
  switch (access.code) {
    case "sso_required":
      deps.signOutTo(
        signInPath({ reason: "sso_required", domain: access.domain }),
      );
      return;
    case "session_too_old":
      deps.signOutTo(signInPath({ reason: "session_too_old" }));
      return;
    case "mfa_required":
      notifyError({
        title: t("access.mfa_required.title"),
        content: t("access.mfa_required.body"),
        action: {
          label: t("access.mfa_required.action"),
          onClick: deps.openUserProfile,
        },
        options: sticky,
      });
      return;
    case "ip_not_allowed":
      notifyError({
        title: t("access.ip_not_allowed.title"),
        content: t("access.ip_not_allowed.body"),
        options: sticky,
      });
      return;
    case "member_suspended": {
      const personalId = deps.personalOrganizationId();
      const canLeave =
        personalId !== null && !deps.activeOrganizationIsPersonal();
      if (canLeave) {
        deps.switchOrganization(personalId);
      }
      notifyError({
        title: t("access.member_suspended.title"),
        content: canLeave
          ? t("access.member_suspended.switched")
          : t("access.member_suspended.body"),
        options: sticky,
      });
      return;
    }
  }
};
