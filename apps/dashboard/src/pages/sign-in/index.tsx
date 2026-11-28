import { Avatar, Button } from "@4mica/ui";
import { safeRedirectPath } from "@4mica/url";
import {
  getPublicInvitationPreview,
  type PublicInvitationPreview,
} from "@api/organization";
import { useAuth, useSignIn } from "@clerk/clerk-react";
import { isClerkAPIResponseError } from "@clerk/clerk-react/errors";
import { useTitle } from "ahooks";
import { m } from "framer-motion";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useSearchParams } from "react-router-dom";
import { SLOW_LOAD_MS } from "@/auth/FullScreenLoader";
import { links } from "@/lib/links";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-4.5 w-4.5">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

const INVITATION_PATH =
  /^\/invitations\/(4mica_inv_[A-Za-z0-9_-]+)\/?(?:[?#].*)?$/;

const invitationTokenOf = (path: string): string | null =>
  INVITATION_PATH.exec(path)?.[1] ?? null;

function useInvitationContext(
  token: string | null,
): PublicInvitationPreview | null {
  const [preview, setPreview] = useState<PublicInvitationPreview | null>(null);

  useEffect(() => {
    setPreview(null);
    if (!token) {
      return;
    }
    let active = true;
    getPublicInvitationPreview(token)
      .then((result) => {
        if (active) {
          setPreview(result);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);

  return preview;
}

function InvitationContext({ preview }: { preview: PublicInvitationPreview }) {
  const { t } = useTranslation();
  const values = {
    inviter: preview.invitedBy?.name ?? "",
    organization: preview.organization.name,
    email: preview.emailHint,
  };
  return (
    <div
      role="status"
      className="mb-6 flex w-full items-center gap-3 rounded-lg border border-overlay/10 bg-overlay/5 p-3 text-left"
      data-testid="sign-in-invitation"
    >
      <Avatar
        src={preview.organization.avatarUrl}
        name={preview.organization.name}
        alt=""
        size="sm"
        className="rounded-lg border-0 bg-overlay/15"
      />
      <p className="text-ink-body text-sm">
        {preview.invitedBy
          ? t("auth.signIn.invitation", values)
          : t("auth.signIn.invitationNoInviter", values)}
      </p>
    </div>
  );
}

export function SignInPage() {
  const { t } = useTranslation();
  useTitle(t("auth.signIn.title"));
  const { isLoaded, signIn } = useSignIn();
  const { isSignedIn } = useAuth();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (isLoaded) {
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  const redirectUrlComplete = safeRedirectPath(params.get("redirect_url"));
  const reason = params.get("reason");
  const ssoDomain = reason === "sso_required" ? params.get("domain") : null;
  const [email, setEmail] = useState("");
  const invitation = useInvitationContext(
    isSignedIn ? null : invitationTokenOf(redirectUrlComplete),
  );

  const signInWith = async (
    options:
      | { strategy: "oauth_google" }
      | { strategy: "enterprise_sso"; identifier: string },
  ) => {
    if (!isLoaded || redirecting) {
      return;
    }

    setError(null);
    setRedirecting(true);

    try {
      await signIn.authenticateWithRedirect({
        ...options,
        redirectUrl: "/sso-callback",
        redirectUrlComplete,
      });
    } catch (err) {
      setRedirecting(false);
      setError(
        isClerkAPIResponseError(err)
          ? (err.errors[0]?.longMessage ?? t("auth.signIn.error"))
          : t("auth.signIn.error"),
      );
    }
  };

  if (isSignedIn) {
    return <Navigate to={redirectUrlComplete} replace />;
  }

  return (
    <m.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex min-h-dvh w-full flex-col overflow-y-auto bg-surface-deep"
    >
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-24 p-10">
        <div className="flex flex-col items-center">
          <h1 className="text-center font-semibold text-3xl text-ink-strong tracking-tight">
            {t("auth.signIn.title")}
          </h1>

          <div className="mt-10 flex w-91.25 max-w-full flex-col items-center">
            {reason === "session_too_old" && (
              <p
                role="status"
                className="mb-6 text-center text-ink-muted text-sm"
                data-testid="sign-in-reason"
              >
                {t("auth.signIn.sessionTooOld")}
              </p>
            )}

            {ssoDomain && (
              <form
                className="mb-6 flex w-full flex-col gap-3"
                data-testid="sign-in-sso"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (email.trim()) {
                    void signInWith({
                      strategy: "enterprise_sso",
                      identifier: email.trim(),
                    });
                  }
                }}
              >
                <p className="text-center text-ink-muted text-sm">
                  {t("auth.signIn.ssoRequired", { domain: ssoDomain })}
                </p>
                <input
                  id="sign-in-sso-email"
                  type="email"
                  autoComplete="email"
                  aria-label={t("auth.signIn.ssoEmail")}
                  placeholder={`name@${ssoDomain}`}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 w-full rounded-md border border-overlay/15 bg-overlay/5 px-3 text-ink-strong text-sm outline-none focus-visible:ring-1 focus-visible:ring-overlay/60"
                />
                <Button
                  type="submit"
                  intent="invert"
                  block
                  disabled={!isLoaded || !email.trim()}
                  loading={redirecting}
                  className="h-12 text-sm"
                >
                  {t("auth.signIn.ssoContinue")}
                </Button>
              </form>
            )}

            {invitation && <InvitationContext preview={invitation} />}

            <Button
              type="button"
              intent="soft"
              block
              disabled={!isLoaded}
              loading={redirecting}
              onClick={() => void signInWith({ strategy: "oauth_google" })}
              icon={<GoogleIcon />}
              className="h-12 gap-2 rounded-md bg-overlay/5 font-normal text-sm hover:bg-overlay/10"
            >
              {t("auth.signIn.google")}
            </Button>

            {error && (
              <p role="alert" className="mt-6 text-center text-danger text-sm">
                {error}
              </p>
            )}

            {!isLoaded && slow && (
              <p
                role="status"
                className="mt-6 text-center text-ink-muted text-sm"
              >
                {t("loader.slow")}
              </p>
            )}

            <p className="mt-6 text-center text-ink-muted text-xs">
              {t("auth.signIn.help")}{" "}
              <a
                href={links.mailto.support}
                className="text-brand underline underline-offset-2"
              >
                {t("auth.signIn.contact")}
              </a>
            </p>
          </div>
        </div>

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
      </div>
    </m.main>
  );
}
