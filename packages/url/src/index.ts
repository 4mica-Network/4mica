export type Env = Record<string, string | undefined>;

type Bases = {
  base: string;
  appBase: string;
  root: string;
};

type ProcessLike = {
  env?: Env;
};

const defaultEnv = (): Env => {
  const globalWithProcess = globalThis as typeof globalThis & {
    process?: ProcessLike;
  };

  return typeof globalWithProcess.process === "object" &&
    globalWithProcess.process?.env
    ? globalWithProcess.process.env
    : {};
};

const stripTrailingSlash = (url: string): string => url.replace(/\/$/, "");
const toRoot = (url: string): string => url.replace(/^https?:\/\//, "");

const resolveUrl = (url: string): string =>
  url.startsWith("http") ? url : `https://${url}`;

// Treat unset AND empty/whitespace-only env vars as absent. Docker's
// `ENV FOO=$FOO` with no build arg sets FOO to "", which `??` would keep,
// producing an invalid base like "https:/".
const firstNonEmpty = (...values: (string | undefined)[]): string | undefined =>
  values.find((value) => value != null && value.trim() !== "");

const resolveBases = (env: Env): Bases => {
  const base = stripTrailingSlash(
    resolveUrl(
      firstNonEmpty(
        env.NEXT_PUBLIC_BASE_URL,
        env.VITE_BASE_URL,
        env.BASE_URL,
      ) ?? "https://4mica.io",
    ),
  );
  const appBase = stripTrailingSlash(
    resolveUrl(
      firstNonEmpty(env.NEXT_PUBLIC_APP_URL, env.VITE_APP_URL, env.APP_URL) ??
        base,
    ),
  );

  return { base, appBase, root: toRoot(base) };
};

const buildRoutes = () =>
  ({
    home: "/",
    about: "/about",
    agentsRegister: "/agents/register",
    careers: "/careers",
    interactiveProtocol: "/interactive-protocol",
    leadership: "/leadership",
    partners: "/partners",
    team: "/team",
    privacy: "/privacy",
    register: "/register",
    blog: "/blog",
    roadmap: "/roadmap",
    terms: "/terms",
    logo: "/assets/logo_transparent.png",
  }) as const;

/**
 * Root path segments that can never be a username.
 *
 * Public profiles are served bare (`4mica.io/<username>`) from the same apex
 * domain as the marketing site, so every segment the marketing site owns has to
 * be excluded from the handle namespace. The list is derived from `routes` so it
 * cannot drift, plus the pages that exist only as files under `apps/web/app`.
 *
 * `apps/playground/nginx.conf` encodes the same list as proxy rules, and
 * `apps/playground/src/main.test.ts` asserts the two stay in sync.
 */
export const reservedSegments: ReadonlySet<string> = new Set([
  ...Object.values(buildRoutes())
    .filter((route) => route.startsWith("/") && route !== "/")
    .map((route) => route.slice(1).split("/")[0]),
  // apps/web pages that have no entry in `routes`
  "careers",
  "dpa",
  "legal",
  "pricing",
  "solution",
  "solutions",
  // auth and playground literals
  "api",
  "docs",
  "sign-in",
  "sign-up",
  "sso-callback",
  "status",
  "waitlist",
  // framework and static assets
  "_next",
  "assets",
  "favicon.ico",
  "icon.png",
  "llms.txt",
  "manifest.webmanifest",
  "og",
  "p",
  "robots.txt",
  "sitemap.xml",
]);

/** True when `segment` is claimable as a public profile handle. */
export const isReservedSegment = (segment: string): boolean =>
  reservedSegments.has(segment.toLowerCase());

/**
 * The handle character class and bounds.
 *
 * This lives beside `reservedSegments` because the two are one rule: what may
 * become a public profile handle. It used to be copied into
 * apps/be/src/controllers/me/schema.ts and apps/playground/src/schema/params.ts
 * with a "must never diverge" comment on the copy; the dashboard needing a
 * client-side check made a third copy the breaking point.
 */
export const USERNAME_PATTERN = /^[a-z0-9_-]+$/;
export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 64;

export const USERNAME_MESSAGE =
  "username may only contain lowercase letters, numbers, - and _";

/** Format only — says nothing about whether the handle is free or reserved. */
export const isValidUsername = (value: string): boolean =>
  value.length >= USERNAME_MIN_LENGTH &&
  value.length <= USERNAME_MAX_LENGTH &&
  USERNAME_PATTERN.test(value);

/**
 * The shape `generateUsername()` in apps/be mints for every new account:
 * `user-` plus 8 characters of Crockford base32 minus i/l/o/u. Callers use this
 * to tell "the system picked this" from "the person picked this" — the
 * onboarding wizard will not let a generated handle count as a chosen one.
 */
export const GENERATED_USERNAME_PREFIX = "user-";
export const GENERATED_USERNAME_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
export const GENERATED_USERNAME_SUFFIX_LENGTH = 8;

const GENERATED_USERNAME_PATTERN = new RegExp(
  `^${GENERATED_USERNAME_PREFIX}[${GENERATED_USERNAME_ALPHABET}]{${GENERATED_USERNAME_SUFFIX_LENGTH}}$`,
);

export const isGeneratedUsername = (value: string): boolean =>
  GENERATED_USERNAME_PATTERN.test(value);

const buildLinks = ({ base, appBase, root }: Bases) => {
  const routes = buildRoutes();

  return {
    ...routes,
    website: base,
    root,
    app: appBase,
    /** The canonical public profile URL. Bare handle, no `@` prefix. */
    profile: (username: string) => `${base}/${username}`,
    signin: `${appBase}/sign-in`,
    signup: `${appBase}/sign-up`,
    waitlist: `${appBase}/waitlist`,
    docs: "https://docs.4mica.io",
    docsChangelog: "https://docs.4mica.io/updates/changelogs",
    status: "https://status.4mica.io",
    facilitator: "https://x402.4mica.xyz",
    facilitatorSettle: "https://x402.4mica.xyz/settle",
    api: {
      base: "https://base.api.4mica.xyz/",
      baseSepolia: "https://base.sepolia.api.4mica.xyz/",
      ethereumSepolia: "https://ethereum.sepolia.api.4mica.xyz/",
    },
    explorer: {
      ethereumSepolia: "https://sepolia.etherscan.io",
      baseSepolia: "https://sepolia.basescan.org",
    },
    rpc: {
      ethereumSepolia: "https://rpc.sepolia.org",
      baseSepolia: "https://sepolia.base.org",
    },
    email: {
      admin: "admin@4mica.io",
      billing: "billing@4mica.io",
      careers: "career@4mica.io",
      career: "career@4mica.io",
      contact: "support@4mica.io",
      culture: "culture@4mica.io",
      dev: "dev@4mica.io",
      engineering: "engineering@4mica.io",
      events: "events@4mica.io",
      feedback: "feedback@4mica.io",
      finance: "finance@4mica.io",
      founders: "founders@4mica.io",
      hello: "hello@4mica.io",
      hr: "hr@4mica.io",
      info: "info@4mica.io",
      invite: "invite@4mica.io",
      jobs: "jobs@4mica.io",
      legal: "legal@4mica.io",
      marketing: "marketing@4mica.io",
      noReply: "no-reply@4mica.io",
      office: "office@4mica.io",
      operation: "operation@4mica.io",
      partnerships: "partnership@4mica.io",
      partnership: "partnership@4mica.io",
      press: "press@4mica.io",
      sales: "sales@4mica.io",
      security: "security@4mica.io",
      support: "support@4mica.io",
      team: "team@4mica.io",
    },
    mailto: {
      admin: "mailto:admin@4mica.io",
      billing: "mailto:billing@4mica.io",
      careers: "mailto:career@4mica.io",
      career: "mailto:career@4mica.io",
      contact: "mailto:support@4mica.io",
      culture: "mailto:culture@4mica.io",
      dev: "mailto:dev@4mica.io",
      engineering: "mailto:engineering@4mica.io",
      events: "mailto:events@4mica.io",
      feedback: "mailto:feedback@4mica.io",
      finance: "mailto:finance@4mica.io",
      founders: "mailto:founders@4mica.io",
      hello: "mailto:hello@4mica.io",
      hr: "mailto:hr@4mica.io",
      info: "mailto:info@4mica.io",
      invite: "mailto:invite@4mica.io",
      jobs: "mailto:jobs@4mica.io",
      legal: "mailto:legal@4mica.io",
      marketing: "mailto:marketing@4mica.io",
      noReply: "mailto:no-reply@4mica.io",
      office: "mailto:office@4mica.io",
      operation: "mailto:operation@4mica.io",
      partnerships: "mailto:partnership@4mica.io",
      partnership: "mailto:partnership@4mica.io",
      press: "mailto:press@4mica.io",
      sales: "mailto:sales@4mica.io",
      security: "mailto:security@4mica.io",
      support: "mailto:support@4mica.io",
      team: "mailto:team@4mica.io",
      earlyAccess:
        "mailto:support@4mica.io?subject=Early%20Access%20Request&body=Hi%204Mica%20team,%20I%20would%20like%20early%20access.",
    },
    social: {
      x: "https://x.com/0x4Mica",
      github: "https://github.com/4mica-Network",
      githubCore: "https://github.com/4mica-Network/4mica-core/",
      githubX402Demo:
        "https://github.com/4mica-Network/x402-4mica/tree/main/packages/typescript/x402/demo",
      linkedin: "https://www.linkedin.com/company/4mica",
    },
    partner: {
      alignedLayer: "https://alignedlayer.com/",
      chaosChain: "https://chaoscha.in/",
      wachai: "https://wach.ai/",
      clawCash: "https://clawcash.xyz",
      lambdaClass: "https://github.com/lambdaclass",
    },
  } as const;
};

export class LinkConfig {
  public readonly base: string;
  public readonly appBase: string;
  public readonly root: string;
  public readonly routes: ReturnType<typeof buildRoutes>;
  public readonly links: ReturnType<typeof buildLinks>;

  constructor(env: Env = defaultEnv()) {
    const { base, appBase, root } = resolveBases(env);

    this.base = base;
    this.appBase = appBase;
    this.root = root;
    this.routes = buildRoutes();
    this.links = buildLinks({ base, appBase, root });
  }
}

const defaultConfig = new LinkConfig();

export const routes = defaultConfig.routes;
export const links = defaultConfig.links;
export type Routes = typeof routes;
export type RouteKey = keyof Routes;
export type Links = typeof links;
export type LinkKey = keyof Links;
