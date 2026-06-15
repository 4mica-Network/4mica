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

const resolveBases = (env: Env): Bases => {
  const base = stripTrailingSlash(
    resolveUrl(
      env.NEXT_PUBLIC_BASE_URL ??
        env.VITE_BASE_URL ??
        env.BASE_URL ??
        "https://4mica.xyz",
    ),
  );
  const appBase = stripTrailingSlash(
    resolveUrl(
      env.NEXT_PUBLIC_APP_URL ?? env.VITE_APP_URL ?? env.APP_URL ?? base,
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
    privacy: "/privacy",
    register: "/register",
    resources: "/resources",
    resourcesAnchor: "/#resources",
    blog: "/resources/blog",
    gettingPaidBy4Mica: "/resources/blog/getting-paid-by-4mica",
    how4MicaWorks: "/resources/blog/how-4mica-works",
    payingWith4Mica: "/resources/blog/paying-with-4mica",
    legacyBlogPost: "/resources/blog/1",
    onePager: "/resources/one-pager",
    technicalDocs: "/resources/technical-docs",
    roadmap: "/roadmap",
    terms: "/terms",
    logo: "/assets/logo_transparent.png",
  }) as const;

const buildLinks = ({ base, appBase, root }: Bases) => {
  const routes = buildRoutes();

  return {
    ...routes,
    website: base,
    root,
    app: appBase,
    signin: `${appBase}/sign-in`,
    signup: `${appBase}/sign-up`,
    waitlist: `${appBase}/waitlist`,
    docs: `${base}${routes.technicalDocs}`,
    status: "https://status.4mica.xyz",
    facilitator: "https://x402.4mica.xyz",
    facilitatorTabs: "https://x402.4mica.xyz/tabs",
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
      contact: "mairon@4mica.xyz",
      mairon: "mairon@4mica.xyz",
    },
    mailto: {
      contact: "mailto:mairon@4mica.xyz",
      earlyAccess:
        "mailto:mairon@4mica.xyz?subject=Early%20Access%20Request&body=Hi%204Mica%20team,%20I%20would%20like%20early%20access.",
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
