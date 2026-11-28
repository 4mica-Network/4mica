import { Avatar, Button, Card } from "@4mica/ui";
import { useClerk } from "@clerk/clerk-react";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  acceptInvitation,
  declineInvitation,
  fetchInvitation,
  organizationPendingKeys,
} from "@stores/organization/actions";
import {
  selectInvitation,
  selectIsOrganizationPending,
} from "@stores/organization/selector";
import { formatDate } from "@utils/format";
import { CircleX, MailX, SearchX, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { PageSpinner } from "@/components/PageSpinner";
import { usePageTitle } from "@/hooks/usePageTitle";

const FAILURES: Record<string, { key: string; icon: ReactNode }> = {
  invitation_unavailable: {
    key: "invitation.unavailable",
    icon: <MailX aria-hidden="true" className="h-5 w-5" />,
  },
  invitation_email_mismatch: {
    key: "invitation.mismatch",
    icon: <CircleX aria-hidden="true" className="h-5 w-5" />,
  },
  not_found: {
    key: "invitation.notFound",
    icon: <SearchX aria-hidden="true" className="h-5 w-5" />,
  },
};

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-surface-deep p-6 text-ink-body">
      <Card className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        {children}
      </Card>
    </div>
  );
}

function Message({
  icon,
  title,
  body,
  testId,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  testId: string;
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Frame>
      <span className="grid h-10 w-10 place-items-center rounded-full bg-overlay/10 text-ink-muted">
        {icon}
      </span>
      <div data-testid={testId}>
        <h1 className="font-semibold text-ink-strong text-lg">{title}</h1>
        <p className="mt-1 text-ink-muted text-sm">{body}</p>
      </div>
      {action}
      <Button
        type="button"
        intent="outline"
        size="sm"
        onClick={() => navigate("/", { replace: true })}
      >
        {t("invitation.home")}
      </Button>
    </Frame>
  );
}

function SwitchAccount({ token }: { token: string }) {
  const { t } = useTranslation();
  const { signOut } = useClerk();
  const [leaving, setLeaving] = useState(false);
  return (
    <Button
      type="button"
      intent="invert"
      size="sm"
      className="btn-no-lift"
      loading={leaving}
      onClick={() => {
        setLeaving(true);
        void signOut({
          redirectUrl: `/invitations/${encodeURIComponent(token)}`,
        });
      }}
      data-testid="invitation-switch-account"
    >
      {t("invitation.mismatch.switchAccount")}
    </Button>
  );
}

export function InvitationPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { token = "" } = useParams();
  const invitation = useAppSelector(selectInvitation);
  const accepting = useAppSelector(
    selectIsOrganizationPending(organizationPendingKeys.accept),
  );
  const declining = useAppSelector(
    selectIsOrganizationPending(organizationPendingKeys.decline),
  );
  usePageTitle(t("invitation.title"));

  const current = invitation.token === token;

  useEffect(() => {
    if (token && !current) {
      dispatch(fetchInvitation(token));
    }
  }, [current, dispatch, token]);

  if (
    !current ||
    invitation.status === "loading" ||
    invitation.status === "idle"
  ) {
    return <PageSpinner />;
  }

  if (invitation.status === "accepted") {
    return <Navigate to="/" replace />;
  }

  if (invitation.status === "declined") {
    return (
      <Message
        icon={<MailX aria-hidden="true" className="h-5 w-5" />}
        title={t("invitation.declined.title")}
        body={t("invitation.declined.body")}
        testId="invitation-declined"
      />
    );
  }

  if (invitation.status === "failed") {
    const failure = FAILURES[invitation.errorCode ?? ""];
    if (invitation.errorCode === "invitation_email_mismatch" && failure) {
      return (
        <Message
          icon={failure.icon}
          title={t("invitation.mismatch.title")}
          body={
            invitation.preview
              ? t("invitation.mismatch.sentTo", {
                  email: invitation.preview.email,
                })
              : t("invitation.mismatch.body")
          }
          testId="invitation-invitation_email_mismatch"
          action={<SwitchAccount token={token} />}
        />
      );
    }
    return failure ? (
      <Message
        icon={failure.icon}
        title={t(`${failure.key}.title`)}
        body={t(`${failure.key}.body`)}
        testId={`invitation-${invitation.errorCode}`}
      />
    ) : (
      <Message
        icon={<TriangleAlert aria-hidden="true" className="h-5 w-5" />}
        title={t("invitation.error.title")}
        body={invitation.error ?? ""}
        testId="invitation-error"
      />
    );
  }

  const preview = invitation.preview;
  if (!preview) {
    return <PageSpinner />;
  }

  const values = {
    organization: preview.organization.name,
    role: t(`organization.role.${preview.role}`),
    inviter: preview.invitedBy?.name ?? "",
  };

  return (
    <Frame>
      <Avatar
        src={preview.organization.avatarUrl}
        name={preview.organization.name}
        alt=""
        size="md"
        className="border-0 bg-overlay/15 text-ink-strong"
      />
      <div data-testid="invitation-preview">
        <h1 className="font-semibold text-ink-strong text-lg">
          {t("invitation.title")}
        </h1>
        <p className="mt-1 text-ink-body text-sm">
          {preview.invitedBy
            ? t("invitation.body", values)
            : t("invitation.bodyNoInviter", values)}
        </p>
        <p className="mt-2 text-ink-muted text-xs">
          {t("invitation.details", {
            email: preview.email,
            date: formatDate(preview.expiresAt),
          })}
        </p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:flex-row-reverse">
        <Button
          type="button"
          intent="invert"
          size="sm"
          className="btn-no-lift flex-1"
          loading={accepting}
          disabled={declining}
          onClick={() => dispatch(acceptInvitation(token))}
          data-testid="invitation-accept"
        >
          {t("invitation.accept")}
        </Button>
        <Button
          type="button"
          intent="ghost"
          size="sm"
          className="btn-no-lift flex-1"
          loading={declining}
          disabled={accepting}
          onClick={() => dispatch(declineInvitation(token))}
          data-testid="invitation-decline"
        >
          {t("invitation.decline")}
        </Button>
      </div>
    </Frame>
  );
}
