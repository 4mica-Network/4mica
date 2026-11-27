import { Button, Card, InputField } from "@4mica/ui";
import { useAppSelector } from "@stores/hooks";
import { selectUser } from "@stores/user/selector";
import { isNotFound, toMessage } from "@utils/http-errors";
import { m } from "framer-motion";
import { CircleCheck, CircleX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  approveCliDeviceRequest,
  type CliDeviceRequest,
  denyCliDeviceRequest,
  getCliDeviceRequest,
} from "@/api/cli";
import { PageSpinner } from "@/components/PageSpinner";
import { usePageTitle } from "@/hooks/usePageTitle";
import { links } from "@/lib/links";

type Stage =
  | { name: "enter" }
  | { name: "loading" }
  | { name: "unknown" }
  | { name: "review"; request: CliDeviceRequest }
  | { name: "approved" }
  | { name: "denied" };

const SCOPE_KEYS: Record<string, string> = {
  "account:read": "developer.cli.authorize.scope.accountRead",
  "wallets:read": "developer.cli.authorize.scope.walletsRead",
  "wallets:write": "developer.cli.authorize.scope.walletsWrite",
};

function Brand() {
  const { t } = useTranslation();

  return (
    <a
      href={links.website}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 opacity-90 transition-opacity hover:opacity-100"
    >
      <img
        src="/icon.png"
        alt=""
        width={33}
        height={24}
        className="h-6 w-auto"
      />
      <span className="font-semibold text-ink-strong text-lg tracking-tight">
        {t("auth.signIn.brand")}
      </span>
    </a>
  );
}

function Heading({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-semibold text-base text-ink-strong">{title}</h1>
      {body && <p className="break-words text-ink-muted text-sm">{body}</p>}
    </div>
  );
}

const SOFT = "bg-overlay/5 font-normal hover:bg-overlay/10";

