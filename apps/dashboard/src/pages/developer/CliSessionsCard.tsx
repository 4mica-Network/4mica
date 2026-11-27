import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  InputField,
  Segmented,
  Tag,
} from "@4mica/ui";
import {
  createCliToken,
  developerPendingKeys,
  fetchCliSessions,
  revokeCliSession,
  selectCliSessions,
  selectCliSessionsState,
  selectDeveloperError,
  selectIsDeveloperPending,
} from "@stores/developer";
import type {
  CliScope,
  CliSession,
  NewCliToken,
  RevealSecret,
} from "@stores/developer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { formatDate } from "@utils/format";
import { Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { RetryState } from "@/components/LoadFailure";
import { SettingsSection } from "@/components/layout";
import { PageSpinner } from "@/components/PageSpinner";
import { Spinner } from "@/components/Spinner";
import { useOnSuccess } from "@/hooks/useOnSuccess";

const CHOOSABLE: { scope: CliScope; key: string }[] = [
  { scope: "wallets:read", key: "developer.cli.authorize.scope.walletsRead" },
  { scope: "wallets:link", key: "developer.cli.authorize.scope.walletsLink" },
  {
    scope: "wallets:unlink",
    key: "developer.cli.authorize.scope.walletsUnlink",
  },
];

const DEFAULT_SCOPES: CliScope[] = ["wallets:read"];

const SCOPE_LABELS: Record<string, string> = {
  "account:read": "developer.cli.authorize.scope.accountRead",
  "wallets:read": "developer.cli.authorize.scope.walletsRead",
  "wallets:link": "developer.cli.authorize.scope.walletsLink",
  "wallets:unlink": "developer.cli.authorize.scope.walletsUnlink",
};

function CliSessionRow({ session }: { session: CliSession }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isPending = useAppSelector(
    selectIsDeveloperPending(developerPendingKeys.cliSession(session.id)),
  );

  return (
    <Card
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid="cli-session"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-ink-strong text-sm">
            {session.name}
          </span>
          <Tag size="sm">
            {session.kind === "DEVICE"
              ? t("developer.cli.kindDevice")
              : t("developer.cli.kindToken")}
          </Tag>
        </div>
        <p className="mt-0.5 font-mono text-ink-muted text-xs">
          {session.prefix}…{session.last4}
        </p>
        <p className="mt-0.5 text-ink-muted text-xs">
          {t("developer.cli.permissions")}:{" "}
          {session.scopes
            .map((scope) =>
              SCOPE_LABELS[scope] ? t(SCOPE_LABELS[scope]) : scope,
            )
            .join(", ")}
        </p>
        <p className="mt-0.5 text-ink-subtle text-xs">
          {t("developer.cli.created")} {formatDate(session.createdAt)} ·{" "}
          {t("developer.cli.lastUsed")} {formatDate(session.lastUsedAt)} ·{" "}
          {t("developer.cli.expires")} {formatDate(session.expiresAt)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isPending && <Spinner size="sm" className="text-ink-subtle" />}
        <ConfirmAction
          title={t("developer.cli.revokeConfirm", { name: session.name })}
          description={t("developer.cli.revokeConsequence")}
          confirmLabel={t("developer.cli.revoke")}
          onConfirm={() => dispatch(revokeCliSession({ id: session.id }))}
        >
          <Button type="button" size="sm" intent="soft" disabled={isPending}>
            {t("developer.cli.revoke")}
          </Button>
        </ConfirmAction>
      </div>
    </Card>
  );
}

export function CliSessionsCard({ onReveal }: { onReveal: RevealSecret }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const sessions = useAppSelector(selectCliSessions);
  const status = useAppSelector(selectCliSessionsState);
  const error = useAppSelector(selectDeveloperError);
  const isCreating = useAppSelector(selectIsDeveloperPending("createCliToken"));
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<CliScope[]>(DEFAULT_SCOPES);
  const [lifetime, setLifetime] = useState<NewCliToken["expiresInDays"]>(90);

  useEffect(() => {
    dispatch(fetchCliSessions());
  }, [dispatch]);

  useOnSuccess(isCreating, error !== null, () => {
    setName("");
    setScopes(DEFAULT_SCOPES);
    setLifetime(90);
  });

  const toggle = (scope: CliScope, on: boolean) =>
    setScopes((current) =>
      on ? [...current, scope] : current.filter((s) => s !== scope),
    );

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed || isCreating) {
      return;
    }
    dispatch(
      createCliToken(
        {
          name: trimmed,
          scopes: ["account:read", ...scopes],
          expiresInDays: lifetime,
        },
        onReveal,
      ),
    );
  };

  return (
    <SettingsSection
      id="cli"
      title={t("developer.cli.title")}
      description={t("developer.cli.description")}
    >
      <Card>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <InputField
                id="cli-token-name"
                aria-label={t("developer.cli.nameLabel")}
                value={name}
                placeholder={t("developer.cli.namePlaceholder")}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              intent="invert"
              className="btn-no-lift min-w-28 shrink-0 whitespace-nowrap border border-transparent py-2.5 text-sm leading-5"
              loading={isCreating}
              disabled={!name.trim()}
            >
              {t("developer.cli.create")}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-ink-muted text-xs">
              {t("developer.cli.permissions")}
            </span>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-5">
              {CHOOSABLE.map(({ scope, key }) => (
                <Checkbox
                  key={scope}
                  variant="square"
                  className="w-auto text-ink-body text-sm"
                  checked={scopes.includes(scope)}
                  onChange={(on) => toggle(scope, on)}
                  data-testid={`cli-scope-${scope}`}
                >
                  {t(key)}
                </Checkbox>
              ))}
            </div>
          </div>

          <Segmented
            label={t("developer.cli.lifetime")}
            value={lifetime}
            options={[
              { value: 30, label: t("developer.cli.lifetime30") },
              { value: 90, label: t("developer.cli.lifetime90") },
              { value: 365, label: t("developer.cli.lifetime365") },
            ]}
            onChange={setLifetime}
          />
        </form>
      </Card>

      {status.isLoading && !status.hasLoaded ? (
        <PageSpinner />
      ) : !status.hasLoaded && status.error ? (
        <RetryState
          message={status.error}
          onRetry={() => dispatch(fetchCliSessions())}
        />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Terminal size={20} />}
          title={t("developer.cli.emptyTitle")}
          description={t("developer.cli.emptyDescription")}
          data-testid="cli-sessions"
        />
      ) : (
        sessions.map((session) => (
          <CliSessionRow key={session.id} session={session} />
        ))
      )}
    </SettingsSection>
  );
}
