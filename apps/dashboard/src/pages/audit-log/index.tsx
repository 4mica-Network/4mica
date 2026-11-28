import { Avatar, Button, EmptyState, InputField } from "@4mica/ui";
import { exportAuditLog } from "@api/exports";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { selectCan } from "@stores/organization/selector";
import { PERMISSION } from "@stores/organization/type";
import { selectProjects } from "@stores/project/selector";
import {
  fetchAuditLog,
  fetchMembers,
  selectAuditLog,
  selectMembers,
  setAuditFilters,
} from "@stores/team";
import { INITIAL_AUDIT_FILTERS } from "@stores/team/reducer";
import { auditParams } from "@stores/team/saga";
import type { AuditFilters, AuditLogItem } from "@stores/team/type";
import { formatDateTime } from "@utils/format";
import { useDebounceEffect } from "ahooks";
import { Lock, ScrollText, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExportCsvButton } from "@/components/ExportCsv";
import { TextInput } from "@/components/form";
import { ListToolbar } from "@/components/ListToolbar";
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

function AuditFiltersBar() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { filters } = useAppSelector(selectAuditLog);
  const members = useAppSelector(selectMembers);
  const projects = useAppSelector(selectProjects);
  const canExport = useAppSelector(selectCan(PERMISSION.REPORTS_EXPORT));

  useEffect(() => {
    dispatch(fetchMembers());
  }, [dispatch]);

  const apply = (next: Partial<AuditFilters>) => {
    dispatch(setAuditFilters(next));
    dispatch(fetchAuditLog());
  };

  return (
    <div className="flex flex-col gap-3" data-testid="audit-filters">
      <ListToolbar>
        <ListToolbar.Search
          value={filters.q}
          placeholder={t("auditLog.filter.search")}
          onSearch={(q) => apply({ q })}
          data-testid="audit-search"
        />
        <ListToolbar.Filters>
          <ListToolbar.Filter
            label={t("auditLog.filter.actor")}
            value={filters.actorUserId}
            options={[
              { value: "", title: t("auditLog.filter.anyone") },
              ...members.map((member) => ({
                value: member.userId,
                title: member.name || member.email || member.userId,
              })),
            ]}
            onChange={(actorUserId) => apply({ actorUserId })}
            data-testid="audit-actor-filter"
          />
          <ListToolbar.Filter
            label={t("auditLog.filter.project")}
            value={filters.projectId}
            options={[
              { value: "", title: t("auditLog.filter.allProjects") },
              ...projects.map((project) => ({
                value: project.id,
                title: project.name,
              })),
            ]}
            onChange={(projectId) => apply({ projectId })}
            data-testid="audit-project-filter"
          />
        </ListToolbar.Filters>
      </ListToolbar>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
        <DebouncedInput
          label={t("auditLog.filter.actionPrefix")}
          value={filters.actionPrefix}
          placeholder="spending_policy."
          onCommit={(actionPrefix) => apply({ actionPrefix })}
          testId="audit-action-prefix"
        />
        <DebouncedInput
          label={t("auditLog.filter.targetType")}
          value={filters.targetType}
          placeholder="api_key"
          onCommit={(targetType) => apply({ targetType })}
          testId="audit-target-type"
        />
        <DebouncedInput
          label={t("auditLog.filter.targetId")}
          value={filters.targetId}
          onCommit={(targetId) => apply({ targetId })}
          testId="audit-target-id"
        />
        <TextInput
          type="date"
          aria-label={t("auditLog.filter.from")}
          value={filters.from}
          onChange={(from) => apply({ from })}
        />
        <TextInput
          type="date"
          aria-label={t("auditLog.filter.to")}
          value={filters.to}
          onChange={(to) => apply({ to })}
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          intent="ghost"
          size="sm"
          onClick={() => apply(INITIAL_AUDIT_FILTERS)}
          data-testid="audit-clear-filters"
        >
          {t("auditLog.filter.clear")}
        </Button>
        {canExport && (
          <ExportCsvButton
            onExport={() => exportAuditLog(auditParams(filters))}
            data-testid="audit-export"
          />
        )}
      </div>
    </div>
  );
}

function DebouncedInput({
  label,
  value,
  placeholder,
  onCommit,
  testId,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  testId: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  useDebounceEffect(
    () => {
      if (text !== value) {
        onCommit(text);
      }
    },
    [text],
    { wait: 450 },
  );
  return (
    <InputField
      value={text}
      aria-label={label}
      placeholder={placeholder ?? label}
      maxLength={200}
      onChange={(event) => setText(event.target.value)}
      data-testid={testId}
    />
  );
}

function AuditLog() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const audit = useAppSelector(selectAuditLog);

  useEffect(() => {
    dispatch(fetchAuditLog());
  }, [dispatch]);

  return (
    <div className="flex flex-col gap-4">
      <AuditFiltersBar />

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
