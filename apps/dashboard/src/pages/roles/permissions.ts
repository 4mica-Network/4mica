import type { Permission } from "@stores/organization/type";

export interface PermissionGroup {
  area: string;
  permissions: Permission[];
}

export const permissionArea = (permission: Permission): string =>
  permission.split(".")[0] ?? permission;

export const groupPermissions = (
  assignable: Permission[],
): PermissionGroup[] => {
  const groups = new Map<string, Permission[]>();
  for (const permission of assignable) {
    const area = permissionArea(permission);
    groups.set(area, [...(groups.get(area) ?? []), permission]);
  }
  return [...groups].map(([area, permissions]) => ({ area, permissions }));
};

export const togglePermission = (
  selected: Permission[],
  permission: Permission,
  on: boolean,
  assignable: Permission[],
): Permission[] =>
  assignable.filter((item) =>
    item === permission ? on : selected.includes(item),
  );

export const onlyAssignable = (
  selected: Permission[],
  assignable: Permission[],
): Permission[] => selected.filter((item) => assignable.includes(item));
