import { Button, EmptyState, Spinner, Switch, Tag } from "@4mica/ui";
import {
  createWebhook,
  deleteWebhook,
  developerPendingKeys,
  rotateWebhookSecret,
  updateWebhook,
} from "@stores/developer/actions";
import {
  selectDeveloperError,
  selectDeveloperIssues,
  selectIsDeveloperPending,
  selectWebhookEvents,
  selectWebhooks,
} from "@stores/developer/selector";
import type { Webhook } from "@stores/developer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { Trash2, Webhook as WebhookIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { ComboBox, FieldRow, TextInput } from "@/components/form";
import { SettingsSection, SurfaceCard } from "@/components/layout";
import { useOnSuccess } from "@/hooks/useOnSuccess";

function WebhookRow({ webhook }: { webhook: Webhook }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const events = useAppSelector(selectWebhookEvents);
  const isPending = useAppSelector(
    selectIsDeveloperPending(developerPendingKeys.webhook(webhook.id)),
  );
  const [expanded, setExpanded] = useState(false);

  const options = useMemo(
    () => events.map((e) => ({ title: e.slug, value: e.slug })),
    [events],
  );

  const enabled = webhook.status === "ENABLED";

  return (
    <SurfaceCard className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-strong text-sm">
            {webhook.url}
          </p>
          {webhook.description && (
            <p className="mt-0.5 truncate text-ink-muted text-xs">
              {webhook.description}
            </p>
          )}
          <p className="mt-1 font-mono text-ink-subtle text-xs">
            {webhook.secretPrefix}…
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isPending && <Spinner size="sm" className="text-ink-subtle" />}
          <Tag size="sm" variant={enabled ? "success" : "neutral"}>
            {enabled
              ? t("developer.webhooks.enabled")
              : t("developer.webhooks.disabled")}
          </Tag>
          <Switch
            data-testid={`webhook-${webhook.id}`}
            aria-label={t("developer.webhooks.toggle", { url: webhook.url })}
            initialState={enabled}
            disabled={isPending}
            onToggle={(next) =>
              dispatch(
                updateWebhook({
                  id: webhook.id,
                  data: { status: next ? "ENABLED" : "DISABLED" },
                }),
              )
            }
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {webhook.events.map((slug) => (
          <Tag key={slug} size="sm" variant="default">
            {slug}
          </Tag>
        ))}
      </div>

      {expanded && (
        <div className="border-overlay/10 border-t pt-3">
          <FieldRow
            title={t("developer.webhooks.events")}
            description={t("developer.webhooks.eventsHint")}
          >
            <ComboBox
              data-testid={`webhook-events-${webhook.id}`}
              options={options}
              selectedValues={webhook.events}
              placeholder={t("developer.webhooks.selectEvents")}
              disabled={isPending}
              onChange={(selected) => {
                if (selected.length === 0) {
                  return;
                }
                dispatch(
                  updateWebhook({
                    id: webhook.id,
                    data: { events: selected.map(String) },
                  }),
                );
              }}
            />
          </FieldRow>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          intent="ghost"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? t("developer.webhooks.done")
            : t("developer.webhooks.editEvents")}
        </Button>

        <div className="flex items-center gap-2">
          <ConfirmAction
            title={t("developer.webhooks.rotateConfirm")}
            description={t("developer.webhooks.rotateConsequence")}
            confirmLabel={t("developer.webhooks.rotate")}
            onConfirm={() => dispatch(rotateWebhookSecret({ id: webhook.id }))}
          >
            <Button type="button" size="sm" intent="soft" disabled={isPending}>
              {t("developer.webhooks.rotate")}
            </Button>
          </ConfirmAction>
          <ConfirmAction
            title={t("developer.webhooks.deleteConfirm", { url: webhook.url })}
            onConfirm={() => dispatch(deleteWebhook({ id: webhook.id }))}
          >
            <Button
              type="button"
              size="sm"
              intent="ghost"
              aria-label={t("developer.webhooks.delete", { url: webhook.url })}
              disabled={isPending}
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </Button>
          </ConfirmAction>
        </div>
      </div>
    </SurfaceCard>
  );
}

