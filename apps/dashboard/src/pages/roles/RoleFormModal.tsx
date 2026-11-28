import { Button, Checkbox, Modal } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import type { Permission } from "@stores/organization/type";
import { PROJECT_ROLES, type ProjectRole } from "@stores/project/type";
import {
  clearSecurityFailure,
  runSecurityOp,
  securityPendingKeys,
  selectIsSecurityPending,
  selectSecurityFailure,
} from "@stores/security";
import type { CustomRole } from "@stores/security/type";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FieldRow, Select, TextArea, TextInput } from "@/components/form";
import { useOnSuccess } from "@/hooks/useOnSuccess";
import {
  groupPermissions,
  onlyAssignable,
  togglePermission,
} from "./permissions";

export function PermissionChecklist({
  assignable,
  selected,
  onChange,
}: {
  assignable: Permission[];
  selected: Permission[];
  onChange: (next: Permission[]) => void;
}) {
  const { t } = useTranslation();
  const groups = useMemo(() => groupPermissions(assignable), [assignable]);

  return (
    <div className="flex flex-col gap-4" data-testid="permission-checklist">
      {groups.map((group) => (
        <fieldset key={group.area} className="flex flex-col gap-2">
          <legend className="mb-1 font-medium text-ink-strong text-xs uppercase tracking-wider">
            {t(`security.area.${group.area}`, { defaultValue: group.area })}
          </legend>
          {group.permissions.map((permission) => (
            <Checkbox
              key={permission}
              variant="square"
              checked={selected.includes(permission)}
              onChange={(on) =>
                onChange(togglePermission(selected, permission, on, assignable))
              }
              data-testid={`permission-${permission}`}
            >
              <span className="flex flex-col">
                <span className="text-ink-strong text-sm">
                  {t(`security.permission.${permission}`, {
                    defaultValue: permission,
                  })}
                </span>
                <span className="font-mono text-ink-subtle text-xs">
                  {permission}
                </span>
              </span>
            </Checkbox>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

export function RoleFormModal({
  isOpen,
  role,
  assignable,
  onClose,
}: {
  isOpen: boolean;
  role: CustomRole | null;
  assignable: Permission[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const key = securityPendingKeys.op("saveRole", role?.id);
  const isSaving = useAppSelector(selectIsSecurityPending(key));
  const failure = useAppSelector(selectSecurityFailure(key));
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [projectRole, setProjectRole] = useState<ProjectRole>("VIEWER");

  useEffect(() => {
    if (isOpen) {
      setName(role?.name ?? "");
      setDescription(role?.description ?? "");
      setPermissions(onlyAssignable(role?.permissions ?? [], assignable));
      setProjectRole(role?.projectRole ?? "VIEWER");
      dispatch(clearSecurityFailure());
    }
  }, [isOpen, role, assignable, dispatch]);

  useOnSuccess(isSaving, failure !== null, onClose);

  const submit = () => {
    if (!name.trim()) {
      return;
    }
    dispatch(
      runSecurityOp({
        op: "saveRole",
        ...(role ? { id: role.id } : {}),
        data: {
          name: name.trim(),
          description: description.trim() || null,
          permissions: onlyAssignable(permissions, assignable),
          projectRole,
        },
      }),
    );
  };

  return (
    <Modal
      closeLabel={t("modal.close")}
      isOpen={isOpen}
      onClose={onClose}
      title={
        role ? t("security.roles.editTitle") : t("security.roles.createTitle")
      }
      description={t("security.roles.formDescription")}
      data-testid="role-modal"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button intent="ghost" size="sm" onClick={onClose}>
            {t("confirm.cancel")}
          </Button>
          <Button
            intent="invert"
            size="sm"
            className="btn-no-lift min-w-24 text-sm"
            loading={isSaving}
            disabled={!name.trim()}
            onClick={submit}
            data-testid="role-modal-submit"
          >
            {t("security.save")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col">
        <FieldRow title={t("security.roles.fields.name")} htmlFor="role-name">
          <TextInput
            id="role-name"
            value={name}
            maxLength={80}
            error={failure?.issues.name}
            onChange={setName}
          />
        </FieldRow>
        <FieldRow
          title={t("security.roles.fields.description")}
          htmlFor="role-description"
        >
          <TextArea
            id="role-description"
            value={description}
            rows={2}
            maxLength={500}
            onChange={setDescription}
          />
        </FieldRow>
        <FieldRow
          title={t("security.roles.fields.projectRole")}
          description={t("security.roles.fields.projectRoleHint")}
          htmlFor="role-project-role"
        >
          <Select
            id="role-project-role"
            value={projectRole}
            options={PROJECT_ROLES.map((value) => ({
              value,
              title: t(`security.projectRole.${value}`),
            }))}
            onChange={(value) => setProjectRole(value as ProjectRole)}
          />
        </FieldRow>
        <FieldRow
          title={t("security.roles.fields.permissions")}
          description={t("security.roles.fields.permissionsHint")}
        >
          <PermissionChecklist
            assignable={assignable}
            selected={permissions}
            onChange={setPermissions}
          />
        </FieldRow>
      </div>
    </Modal>
  );
}
