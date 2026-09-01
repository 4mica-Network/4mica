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
 * `apps/web/nginx.conf.template` encodes the same list as proxy rules, and
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

/** True when `segment` is a marketing route and so NOT claimable as a handle. */
export const isReservedSegment = (segment: string): boolean =>
  reservedSegments.has(segment.toLowerCase());

/**
 * Handles nobody may claim, mapped to why.
 *
 * Deliberately separate from `reservedSegments`, which is about *path
 * collisions* — every entry there is a real page on 4mica.io and has a matching
 * proxy rule in apps/web/nginx.conf.template. These are not routes. They are
 * names that would let someone impersonate the company, a role, or a
 * third-party brand.
 *
 * Merging the two sets would break in both directions: the sync test in
 * apps/playground/src/main.test.ts would demand ~300 nginx rules for pages that
 * do not exist, and apps/playground/src/middleware.ts passes reserved segments
 * through to apps/web, so `4mica.io/google` would render a marketing 404
 * instead of the correct "no such profile" page.
 *
 * Overlap with `reservedSegments` is intentional and harmless — a name that is
 * both stays blocked if the route behind it is ever deleted.
 *
 * A Map rather than a list of records: it dedupes by construction, answers in
 * O(1), and keeps each reason next to the name it explains. The reasons are
 * internal documentation — callers surface a generic "not available", so the
 * policy is not published to whoever is probing for handles.
 */
