# @4mica/playground

Public user-profile pages, in the style of cal.com / calendly public pages.

```
4mica.io/<username>                     profile overview
4mica.io/<username>/agents/<id|slug>    agent detail
4mica.io/<username>/api/<id|slug>       API listing detail
4mica.io/<username>/<anything else>     404
```

Next.js 16 App Router, server-rendered (`output: "standalone"`), reading
Postgres directly through `@4mica/db`. Clerk auth is **optional**: pages are
public, and the session is only used to decide whether the viewer owns the
profile they are looking at.

## Quick start

```bash
pnpm install
pnpm db:up                                   # Postgres on :5433
pnpm --filter @4mica/db exec prisma migrate deploy
pnpm db:seed                                 # creates @4mica-workspace
cp apps/playground/.env.example apps/playground/.env   # then fill in the keys
pnpm --filter @4mica/playground dev          # http://localhost:3100
```

Then open <http://localhost:3100/4mica-workspace>.

## Things that will bite you

### `User.private` defaults to `true`

Every account is invisible until it opts in. A brand-new user visiting their own
profile sees an owner-preview banner, and everyone else gets a 404 — not a
"this profile is private" page, because a 200 would confirm the handle exists.

`pnpm db:seed` sets `private: false` on the fixture user. On a real database,
**no profile renders until someone changes their settings.**

### Handles are bare, and share the apex domain with `apps/web`

`4mica.io/<username>` has no `@` prefix, so this app and the marketing site
share one root namespace. Three things keep them apart:

1. `reservedSegments` in `packages/url/src/index.ts` — the single source of
   truth for "this segment is not a handle".
2. `nginx.conf` — apps/web keeps its known routes; **the playground is the
   default**, because an unrecognised first segment is a profile.
3. A test in `src/main.test.ts` that fails if any reserved segment has no rule
   in `nginx.conf`.

That test is the whole safety net. Add a page to `apps/web` and you must add its
segment to `reservedSegments` *and* to `nginx.conf`, or the path silently
becomes a claimable handle in production.

`/@username` 308-redirects to `/username`, so older dashboard links still work.

### `NEXT_PUBLIC_ASSET_PREFIX` is required in production

`apps/web` is a static export on the same origin and emits its own
`/_next/static/*`. Two Next apps cannot share `/_next` — the edge has no way to
tell whose chunk a request is for. So this app builds with `assetPrefix=/p` and
nginx strips the prefix back off.

If the prefix is ever unset in a production build, **every page loads with no
CSS or JS and nothing appears in the server logs.** Treat it as a required CI
build arg.

### `@4mica/db` throws at import

`packages/db/src/index.ts` throws when `DATABASE_URL` is unset, and `next build`
imports every route module. A build without a `.env` fails confusingly; the
Dockerfile passes a sentinel URL that is never connected to.

Related: `@prisma/client` and `@prisma/adapter-pg` are direct dependencies that
nothing in `src/` imports — they are listed in `serverExternalPackages` and must
resolve from this app's own `node_modules` during standalone file tracing. That
is why they sit in `knip.json`'s `ignoreDependencies`; removing them breaks the
container, not the dev server, so the failure shows up late.

### `vitest.workspace.ts` is not a Vitest config

`test.workspace` and `defineWorkspace` were both removed in Vitest 4 —
`vitest/dist/config.js` exports only `defineConfig` and `defineProject`, and
there is no filesystem auto-discovery of that filename any more. The file is a
plain module exporting the project list, which `vitest.config.ts` imports into
`test.projects`. Each project carries its own `root` and `resolve.alias`,
because neither is inherited from the parent config.

Two projects: `node` for pure logic, `jsdom` for components.

### `src/middleware.ts` runs on the Edge

It must never import `@/logger` (winston needs `fs`), `@/services/*` or
`@4mica/db` (Prisma cannot run there). Next 16 also deprecates the `middleware`
filename in favour of `proxy`, which costs one warning per build; Clerk 6.x
still documents `middleware.ts`, so the rename is deferred.

## Layout

| Path | What lives there |
| --- | --- |
| `src/app/[username]/` | The profile routes. `layout.tsx` is the visibility gate — every page below it inherits the check. |
| `src/app/api/` | Route handlers: `health` (compose healthcheck), `og/[username]`, `revalidate`. A literal segment, so it always beats `[username]`. |
| `src/schema/` | Valibot param and DTO schemas. `params.ts` is the boundary between a URL segment and a Prisma `where`. |
| `src/services/` | The query layer. Every file is `server-only`; every query uses an explicit `select`. |
| `src/services/profile-rules.ts` | The visibility gate and the DTO mapper, split out as pure functions so they are testable without Prisma. |
| `src/actions/` | Two server actions, both owner-gated. Profile *editing* lives in the dashboard. |
| `src/env.ts` | Eager public env, lazy server env. See the note about `NEXT_PUBLIC_*` inlining. |

### Why so few server actions

A `"use server"` export is a public HTTP endpoint. Only two exist:
`revalidateProfile` and the two visibility setters, and each re-derives the
viewer from the Clerk session and compares it to the row's `ownerId` *before*
writing.

Copy-link is a plain client button (no round-trip for a string concat). Profile
editing belongs in `apps/dashboard` against the already-validated
`PATCH /me/profile` — duplicating it here would create two write paths for the
same fields.

### What is never exposed

`AGENT_PUBLIC_SELECT` omits `walletAddress` and `creditLimit`: a credit limit is
commercially sensitive, and a wallet address lets anyone correlate a profile
with its on-chain activity. `ApiListing` has no relation to `ApiKey`, which
stores hashed credentials.

## Ports

| Port | Service |
| --- | --- |
| 3000 | `apps/web` dev |
| **3100** | **this app** |
| 4000 | `apps/be` |
| 4173 | `apps/dashboard` |
| 5433 | Postgres |
| 8080 | `apps/web` container |
| **8081** | **this app's container** |
| **8088** | **nginx edge** |

## Containers

```bash
pnpm playground:up     # build + start playground and the nginx edge
pnpm playground:down
```

`DATABASE_URL` must reach the Postgres from `apps/be/docker-compose.yml` —
either join that stack's network (see the commented `networks` block in
`docker-compose.yml`) or use `host.docker.internal:5433` locally.

**Not yet verified:** no nginx config is version-controlled anywhere else in the
repo, and `apps/web` runs `serve` under pm2 bound to host `8080`, which implies
an unversioned host-level reverse proxy already fronts 4mica.io. The
`nginx.conf` here may need to be merged into that existing config rather than
deployed as a container. Check the server before relying on the `edge` service.