export function WebhooksCard() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const webhooks = useAppSelector(selectWebhooks);
  const events = useAppSelector(selectWebhookEvents);
  const issues = useAppSelector(selectDeveloperIssues);
  const error = useAppSelector(selectDeveloperError);
  const isCreating = useAppSelector(selectIsDeveloperPending("createWebhook"));

  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Array<string | number>>([]);

  const options = useMemo(
    () => events.map((e) => ({ title: e.slug, value: e.slug })),
    [events],
  );

  const trimmedUrl = url.trim();
  const urlError =
    trimmedUrl === ""
      ? undefined
      : !trimmedUrl.startsWith("https://")
        ? t("validation.httpsUrl")
        : trimmedUrl.length > 2048
          ? t("validation.tooLong", { max: 2048 })
          : undefined;
  const canSubmit =
    trimmedUrl.length > 0 && urlError === undefined && selected.length > 0;

  useOnSuccess(isCreating, error !== null, () => {
    setUrl("");
    setDescription("");
    setSelected([]);
  });

  const create = () => {
    if (!canSubmit || isCreating) {
      return;
    }
    dispatch(
      createWebhook({
        url: trimmedUrl,
        description: description.trim() || null,
        events: selected.map(String),
      }),
    );
  };

  return (
    <SettingsSection
      title={t("developer.webhooks.title")}
      description={t("developer.webhooks.description")}
    >
      <SurfaceCard>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <FieldRow
            title={t("developer.webhooks.url")}
            description={t("developer.webhooks.urlHint")}
            htmlFor="webhook-url"
          >
            <TextInput
              type="url"
              inputMode="url"
              value={url}
              placeholder="https://api.example.com/4mica/webhooks"
              error={urlError ?? issues.url}
              maxLength={2048}
              onChange={setUrl}
            />
          </FieldRow>

          <FieldRow
            title={t("developer.webhooks.descriptionLabel")}
            description={t("developer.webhooks.descriptionHint")}
            htmlFor="webhook-description"
          >
            <TextInput
              value={description}
              error={issues.description}
              maxLength={255}
              onChange={setDescription}
            />
          </FieldRow>

          <FieldRow
            title={t("developer.webhooks.events")}
            description={t("developer.webhooks.eventsHint")}
          >
            <ComboBox
              data-testid="webhook-new-events"
              options={options}
              selectedValues={selected}
              placeholder={t("developer.webhooks.selectEvents")}
              onChange={setSelected}
            />
            {issues.events && (
              <p className="mt-2 text-danger text-xs" role="alert">
                {issues.events}
              </p>
            )}
          </FieldRow>

          <div className="-mx-6 mt-5 flex items-center justify-end gap-2 border-overlay/10 border-t px-6 pt-4">
            <Button
              type="submit"
              size="sm"
              intent="invert"
              className="btn-no-lift min-w-28 shrink-0 whitespace-nowrap border border-transparent py-2.5 text-sm leading-5"
              disabled={!canSubmit || isCreating}
            >
              <span className="flex w-full items-center justify-center">
                {isCreating ? (
                  <Spinner size="sm" />
                ) : (
                  t("developer.webhooks.create")
                )}
              </span>
            </Button>
          </div>
        </form>
      </SurfaceCard>

      {webhooks.length === 0 ? (
        <EmptyState
          icon={<WebhookIcon size={20} />}
          title={t("developer.webhooks.emptyTitle")}
          description={t("developer.webhooks.emptyDescription")}
          data-testid="webhooks"
        />
      ) : (
        webhooks.map((webhook) => (
          <WebhookRow key={webhook.id} webhook={webhook} />
        ))
      )}
    </SettingsSection>
  );
}
