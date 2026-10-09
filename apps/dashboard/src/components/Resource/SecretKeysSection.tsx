import { Button, EmptyState, InputField, Spinner, Tag } from "@4mica/ui";
import type { ApiKey } from "@stores/developer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  createResourceKey,
  deleteResourceKey,
  dismissRevealedResourceKey,
  fetchResourceKeys,
  resetResourceKeys,
  resourceKeyPendingKeys,
  revokeResourceKey,
} from "@stores/resourceKey/actions";
import {
  selectIsResourceKeyPending,
  selectResourceKeyError,
  selectResourceKeyIssues,
  selectResourceKeys,
  selectRevealedResourceKey,
} from "@stores/resourceKey/selector";
import type { ResourceRef } from "@stores/shared/type";
import { formatDate } from "@utils/format";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { SettingsSection, SurfaceCard } from "@/components/layout";
import { SecretRevealCard } from "@/components/RevealedSecret";
import { useOnSuccess } from "@/hooks/useOnSuccess";

function SecretKeyRow({
  apiKey,
  resource,
}: {
  apiKey: ApiKey;
  resource: ResourceRef;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isPending = useAppSelector(
    selectIsResourceKeyPending(resourceKeyPendingKeys.row(apiKey.id)),
  );
  const isRevoked = Boolean(apiKey.revokedAt);

  return (
    <li
      className="flex flex-col gap-3 border border-overlay/10 bg-surface-deep/40 px-4 py-3 first:rounded-t-lg last:rounded-b-lg sm:flex-row sm:items-center sm:justify-between [&+&]:border-t-0"
      data-testid={`secret-key-row-${apiKey.id}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-ink-strong text-sm">
            {apiKey.name}
          </span>
          {isRevoked && (
            <Tag size="sm" variant="error">
              {t("appDetail.keys.revoked")}
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
            confirmLabel={t("appDetail.keys.revoke")}
            onConfirm={() => dispatch(revokeResourceKey(resource, apiKey.id))}
            data-testid={`secret-key-revoke-${apiKey.id}`}
          >
            <Button
              type="button"
              size="sm"
              intent="soft"
              disabled={isPending}
              data-testid={`secret-key-revoke-${apiKey.id}`}
            >
              {t("appDetail.keys.revoke")}
            </Button>
          </ConfirmAction>
        )}
        <ConfirmAction
          title={t("developer.keys.deleteConfirm", { name: apiKey.name })}
          onConfirm={() => dispatch(deleteResourceKey(resource, apiKey.id))}
          data-testid={`secret-key-delete-${apiKey.id}`}
        >
          <Button
            type="button"
            size="sm"
            intent="ghost"
            aria-label={t("appDetail.keys.delete")}
            disabled={isPending}
            data-testid={`secret-key-delete-${apiKey.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </ConfirmAction>
      </div>
    </li>
  );
}

export function SecretKeysSection({ resource }: { resource: ResourceRef }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const keys = useAppSelector(selectResourceKeys);
  const revealed = useAppSelector(selectRevealedResourceKey);
  const issues = useAppSelector(selectResourceKeyIssues);
  const error = useAppSelector(selectResourceKeyError);
  const isCreating = useAppSelector(
    selectIsResourceKeyPending("createResourceKey"),
  );
  const [name, setName] = useState("");

  useEffect(() => {
    if (!resource.id) {
      return;
    }

    dispatch(fetchResourceKeys(resource));

    return () => {
      dispatch(resetResourceKeys());
    };
  }, [dispatch, resource.kind, resource.id]);

  useOnSuccess(isCreating, error !== null, () => setName(""));

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed || isCreating) {
      return;
    }
    dispatch(createResourceKey(resource, trimmed));
  };

  return (
    <SettingsSection
      title={t("appDetail.keys.title")}
      description={t("appDetail.keys.lead")}
    >
      <SurfaceCard data-testid="secret-keys">
        <div className="flex flex-col gap-4">
          {revealed && (
            <SecretRevealCard
              title={t("appDetail.keys.revealTitle")}
              plaintext={revealed.plaintext}
              onDismiss={() => dispatch(dismissRevealedResourceKey())}
              className="px-4 py-4"
              data-testid="secret-key-reveal"
            />
          )}

          {keys.length === 0 ? (
            <EmptyState
              icon={<KeyRound size={20} />}
              title={t("appDetail.keys.emptyTitle")}
              description={t("appDetail.keys.emptyDescription")}
              data-testid="secret-keys-empty"
            />
          ) : (
            <ul className="flex flex-col">
              {keys.map((apiKey) => (
                <SecretKeyRow
                  key={apiKey.id}
                  apiKey={apiKey}
                  resource={resource}
                />
              ))}
            </ul>
          )}

          <form
            className="flex flex-col gap-3 rounded-lg border border-overlay/10 border-dashed px-3 py-3 sm:flex-row sm:items-start"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <div className="flex-1">
              <InputField
                id="secret-key-name"
                aria-label={t("appDetail.keys.nameLabel")}
                value={name}
                placeholder={t("appDetail.keys.namePlaceholder")}
                error={issues.name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                data-testid="secret-key-name"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              intent="invert"
              className="btn-no-lift shrink-0 whitespace-nowrap border border-transparent py-2.5 text-sm leading-5"
              disabled={!name.trim() || isCreating}
              data-testid="secret-key-create"
            >
              <span className="flex w-full items-center justify-center">
                {isCreating ? (
                  <Spinner size="sm" />
                ) : (
                  <>
                    <Plus className="mr-1.5 h-4 w-4" />
                    {t("appDetail.keys.create")}
                  </>
                )}
              </span>
            </Button>
          </form>
        </div>
      </SurfaceCard>
    </SettingsSection>
  );
}
