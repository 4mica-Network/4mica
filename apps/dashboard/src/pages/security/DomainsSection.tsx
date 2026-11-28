import { Button, Card, Checkbox, CopyButton, EmptyState, Tag } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  ORGANIZATION_ROLE,
  type OrganizationRole,
} from "@stores/organization/type";
import {
  fetchSecurity,
  runSecurityOp,
  securityPendingKeys,
  selectIsSecurityPending,
  selectSecurityCollection,
  selectSecurityFailure,
} from "@stores/security";
import type { OrganizationDomain } from "@stores/security/type";
import { formatDate } from "@utils/format";
import { Globe, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Select, TextInput } from "@/components/form";
import { SectionCard } from "@/components/layout";
import { Spinner } from "@/components/Spinner";
import { ROLES } from "@/pages/team/roles";

export const AUTO_JOIN_ROLES = ROLES.filter(
  (role) => role !== ORGANIZATION_ROLE.OWNER,
);

const DOMAIN_PATTERN =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export const isValidDomain = (value: string): boolean =>
  DOMAIN_PATTERN.test(value) && !/^[\d.]+$/.test(value);

function RecordValue({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-12 shrink-0 text-ink-subtle text-xs">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-md border border-overlay/15 bg-surface-deep px-2 py-1 font-mono text-ink-body text-xs">
        {value}
      </code>
      <CopyButton
        value={value}
        labels={{ copy: t("security.copy"), copied: t("security.copied") }}
      />
    </div>
  );
}

