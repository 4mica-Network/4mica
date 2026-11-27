import { Button, Card, Checkbox, CopyButton, EmptyState, Tag } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import type { OrganizationRole } from "@stores/organization/type";
import {
  fetchSecurity,
  runSecurityOp,
  securityPendingKeys,
  selectIsSecurityPending,
  selectSecurityCollection,
} from "@stores/security";
import type { SsoConnection, SsoConnectionUpdate } from "@stores/security/type";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Select } from "@/components/form";
import { SectionCard } from "@/components/layout";
import { Spinner } from "@/components/Spinner";
import { AUTO_JOIN_ROLES } from "./DomainsSection";
import { SsoConnectionModal } from "./SsoConnectionModal";

function SpValue({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
      <span className="w-28 shrink-0 text-ink-subtle text-xs">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-overlay/15 bg-surface-deep px-2 py-1 font-mono text-ink-body text-xs">
          {value}
        </code>
        <CopyButton
          value={value}
          labels={{ copy: t("security.copy"), copied: t("security.copied") }}
        />
      </div>
    </div>
  );
}

function ConnectionRow({ connection }: { connection: SsoConnection }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isUpdating = useAppSelector(
    selectIsSecurityPending(securityPendingKeys.op("updateSso", connection.id)),
  );
  const isDeleting = useAppSelector(
    selectIsSecurityPending(securityPendingKeys.op("deleteSso", connection.id)),
  );
  const [confirmEnforce, setConfirmEnforce] = useState(false);
  const busy = isUpdating || isDeleting;

  const update = (data: SsoConnectionUpdate) =>
    dispatch(runSecurityOp({ op: "updateSso", id: connection.id, data }));

  return (
    <Card
      className="flex flex-col gap-4"
      data-testid={`sso-row-${connection.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-ink-strong text-sm">
              {connection.name}
            </span>
            <Tag size="sm" variant={connection.active ? "success" : "neutral"}>
              {connection.active
                ? t("security.sso.active")
                : t("security.sso.inactive")}
            </Tag>
            {connection.enforced && (
              <Tag size="sm" variant="warning">
                {t("security.sso.enforced")}
              </Tag>
            )}
          </div>
          <p className="mt-0.5 text-ink-muted text-xs">
            {t(`security.sso.provider.${connection.provider}.title`)} ·{" "}
            {connection.domain}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {busy && <Spinner size="sm" className="text-ink-subtle" />}
          <Button
            type="button"
            size="sm"
            intent={connection.active ? "soft" : "invert"}
            className="btn-no-lift"
            disabled={busy}
            onClick={() =>
              update(
                connection.active
                  ? { active: false, enforced: false }
                  : { active: true },
              )
            }
            data-testid={`sso-toggle-${connection.id}`}
          >
            {connection.active
              ? t("security.sso.deactivate")
              : t("security.sso.activate")}
          </Button>
          <ConfirmAction
            title={t("security.sso.deleteTitle", { name: connection.name })}
            description={t("security.sso.deleteBody")}
            onConfirm={() =>
              dispatch(runSecurityOp({ op: "deleteSso", id: connection.id }))
            }
          >
            <Button
              type="button"
              size="sm"
              intent="ghost"
              className="btn-no-lift px-2"
              aria-label={t("security.sso.delete", { name: connection.name })}
              disabled={busy}
              data-testid={`sso-delete-${connection.id}`}
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </Button>
          </ConfirmAction>
        </div>
      </div>

      {connection.serviceProvider && (
        <div
          className="flex flex-col gap-2 rounded-lg border border-overlay/10 bg-overlay/5 p-3"
          data-testid={`sso-sp-${connection.id}`}
        >
          <p className="text-ink-muted text-xs">{t("security.sso.spHint")}</p>
          <SpValue
            label={t("security.sso.acsUrl")}
            value={connection.serviceProvider.acsUrl}
          />
          <SpValue
            label={t("security.sso.entityId")}
            value={connection.serviceProvider.entityId}
          />
          <SpValue
            label={t("security.sso.metadataUrl")}
            value={connection.serviceProvider.metadataUrl}
          />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Checkbox
          variant="square"
          checked={connection.enforced}
          disabled={busy || !connection.active}
          onChange={(on) =>
            on ? setConfirmEnforce(true) : update({ enforced: false })
          }
          data-testid={`sso-enforce-${connection.id}`}
        >
          <span className="flex flex-col">
            <span className="font-medium text-ink-strong text-sm">
              {t("security.sso.enforce")}
            </span>
            <span className="text-ink-muted text-xs">
              {connection.active
                ? t("security.sso.enforceHint", { domain: connection.domain })
                : t("security.sso.enforceNeedsActive")}
            </span>
          </span>
        </Checkbox>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Checkbox
            variant="square"
            checked={connection.jitProvisioning}
            disabled={busy}
            onChange={(jitProvisioning) => update({ jitProvisioning })}
            data-testid={`sso-jit-${connection.id}`}
          >
            <span className="flex flex-col">
              <span className="font-medium text-ink-strong text-sm">
                {t("security.sso.fields.jit")}
              </span>
              <span className="text-ink-muted text-xs">
                {t("security.sso.fields.jitHint")}
              </span>
            </span>
          </Checkbox>
          <div className="w-40 shrink-0">
            <Select
              id={`sso-role-${connection.id}`}
              aria-label={t("security.sso.fields.defaultRole")}
              value={connection.defaultRole}
              disabled={busy}
              options={AUTO_JOIN_ROLES.map((role) => ({
                value: role,
                title: t(`organization.role.${role}`),
              }))}
              onChange={(role) =>
                role !== connection.defaultRole &&
                update({ defaultRole: role as OrganizationRole })
              }
            />
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmEnforce}
        title={t("security.sso.enforceTitle", { domain: connection.domain })}
        confirmLabel={t("security.sso.enforceConfirm")}
        intent="invert"
        onClose={() => setConfirmEnforce(false)}
        onConfirm={() => {
          update({ enforced: true });
          setConfirmEnforce(false);
        }}
        data-testid={`sso-enforce-dialog-${connection.id}`}
      >
        <p>{t("security.sso.enforceBody", { domain: connection.domain })}</p>
        <p className="text-ink-muted text-xs">
          {t("security.sso.enforceBodyNote")}
        </p>
      </ConfirmDialog>
    </Card>
  );
}

export function SsoSection({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const connections = useAppSelector(selectSecurityCollection("sso"));
  const domains = useAppSelector(selectSecurityCollection("domains"));
  const [creating, setCreating] = useState(false);
  const verified = useMemo(
    () => domains.items.filter((domain) => domain.verified),
    [domains.items],
  );

  if (!canManage) {
    return (
      <SectionCard
        title={t("security.sso.title")}
        description={t("security.sso.description")}
        data-testid="security-sso"
      >
        <p className="text-ink-muted text-sm" data-testid="sso-owner-only">
          {t("security.sso.ownerOnly")}
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={t("security.sso.title")}
      description={t("security.sso.description")}
      data-testid="security-sso"
      action={
        <Button
          type="button"
          size="sm"
          intent="invert"
          className="btn-no-lift"
          icon={<Plus aria-hidden="true" className="h-4 w-4" />}
          disabled={verified.length === 0}
          onClick={() => setCreating(true)}
          data-testid="sso-new"
        >
          {t("security.sso.new")}
        </Button>
      }
    >
      {verified.length === 0 && (
        <p className="text-ink-muted text-sm" data-testid="sso-needs-domain">
          {t("security.sso.needsDomain")}
        </p>
      )}

      {connections.status === "failed" ? (
        <EmptyState
          size="sm"
          title={t("security.loadFailed")}
          description={connections.error ?? undefined}
          action={{
            label: t("security.retry"),
            onClick: () => dispatch(fetchSecurity("sso")),
          }}
        />
      ) : connections.status !== "loaded" ? (
        <Spinner size="sm" className="text-ink-subtle" />
      ) : connections.items.length === 0 ? (
        <EmptyState
          variant="dashed"
          size="sm"
          icon={<KeyRound className="h-5 w-5" />}
          title={t("security.sso.empty")}
          data-testid="sso-empty"
        />
      ) : (
        connections.items.map((connection) => (
          <ConnectionRow key={connection.id} connection={connection} />
        ))
      )}

      <SsoConnectionModal
        isOpen={creating}
        domains={verified}
        onClose={() => setCreating(false)}
      />
    </SectionCard>
  );
}
