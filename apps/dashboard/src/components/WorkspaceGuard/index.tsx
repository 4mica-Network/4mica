import { useAppSelector } from "@stores/hooks";
import {
  allows,
  selectActiveOrganization,
} from "@stores/organization/selector";
import type { Permission } from "@stores/organization/type";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useWorkspaceMode } from "@/hooks/useWorkspaceMode";
import { firstSettingsPath, isPathVisible } from "@/nav";

export function WorkspaceGuard({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const mode = useWorkspaceMode();
  const organization = useAppSelector(selectActiveOrganization);
  if (!isPathVisible(path, mode)) {
    const fallback = path.startsWith("/settings/")
      ? firstSettingsPath(mode, (permission: Permission) =>
          allows(organization, permission),
        )
      : "/";
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}

export function SettingsIndex() {
  const mode = useWorkspaceMode();
  const organization = useAppSelector(selectActiveOrganization);
  return (
    <Navigate
      to={firstSettingsPath(mode, (permission: Permission) =>
        allows(organization, permission),
      )}
      replace
    />
  );
}
