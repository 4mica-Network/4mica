import { useAppSelector } from "@stores/hooks";
import { selectProjectCan } from "@stores/project/selector";
import {
  PROJECT_PERMISSION,
  type ProjectPermission,
} from "@stores/project/type";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RoleRestricted } from "@/components/Organization/RoleRestricted";

export function ProjectRestricted({
  permission = PROJECT_PERMISSION.RESOURCES_WRITE,
  children,
}: {
  permission?: ProjectPermission;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const allowed = useAppSelector(selectProjectCan(permission));
  return (
    <RoleRestricted allowed={allowed} message={t("project.restricted")}>
      {children}
    </RoleRestricted>
  );
}
