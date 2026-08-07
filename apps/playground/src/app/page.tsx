import { Button } from "@4mica/ui";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { messages } from "@/i18n";
import { parseUsername } from "@/schema/params";
import { links } from "@/services/links";
import { SITE_NAME } from "@/services/seo";

export const metadata: Metadata = {
  title: `${messages.home.title} · ${SITE_NAME}`,
  description: messages.home.lead,
  robots: { index: true, follow: true },
};

/**
 * In production nginx routes `/` to apps/web, so this page is only reachable in
 * local development and as a direct-container fallback. It stays useful rather
 * than being a stub: the handle box is the fastest way to jump to a profile
 * while developing.
 */
async function goToProfile(formData: FormData) {
  "use server";

  const username = parseUsername(formData.get("username"));
  redirect(username ? `/${username}` : "/");
}

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-10 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="font-semibold text-3xl text-ink-strong sm:text-4xl">
          {messages.home.title}
        </h1>
        <p className="text-ink-muted">{messages.home.lead}</p>
      </div>

      <form action={goToProfile} className="flex flex-col gap-2">
        <label
          className="font-medium text-ink-body text-sm"
          htmlFor="username-search"
        >
          {messages.home.searchLabel}
        </label>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-lg border border-overlay/10 bg-surface focus-within:border-brand/50">
            <span className="pl-3 text-ink-subtle text-sm">4mica.io/</span>
            <input
              autoCapitalize="none"
              autoComplete="off"
              className="h-10 min-w-0 flex-1 bg-transparent px-1 text-ink-strong text-sm outline-none placeholder:text-ink-subtle"
              id="username-search"
              name="username"
              placeholder={messages.home.searchPlaceholder}
              spellCheck={false}
            />
          </div>
          <Button
            type="submit"
            icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
            iconPosition="right"
          >
            {messages.home.searchAction}
          </Button>
        </div>
        <p className="text-ink-subtle text-xs">{messages.home.searchHint}</p>
      </form>

      <div className="flex flex-col gap-3 rounded-lg border border-overlay/10 px-5 py-4">
        <h2 className="font-semibold text-ink-strong">
          {messages.home.claimTitle}
        </h2>
        <p className="text-ink-muted text-sm">{messages.home.claimLead}</p>
        <div>
          <Button intent="outline" size="sm" asChild>
            <a href={links.signup}>{messages.home.claimAction}</a>
          </Button>
        </div>
      </div>
    </main>
  );
}