function DomainRow({
  domain,
  canManage,
}: {
  domain: OrganizationDomain;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const verifyKey = securityPendingKeys.op("verifyDomain", domain.id);
  const isVerifying = useAppSelector(selectIsSecurityPending(verifyKey));
  const isUpdating = useAppSelector(
    selectIsSecurityPending(securityPendingKeys.op("updateDomain", domain.id)),
  );
  const isDeleting = useAppSelector(
    selectIsSecurityPending(securityPendingKeys.op("deleteDomain", domain.id)),
  );
  const verifyFailure = useAppSelector(selectSecurityFailure(verifyKey));
  const found = Array.isArray(verifyFailure?.detail.found)
    ? (verifyFailure.detail.found as unknown[]).map(String)
    : [];

  const update = (data: {
    autoJoin?: boolean;
    autoJoinRole?: OrganizationRole;
  }) => dispatch(runSecurityOp({ op: "updateDomain", id: domain.id, data }));

  return (
    <Card
      className="flex flex-col gap-4"
      data-testid={`domain-row-${domain.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-ink-strong text-sm">
              {domain.domain}
            </span>
            <Tag size="sm" variant={domain.verified ? "success" : "warning"}>
              {domain.verified
                ? t("security.domains.verified")
                : t("security.domains.unverified")}
            </Tag>
          </div>
          <p className="mt-0.5 text-ink-subtle text-xs">
            {domain.verified && domain.verifiedAt
              ? t("security.domains.verifiedAt", {
                  date: formatDate(domain.verifiedAt),
                })
              : domain.lastCheckedAt
                ? t("security.domains.lastChecked", {
                    date: formatDate(domain.lastCheckedAt),
                  })
                : t("security.domains.addedAt", {
                    date: formatDate(domain.createdAt),
                  })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {(isUpdating || isDeleting) && (
            <Spinner size="sm" className="text-ink-subtle" />
          )}
          {canManage && !domain.verified && (
            <Button
              type="button"
              size="sm"
              intent="invert"
              className="btn-no-lift"
              loading={isVerifying}
              onClick={() =>
                dispatch(runSecurityOp({ op: "verifyDomain", id: domain.id }))
              }
              data-testid={`domain-verify-${domain.id}`}
            >
              {t("security.domains.verify")}
            </Button>
          )}
          {canManage && (
            <ConfirmAction
              title={t("security.domains.deleteTitle", {
                domain: domain.domain,
              })}
              description={t("security.domains.deleteBody")}
              onConfirm={() =>
                dispatch(runSecurityOp({ op: "deleteDomain", id: domain.id }))
              }
            >
              <Button
                type="button"
                size="sm"
                intent="ghost"
                className="btn-no-lift px-2"
                aria-label={t("security.domains.delete", {
                  domain: domain.domain,
                })}
                disabled={isDeleting}
                data-testid={`domain-delete-${domain.id}`}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </Button>
            </ConfirmAction>
          )}
        </div>
      </div>

      {!domain.verified && (
        <div
          className="flex flex-col gap-2 rounded-lg border border-overlay/10 bg-overlay/5 p-3"
          data-testid={`domain-record-${domain.id}`}
        >
          <p className="text-ink-muted text-xs">
            {t("security.domains.recordHint")}
          </p>
          <RecordValue
            label={t("security.domains.recordType")}
            value={domain.verificationRecord.type}
          />
          <RecordValue
            label={t("security.domains.recordName")}
            value={domain.verificationRecord.name}
          />
          <RecordValue
            label={t("security.domains.recordValue")}
            value={domain.verificationRecord.value}
          />
          {verifyFailure && (
            <div
              role="alert"
              className="text-danger text-xs"
              data-testid={`domain-verify-failure-${domain.id}`}
            >
              <p>{verifyFailure.message}</p>
              {found.length > 0 && (
                <p className="mt-1 text-ink-muted">
                  {t("security.domains.found", { records: found.join(", ") })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {domain.verified && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Checkbox
            variant="square"
            checked={domain.autoJoin}
            disabled={!canManage || isUpdating}
            onChange={(autoJoin) => update({ autoJoin })}
            data-testid={`domain-autojoin-${domain.id}`}
          >
            <span className="flex flex-col">
              <span className="font-medium text-ink-strong text-sm">
                {t("security.domains.autoJoin")}
              </span>
              <span className="text-ink-muted text-xs">
                {t("security.domains.autoJoinHint", { domain: domain.domain })}
              </span>
            </span>
          </Checkbox>
          <div className="w-40 shrink-0">
            <Select
              id={`domain-role-${domain.id}`}
              aria-label={t("security.domains.autoJoinRole")}
              value={domain.autoJoinRole}
              disabled={!canManage || isUpdating || !domain.autoJoin}
              options={AUTO_JOIN_ROLES.map((role) => ({
                value: role,
                title: t(`organization.role.${role}`),
              }))}
              onChange={(role) =>
                role !== domain.autoJoinRole &&
                update({ autoJoinRole: role as OrganizationRole })
              }
            />
          </div>
        </div>
      )}
    </Card>
  );
}

export function DomainsSection({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const domains = useAppSelector(selectSecurityCollection("domains"));
  const isAdding = useAppSelector(
    selectIsSecurityPending(securityPendingKeys.op("createDomain")),
  );
  const [value, setValue] = useState("");
  const candidate = value.trim().toLowerCase();
  const invalid = candidate !== "" && !isValidDomain(candidate);

  const add = () => {
    if (!candidate || invalid || isAdding) {
      return;
    }
    dispatch(runSecurityOp({ op: "createDomain", domain: candidate }));
    setValue("");
  };

  return (
    <SectionCard
      title={t("security.domains.title")}
      description={t("security.domains.description")}
      data-testid="security-domains"
    >
      {canManage && (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <div className="flex-1">
            <TextInput
              id="security-domain-input"
              aria-label={t("security.domains.inputLabel")}
              placeholder={t("security.domains.placeholder")}
              value={value}
              format="lowercase"
              error={invalid ? t("security.domains.invalid") : undefined}
              onChange={setValue}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            intent="invert"
            className="btn-no-lift min-w-28 shrink-0 py-2.5"
            loading={isAdding}
            disabled={!candidate || invalid}
            data-testid="security-domain-add"
          >
            {t("security.domains.add")}
          </Button>
        </form>
      )}

      {domains.status === "failed" ? (
        <EmptyState
          size="sm"
          title={t("security.loadFailed")}
          description={domains.error ?? undefined}
          action={{
            label: t("security.retry"),
            onClick: () => dispatch(fetchSecurity("domains")),
          }}
        />
      ) : domains.status !== "loaded" ? (
        <Spinner size="sm" className="text-ink-subtle" />
      ) : domains.items.length === 0 ? (
        <EmptyState
          variant="dashed"
          size="sm"
          icon={<Globe className="h-5 w-5" />}
          title={t("security.domains.empty")}
          data-testid="security-domains-empty"
        />
      ) : (
        domains.items.map((domain) => (
          <DomainRow key={domain.id} domain={domain} canManage={canManage} />
        ))
      )}
    </SectionCard>
  );
}
