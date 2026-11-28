import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { switchOrganization } from "@stores/organization/actions";
import {
  allows,
  selectActiveOrganizationId,
  selectOrganizations,
} from "@stores/organization/selector";
import type { Permission } from "@stores/organization/type";
import { useLocation, useNavigate } from "react-router-dom";
import { workspaceModeFor } from "@/hooks/useWorkspaceMode";
import { settingsPathFor } from "@/nav";

export function useSwitchOrganization(): (id: string) => void {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const organizations = useAppSelector(selectOrganizations);
  const activeId = useAppSelector(selectActiveOrganizationId);

  return (id: string) => {
    const target = organizations.find((item) => item.id === id);
    if (!target || id === activeId) {
      return;
    }
    const destination = pathname.startsWith("/settings")
      ? settingsPathFor(
          pathname,
          workspaceModeFor(target, [], organizations),
          (permission: Permission) => allows(target, permission),
        )
      : "/";
    navigate(destination);
    dispatch(switchOrganization(id));
  };
}
