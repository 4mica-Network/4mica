import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react";
import { FullScreenLoader } from "@/auth/FullScreenLoader";

export function SsoCallbackPage() {
  return (
    <>
      <FullScreenLoader messageKey="auth.callback.loading" />
      <AuthenticateWithRedirectCallback
        signInUrl="/sign-in"
        signInFallbackRedirectUrl="/"
        signUpFallbackRedirectUrl="/"
        continueSignUpUrl="/sign-in"
      />
    </>
  );
}
