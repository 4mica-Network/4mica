import { Button, Card, EmptyState, Tag } from "@4mica/ui";
import type { RevealSecret } from "@stores/developer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { selectProjectCan } from "@stores/project/selector";
import { PROJECT_PERMISSION } from "@stores/project/type";
import {
  createServiceAccount,
  deleteServiceAccount,
  fetchServiceAccounts,
  selectIsServiceAccountPending,
  selectServiceAccountActionError,
  selectServiceAccountIssues,
  selectServiceAccounts,
  selectServiceAccountsError,
  selectServiceAccountsStatus,
  serviceAccountPendingKeys,
  suspendServiceAccount,
  updateServiceAccount,
} from "@stores/serviceAccount";
import type { ServiceAccount } from "@stores/serviceAccount/type";
import { formatDate } from "@utils/format";
import { Bot, ChevronDown, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { FieldRow, TextInput } from "@/components/form";
import { RetryState } from "@/components/LoadFailure";
import { SettingsSection } from "@/components/layout";
import { RoleRestrictedNotice } from "@/components/Organization/RoleRestricted";
import { PageSpinner } from "@/components/PageSpinner";
import { RevealedSecretBanner } from "@/components/RevealedSecret";
import { SettingsPage } from "@/components/SettingsPage";
import { Spinner } from "@/components/Spinner";
import { useEphemeralSecret } from "@/hooks/useEphemeralSecret";
import { useOnSuccess } from "@/hooks/useOnSuccess";
import { KeysPanel } from "./KeysPanel";

function CreateServiceAccountForm() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isCreating = useAppSelector(
    selectIsServiceAccountPending(serviceAccountPendingKeys.create),
  );
  const failed = Boolean(useAppSelector(selectServiceAccountActionError));
  const issues = useAppSelector(selectServiceAccountIssues);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useOnSuccess(isCreating, failed, () => {
    setName("");
    setDescription("");
  });

  return (
    <Card>
      <form
        className="flex flex-col gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim() || isCreating) {
            return;
          }
          dispatch(
            createServiceAccount({
              name: name.trim(),
              description: description.trim() || null,
            }),
          );
        }}
        data-testid="create-service-account-form"
      >
        <FieldRow
          title={t("serviceAccounts.create.name")}
          htmlFor="service-account-name"
          required
        >
          <TextInput
            id="service-account-name"
            value={name}
            maxLength={120}
            placeholder={t("serviceAccounts.create.namePlaceholder")}
            error={issues.name}
            onChange={setName}
          />
        </FieldRow>
        <FieldRow
          title={t("serviceAccounts.create.description")}
          htmlFor="service-account-description"
        >
          <TextInput
            id="service-account-description"
            value={description}
            maxLength={280}
            error={issues.description}
            onChange={setDescription}
          />
        </FieldRow>
        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            size="sm"
            intent="invert"
            className="btn-no-lift"
            loading={isCreating}
            disabled={!name.trim()}
            data-testid="create-service-account-submit"
          >
            {t("serviceAccounts.create.submit")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ServiceAccountCard({
  account,
  canManage,
  onReveal,
}: {
  account: ServiceAccount;
  canManage: boolean;
  onReveal: RevealSecret;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isPending = useAppSelector(
    selectIsServiceAccountPending(
      serviceAccountPendingKeys.account(account.id),
    ),
  );
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(account.name);
  const suspended = Boolean(account.suspendedAt);

  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== account.name) {
      dispatch(updateServiceAccount({ id: account.id, name: trimmed }));
    }
    setRenaming(false);
  };

  return (
    <Card
      className="flex flex-col gap-3"
      data-testid={`service-account-${account.id}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                saveName();
              }}
            >
              <div className="flex-1">
                <TextInput
                  id={`rename-${account.id}`}
                  aria-label={t("serviceAccounts.rename")}
                  value={name}
                  maxLength={120}
                  autoFocus
                  onChange={setName}
                />
              </div>
              <Button
                type="submit"
                size="sm"
                intent="soft"
                data-testid={`rename-save-${account.id}`}
              >
                {t("serviceAccounts.save")}
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-ink-strong text-sm">
                {account.name}
              </span>
              {suspended && (
                <Tag size="sm" variant="warning">
                  {t("serviceAccounts.suspended")}
                </Tag>
              )}
            </div>
          )}
          {account.description && (
            <p className="mt-0.5 text-ink-muted text-xs">
              {account.description}
            </p>
          )}
          <p className="mt-0.5 text-ink-subtle text-xs">
            {t("serviceAccounts.meta", {
              count: account.keyCount,
              date: formatDate(account.createdAt),
            })}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isPending && <Spinner size="sm" className="text-ink-subtle" />}
          {canManage && (
            <>
              <Button
                type="button"
                size="sm"
                intent="ghost"
                disabled={isPending}
                onClick={() => {
                  setName(account.name);
                  setRenaming((value) => !value);
                }}
                data-testid={`rename-${account.id}`}
              >
                {t("serviceAccounts.rename")}
              </Button>
              <Button
                type="button"
                size="sm"
                intent="soft"
                disabled={isPending}
                onClick={() =>
                  dispatch(
                    suspendServiceAccount({
                      id: account.id,
                      suspended: !suspended,
                    }),
                  )
                }
                data-testid={`suspend-${account.id}`}
              >
                {suspended
                  ? t("serviceAccounts.reactivate")
                  : t("serviceAccounts.suspend")}
              </Button>
              <ConfirmAction
                title={t("serviceAccounts.deleteConfirm", {
                  name: account.name,
                })}
                description={t("serviceAccounts.deleteConsequence")}
                onConfirm={() =>
                  dispatch(deleteServiceAccount({ id: account.id }))
                }
              >
                <Button
                  type="button"
                  size="sm"
                  intent="ghost"
                  aria-label={t("serviceAccounts.delete")}
                  disabled={isPending}
                  data-testid={`delete-${account.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </ConfirmAction>
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex items-center gap-1 self-start text-ink-muted text-xs hover:text-ink-body"
        data-testid={`keys-toggle-${account.id}`}
      >
        <ChevronDown
          aria-hidden="true"
          className={expanded ? "h-3.5 w-3.5 rotate-180" : "h-3.5 w-3.5"}
        />
        {t("serviceAccounts.keys.title")}
      </button>
      {expanded && (
        <KeysPanel
          accountId={account.id}
          suspended={suspended}
          onReveal={onReveal}
        />
      )}
    </Card>
  );
}

export function ServiceAccountsSettings() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const accounts = useAppSelector(selectServiceAccounts);
  const status = useAppSelector(selectServiceAccountsStatus);
  const error = useAppSelector(selectServiceAccountsError);
  const canManage = useAppSelector(
    selectProjectCan(PROJECT_PERMISSION.SERVICE_ACCOUNTS_MANAGE),
  );
  const { secret, reveal, clear } = useEphemeralSecret();

  useEffect(() => {
    dispatch(fetchServiceAccounts());
  }, [dispatch]);

  return (
    <SettingsPage
      titleKey="page.settings.serviceAccounts.title"
      descriptionKey="page.settings.serviceAccounts.description"
    >
      {status === "idle" || status === "loading" ? (
        <PageSpinner />
      ) : status === "failed" ? (
        <RetryState
          message={error ?? ""}
          onRetry={() => dispatch(fetchServiceAccounts())}
        />
      ) : (
        <>
          {!canManage && (
            <RoleRestrictedNotice message={t("project.restricted")} />
          )}
          <RevealedSecretBanner secret={secret} onDismiss={clear} />
          {canManage && (
            <SettingsSection
              title={t("serviceAccounts.create.title")}
              description={t("serviceAccounts.create.lead")}
            >
              <CreateServiceAccountForm />
            </SettingsSection>
          )}
          <SettingsSection title={t("serviceAccounts.list.title")}>
            {accounts.length === 0 ? (
              <EmptyState
                icon={<Bot size={20} />}
                title={t("serviceAccounts.list.emptyTitle")}
                description={t("serviceAccounts.list.emptyDescription")}
                data-testid="service-accounts-empty"
              />
            ) : (
              accounts.map((account) => (
                <ServiceAccountCard
                  key={account.id}
                  account={account}
                  canManage={canManage}
                  onReveal={reveal}
                />
              ))
            )}
          </SettingsSection>
        </>
      )}
    </SettingsPage>
  );
}
