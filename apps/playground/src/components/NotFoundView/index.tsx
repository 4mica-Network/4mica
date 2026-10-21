import { cn } from "@4mica/ui";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  type LucideIcon,
  Newspaper,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { messages } from "@/i18n";
import { links } from "@/services/links";

interface ExploreLink {
  href: string;
  icon: LucideIcon;
  title: string;
  hint: string;
}

const EXPLORE: ExploreLink[] = [
  {
    href: links.docs,
    icon: BookOpen,
    title: messages.notFound.docs,
    hint: messages.notFound.docsHint,
  },
  {
    href: `${links.website}${links.blog}`,
    icon: Newspaper,
    title: messages.notFound.blog,
    hint: messages.notFound.blogHint,
  },
  {
    href: `mailto:${links.email.sales}?subject=${encodeURIComponent(messages.notFound.demoSubject)}`,
    icon: CalendarDays,
    title: messages.notFound.demo,
    hint: messages.notFound.demoHint,
  },
];

export function NotFoundView({
  handle,
  embedded = false,
}: {
  handle?: string | null;
  embedded?: boolean;
}) {
  return (
    <main
      className={cn(
        "flex w-full flex-col items-center justify-center",
        embedded
          ? "min-h-0 flex-1"
          : "h-dvh overflow-y-auto px-4 py-10 sm:px-6",
      )}
      data-fit-viewport={embedded ? true : undefined}
    >
      <div className="flex w-full max-w-xl flex-col gap-8">
        <header className="flex flex-col items-center text-center">
          <p className="font-medium text-danger text-xs uppercase tracking-wide">
            {messages.notFound.code}
          </p>
          <h1 className="mt-3 text-balance font-semibold text-3xl text-ink-strong tracking-tight sm:text-4xl">
            {handle ? messages.notFound.handleTitle : messages.notFound.title}
          </h1>
          <p className="mt-3 text-ink-muted">
            {handle ? (
              <>
                {messages.notFound.handleLeadBefore}{" "}
                <span className="text-brand">/{handle}</span>{" "}
                {messages.notFound.handleLeadAfter}{" "}
                <Link
                  className="text-brand underline-offset-4 hover:underline"
                  href="/sign-up"
                >
                  {messages.notFound.claimNow}
                </Link>
              </>
            ) : (
              messages.notFound.lead
            )}
          </p>
        </header>

        {handle && (
          <Link
            className="group flex items-center gap-4 rounded-xl border border-success/30 bg-success/5 p-4 transition-colors hover:bg-success/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-success/50"
            href="/sign-up"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-success/10 text-success">
              <Check aria-hidden="true" className="h-4 w-4" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium text-ink-strong text-sm">
                {messages.notFound.claim}{" "}
                <span className="text-brand">/{handle}</span>
              </span>
              <span className="text-ink-muted text-xs">
                {messages.notFound.claimHint}
              </span>
            </span>
            <ArrowRight
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Link>
        )}

        <nav aria-label={messages.notFound.explore} className="flex flex-col">
          <p className="pb-1 text-ink-muted text-sm">
            {messages.notFound.explore}
          </p>
          <ul className="flex flex-col divide-y divide-overlay/10">
            {EXPLORE.map(({ href, icon: Icon, title, hint }) => (
              <li key={title}>
                <a
                  className="group -mx-2 flex items-center gap-4 rounded-lg px-2 py-3.5 transition-colors hover:bg-overlay/4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-overlay/40"
                  href={href}
                  {...(href.startsWith("http")
                    ? { target: "_blank", rel: "noreferrer noopener" }
                    : {})}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-overlay/6 text-ink-muted">
                    <Icon aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-medium text-ink-strong text-sm">
                      {title}
                    </span>
                    <span className="text-ink-muted text-xs">{hint}</span>
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <a
          className="group inline-flex items-center gap-1.5 self-start text-ink-body text-sm transition-colors hover:text-ink-strong"
          href={links.website}
        >
          {messages.notFound.home}
          <ArrowRight
            aria-hidden="true"
            className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </a>

        {!embedded && (
          <a
            aria-label={messages.common.brandName}
            className="group flex items-center justify-center gap-2 self-center text-ink-muted text-sm transition-colors hover:text-ink-strong"
            href={links.website}
          >
            <Image
              alt=""
              className="h-5 w-auto opacity-60 brightness-0 transition-opacity group-hover:opacity-100 dark:invert"
              height={20}
              src="/icon.png"
              width={28}
            />
            <span className="font-medium">{messages.common.brandName}</span>
          </a>
        )}
      </div>
    </main>
  );
}
