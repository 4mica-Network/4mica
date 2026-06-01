import type { Language } from "../navigation";

interface OverviewSectionProps {
  onNavigate: (section: string) => void;
  language: Language;
}

interface Capability {
  title: string;
  desc: string;
}

const capabilities: Record<Language, Capability[]> = {
  typescript: [
    {
      title: "Batteries-Included Express Middleware",
      desc: "paymentMiddlewareFromConfig protects Express routes with HTTP 402 responses and wires the 4Mica facilitator automatically.",
    },
    {
      title: "Automatic Facilitator Setup",
      desc: "FourMicaEvmScheme and the facilitator client are registered for you - no manual configuration needed.",
    },
    {
      title: "Tab Management",
      desc: "advertisedEndpoint is injected automatically; the middleware handles tab open requests end to end.",
    },
    {
      title: "Fetch & Axios Client Wrappers",
      desc: "@x402/fetch and @x402/axios handle 402 responses, open tabs, sign guarantees, and retry requests transparently.",
    },
    {
      title: "ERC-8004 Validation Gating",
      desc: "V2 guarantees bind validation policy fields; remuneration is allowed only after on-chain validation passes.",
    },
    {
      title: "Multi-Network Support",
      desc: "Built-in support for Base (eip155:8453), Ethereum Sepolia (eip155:11155111), and Base Sepolia (eip155:84532) networks.",
    },
    {
      title: "Extensible Paywalls",
      desc: "Drop in a custom paywall UI or attach HTTP lifecycle hooks for advanced flows.",
    },
  ],
  python: [
    {
      title: "FastAPI & Flask Middleware",
      desc: "fastapi_payment_middleware_from_config and its Flask counterpart protect routes with HTTP 402 responses and wire the 4Mica facilitator automatically.",
    },
    {
      title: "Automatic Facilitator Setup",
      desc: "FourMicaEvmScheme and the facilitator client are registered for you - no manual configuration needed.",
    },
    {
      title: "Tab Management",
      desc: "The tab endpoint URL is injected into payment requirements automatically; the middleware handles tab open requests end to end.",
    },
    {
      title: "httpx & requests Client Wrappers",
      desc: "x402_httpx_transport (async) and x402_requests (sync) handle 402 responses, open tabs, sign guarantees, and retry requests transparently.",
    },
    {
      title: "ERC-8004 Validation Gating",
      desc: "V2 guarantees bind validation policy fields; remuneration is allowed only after on-chain validation passes.",
    },
    {
      title: "Multi-Network Support",
      desc: "Built-in support for Base (eip155:8453), Ethereum Sepolia (eip155:11155111), and Base Sepolia (eip155:84532) networks.",
    },
    {
      title: "Async & Sync Support",
      desc: "Full async support via httpx and FastAPI; synchronous support via requests and Flask.",
    },
  ],
  rust: [
    {
      title: "Collateral Management",
      desc: "Deposit and withdraw ETH or ERC-20 tokens into the Core4Mica vault via the sdk-4mica crate.",
    },
    {
      title: "Balance & Position Queries",
      desc: "Query collateral balances and positions on-chain using client.user.get_user().",
    },
    {
      title: "Direct RPC Integration",
      desc: "The SDK communicates directly with the 4Mica network RPC URL - no separate facilitator package needed for wallet operations.",
    },
    {
      title: "ERC-8004 Validation Gating",
      desc: "V2 guarantees bind validation policy fields; remuneration is allowed only after on-chain validation passes.",
    },
    {
      title: "Multi-Network Support",
      desc: "Point the SDK at Base (https://base.api.4mica.xyz/), Ethereum Sepolia (https://ethereum.sepolia.api.4mica.xyz/), or Base Sepolia (https://base.sepolia.api.4mica.xyz/).",
    },
    {
      title: "Server & Client Middleware (coming soon)",
      desc: "Axum/Actix-Web middleware and a reqwest-based 402 client wrapper are on the roadmap.",
    },
  ],
};

const intros: Record<Language, { p1: string; p2: string }> = {
  typescript: {
    p1: "The @4mica/x402 package ships batteries-included Express middleware and client helpers for the x402 Payment Protocol with 4Mica credit flow support. It adds HTTP 402 payment requirements to protected routes, advertises tab endpoints, and wires the 4Mica facilitator automatically.",
    p2: "Use this page to get paid as a resource server, configure deeper server integrations, or pay as an agent with @x402/fetch or @x402/axios wrappers that automatically open tabs, sign guarantees (V1 or V2), and retry requests.",
  },
  python: {
    p1: "The 4mica-x402 package ships FastAPI and Flask server middleware and httpx/requests client helpers for the x402 Payment Protocol with 4Mica credit flow support. It protects API routes with HTTP 402 responses and wires the 4Mica facilitator automatically.",
    p2: "Use this page to get paid as a resource server with FastAPI or Flask, or pay as an agent with x402_httpx_transport (async) or x402_requests (sync) wrappers that automatically open tabs, sign guarantees (V1 or V2), and retry requests.",
  },
  rust: {
    p1: "The sdk-4mica crate provides collateral management and wallet operations for the x402 Payment Protocol with 4Mica credit flow support. It communicates directly with the 4Mica network RPC URL and handles deposit, withdrawal, and balance queries.",
    p2: "Use this page to register a wallet by depositing collateral. Server middleware and HTTP client wrappers for Rust are on the roadmap - see the sections below for what is available today.",
  },
};

export default function OverviewSection({
  onNavigate,
  language,
}: OverviewSectionProps) {
  const { p1, p2 } = intros[language];

  return (
    <div>
      <h2 className="mb-6 font-bold text-3xl text-ink-strong">Overview</h2>
      <div className="space-y-6">
        <p className="text-ink-body leading-relaxed">{p1}</p>
        <p className="text-ink-body leading-relaxed">{p2}</p>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-ink-body text-sm">
          <span className="font-semibold text-ink-strong">New here?</span> Payer
          wallets must deposit collateral before making payments. Start with the{" "}
          <button
            type="button"
            onClick={() => onNavigate("registration")}
            className="cursor-pointer text-ink-strong underline hover:opacity-80"
          >
            Registration
          </button>{" "}
          section first.
        </div>
        <div>
          <h3 className="mb-4 font-semibold text-ink-strong text-xl">
            Key Capabilities
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {capabilities[language].map((item) => (
              <div
                key={item.title}
                className="rounded-lg border border-white/10 bg-white/10 p-4"
              >
                <h4 className="mb-2 font-semibold text-ink-body">
                  {item.title}
                </h4>
                <p className="text-ink-body text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
