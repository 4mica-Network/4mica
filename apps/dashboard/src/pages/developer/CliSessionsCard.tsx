import { Button, Card, EmptyState, InputField, Tag } from "@4mica/ui";
import {
  createCliToken,
  developerPendingKeys,
  revokeCliSession,
  selectCliSessions,
  selectDeveloperError,
  selectIsDeveloperPending,
} from "@stores/developer";
import type { CliSession, RevealSecret } from "@stores/developer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { formatDate } from "@utils/format";
import { Terminal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { SettingsSection } from "@/components/layout";
import { Spinner } from "@/components/Spinner";
import { useOnSuccess } from "@/hooks/useOnSuccess";

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
  const error = useAppSelector(selectDeveloperError);
  const isCreating = useAppSelector(selectIsDeveloperPending("createCliToken"));
  const [name, setName] = useState("");

  useOnSuccess(isCreating, error !== null, () => setName(""));

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed || isCreating) {
      return;
    }
    dispatch(createCliToken({ name: trimmed }, onReveal));
  };

  return (
    <SettingsSection
      id="cli"
      title={t("developer.cli.title")}
      description={t("developer.cli.description")}
    >
      <Card>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
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
        </form>
      </Card>

      {sessions.length === 0 ? (
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
