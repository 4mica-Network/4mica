import { Avatar, Button, EmptyState } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { selectCan } from "@stores/organization/selector";
import { PERMISSION } from "@stores/organization/type";
import {
  fetchAuditLog,
  selectAuditLog,
  setAuditActionFilter,
} from "@stores/team";
import type { AuditLogItem } from "@stores/team/type";
import { formatDateTime } from "@utils/format";
import { Lock, ScrollText, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Select } from "@/components/form";
import { PageSpinner } from "@/components/PageSpinner";
import { SettingsPage } from "@/components/SettingsPage";

function Actor({ item }: { item: AuditLogItem }) {
  const { t } = useTranslation();
  const name = item.actor
    ? item.actor.name || item.actor.username || ""
    : item.actorApiKeyId
      ? t("auditLog.actor.apiKey")
      : t("auditLog.actor.system");
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar
        src={item.actor?.avatarUrl ?? null}
        name={name}
        alt=""
        size="xs"
        className="h-6 w-6 shrink-0 border-0 bg-overlay/15 text-2xs text-ink-strong"
      />
      <span className="truncate text-ink-body text-sm">{name}</span>
    </span>
  );
}

function AuditRow({ item }: { item: AuditLogItem }) {
  const target = [item.targetType, item.targetId].filter(Boolean).join(" · ");
  return (
    <tr className="bg-surface" data-testid={`audit-row-${item.id}`}>
      <td className="px-4 py-3 align-top">
        <span className="font-medium font-mono text-ink-strong text-xs">
          {item.action}
        </span>
      </td>
      <td className="px-4 py-3 align-top">
        <Actor item={item} />
      </td>
      <td className="max-w-48 truncate px-4 py-3 align-top text-ink-muted text-xs">
        {target}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right align-top text-ink-muted text-xs">
        {formatDateTime(item.createdAt)}
      </td>
    </tr>
  );
}

function AuditLog() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const audit = useAppSelector(selectAuditLog);
  const [seenActions, setSeenActions] = useState<string[]>([]);

  useEffect(() => {
    dispatch(fetchAuditLog());
  }, [dispatch]);

  useEffect(() => {
    setSeenActions((current) => {
      const next = new Set(current);
      for (const item of audit.items) {
        next.add(item.action);
      }
      return next.size === current.length ? current : [...next].sort();
    });
  }, [audit.items]);

  const options = useMemo(
    () => [
      { value: "", title: t("auditLog.filter.all") },
      ...seenActions.map((action) => ({ value: action, title: action })),
    ],
    [seenActions, t],
  );

  const chooseAction = (action: string) => {
    dispatch(setAuditActionFilter(action));
    dispatch(fetchAuditLog());
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="w-60">
        <Select
          id="audit-action-filter"
          aria-label={t("auditLog.filter.label")}
          value={audit.action}
          options={options}
          hasSearch
          onChange={chooseAction}
        />
      </div>

      {audit.status === "idle" || audit.status === "loading" ? (
        <PageSpinner />
      ) : audit.status === "failed" ? (
        <EmptyState
          icon={<TriangleAlert className="h-5 w-5" />}
          title={t("auditLog.error.title")}
          description={audit.error ?? undefined}
          action={{
            label: t("auditLog.retry"),
            onClick: () => dispatch(fetchAuditLog()),
          }}
          data-testid="audit-error"
        />
      ) : audit.items.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-5 w-5" />}
          title={t("auditLog.empty.title")}
          description={t("auditLog.empty.description")}
          data-testid="audit-empty"
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-overlay/10">
          <table className="w-full text-left" data-testid="audit-table">
            <thead className="bg-overlay/5 text-2xs text-ink-subtle uppercase tracking-wide">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("auditLog.column.action")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("auditLog.column.actor")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("auditLog.column.target")}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t("auditLog.column.time")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-overlay/10">
              {audit.items.map((item) => (
                <AuditRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {audit.status === "loaded" && audit.nextCursor && (
        <div className="flex justify-center">
          <Button
            type="button"
            intent="outline"
            size="sm"
            loading={audit.isLoadingMore}
            onClick={() => dispatch(fetchAuditLog({ append: true }))}
            data-testid="audit-load-more"
          >
            {t("auditLog.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function AuditLogSettings() {
  const { t } = useTranslation();
  const canRead = useAppSelector(selectCan(PERMISSION.AUDIT_READ));

  return (
    <SettingsPage
      titleKey="page.settings.auditLog.title"
      descriptionKey="page.settings.auditLog.description"
    >
      {canRead ? (
        <AuditLog />
      ) : (
        <EmptyState
          icon={<Lock className="h-5 w-5" />}
          title={t("auditLog.noAccess.title")}
          description={t("auditLog.noAccess.description")}
          data-testid="audit-no-access"
        />
      )}
    </SettingsPage>
  );
}
