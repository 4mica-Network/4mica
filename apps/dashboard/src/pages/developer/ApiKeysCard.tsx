import { Button, EmptyState, InputField, Spinner, Tag } from "@4mica/ui";
import {
  createApiKey,
  deleteApiKey,
  developerPendingKeys,
  revokeApiKey,
} from "@stores/developer/actions";
import {
  selectApiKeys,
  selectDeveloperError,
  selectDeveloperIssues,
  selectIsDeveloperPending,
} from "@stores/developer/selector";
import type { ApiKey } from "@stores/developer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { formatDate } from "@utils/format";
import { KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { SettingsSection, SurfaceCard } from "@/components/layout";
import { useOnSuccess } from "@/hooks/useOnSuccess";

function ApiKeyRow({ apiKey }: { apiKey: ApiKey }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isPending = useAppSelector(
    selectIsDeveloperPending(developerPendingKeys.apiKey(apiKey.id)),
  );
  const isRevoked = Boolean(apiKey.revokedAt);

  return (
    <SurfaceCard className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <p className="mt-0.5 text-ink-subtle text-xs">
          {t("developer.keys.created")} {formatDate(apiKey.createdAt)} ·{" "}
          {t("developer.keys.lastUsed")} {formatDate(apiKey.lastUsedAt)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isPending && <Spinner size="sm" className="text-ink-subtle" />}
        {!isRevoked && (
          <ConfirmAction
            title={t("developer.keys.revokeConfirm", { name: apiKey.name })}
            description={t("developer.keys.revokeConsequence")}
            confirmLabel={t("developer.keys.revoke")}
            onConfirm={() => dispatch(revokeApiKey({ id: apiKey.id }))}
          >
            <Button type="button" size="sm" intent="soft" disabled={isPending}>
              {t("developer.keys.revoke")}
            </Button>
          </ConfirmAction>
        )}
        <ConfirmAction
          title={t("developer.keys.deleteConfirm", { name: apiKey.name })}
          onConfirm={() => dispatch(deleteApiKey({ id: apiKey.id }))}
        >
          <Button
            type="button"
            size="sm"
            intent="ghost"
            aria-label={t("developer.keys.delete")}
            disabled={isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </ConfirmAction>
      </div>
    </SurfaceCard>
  );
}

export function ApiKeysCard() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const apiKeys = useAppSelector(selectApiKeys);
  const issues = useAppSelector(selectDeveloperIssues);
  const error = useAppSelector(selectDeveloperError);
  const isCreating = useAppSelector(selectIsDeveloperPending("createApiKey"));
  const [name, setName] = useState("");

  useOnSuccess(isCreating, error !== null, () => setName(""));

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed || isCreating) {
      return;
    }
    dispatch(createApiKey({ name: trimmed }));
  };

  return (
    <SettingsSection
      title={t("developer.keys.title")}
      description={t("developer.keys.description")}
    >
      <SurfaceCard>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <div className="flex-1">
            <InputField
              id="api-key-name"
              aria-label={t("developer.keys.nameLabel")}
              value={name}
              placeholder={t("developer.keys.namePlaceholder")}
              error={issues.name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            intent="invert"
            className="btn-no-lift min-w-28 shrink-0 whitespace-nowrap border border-transparent py-2.5 text-sm leading-5"
            disabled={!name.trim() || isCreating}
          >
            <span className="flex w-full items-center justify-center">
              {isCreating ? <Spinner size="sm" /> : t("developer.keys.create")}
            </span>
          </Button>
        </form>
      </SurfaceCard>

      {apiKeys.length === 0 ? (
        <EmptyState
          icon={<KeyRound size={20} />}
          title={t("developer.keys.emptyTitle")}
          description={t("developer.keys.emptyDescription")}
          data-testid="api-keys"
        />
      ) : (
        apiKeys.map((apiKey) => <ApiKeyRow key={apiKey.id} apiKey={apiKey} />)
      )}
    </SettingsSection>
  );
}
