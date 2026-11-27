import { Button, Card, EmptyState, Tag } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  selectActiveOrganization,
  selectCan,
} from "@stores/organization/selector";
import { PERMISSION } from "@stores/organization/type";
import {
  fetchSecurity,
  runSecurityOp,
  securityPendingKeys,
  selectIsSecurityPending,
  selectSecurityCollection,
  selectSecurityFailure,
} from "@stores/security";
import type {
  AuditStream,
  AuditStreamStatus,
  RevealedSecuritySecret,
} from "@stores/security/type";
import { formatDateTime } from "@utils/format";
import {
  FlaskConical,
  Pause,
  Play,
  Radio,
  RotateCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FieldRow, TextInput } from "@/components/form";
import { SectionCard, SettingsSection } from "@/components/layout";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import {
  OneTimeSecret,
  ReadOnlyNotice,
  Unavailable,
} from "@/components/SecurityNotice";
import { SettingsPage } from "@/components/SettingsPage";
import { Spinner } from "@/components/Spinner";
import { useEphemeralSecret } from "@/hooks/useEphemeralSecret";
import { useOnSuccess } from "@/hooks/useOnSuccess";
import {
  backfillBounds,
  isHttpsUrl,
  parsePrefixes,
  SIGNATURE_HEADER,
  verificationSnippet,
} from "./snippet";

const STATUS_VARIANT: Record<
  AuditStreamStatus,
  "success" | "neutral" | "error"
> = {
  ACTIVE: "success",
  PAUSED: "neutral",
  FAILING: "error",
};

function CreateStream({
  onReveal,
}: {
  onReveal: (secret: RevealedSecuritySecret) => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const key = securityPendingKeys.op("createStream");
  const isCreating = useAppSelector(selectIsSecurityPending(key));
  const failure = useAppSelector(selectSecurityFailure(key));
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [prefixes, setPrefixes] = useState("");
  const [backfillFrom, setBackfillFrom] = useState("");
  const bounds = backfillBounds();

  useOnSuccess(isCreating, failure !== null, () => {
    setName("");
    setUrl("");
    setPrefixes("");
    setBackfillFrom("");
  });

  const urlError =
    url.trim() && !isHttpsUrl(url.trim())
      ? t("security.streams.errors.https")
      : failure?.issues.url;
  const backfillError =
    backfillFrom && (backfillFrom < bounds.min || backfillFrom > bounds.max)
      ? t("security.streams.errors.backfill")
      : failure?.issues.backfillFrom;
  const canSubmit =
    name.trim() !== "" && isHttpsUrl(url.trim()) && !backfillError;

  return (
    <SectionCard
      title={t("security.streams.createTitle")}
      description={t("security.streams.createDescription")}
      data-testid="stream-create"
    >
      <form
        className="flex flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit || isCreating) {
            return;
          }
          dispatch(
            runSecurityOp(
              {
                op: "createStream",
                data: {
                  name: name.trim(),
                  url: url.trim(),
                  actionPrefixes: parsePrefixes(prefixes),
                  ...(backfillFrom
                    ? { backfillFrom: `${backfillFrom}T00:00:00.000Z` }
                    : {}),
                },
              },
              onReveal,
            ),
          );
        }}
      >
        <FieldRow
          title={t("security.streams.fields.name")}
          htmlFor="stream-name"
        >
          <TextInput
            id="stream-name"
            value={name}
            maxLength={120}
            error={failure?.issues.name}
            onChange={setName}
          />
        </FieldRow>
        <FieldRow
          title={t("security.streams.fields.url")}
          description={t("security.streams.fields.urlHint")}
          htmlFor="stream-url"
        >
          <TextInput
            id="stream-url"
            type="url"
            value={url}
            placeholder="https://siem.example.com/4mica"
            error={urlError}
            onChange={setUrl}
          />
        </FieldRow>
        <FieldRow
          title={t("security.streams.fields.prefixes")}
          description={t("security.streams.fields.prefixesHint")}
          htmlFor="stream-prefixes"
        >
          <TextInput
            id="stream-prefixes"
            value={prefixes}
            placeholder="member., security., payment."
            onChange={setPrefixes}
          />
        </FieldRow>
        <FieldRow
          title={t("security.streams.fields.backfill")}
          description={t("security.streams.fields.backfillHint")}
          htmlFor="stream-backfill"
        >
          <TextInput
            id="stream-backfill"
            type="date"
            value={backfillFrom}
            error={backfillError}
            onChange={setBackfillFrom}
          />
        </FieldRow>
        <div className="flex justify-end pt-3">
          <Button
            type="submit"
            size="sm"
            intent="invert"
            className="btn-no-lift min-w-28"
            loading={isCreating}
            disabled={!canSubmit}
            data-testid="stream-create-submit"
          >
            {t("security.streams.create")}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

