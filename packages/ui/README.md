# @4mica/ui

Shared React component library for the 4Mica platform. Built with
[class-variance-authority](https://cva.style), bundled with `tsup`, and styled
against the design tokens and canonical component classes in
[`@4mica/tailwind-config`](../tailwind-config) — so components render identically
to the rest of the app and ship almost no CSS of their own.

## Usage

```tsx
import { Button, Link } from "@4mica/ui";

<Button intent="primary" size="md">Try for free</Button>

// Compose with a router link via `asChild`:
<Button asChild intent="soft">
  <a href="/pricing">Pricing</a>
</Button>

<Link variant="accent" external href="https://4mica.io">Read the docs</Link>
```

Icons are agnostic — pass any `ReactNode` via `icon` (with `iconPosition`).

## Components

- **Button** — `intent`: `primary | outline | soft | ghost | invert`; `size`: `sm | md | lg`; `icon`, `iconPosition`, `block`, `asChild`.
- **Link** — `variant`: `accent | muted`; `icon`, `iconPosition`, `external`.
- **cn** — `twMerge(clsx(...))` class-merge helper (Biome sorts classes inside it).

## Scripts

```bash
pnpm --filter @4mica/ui build            # bundle to dist/ (esm + cjs + d.ts)
pnpm --filter @4mica/ui dev              # tsup watch
pnpm --filter @4mica/ui storybook        # Storybook on :6006
pnpm --filter @4mica/ui build-storybook  # static Storybook
pnpm --filter @4mica/ui typecheck
```

## Consuming apps

The app must (1) depend on `@4mica/ui` as `workspace:*`, (2) list it in
`transpilePackages`, and (3) include the library source in its Tailwind
`content` globs so the utility classes used by the components are generated.
See `apps/web` for the reference wiring.
