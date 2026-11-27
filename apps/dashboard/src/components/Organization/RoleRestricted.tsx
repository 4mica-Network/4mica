import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function RoleRestrictedNotice({ message }: { message?: string }) {
  const { t } = useTranslation();
  return (
    <p
      className="flex items-center gap-2 rounded-lg border border-overlay/10 bg-overlay/5 px-3 py-2 text-ink-muted text-sm"
      data-testid="role-restricted"
    >
      <Lock aria-hidden="true" className="h-4 w-4 shrink-0" />
      {message ?? t("organization.restricted")}
    </p>
  );
}

export function RoleRestricted({
  allowed,
  message,
  children,
}: {
  allowed: boolean;
  message?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (allowed) {
    return <>{children}</>;
  }
  return (
    <>
      <RoleRestrictedNotice message={message} />
      <fieldset
        disabled
        title={message ?? t("organization.restricted")}
        className="m-0 flex min-w-0 flex-col gap-8 border-0 p-0"
      >
        {children}
      </fieldset>
    </>
  );
}
