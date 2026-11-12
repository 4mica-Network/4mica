"use client";

import { Button, Spinner } from "@4mica/ui";
import { safeRedirectPath } from "@4mica/url";
import { useAuth, useSignIn, useSignUp } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { messages } from "@/i18n";
import { links } from "@/services/links";

export type AuthMode = "signIn" | "signUp";

const COPY = {
  signIn: {
    title: messages.auth.signInTitle,
    switchLead: messages.auth.needAccount,
    switchAction: messages.auth.join,
    switchHref: "/sign-up",
  },
  signUp: {
    title: messages.auth.signUpTitle,
    switchLead: messages.auth.haveAccount,
    switchAction: messages.auth.signIn,
    switchHref: "/sign-in",
  },
} as const satisfies Record<AuthMode, unknown>;

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-4.5 w-4.5" viewBox="0 0 48 48">
      <path
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        fill="#EA4335"
      />
      <path
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        fill="#4285F4"
      />
      <path
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        fill="#FBBC05"
      />
      <path
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        fill="#34A853"
      />
    </svg>
  );
}

export function AuthPanel({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const { isSignedIn } = useAuth();
  const signIn = useSignIn();
  const signUp = useSignUp();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const reduceMotion = useReducedMotion();

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
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full w-full flex-col overflow-y-auto bg-surface-deep pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      initial={reduceMotion ? false : { opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="flex w-full flex-1 flex-col items-center justify-center px-6 pt-6 pb-8 md:gap-24 md:p-10">
        <div className="flex w-full flex-1 flex-col items-center justify-center md:flex-none">
          <h1 className="text-center font-semibold text-3xl text-ink-strong tracking-tight">
            {copy.title}
          </h1>

          <div className="mt-10 flex w-91.25 max-w-full flex-col items-center">
            <Button
              block
              className="h-12 gap-2 rounded-md bg-overlay/5 font-normal text-sm hover:bg-overlay/10"
              disabled={!isLoaded || pending}
              icon={pending ? <Spinner size="sm" /> : <GoogleIcon />}
              intent="soft"
              onClick={() => void authenticate()}
              type="button"
            >
              {messages.auth.google}
            </Button>

            {error && (
              <p className="mt-6 text-center text-danger text-sm" role="alert">
                {error}
              </p>
            )}

            <p className="mt-6 text-center text-ink-muted text-xs">
              {copy.switchLead}{" "}
              <Link
                className="text-brand hover:underline hover:underline-offset-2"
                href={`${copy.switchHref}?redirect_url=${encodeURIComponent(redirectUrlComplete)}`}
              >
                {copy.switchAction}
              </Link>
            </p>

            <p className="mt-2 text-center text-ink-muted text-xs">
              {messages.auth.help}{" "}
              <a
                className="text-brand hover:underline hover:underline-offset-2"
                href={links.mailto.support}
              >
                {messages.auth.contact}
              </a>
            </p>
          </div>
        </div>

        <a
          className="flex items-center gap-2 opacity-90 transition-opacity hover:opacity-100"
          href={links.website}
          rel="noopener noreferrer"
          target="_blank"
        >
          <Image
            alt=""
            className="h-6 w-auto"
            height={24}
            src="/icon.png"
            width={34}
          />
          <span className="font-semibold text-ink-strong text-lg tracking-tight">
            {messages.common.brandName}
          </span>
        </a>
      </div>
    </motion.div>
  );
}