function StreamRow({
  stream,
  canManage,
  onReveal,
}: {
  stream: AuditStream;
  canManage: boolean;
  onReveal: (secret: RevealedSecuritySecret) => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [confirm, setConfirm] = useState<"rotate" | "delete" | null>(null);
  const busy = useAppSelector((state) =>
    (
      [
        "updateStream",
        "rotateStream",
        "testStream",
        "resumeStream",
        "deleteStream",
      ] as const
    ).some((op) =>
      selectIsSecurityPending(securityPendingKeys.op(op, stream.id))(state),
    ),
  );

  return (
    <Card
      className="flex flex-col gap-3"
      data-testid={`stream-row-${stream.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-ink-strong text-sm">
              {stream.name}
            </span>
            <Tag
              size="sm"
              variant={STATUS_VARIANT[stream.status]}
              data-testid={`stream-status-${stream.id}`}
            >
              {t(`security.streams.status.${stream.status}`)}
            </Tag>
          </div>
          <p className="mt-0.5 truncate font-mono text-ink-muted text-xs">
            {stream.url}
          </p>
          <p className="mt-1 text-ink-subtle text-xs">
            {stream.actionPrefixes.length > 0
              ? t("security.streams.prefixes", {
                  prefixes: stream.actionPrefixes.join(", "),
                })
              : t("security.streams.allEvents")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {busy && <Spinner size="sm" className="text-ink-subtle" />}
          {canManage && (
            <RowActionsMenu
              label={t("security.streams.actions", { name: stream.name })}
              disabled={busy}
              data-testid={`stream-actions-${stream.id}`}
            >
              <RowActionsMenu.Item
                icon={FlaskConical}
                onSelect={() =>
                  dispatch(runSecurityOp({ op: "testStream", id: stream.id }))
                }
                data-testid={`stream-test-${stream.id}`}
              >
                {t("security.streams.test")}
              </RowActionsMenu.Item>
              {stream.status === "ACTIVE" ? (
                <RowActionsMenu.Item
                  icon={Pause}
                  onSelect={() =>
                    dispatch(
                      runSecurityOp({
                        op: "updateStream",
                        id: stream.id,
                        data: { status: "PAUSED" },
                      }),
                    )
                  }
                  data-testid={`stream-pause-${stream.id}`}
                >
                  {t("security.streams.pause")}
                </RowActionsMenu.Item>
              ) : (
                <RowActionsMenu.Item
                  icon={Play}
                  onSelect={() =>
                    dispatch(
                      runSecurityOp({ op: "resumeStream", id: stream.id }),
                    )
                  }
                  data-testid={`stream-resume-${stream.id}`}
                >
                  {t("security.streams.resume")}
                </RowActionsMenu.Item>
              )}
              <RowActionsMenu.Item
                icon={RotateCw}
                onSelect={() => setConfirm("rotate")}
                data-testid={`stream-rotate-${stream.id}`}
              >
                {t("security.streams.rotate")}
              </RowActionsMenu.Item>
              <RowActionsMenu.Item
                icon={Trash2}
                tone="danger"
                onSelect={() => setConfirm("delete")}
                data-testid={`stream-delete-${stream.id}`}
              >
                {t("security.streams.delete")}
              </RowActionsMenu.Item>
            </RowActionsMenu>
          )}
        </div>
      </div>

      <dl
        className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2"
        data-testid={`stream-health-${stream.id}`}
      >
        <div className="flex justify-between gap-2">
          <dt className="text-ink-subtle">
            {t("security.streams.lastDelivery")}
          </dt>
          <dd className="text-ink-body">
            {formatDateTime(stream.lastDeliveryAt)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-subtle">
            {t("security.streams.lastStatus")}
          </dt>
          <dd className="text-ink-body">{stream.lastStatusCode ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-subtle">{t("security.streams.failures")}</dt>
          <dd className="text-ink-body">{stream.consecutiveFailures}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-subtle">
            {t("security.streams.nextAttempt")}
          </dt>
          <dd className="text-ink-body">
            {formatDateTime(stream.nextAttemptAt)}
          </dd>
        </div>
      </dl>
      {stream.lastError && (
        <p
          className="flex items-start gap-2 text-danger text-xs"
          data-testid={`stream-error-${stream.id}`}
        >
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          {stream.lastError}
        </p>
      )}

      <ConfirmDialog
        isOpen={confirm !== null}
        title={
          confirm === "rotate"
            ? t("security.streams.rotateTitle", { name: stream.name })
            : t("security.streams.deleteTitle", { name: stream.name })
        }
        confirmLabel={
          confirm === "rotate"
            ? t("security.streams.rotate")
            : t("security.streams.delete")
        }
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          dispatch(
            confirm === "rotate"
              ? runSecurityOp({ op: "rotateStream", id: stream.id }, onReveal)
              : runSecurityOp({ op: "deleteStream", id: stream.id }),
          );
          setConfirm(null);
        }}
        data-testid={`stream-confirm-${stream.id}`}
      >
        <p>
          {confirm === "rotate"
            ? t("security.streams.rotateBody")
            : t("security.streams.deleteBody")}
        </p>
      </ConfirmDialog>
    </Card>
  );
}

function Streams() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const canManage = useAppSelector(selectCan(PERMISSION.SECURITY_MANAGE));
  const streams = useAppSelector(selectSecurityCollection("streams"));
  const { secret, reveal, clear } =
    useEphemeralSecret<RevealedSecuritySecret>();

  useEffect(() => {
    dispatch(fetchSecurity("streams"));
  }, [dispatch]);

  return (
    <>
      {!canManage && (
        <ReadOnlyNotice
          message={t("security.streams.readOnly")}
          testId="streams-read-only"
        />
      )}

      {secret?.kind === "streamSecret" && (
        <OneTimeSecret
          title={t("security.streams.secretTitle", { name: secret.name })}
          values={[
            { label: t("security.streams.secret"), value: secret.secret },
            {
              label: t("security.streams.snippet", {
                header: SIGNATURE_HEADER,
              }),
              value: verificationSnippet(),
              block: true,
            },
          ]}
          onDismiss={clear}
          data-testid="stream-secret"
        />
      )}

      {canManage && <CreateStream onReveal={reveal} />}

      <SettingsSection
        title={t("security.streams.title")}
        description={t("security.streams.description")}
      >
        {streams.status === "failed" ? (
          <EmptyState
            icon={<TriangleAlert className="h-5 w-5" />}
            title={t("security.loadFailed")}
            description={streams.error ?? undefined}
            action={{
              label: t("security.retry"),
              onClick: () => dispatch(fetchSecurity("streams")),
            }}
          />
        ) : streams.status !== "loaded" ? (
          <Spinner size="sm" className="text-ink-subtle" />
        ) : streams.items.length === 0 ? (
          <EmptyState
            variant="dashed"
            size="sm"
            icon={<Radio className="h-5 w-5" />}
            title={t("security.streams.empty")}
            data-testid="streams-empty"
          />
        ) : (
          streams.items.map((stream) => (
            <StreamRow
              key={stream.id}
              stream={stream}
              canManage={canManage}
              onReveal={reveal}
            />
          ))
        )}
      </SettingsSection>
    </>
  );
}

export function AuditStreamsSettings() {
  const organization = useAppSelector(selectActiveOrganization);
  const canRead = useAppSelector(selectCan(PERMISSION.AUDIT_READ));

  return (
    <SettingsPage
      titleKey="page.settings.auditStreams.title"
      descriptionKey="page.settings.auditStreams.description"
    >
      {!canRead || organization?.personal ? (
        <Unavailable
          personal={Boolean(organization?.personal)}
          testId="streams-unavailable"
        />
      ) : (
        <Streams />
      )}
    </SettingsPage>
  );
}
