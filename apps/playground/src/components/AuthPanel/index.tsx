"use client";

import { Button, Spinner } from "@4mica/ui";
import { useAuth, useSignIn, useSignUp } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { messages } from "@/i18n";
import { safeRedirectPath } from "@/utils/redirect";

export type AuthMode = "signIn" | "signUp";

const COPY = {
  signIn: {
    title: messages.auth.signInTitle,
    subtitle: messages.auth.signInSubtitle,
    switchLead: messages.auth.needAccount,
    switchAction: messages.auth.join,
    switchHref: "/sign-up",
  },
  signUp: {
    title: messages.auth.signUpTitle,
    subtitle: messages.auth.signUpSubtitle,
    switchLead: messages.auth.haveAccount,
    switchAction: messages.auth.signIn,
    switchHref: "/sign-in",
  },
} as const satisfies Record<AuthMode, unknown>;

export function AuthPanel({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const { isSignedIn } = useAuth();
  const signIn = useSignIn();
  const signUp = useSignUp();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const copy = COPY[mode];
  const redirectUrlComplete = safeRedirectPath(params.get("redirect_url"));

  const isLoaded = mode === "signUp" ? signUp.isLoaded : signIn.isLoaded;

  useEffect(() => {
    if (isSignedIn) {
      router.replace(redirectUrlComplete);
    }
  }, [isSignedIn, redirectUrlComplete, router]);

  const authenticate = async () => {
    if (!isLoaded) {
      return;
    }

    setError(null);
    setPending(true);

    try {
      const options = {
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete,
      } as const;

      if (mode === "signUp" && signUp.isLoaded) {
        await signUp.signUp.authenticateWithRedirect(options);
      } else if (mode === "signIn" && signIn.isLoaded) {
        await signIn.signIn.authenticateWithRedirect(options);
      }
    } catch (err) {
      setPending(false);
      setError(
        isClerkAPIResponseError(err)
          ? (err.errors[0]?.longMessage ?? messages.auth.error)
          : messages.auth.error,
      );
    }
  };

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-semibold text-ink-strong text-xl tracking-tight">
        {copy.title}
      </h1>
      <p className="mt-1 text-ink-muted text-sm">{copy.subtitle}</p>

      <Button
        type="button"
        block
        disabled={!isLoaded || pending}
        onClick={() => void authenticate()}
        className="mt-6"
        icon={pending ? <Spinner size="sm" /> : undefined}
      >
        {messages.auth.google}
      </Button>

      {error && (
        <p role="alert" className="mt-3 text-danger text-sm">
          {error}
        </p>
      )}

      <p className="mt-6 text-ink-subtle text-sm">
        {copy.switchLead}{" "}
        <Link
          className="link-muted"
          href={`${copy.switchHref}?redirect_url=${encodeURIComponent(redirectUrlComplete)}`}
        >
          {copy.switchAction}
        </Link>
      </p>
    </div>
  );
}
