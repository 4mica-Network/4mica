import { Button } from "@4mica/ui";
import { useAuth, useSignIn } from "@clerk/clerk-react";
import { isClerkAPIResponseError } from "@clerk/clerk-react/errors";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useSearchParams } from "react-router-dom";

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
    <div className="grid min-h-screen place-items-center bg-surface-deep px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-semibold text-ink-strong text-xl tracking-tight">
          {t("auth.signIn.title")}
        </h1>
        <p className="mt-1 text-ink-muted text-sm">
          {t("auth.signIn.subtitle")}
        </p>

        <Button
          type="button"
          block
          disabled={!isLoaded}
          onClick={() => void signInWithGoogle()}
          className="mt-6"
        >
          {t("auth.signIn.google")}
        </Button>

        {error && (
          <p role="alert" className="mt-3 text-danger text-sm">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
