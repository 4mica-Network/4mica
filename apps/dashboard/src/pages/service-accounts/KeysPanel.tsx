import { Button, Card, Tag } from "@4mica/ui";
import {
  API_KEY_SCOPES,
  type ApiKey,
  type ApiKeyScope,
  type RevealSecret,
} from "@stores/developer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { selectProjectCan } from "@stores/project/selector";
import { PROJECT_PERMISSION } from "@stores/project/type";
import {
  createServiceAccountKey,
  fetchServiceAccountKeys,
  revokeServiceAccountKey,
  rotateServiceAccountKey,
  selectIsServiceAccountPending,
  selectServiceAccountActionError,
  selectServiceAccountKeys,
  selectServiceAccountKeysStatus,
  serviceAccountPendingKeys,
} from "@stores/serviceAccount";
import { formatDate } from "@utils/format";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiKeyTags, ScopePicker } from "@/components/ApiKey";
import { ConfirmAction } from "@/components/ConfirmAction";
import { FieldRow, Select, TextInput } from "@/components/form";
import { Spinner } from "@/components/Spinner";
import { useOnSuccess } from "@/hooks/useOnSuccess";

export const GRACE_HOURS = [0, 1, 24, 72, 168] as const;

function KeyRow({
  accountId,
  apiKey,
  canManage,
  onReveal,
}: {
  accountId: string;
  apiKey: ApiKey;
  canManage: boolean;
  onReveal: RevealSecret;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isPending = useAppSelector(
    selectIsServiceAccountPending(serviceAccountPendingKeys.key(apiKey.id)),
  );
  const [grace, setGrace] = useState("0");
  const isRevoked = Boolean(apiKey.revokedAt);

  return (
    <div
      className="flex flex-col gap-2 bg-surface px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
      data-testid={`service-account-key-${apiKey.id}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-ink-strong text-sm">
            {apiKey.name}
          </span>
          {isRevoked && (
            <Tag size="sm" variant="error">
              {t("developer.keys.revoked")}
            </Tag>
          )}
        </div>
        <p className="mt-0.5 font-mono text-ink-muted text-xs">
          {apiKey.prefix}…{apiKey.last4}
        </p>
        <ApiKeyTags apiKey={apiKey} />
        <p className="mt-1 text-ink-subtle text-xs">
          {t("developer.keys.created")} {formatDate(apiKey.createdAt)} ·{" "}
          {t("developer.keys.lastUsed")} {formatDate(apiKey.lastUsedAt)}
          {apiKey.expiresAt &&
            ` · ${t("serviceAccounts.keys.expires", { date: formatDate(apiKey.expiresAt) })}`}
        </p>
      </div>
      {canManage && !isRevoked && (
        <div className="flex shrink-0 items-center gap-2">
          {isPending && <Spinner size="sm" className="text-ink-subtle" />}
          <div className="w-32">
            <Select
              id={`rotate-grace-${apiKey.id}`}
              aria-label={t("serviceAccounts.keys.grace")}
              value={grace}
              options={GRACE_HOURS.map((hours) => ({
                value: String(hours),
                title: t("serviceAccounts.keys.graceHours", { count: hours }),
              }))}
              onChange={setGrace}
            />
          </div>
          <ConfirmAction
            title={t("serviceAccounts.keys.rotateConfirm", {
              name: apiKey.name,
            })}
            description={t("serviceAccounts.keys.rotateConsequence")}
            confirmLabel={t("serviceAccounts.keys.rotate")}
            onConfirm={() =>
              dispatch(
                rotateServiceAccountKey(
                  {
                    id: accountId,
                    keyId: apiKey.id,
                    expireOldInHours: Number(grace),
                  },
                  onReveal,
                ),
              )
            }
            data-testid={`rotate-confirm-${apiKey.id}`}
          >
            <Button
              type="button"
              size="sm"
              intent="soft"
              disabled={isPending}
              data-testid={`rotate-${apiKey.id}`}
            >
              {t("serviceAccounts.keys.rotate")}
            </Button>
          </ConfirmAction>
          <ConfirmAction
            title={t("developer.keys.revokeConfirm", { name: apiKey.name })}
            description={t("developer.keys.revokeConsequence")}
            confirmLabel={t("developer.keys.revoke")}
            onConfirm={() =>
              dispatch(
                revokeServiceAccountKey({ id: accountId, keyId: apiKey.id }),
              )
            }
          >
            <Button
              type="button"
              size="sm"
              intent="ghost"
              disabled={isPending}
              data-testid={`revoke-${apiKey.id}`}
            >
              {t("developer.keys.revoke")}
            </Button>
          </ConfirmAction>
        </div>
      )}
    </div>
  );
}

function NewKeyForm({
  accountId,
  onReveal,
}: {
  accountId: string;
  onReveal: RevealSecret;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isCreating = useAppSelector(
    selectIsServiceAccountPending(
      serviceAccountPendingKeys.createKey(accountId),
    ),
  );
  const failed = Boolean(useAppSelector(selectServiceAccountActionError));
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>([...API_KEY_SCOPES]);
  const [expiresOn, setExpiresOn] = useState("");

  useOnSuccess(isCreating, failed, () => {
    setName("");
    setScopes([...API_KEY_SCOPES]);
    setExpiresOn("");
  });

  const trimmed = name.trim();
  const ready = trimmed.length > 0 && scopes.length > 0;

  return (
    <Card>
      <form
        className="flex flex-col gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready || isCreating) {
            return;
          }
          dispatch(
            createServiceAccountKey(
              {
                id: accountId,
                key: {
                  name: trimmed,
                  scopes,
                  ...(expiresOn
                    ? { expiresAt: new Date(expiresOn).toISOString() }
                    : {}),
                },
              },
              onReveal,
            ),
          );
        }}
        data-testid={`new-key-form-${accountId}`}
      >
        <FieldRow
          title={t("developer.keys.nameLabel")}
          htmlFor={`new-key-name-${accountId}`}
          required
        >
          <TextInput
            id={`new-key-name-${accountId}`}
            value={name}
            maxLength={120}
            placeholder={t("developer.keys.namePlaceholder")}
            onChange={setName}
          />
        </FieldRow>
        <FieldRow
          title={t("serviceAccounts.keys.expiry")}
          description={t("serviceAccounts.keys.expiryHint")}
          htmlFor={`new-key-expiry-${accountId}`}
        >
          <TextInput
            id={`new-key-expiry-${accountId}`}
            type="date"
            value={expiresOn}
            onChange={setExpiresOn}
          />
        </FieldRow>
        <div className="py-3">
          <ScopePicker
            idPrefix={`new-key-scope-${accountId}`}
            value={scopes}
            onChange={setScopes}
            error={scopes.length === 0 ? t("apiKey.scopesRequired") : undefined}
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            intent="invert"
            className="btn-no-lift"
            loading={isCreating}
            disabled={!ready}
            data-testid={`new-key-submit-${accountId}`}
          >
            {t("developer.keys.create")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function KeysPanel({
  accountId,
  suspended,
  onReveal,
}: {
  accountId: string;
  suspended: boolean;
  onReveal: RevealSecret;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const keys = useAppSelector(selectServiceAccountKeys(accountId));
  const status = useAppSelector(selectServiceAccountKeysStatus(accountId));
  const canManage = useAppSelector(
    selectProjectCan(PROJECT_PERMISSION.KEYS_MANAGE),
  );

  useEffect(() => {
    dispatch(fetchServiceAccountKeys(accountId));
  }, [dispatch, accountId]);

  return (
    <div className="flex flex-col gap-3">
      {status === "loading" || status === "idle" ? (
        <Spinner size="sm" className="text-ink-subtle" />
      ) : status === "failed" ? (
        <p className="text-danger text-xs">
          {t("serviceAccounts.keys.loadFailed")}
        </p>
      ) : keys.length === 0 ? (
        <p className="text-ink-muted text-xs">
          {t("serviceAccounts.keys.empty")}
        </p>
      ) : (
        <div className="divide-y divide-overlay/10 overflow-hidden rounded-lg border border-overlay/10">
          {keys.map((apiKey) => (
            <KeyRow
              key={apiKey.id}
              accountId={accountId}
              apiKey={apiKey}
              canManage={canManage && !suspended}
              onReveal={onReveal}
            />
          ))}
        </div>
      )}
      {canManage && !suspended && (
        <NewKeyForm accountId={accountId} onReveal={onReveal} />
      )}
    </div>
  );
}
