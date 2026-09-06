import { Button } from "@4mica/ui";
import { useAuth, useSignIn } from "@clerk/clerk-react";
import { isClerkAPIResponseError } from "@clerk/clerk-react/errors";
import { motion } from "framer-motion";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useSearchParams } from "react-router-dom";
import { links } from "@/lib/links";

/** Google's brand mark. Inlined because lucide ships no brand icons. */
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

export function SignInPage() {
  const { t } = useTranslation();
  const { isLoaded, signIn } = useSignIn();
  const { isSignedIn } = useAuth();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const redirectUrlComplete = params.get("redirect_url") ?? "/";

  const signInWithGoogle = async () => {
    if (!isLoaded) {
      return;
    }

    setError(null);

    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete,
      });
    } catch (err) {
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex min-h-screen w-full flex-col overflow-y-auto bg-surface-deep"
    >
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-24 p-10">
        <div className="flex flex-col items-center">
          <h1 className="text-center font-semibold text-3xl text-ink-strong tracking-tight">
            {t("auth.signIn.title")}
          </h1>

          <div className="mt-10 flex w-91.25 max-w-full flex-col items-center">
            <Button
              type="button"
              intent="soft"
              block
              disabled={!isLoaded}
              onClick={() => void signInWithGoogle()}
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

            <p className="mt-6 text-center text-ink-muted text-xs">
              {t("auth.signIn.help")}{" "}
              <a
                href={links.mailto.support}
                className="text-brand hover:underline hover:underline-offset-2"
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
          <img src="/icon.png" alt="" className="h-6 w-auto" />
          <span className="font-semibold text-ink-strong text-lg tracking-tight">
            {t("auth.signIn.brand")}
          </span>
        </a>
      </div>
    </motion.div>
  );
}
