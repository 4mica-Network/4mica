import { Link as UiLink } from "@4mica/ui";
import type { ReactNode } from "react";

/**
 * The shared typography map, ported from apps/web/mdx-components.tsx minus the
 * @next/mdx plumbing.
 *
 * This app does not compile MDX — user-authored markup on a public page is
 * arbitrary component execution. The map exists so that any long-form content
 * we *do* author (an about page, a docs blurb) matches apps/web exactly, and so
 * `<Prose>` has a single place to pull element styling from.
 */
export const components = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mt-8 mb-4 font-semibold text-2xl text-ink-strong">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mt-8 mb-3 font-semibold text-ink-strong text-xl">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mt-6 mb-2 font-semibold text-ink-strong text-lg">
      {children}
    </h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-4 text-ink-body leading-relaxed">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-4 list-disc space-y-1.5 pl-5 text-ink-body">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-ink-body">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-ink-strong">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="mb-4 border-brand/40 border-l-2 pl-4 text-ink-muted italic">
      {children}
    </blockquote>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded bg-overlay/10 px-1.5 py-0.5 font-mono text-[0.9em]">
      {children}
    </code>
  ),
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <UiLink href={href} external={href?.startsWith("http")}>
      {children}
    </UiLink>
  ),
};

export function useMDXComponents(
  overrides: typeof components,
): typeof components {
  return { ...components, ...overrides };
}
