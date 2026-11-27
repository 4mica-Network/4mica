import { Button, Card, EmptyState, Tag } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  selectActiveOrganization,
  selectCan,
} from "@stores/organization/selector";
import { PERMISSION } from "@stores/organization/type";
import {
  fetchSecurity,
  runSecurityOp,
  securityPendingKeys,
  selectAssignablePermissions,
  selectIsSecurityPending,
  selectSecurityCollection,
} from "@stores/security";
import type { CustomRole } from "@stores/security/type";
import { Pencil, Plus, ShieldPlus, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SettingsSection } from "@/components/layout";
import { PageSpinner } from "@/components/PageSpinner";
import { ReadOnlyNotice, Unavailable } from "@/components/SecurityNotice";
import { SettingsPage } from "@/components/SettingsPage";
import { RoleFormModal } from "./RoleFormModal";

function RoleRow({
  role,
  canManage,
  onEdit,
  onDelete,
}: {
  role: CustomRole;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const isDeleting = useAppSelector(
    selectIsSecurityPending(securityPendingKeys.op("deleteRole", role.id)),
  );

  return (
    <Card
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`role-row-${role.id}`}
    >
      <div className="min-w-0">
        <span className="truncate font-medium text-ink-strong text-sm">
          {role.name}
        </span>
        {role.description && (
          <p className="mt-0.5 text-ink-muted text-xs">{role.description}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Tag size="sm" variant="neutral">
            {t("security.roles.permissionCount", {
              count: role.permissions.length,
            })}
          </Tag>
          <Tag size="sm" variant="neutral">
            {t("security.roles.projectRoleTag", {
              role: t(`security.projectRole.${role.projectRole}`),
            })}
          </Tag>
          <Tag
            size="sm"
            variant="default"
            data-testid={`role-members-${role.id}`}
          >
            {t("security.roles.memberCount", { count: role.memberCount })}
          </Tag>
        </div>
      </div>
      {canManage && (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="sm"
            intent="ghost"
            className="btn-no-lift px-2"
            aria-label={t("security.roles.edit", { name: role.name })}
            onClick={onEdit}
            data-testid={`role-edit-${role.id}`}
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            intent="ghost"
            className="btn-no-lift px-2"
            aria-label={t("security.roles.delete", { name: role.name })}
            loading={isDeleting}
            onClick={onDelete}
            data-testid={`role-delete-${role.id}`}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      )}
    </Card>
  );
}

function Roles() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const canManage = useAppSelector(selectCan(PERMISSION.ROLES_MANAGE));
  const roles = useAppSelector(selectSecurityCollection("roles"));
  const assignable = useAppSelector(selectAssignablePermissions);
  const [editing, setEditing] = useState<CustomRole | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CustomRole | null>(null);

  useEffect(() => {
    dispatch(fetchSecurity("roles"));
  }, [dispatch]);

  if (roles.status === "failed" && roles.items.length === 0) {
    return (
      <EmptyState
        icon={<TriangleAlert className="h-5 w-5" />}
        title={t("security.loadFailed")}
        description={roles.error ?? undefined}
        action={{
          label: t("security.retry"),
          onClick: () => dispatch(fetchSecurity("roles")),
        }}
        data-testid="roles-error"
      />
    );
  }
  if (roles.status !== "loaded" && roles.status !== "failed") {
    return <PageSpinner />;
  }

  return (
    <>
      {!canManage && (
        <ReadOnlyNotice
          message={t("security.roles.readOnly")}
          testId="roles-read-only"
        />
      )}
      <SettingsSection
        title={t("security.roles.title")}
        description={t("security.roles.description")}
        action={
          canManage && (
            <Button
              type="button"
              intent="invert"
              size="sm"
              className="btn-no-lift"
              icon={<Plus aria-hidden="true" className="h-4 w-4" />}
              onClick={() => setCreating(true)}
              data-testid="role-new"
            >
              {t("security.roles.new")}
            </Button>
          )
        }
      >
        {roles.items.length === 0 ? (
          <EmptyState
            variant="dashed"
            size="sm"
            icon={<ShieldPlus className="h-5 w-5" />}
            title={t("security.roles.empty")}
            description={t("security.roles.emptyHint")}
            data-testid="roles-empty"
          />
        ) : (
          roles.items.map((role) => (
            <RoleRow
              key={role.id}
              role={role}
              canManage={canManage}
              onEdit={() => setEditing(role)}
              onDelete={() => setDeleting(role)}
            />
          ))
        )}
      </SettingsSection>

      <RoleFormModal
        isOpen={creating || editing !== null}
        role={editing}
        assignable={assignable}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        isOpen={deleting !== null}
        title={t("security.roles.deleteTitle", { name: deleting?.name ?? "" })}
        confirmLabel={t("security.roles.deleteConfirm")}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            dispatch(runSecurityOp({ op: "deleteRole", id: deleting.id }));
          }
          setDeleting(null);
        }}
        data-testid="role-delete-dialog"
      >
        <p>
          {t("security.roles.deleteBody", {
            count: deleting?.memberCount ?? 0,
          })}
        </p>
      </ConfirmDialog>
    </>
  );
}

export function RolesSettings() {
  const organization = useAppSelector(selectActiveOrganization);
  const canRead = useAppSelector(selectCan(PERMISSION.MEMBERS_MANAGE));

  return (
    <SettingsPage
      titleKey="page.settings.roles.title"
      descriptionKey="page.settings.roles.description"
    >
      {!canRead || organization?.personal ? (
        <Unavailable
          personal={Boolean(organization?.personal)}
          testId="roles-unavailable"
        />
      ) : (
        <Roles />
      )}
    </SettingsPage>
  );
}
