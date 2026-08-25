import { Spinner } from "@4mica/ui";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPanel } from "@/components/AuthPanel";
import { messages } from "@/i18n";

export const metadata: Metadata = {
  title: messages.auth.signInTitle,
  description: messages.auth.signInSubtitle,
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <Suspense fallback={<Spinner size="lg" />}>
        <AuthPanel mode="signIn" />
      </Suspense>
    </main>
  );
}