export const blacklistedUsernames: ReadonlyMap<string, string> = new Map([
  // Core system and role names
  ["admin", "Reserved for system use"],
  ["administrator", "Reserved for system use"],
  ["admins", "Reserved for system use"],
  ["system", "Reserved for system use"],
  ["root", "Reserved for system use"],
  ["api", "Reserved for API/system integration"],
  ["support", "Reserved for support and help accounts"],
  ["team", "Reserved for organizational usage"],
  ["staff", "Reserved for staff accounts"],
  ["moderator", "Reserved for moderation accounts"],
  ["moderation", "Reserved for safety"],
  ["mod", "Reserved for moderation flows"],
  ["mods", "Reserved for moderation flows"],
  ["owner", "Reserved for ownership/meta accounts"],
  ["help", "Reserved for support usage"],
  ["helpdesk", "Reserved for support usage"],
  ["billing", "Reserved for billing team"],
  ["invoice", "Reserved for system usage"],
  ["payments", "Reserved for payment flows"],
  ["payment", "Reserved for payment flows"],

  // Authentication and security
  ["security", "Reserved for security operations"],
  ["auth", "Reserved for authentication system"],
  ["login", "Reserved for authentication system"],
  ["logout", "Reserved for authentication system"],
  ["signup", "Reserved for authentication system"],
  ["register", "Reserved for authentication system"],
  ["oauth", "Reserved for authentication system"],
  ["callback", "Reserved for auth redirect"],
  ["api-key", "Reserved for security"],
  ["token", "Reserved for auth flows"],

  // Protocol and DNS-shaped names
  ["www", "Reserved for DNS-style naming"],
  ["http", "Reserved for system use"],
  ["https", "Reserved for system use"],

  // Brand protection — 4mica itself
  ["4mica", "Reserved brand protection"],
  ["4micaapp", "Reserved brand protection"],
  ["4mica-admin", "Reserved brand protection"],
  ["official4mica", "Reserved brand protection"],
  ["get4mica", "Reserved brand protection"],
  ["fourmica", "Reserved brand protection"],
  ["mica", "Reserved brand protection"],

  // Organizational roles
  ["ceo", "Reserved for organizational roles"],
  ["cto", "Reserved for organizational roles"],
  ["cfo", "Reserved for organizational roles"],
  ["founder", "Reserved for organizational roles"],
  ["cofounder", "Reserved for organizational roles"],
  ["founders", "Reserved for organizational roles"],
  ["internal", "Reserved for internal operations"],
  ["bot", "Reserved for system bots"],
  ["ai", "Reserved for system agents"],
  ["assistant", "Reserved for system assistants"],

  // Impersonation-shaped names
  ["supportteam", "Reserved to prevent impersonation"],
  ["support-admin", "Reserved to prevent impersonation"],
  ["supportagent", "Reserved to prevent impersonation"],
  ["billingteam", "Reserved to prevent impersonation"],
  ["official", "Reserved to prevent impersonation"],
  ["verified", "Reserved verification system"],
  ["verification", "Reserved verification system"],

  // Route-shaped names, current and future
  ["dashboard", "Reserved route-like name"],
  ["settings", "Reserved route-like name"],
  ["profile", "Reserved route-like name"],
  ["profile-settings", "Reserved route-like name"],
  ["account", "Reserved route-like name"],
  ["accounts", "Reserved route-like name"],
  ["user", "Reserved system username"],
  ["users", "Reserved for system use"],
  ["helo", "Reserved route-like name"],
  ["about", "Reserved route-like name"],
  ["blog", "Reserved route-like name"],
  ["privacy", "Reserved route-like name"],
  ["changelog", "Reserved route-like name"],
  ["careers", "Reserved route-like name"],
  ["dpa", "Reserved route-like name"],
  ["pricing", "Reserved route-like name"],
  ["solutions", "Reserved route-like name"],
  ["home", "Reserved for navigation"],
  ["contact", "Reserved for navigation"],
  ["status", "Reserved for system status"],
  ["static", "Reserved for static assets"],
  ["docs", "Reserved for documentation"],
  ["documentation", "Reserved for documentation"],
  ["config", "Reserved for system use"],
  ["configs", "Reserved for system use"],

  // Placeholder words that read as bugs
  ["null", "Reserved to avoid confusion"],
  ["undefined", "Reserved to avoid confusion"],
  ["unknown", "Reserved to avoid confusion"],
  ["test", "Reserved for testing"],
  ["tester", "Reserved for testing"],
  ["testing", "Reserved for testing"],

  // Safety and moderation
  ["banned", "Reserved for moderation"],
  ["blocked", "Reserved for moderation"],
  ["report", "Reserved for moderation/reporting"],
  ["reports", "Reserved for moderation/reporting"],
  ["ban", "Reserved for safety"],
  ["abuse", "Reserved for safety team"],
  ["tos", "Reserved for terms-of-service"],
  ["terms", "Reserved for policy pages"],
  ["nsfw", "Reserved for safety"],
  ["adult", "Reserved for safety"],

  // Future product surface
  ["workflow", "Reserved for product-level future use"],
  ["workflows", "Reserved for product-level future use"],
  ["marketplace", "Reserved for product-level future use"],
  ["integration", "Reserved for product-level future use"],
  ["integrations", "Reserved for product-level future use"],
  ["automation", "Reserved for future features"],
  ["automations", "Reserved for future features"],
  ["community", "Reserved for future features"],
  ["agent", "Reserved for AI agents"],
  ["agents", "Reserved for AI agents"],
  ["prompt", "Reserved for AI features"],
  ["model", "Reserved for AI features"],

  // Internal processes
  ["service", "Reserved for system services"],
  ["services", "Reserved for system services"],
  ["background", "Reserved for internal processes"],
  ["scheduler", "Reserved for internal processes"],
  ["worker", "Reserved for job worker processes"],

  // SEO-spam shapes
  ["free", "Reserved for product messaging"],
  ["sale", "Reserved for product messaging"],
  ["discount", "Reserved for product messaging"],
  ["promo", "Reserved for product messaging"],

  // ---------------------------------------------------------------------
  // Third-party brands. Not exhaustive and not meant to be — this covers the
  // names most likely to be squatted for a convincing impersonation.
  // ---------------------------------------------------------------------

  // Big tech
  ["apple", "Reserved for brand protection (company)"],
  ["google", "Reserved for brand protection (company)"],
  ["alphabet", "Reserved for brand protection (company)"],
  ["microsoft", "Reserved for brand protection (company)"],
  ["openai", "Reserved for brand protection (company)"],
  ["meta", "Reserved for brand protection (company)"],
  ["facebook", "Reserved for brand protection (company)"],
  ["instagram", "Reserved for brand protection (company)"],
  ["whatsapp", "Reserved for brand protection (company)"],
  ["amazon", "Reserved for brand protection (company)"],
  ["aws", "Reserved for brand protection (company)"],
  ["ibm", "Reserved for brand protection (company)"],
  ["oracle", "Reserved for brand protection (company)"],

  // Media and entertainment
  ["primevideo", "Reserved for brand protection (company)"],
  ["netflix", "Reserved for brand protection (company)"],
  ["hulu", "Reserved for brand protection (company)"],
  ["disney", "Reserved for brand protection (company)"],
  ["pixar", "Reserved for brand protection (company)"],
  ["spotify", "Reserved for brand protection (company)"],
  ["soundcloud", "Reserved for brand protection (company)"],
  ["deezer", "Reserved for brand protection (company)"],

  // Musk-adjacent
  ["tesla", "Reserved for brand protection (company)"],
  ["spacex", "Reserved for brand protection (company)"],
  ["neuralink", "Reserved for brand protection (company)"],
  ["boringcompany", "Reserved for brand protection (company)"],
  ["twitter", "Reserved for brand protection (company)"],
  ["xai", "Reserved for brand protection (company)"],

  // Social
  ["snapchat", "Reserved for brand protection (company)"],
  ["snap", "Reserved for brand protection (company)"],
  ["tiktok", "Reserved for brand protection (company)"],
  ["bytedance", "Reserved for brand protection (company)"],
  ["wechat", "Reserved for brand protection (company)"],

  // China tech
  ["baidu", "Reserved for brand protection (company)"],
  ["alibaba", "Reserved for brand protection (company)"],
  ["aliexpress", "Reserved for brand protection (company)"],
  ["tencent", "Reserved for brand protection (company)"],
  ["huawei", "Reserved for brand protection (company)"],
  ["xiaomi", "Reserved for brand protection (company)"],
  ["lenovo", "Reserved for brand protection (company)"],

  // Hardware
  ["intel", "Reserved for brand protection (company)"],
  ["amd", "Reserved for brand protection (company)"],
  ["nvidia", "Reserved for brand protection (company)"],
  ["qualcomm", "Reserved for brand protection (company)"],
  ["samsung", "Reserved for brand protection (company)"],
  ["lg", "Reserved for brand protection (company)"],
  ["sony", "Reserved for brand protection (company)"],
  ["panasonic", "Reserved for brand protection (company)"],
  ["dell", "Reserved for brand protection (company)"],
  ["hp", "Reserved for brand protection (company)"],
  ["acer", "Reserved for brand protection (company)"],
  ["asus", "Reserved for brand protection (company)"],
  ["razer", "Reserved for brand protection (company)"],
  ["logitech", "Reserved for brand protection (company)"],
  ["beats", "Reserved for brand protection (company)"],
  ["fitbit", "Reserved for brand protection (company)"],
  ["garmin", "Reserved for brand protection (company)"],

  // Payments and crypto — the highest-risk impersonation targets here
  ["stripe", "Reserved for brand protection (company)"],
  ["paypal", "Reserved for brand protection (company)"],
  ["square", "Reserved for brand protection (company)"],
  ["block", "Reserved for brand protection (company)"],
  ["bitcoin", "Reserved for brand protection (company)"],
  ["ethereum", "Reserved for brand protection (company)"],
  ["solana", "Reserved for brand protection (company)"],
  ["coinbase", "Reserved for brand protection (company)"],
  ["binance", "Reserved for brand protection (company)"],
  ["robinhood", "Reserved for brand protection (company)"],

  // Design and creative
  ["shopify", "Reserved for brand protection (company)"],
  ["canva", "Reserved for brand protection (company)"],
  ["figma", "Reserved for brand protection (company)"],
  ["figjam", "Reserved for brand protection (company)"],
  ["adobe", "Reserved for brand protection (company)"],
  ["photoshop", "Reserved for brand protection (company)"],
  ["illustrator", "Reserved for brand protection (company)"],
  ["aftereffects", "Reserved for brand protection (company)"],
  ["premiere", "Reserved for brand protection (company)"],
  ["autodesk", "Reserved for brand protection (company)"],

  // Gaming
  ["unity", "Reserved for brand protection (company)"],
  ["unreal", "Reserved for brand protection (company)"],
  ["epicgames", "Reserved for brand protection (company)"],
  ["riotgames", "Reserved for brand protection (company)"],
  ["activision", "Reserved for brand protection (company)"],
  ["blizzard", "Reserved for brand protection (company)"],
  ["ea", "Reserved for brand protection (company)"],
  ["ubisoft", "Reserved for brand protection (company)"],

  // SaaS and productivity
  ["salesforce", "Reserved for brand protection (company)"],
  ["zendesk", "Reserved for brand protection (company)"],
  ["atlassian", "Reserved for brand protection (company)"],
  ["jira", "Reserved for brand protection (company)"],
  ["confluence", "Reserved for brand protection (company)"],
  ["dropbox", "Reserved for brand protection (company)"],
  ["slack", "Reserved for brand protection (company)"],
  ["asana", "Reserved for brand protection (company)"],
  ["notion", "Reserved for brand protection (company)"],
  ["linear", "Reserved for brand protection (company)"],
  ["monday", "Reserved for brand protection (company)"],
  ["airtable", "Reserved for brand protection (company)"],
  ["intercom", "Reserved for brand protection (company)"],
  ["freshdesk", "Reserved for brand protection (company)"],
  ["loom", "Reserved for brand protection (company)"],
  ["clickup", "Reserved for brand protection (company)"],
  ["miro", "Reserved for brand protection (company)"],
  ["mural", "Reserved for brand protection (company)"],

  // Infrastructure and hosting
  ["twilio", "Reserved for brand protection (company)"],
  ["cloudflare", "Reserved for brand protection (company)"],
  ["digitalocean", "Reserved for brand protection (company)"],
  ["vercel", "Reserved for brand protection (company)"],
  ["heroku", "Reserved for brand protection (company)"],
  ["gitlab", "Reserved for brand protection (company)"],
  ["github", "Reserved for brand protection (company)"],
  ["webflow", "Reserved for brand protection (company)"],
  ["framer", "Reserved for brand protection (company)"],
  ["wix", "Reserved for brand protection (company)"],
  ["squarespace", "Reserved for brand protection (company)"],
  ["bubble", "Reserved for brand protection (company)"],

  // Observability
  ["datadog", "Reserved for brand protection (company)"],
  ["newrelic", "Reserved for brand protection (company)"],
  ["splunk", "Reserved for brand protection (company)"],
  ["honeycomb", "Reserved for brand protection (company)"],
  ["sentry", "Reserved for brand protection (company)"],
  ["rollbar", "Reserved for brand protection (company)"],
  ["segment", "Reserved for brand protection (company)"],
  ["mixpanel", "Reserved for brand protection (company)"],
  ["amplitude", "Reserved for brand protection (company)"],
  ["heap", "Reserved for brand protection (company)"],
  ["grafana", "Reserved for brand protection (company)"],
  ["prometheus", "Reserved for brand protection (company)"],
  ["kibana", "Reserved for brand protection (company)"],

  // Data
  ["snowflake", "Reserved for brand protection (company)"],
  ["databricks", "Reserved for brand protection (company)"],
  ["mongodb", "Reserved for brand protection (company)"],
  ["couchbase", "Reserved for brand protection (company)"],
  ["elastic", "Reserved for brand protection (company)"],
  ["influxdb", "Reserved for brand protection (company)"],
  ["supabase", "Reserved for brand protection (company)"],

  // AI
  ["pinecone", "Reserved for brand protection (company)"],
  ["weaviate", "Reserved for brand protection (company)"],
  ["milvus", "Reserved for brand protection (company)"],
  ["langchain", "Reserved for brand protection (company)"],
  ["cohere", "Reserved for brand protection (company)"],
  ["anthropic", "Reserved for brand protection (company)"],
  ["stabilityai", "Reserved for brand protection (company)"],
  ["runwayml", "Reserved for brand protection (company)"],
  ["perplexity", "Reserved for brand protection (company)"],
  ["huggingface", "Reserved for brand protection (company)"],

  // Email and messaging
  ["mailchimp", "Reserved for brand protection (company)"],
  ["sendgrid", "Reserved for brand protection (company)"],
  ["mailgun", "Reserved for brand protection (company)"],
  ["postmark", "Reserved for brand protection (company)"],
  ["resend", "Reserved for brand protection (company)"],
  ["plivo", "Reserved for brand protection (company)"],
  ["nexmo", "Reserved for brand protection (company)"],
  ["mailerlite", "Reserved for brand protection (company)"],
  ["convertkit", "Reserved for brand protection (company)"],

  // Identity and password managers
  ["okta", "Reserved for brand protection (company)"],
  ["auth0", "Reserved for brand protection (company)"],
  ["clerk", "Reserved for brand protection (company)"],
  ["duosecurity", "Reserved for brand protection (company)"],
  ["cloudpass", "Reserved for brand protection (company)"],
  ["1password", "Reserved for brand protection (company)"],
  ["lastpass", "Reserved for brand protection (company)"],
  ["bitwarden", "Reserved for brand protection (company)"],

  // Security vendors
  ["kaspersky", "Reserved for brand protection (company)"],
  ["kasperksy", "Reserved for brand protection (company, common typo)"],
  ["norton", "Reserved for brand protection (company)"],
  ["mcafee", "Reserved for brand protection (company)"],
  ["zscaler", "Reserved for brand protection (company)"],
  ["crowdstrike", "Reserved for brand protection (company)"],
  ["sentinelone", "Reserved for brand protection (company)"],
  ["paloaltonetworks", "Reserved for brand protection (company)"],
  ["fortinet", "Reserved for brand protection (company)"],
  ["checkpoint", "Reserved for brand protection (company)"],
  ["rapid7", "Reserved for brand protection (company)"],
  ["qualys", "Reserved for brand protection (company)"],
  ["veracode", "Reserved for brand protection (company)"],
  ["darktrace", "Reserved for brand protection (company)"],

  // Marketplaces and delivery
  ["airbnb", "Reserved for brand protection (company)"],
  ["uber", "Reserved for brand protection (company)"],
  ["ubereats", "Reserved for brand protection (company)"],
  ["lyft", "Reserved for brand protection (company)"],
  ["doordash", "Reserved for brand protection (company)"],
  ["grubhub", "Reserved for brand protection (company)"],
  ["instacart", "Reserved for brand protection (company)"],
  ["postmates", "Reserved for brand protection (company)"],
  ["justeat", "Reserved for brand protection (company)"],
  ["deliveroo", "Reserved for brand protection (company)"],

  // Retail
  ["etsy", "Reserved for brand protection (company)"],
  ["ebay", "Reserved for brand protection (company)"],
  ["wayfair", "Reserved for brand protection (company)"],
  ["target", "Reserved for brand protection (company)"],
  ["costco", "Reserved for brand protection (company)"],
  ["ikea", "Reserved for brand protection (company)"],
  ["walmart", "Reserved for brand protection (company)"],
  ["bestbuy", "Reserved for brand protection (company)"],
  // The source list had "home depot"; a space can never match USERNAME_PATTERN,
  // so the only form worth blocking is the one someone could actually type.
  ["homedepot", "Reserved for brand protection (company)"],
  ["lowes", "Reserved for brand protection (company)"],
  ["codemod", "Reserved for brand protection (company)"],
]);

/** True when `segment` is blacklisted and so NOT claimable as a handle. */
export const isBlacklistedUsername = (segment: string): boolean =>
  blacklistedUsernames.has(segment.toLowerCase());

/**
 * Why a well-formed handle cannot be claimed, or `null` if it can.
 *
 * The single entry point for "may this be claimed?" — apps/be, the availability
 * probe and the dashboard's client-side check all go through it so they cannot
 * answer differently. Says nothing about whether the handle is already taken;
 * that needs the database.
 *
 * `"reserved"` wins over `"blacklisted"` for names in both sets, because a
 * route collision is the more specific and more actionable explanation.
 */
export type UsernameUnavailableReason = "reserved" | "blacklisted";

export const usernameUnavailableReason = (
  segment: string,
): UsernameUnavailableReason | null => {
  if (isReservedSegment(segment)) {
    return "reserved";
  }

  return isBlacklistedUsername(segment) ? "blacklisted" : null;
};

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