export function CliAuthorize() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const code = params.get("code")?.trim() ?? "";

  const [stage, setStage] = useState<Stage>(
    code ? { name: "loading" } : { name: "enter" },
  );
  const [typed, setTyped] = useState("");
  const [deciding, setDeciding] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  usePageTitle(t("developer.cli.authorize.title"));

  const lookUp = useCallback(async (userCode: string) => {
    setStage({ name: "loading" });
    setError(null);
    try {
      setStage({
        name: "review",
        request: await getCliDeviceRequest(userCode),
      });
    } catch (cause) {
      if (isNotFound(cause)) {
        setStage({ name: "unknown" });
        return;
      }
      setStage({ name: "enter" });
      setError(toMessage(cause, ""));
    }
  }, []);

  useEffect(() => {
    if (code) {
      void lookUp(code);
    } else {
      setStage({ name: "enter" });
    }
  }, [code, lookUp]);

  const decide = async (decision: "approve" | "deny", userCode: string) => {
    setDeciding(decision);
    setError(null);
    try {
      if (decision === "approve") {
        await approveCliDeviceRequest(userCode);
        setStage({ name: "approved" });
      } else {
        await denyCliDeviceRequest(userCode);
        setStage({ name: "denied" });
      }
    } catch (cause) {
      if (isNotFound(cause)) {
        setStage({ name: "unknown" });
      } else {
        setError(toMessage(cause, ""));
      }
    } finally {
      setDeciding(null);
    }
  };

  const startOver = () => {
    setTyped("");
    setParams({}, { replace: true });
  };

  return (
    <m.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 overflow-y-auto bg-surface-deep p-4 sm:p-6"
    >
      <Brand />

      <Card className="flex w-full max-w-sm flex-col gap-5 px-5 py-5 sm:px-6">
        {stage.name === "loading" && <PageSpinner />}

        {stage.name === "enter" && (
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (typed.trim()) {
                setParams({ code: typed.trim() }, { replace: true });
              }
            }}
          >
            <Heading
              title={t("developer.cli.authorize.title")}
              body={t("developer.cli.authorize.enterBody")}
            />
            <InputField
              id="cli-user-code"
              aria-label={t("developer.cli.authorize.codeLabel")}
              value={typed}
              placeholder="XXXX-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={32}
              className="text-center tracking-widest"
              onChange={(event) => setTyped(event.target.value)}
            />
            <Button
              type="submit"
              intent="invert"
              block
              disabled={!typed.trim()}
            >
              {t("developer.cli.authorize.continue")}
            </Button>
          </form>
        )}

        {stage.name === "review" && (
          <>
            <Heading
              title={t("developer.cli.authorize.title")}
              body={user?.email ?? user?.name ?? undefined}
            />

            <div className="flex flex-col items-center gap-1 rounded-md bg-overlay/5 px-3 py-4">
              <span
                className="select-all font-semibold text-2xl text-ink-strong tabular-nums tracking-[0.2em]"
                data-testid="cli-user-code"
              >
                {stage.request.userCode}
              </span>
              <span className="text-center text-ink-muted text-xs">
                {t("developer.cli.authorize.codeHint")}
              </span>
            </div>

            <dl className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-ink-muted">
                  {t("developer.cli.authorize.device")}
                </dt>
                <dd className="min-w-0 truncate text-ink-strong">
                  {stage.request.clientName}
                </dd>
              </div>
              {stage.request.requestIp && (
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-ink-muted">
                    {t("developer.cli.authorize.ip")}
                  </dt>
                  <dd className="min-w-0 truncate text-ink-strong tabular-nums">
                    {stage.request.requestIp}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-ink-muted">
                  {t("developer.cli.authorize.access")}
                </dt>
                <dd className="text-right text-ink-strong">
                  {stage.request.scopes
                    .map((scope) =>
                      SCOPE_KEYS[scope] ? t(SCOPE_KEYS[scope]) : scope,
                    )
                    .join(", ")}
                </dd>
              </div>
            </dl>

            <p className="text-ink-muted text-xs">
              {t("developer.cli.authorize.noFunds")}
            </p>

            <div className="flex gap-3">
              <Button
                type="button"
                intent="soft"
                block
                className={SOFT}
                disabled={deciding !== null}
                loading={deciding === "deny"}
                onClick={() => void decide("deny", stage.request.userCode)}
              >
                {t("developer.cli.authorize.deny")}
              </Button>
              <Button
                type="button"
                intent="invert"
                block
                disabled={deciding !== null}
                loading={deciding === "approve"}
                onClick={() => void decide("approve", stage.request.userCode)}
              >
                {t("developer.cli.authorize.approve")}
              </Button>
            </div>
          </>
        )}

        {stage.name === "approved" && (
          <>
            <CircleCheck aria-hidden="true" className="h-6 w-6 text-success" />
            <Heading
              title={t("developer.cli.authorize.approvedTitle")}
              body={t("developer.cli.authorize.approvedBody")}
            />
            <div className="flex flex-col items-center gap-3">
              <Button
                type="button"
                intent="invert"
                block
                onClick={() => navigate("/")}
              >
                {t("developer.cli.authorize.home")}
              </Button>
              <Link
                to="/settings/developer#cli"
                className="text-ink-muted text-sm underline underline-offset-2 transition-colors hover:text-ink-strong"
              >
                {t("developer.cli.authorize.manage")}
              </Link>
            </div>
          </>
        )}

        {stage.name === "denied" && (
          <>
            <CircleX aria-hidden="true" className="h-6 w-6 text-ink-muted" />
            <Heading
              title={t("developer.cli.authorize.deniedTitle")}
              body={t("developer.cli.authorize.deniedBody")}
            />
            <Button
              type="button"
              intent="soft"
              block
              className={SOFT}
              onClick={() => navigate("/")}
            >
              {t("developer.cli.authorize.home")}
            </Button>
          </>
        )}

        {stage.name === "unknown" && (
          <>
            <CircleX aria-hidden="true" className="h-6 w-6 text-ink-muted" />
            <Heading
              title={t("developer.cli.authorize.unknownTitle")}
              body={t("developer.cli.authorize.unknownBody")}
            />
            <Button
              type="button"
              intent="soft"
              block
              className={SOFT}
              onClick={startOver}
            >
              {t("developer.cli.authorize.tryAnother")}
            </Button>
          </>
        )}

        {error !== null && (
          <p role="alert" className="text-danger text-sm">
            {error || t("developer.cli.authorize.failed")}
          </p>
        )}
      </Card>
    </m.main>
  );
}
