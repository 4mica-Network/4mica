'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import CodeBlock from '../../../components/CodeBlock';
import MermaidDiagram from '../../../components/MermaidDiagram';
import CodeTabs from '../blog/CodeTabs';

const navigationItems = [
  { id: 'overview', title: 'Overview', icon: 'ri-eye-line' },
  { id: 'installation', title: 'Installation', icon: 'ri-download-cloud-2-line' },
  { id: 'server-integration', title: 'Server Integration', icon: 'ri-server-line' },
  { id: 'client-integration', title: 'Client Integration', icon: 'ri-user-line' },
  { id: 'examples', title: 'Code Examples', icon: 'ri-file-code-line' },
  { id: 'guarantee-modes', title: 'Guarantee Modes', icon: 'ri-git-branch-line' },
  { id: 'facilitator-api', title: 'Facilitator API', icon: 'ri-cloud-line' },
  { id: 'operator-api', title: 'Operator API', icon: 'ri-database-2-line' },
  { id: 'payment-flow', title: 'Protocol Flow', icon: 'ri-route-line' },
];

export default function TechnicalDocsContent() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-20 text-ink-body" aria-busy>Loading technical docs…</div>}>
      <TechnicalDocsContentInner />
    </Suspense>
  );
}

function TechnicalDocsContentInner() {
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    const requestedSection = searchParams.get('section');
    const normalizedSection = requestedSection === 'guarantee-versions' ? 'guarantee-modes' : requestedSection;
    if (normalizedSection && navigationItems.some((item) => item.id === normalizedSection)) {
      setActiveSection(normalizedSection);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen pt-20 text-ink-body">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h1 className="section-title mb-6">
            4Mica x402 Integration Documentation
          </h1>
          <div className="accent-bar mx-auto mb-8"></div>
          <p className="section-lead max-w-3xl mx-auto text-xl">
            Express middleware and client integration for the x402 Payment Protocol with 4mica credit flow support,
            including V1 and V2 guarantees (V2 adds ERC-8004 validation-gated remuneration) and automatic facilitator/scheme registration.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1">
            <div className="glass-panel rounded-lg p-6 sticky top-6">
              <h3 className="text-lg font-semibold text-ink-strong mb-4">Contents</h3>
              <nav className="space-y-2">
                {navigationItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full text-left p-3 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center ${
                      activeSection === item.id
                        ? 'bg-brand-deep text-ink'
                        : 'text-ink-body hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    <div className="w-5 h-5 flex items-center justify-center mr-3">
                      <i className={`${item.icon} text-lg`}></i>
                    </div>
                    {item.title}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="glass-panel rounded-lg p-8">
              {activeSection === 'overview' && (
                <div>
                  <h2 className="text-3xl font-bold text-ink-strong mb-6">Overview</h2>
                  <div className="space-y-6">
                    <p className="text-ink-body leading-relaxed">
                      The <code className="font-mono">@4mica/x402</code> package ships batteries-included Express middleware and
                      client helpers for the x402 Payment Protocol with 4Mica credit flow support. It adds HTTP 402 payment
                      requirements to protected routes, advertises tab endpoints, and wires the 4Mica facilitator automatically.
                    </p>
                    <p className="text-ink-body leading-relaxed">
                      Use this page to get paid as a resource server, configure deeper server integrations, or pay as an agent
                      with fetch/axios wrappers that automatically open tabs, sign guarantees (V1 or V2), and retry requests.
                    </p>
                    <div>
                      <h3 className="text-xl font-semibold text-ink-strong mb-4">Key Capabilities</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          {
                            title: 'Batteries-Included Middleware',
                            desc: 'Protect Express routes with HTTP 402 responses and 4Mica credit requirements.'
                          },
                          {
                            title: 'Automatic Facilitator Setup',
                            desc: 'paymentMiddlewareFromConfig wires the 4Mica facilitator and registers FourMicaEvmScheme for you.'
                          },
                          {
                            title: 'Tab Management',
                            desc: 'advertisedEndpoint is injected automatically; middleware handles tab open requests end to end.'
                          },
                          {
                            title: 'Client Payment Wrappers',
                            desc: 'Fetch and Axios wrappers handle 402, open tabs, sign guarantees, and retry requests.'
                          },
                          {
                            title: 'ERC-8004 Validation Gating',
                            desc: 'V2 guarantees bind validation policy fields; remuneration is allowed only after on-chain validation passes.'
                          },
                          {
                            title: 'Multi-Network Support',
                            desc: 'Built-in support for Ethereum Sepolia (eip155:11155111) and Base Sepolia (eip155:84532) networks.'
                          },
                          {
                            title: 'Extensible Paywalls',
                            desc: 'Drop in custom paywall UI and HTTP hooks for advanced flows.'
                          }
                        ].map((item, index) => (
                          <div key={index} className="bg-white/10 border border-white/10 rounded-lg p-4">
                            <h4 className="font-semibold text-ink-body mb-2">{item.title}</h4>
                            <p className="text-sm text-ink-body">{item.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'installation' && (
                <div>
                  <h2 className="text-3xl font-bold text-ink-strong mb-6">Installation</h2>
                  <div className="space-y-6">
                    <p className="text-ink-body leading-relaxed">
                      Install the server middleware package, then add optional client wrappers for automatic payment handling.
                    </p>
                    <div>
                      <h3 className="text-xl font-semibold text-ink-strong mb-3">Install the Server Package</h3>
                      <CodeTabs
                        blocks={[
                          {
                            label: 'TypeScript',
                            language: 'bash',
                            code: `pnpm install @4mica/x402`,
                          },
                          {
                            label: 'Python',
                            language: 'bash',
                            code: `pip install "4mica-x402[fastapi]"
# or
pip install "4mica-x402[flask]"`,
                          },
                        ]}
                      />
                      <p className="text-sm text-ink-body mt-3">
                        This installs the Express middleware and server helpers with automatic facilitator and scheme registration.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-ink-strong mb-3">Optional Client Wrappers</h3>
                      <CodeTabs
                        blocks={[
                          {
                            label: 'TypeScript',
                            language: 'bash',
                            code: `pnpm install @x402/fetch @x402/axios`,
                          },
                          {
                            label: 'Python',
                            language: 'bash',
                            code: `pip install "4mica-x402[httpx]"
# or
pip install "4mica-x402[requests]"`,
                          },
                        ]}
                      />
                      <p className="text-sm text-ink-body mt-3">
                        Use <code className="font-mono">@x402/fetch</code> for fetch clients and <code className="font-mono">@x402/axios</code> for Axios-based apps.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'server-integration' && (
                <div>
                  <h2 className="text-3xl font-bold text-ink-strong mb-6">Server Integration</h2>
                  <div className="space-y-8">
                    <p className="text-ink-body leading-relaxed">
                      Use <code className="font-mono">paymentMiddlewareFromConfig</code> (or the 4mica helper for your framework) for most deployments. It
                      configures the 4Mica facilitator, registers <code className="font-mono">FourMicaEvmScheme</code>, and injects the tab endpoint
                      into <code className="font-mono">paymentRequirements.extra.tabEndpoint</code>.
                    </p>
                    <p className="text-sm text-ink-body">
                      Already using Coinbase x402? The delta is: use scheme <code className="font-mono">4mica-credit</code>, register
                      <code className="font-mono">FourMicaEvmScheme</code>, and expose a tab endpoint (the advertised tab URL) so payers can open tabs.
                    </p>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-ink-strong">Install</h3>
                      <CodeTabs
                        blocks={[
                          {
                            label: 'TypeScript',
                            language: 'bash',
                            code: `pnpm install @4mica/x402`,
                          },
                          {
                            label: 'Python',
                            language: 'bash',
                            code: `pip install "4mica-x402[fastapi]"
# or
pip install "4mica-x402[flask]"`,
                          },
                        ]}
                      />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-xl font-semibold text-ink-strong">Quick Start (Server)</h3>
                      <CodeTabs
                        blocks={[
                          {
                            label: 'TypeScript',
                            language: 'ts',
                            code: `import express from "express";
import { paymentMiddlewareFromConfig } from "@4mica/x402/server/express";

const app = express();
app.use(express.json());

app.use(
  paymentMiddlewareFromConfig(
    {
      "GET /premium-content": {
        accepts: {
          scheme: "4mica-credit",
          price: "$0.10",
          network: "eip155:11155111", // Ethereum Sepolia
          payTo: "0xYourAddress",
        },
        description: "Access to premium content",
      },
    },
    {
      advertisedEndpoint: "https://api.example.com/tabs/open",
    }
  )
);

app.get("/premium-content", (req, res) => {
  res.json({ message: "This is premium content behind a paywall" });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});`,
                          },
                          {
                            label: 'Python',
                            language: 'python',
                            code: `from fastapi import FastAPI
from fourmica_x402.http import fastapi_payment_middleware_from_config

app = FastAPI()

routes = {
    "GET /premium-content": {
        "accepts": {
            "scheme": "4mica-credit",
            "price": "$0.10",
            "network": "eip155:11155111",  # Ethereum Sepolia
            "payTo": "0xYourAddress",
        },
        "description": "Access to premium content",
    },
}

middleware = fastapi_payment_middleware_from_config(
    routes,
    tab_endpoint="https://api.example.com/tabs/open",
)

@app.middleware("http")
async def x402_mw(request, call_next):
    return await middleware(request, call_next)

@app.get("/premium-content")
async def premium_content():
    return {"message": "This is premium content behind a paywall"}`,
                          },
                          {
                            label: 'Rust',
                            language: 'rust',
                            code: `Will be ready soon!`,
                          },
                        ]}
                      />
                    </div>
                    <div className="space-y-2 text-sm text-ink-body">
                      <h3 className="text-lg font-semibold text-ink-strong">What Happens on Each Request</h3>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>The client requests your protected route without payment.</li>
                        <li>The server returns HTTP 402 with <code className="font-mono">paymentRequirements</code> and a tab endpoint.</li>
                        <li>The client opens a tab (using the <code className="font-mono">advertisedEndpoint</code>), signs a payment guarantee, and retries with a payment header (<code className="font-mono">X-PAYMENT</code> for v1, <code className="font-mono">PAYMENT-SIGNATURE</code> for v2).</li>
                        <li>The server verifies and settles the payment, then serves the protected response.</li>
                      </ol>
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-xl font-semibold text-ink-strong">
                        paymentMiddlewareFromConfig(routes, tabConfig, ...options)
                      </h3>
                      <p className="text-sm text-ink-body">
                        Provide protected routes plus the tab configuration. The middleware handles 402 responses, tab openings, and
                        verification/settlement wiring.
                      </p>
                      <CodeTabs
                        blocks={[
                          {
                            label: 'TypeScript',
                            language: 'ts',
                            code: `app.use(
  paymentMiddlewareFromConfig(
    {
      "GET /path": {
        accepts: {
          scheme: "4mica-credit",
          price: "$0.10",
          network: "eip155:11155111", // or "eip155:84532" for Base Sepolia (see Networks)
          payTo: "0xRecipientAddress",
        },
        description: "What the user is paying for",
      },
    },
    {
      advertisedEndpoint: "https://api.example.com/tabs/open",
      ttlSeconds: 3600,
    }
  )
);`,
                          },
                          {
                            label: 'Python',
                            language: 'python',
                            code: `from fastapi import FastAPI
from fourmica_x402.http import fastapi_payment_middleware_from_config

app = FastAPI()

routes = {
    "GET /path": {
        "accepts": {
            "scheme": "4mica-credit",
            "price": "$0.10",
            "network": "eip155:11155111",  # or "eip155:84532" for Base Sepolia
            "payTo": "0xRecipientAddress",
        },
        "description": "What the user is paying for",
    },
}

middleware = fastapi_payment_middleware_from_config(
    routes,
    tab_endpoint="https://api.example.com/tabs/open",
    ttl_seconds=3600,
)

@app.middleware("http")
async def x402_mw(request, call_next):
    return await middleware(request, call_next)`,
                          },
                          {
                            label: 'Rust',
                            language: 'rust',
                            code: `Will be ready soon!`,
                          },
                        ]}
                      />
                    </div>
                    <div className="space-y-2 text-sm text-ink-body">
                      <h3 className="text-lg font-semibold text-ink-strong">Parameters</h3>
                      <ul className="list-disc list-inside space-y-1">
                        <li>
                          <code className="font-mono">routes</code> (required): protected route definitions keyed by method + path.
                        </li>
                        <li>
                          <code className="font-mono">tabConfig</code> (required): tab endpoint + optional TTL.
                        </li>
                        <li>
                          <code className="font-mono">facilitatorClients</code> (optional): add other facilitator clients.
                        </li>
                        <li>
                          <code className="font-mono">schemes</code> (optional): register additional schemes/networks.
                        </li>
                        <li>
                          <code className="font-mono">paywallConfig</code> (optional): configuration for the built-in paywall UI.
                        </li>
                        <li>
                          <code className="font-mono">paywall</code> (optional): custom paywall provider.
                        </li>
                        <li>
                          <code className="font-mono">syncFacilitatorOnStart</code> (optional): sync supported kinds at startup (default: true).
                        </li>
                      </ul>
                    </div>
                    <div className="space-y-2 text-sm text-ink-body">
                      <h3 className="text-lg font-semibold text-ink-strong">Supported Networks</h3>
                      <ul className="list-disc list-inside space-y-1">
                        <li>
                          <code className="font-mono">eip155:11155111</code> — Ethereum Sepolia (<code className="font-mono">https://ethereum.sepolia.4mica.xyz/</code>)
                        </li>
                        <li>
                          <code className="font-mono">eip155:84532</code> — Base Sepolia (<code className="font-mono">https://base.sepolia.4mica.xyz/</code>)
                        </li>
                      </ul>
                    </div>
                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-ink-strong">Advanced Server Usage</h3>
                      <p className="text-sm text-ink-body">
                        For custom facilitators or additional schemes, use <code className="font-mono">paymentMiddleware</code> or wire
                        HTTP hooks with <code className="font-mono">paymentMiddlewareFromHTTPServer</code>.
                      </p>
                      <div className="space-y-3">
                        <h4 className="text-lg font-semibold text-ink-strong">Custom Resource Server</h4>
                        <CodeTabs
                          blocks={[
                            {
                              label: 'TypeScript',
                              language: 'ts',
                              code: `import { paymentMiddleware } from "@4mica/x402/server/express";
import {
  x402ResourceServer,
  FourMicaFacilitatorClient,
} from "@4mica/x402/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const fourMicaFacilitator = new FourMicaFacilitatorClient();
const otherFacilitator = new HTTPFacilitatorClient({
  url: "https://other-facilitator.example.com",
});

const resourceServer = new x402ResourceServer([
  fourMicaFacilitator,
  otherFacilitator,
]).register("eip155:8453", new ExactEvmScheme());

app.use(
  paymentMiddleware(
    routes,
    resourceServer,
    {
      advertisedEndpoint: "https://api.example.com/tabs/open",
      ttlSeconds: 3600,
    },
    paywallConfig
  )
);`,
                            },
                            {
                              label: 'Python',
                              language: 'python',
                              code: `from fastapi import FastAPI
from x402.http import HTTPFacilitatorClient
from x402.http.middleware import fastapi as fastapi_mw
from x402.server import x402ResourceServer
from fourmica_x402 import FourMicaEvmScheme, FourMicaFacilitatorClient

app = FastAPI()

routes = {
    "GET /path": {
        "accepts": {
            "scheme": "4mica-credit",
            "price": "$0.10",
            "network": "eip155:11155111",
            "payTo": "0xRecipientAddress",
        },
        "description": "What the user is paying for",
    },
}

fourmica_facilitator = FourMicaFacilitatorClient()
other_facilitator = HTTPFacilitatorClient({"url": "https://other-facilitator.example.com"})

resource_server = x402ResourceServer([fourmica_facilitator, other_facilitator])
resource_server.register(
    "eip155:11155111",
    FourMicaEvmScheme("https://api.example.com/tabs/open"),
)

middleware = fastapi_mw.payment_middleware(
    routes,
    resource_server,
    paywall_config=None,
    paywall_provider=None,
    sync_facilitator_on_start=True,
)

@app.middleware("http")
async def x402_mw(request, call_next):
    return await middleware(request, call_next)

@app.post("/tabs/open")
async def open_tab(body: dict):
    resp = await fourmica_facilitator.open_tab(
        body["userAddress"],
        body["paymentRequirements"],
        ttl_seconds=3600,
    )
    return resp.__dict__`,
                            },
                            {
                              label: 'Rust',
                              language: 'rust',
                              code: `Will be ready soon!`,
                            },
                          ]}
                        />
                      </div>
                      <div className="space-y-3">
                        <h4 className="text-lg font-semibold text-ink-strong">HTTP Hooks</h4>
                        <CodeTabs
                          blocks={[
                            {
                              label: 'TypeScript',
                              language: 'ts',
                              code: `import { paymentMiddlewareFromHTTPServer } from "@4mica/x402/server/express";
import {
  x402ResourceServer,
  x402HTTPResourceServer,
  FourMicaFacilitatorClient,
} from "@4mica/x402/server";

const fourMicaFacilitator = new FourMicaFacilitatorClient();
const resourceServer = new x402ResourceServer(fourMicaFacilitator);

const httpServer = new x402HTTPResourceServer(resourceServer, routes)
  .onProtectedRequest((context) => {
    console.log("Protected request:", context.path);
  });

app.use(
  paymentMiddlewareFromHTTPServer(
    httpServer,
    {
      advertisedEndpoint: "https://api.example.com/tabs/open",
      ttlSeconds: 3600,
    },
    paywallConfig
  )
);`,
                            },
                            {
                              label: 'Python',
                              language: 'python',
                              code: `from fastapi import FastAPI, Request
from fourmica_x402.http import fastapi_payment_middleware_from_config

app = FastAPI()

middleware = fastapi_payment_middleware_from_config(
    routes,
    tab_endpoint="https://api.example.com/tabs/open",
)

@app.middleware("http")
async def x402_mw(request: Request, call_next):
    if request.url.path.startswith("/premium"):
        print("Protected request:", request.url.path)
    return await middleware(request, call_next)`,
                            },
                            {
                              label: 'Rust',
                              language: 'rust',
                              code: `Will be ready soon!`,
                            },
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'client-integration' && (
                <div>
                  <h2 className="text-3xl font-bold text-ink-strong mb-6">Client Integration</h2>
                  <div className="space-y-8">
                    <p className="text-ink-body leading-relaxed">
                      Use the x402 HTTP client wrappers for your stack to handle 402 responses, open tabs, sign payment guarantees,
                      and retry requests automatically.
                    </p>
                    <p className="text-sm text-ink-body">
                      If you're already using Coinbase x402 clients, keep the same wrapper and register
                      <code className="font-mono">FourMicaEvmScheme</code> instead of the exact scheme.
                    </p>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-ink-strong">Install</h3>
                      <CodeTabs
                        blocks={[
                          {
                            label: 'TypeScript',
                            language: 'bash',
                            code: `pnpm install @4mica/x402`,
                          },
                          {
                            label: 'Python',
                            language: 'bash',
                            code: `pip install "4mica-x402[httpx]"
# or
pip install "4mica-x402[requests]"`,
                          },
                        ]}
                      />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-xl font-semibold text-ink-strong">Quick Start (Convenience Wrapper)</h3>
                      <CodeTabs
                        blocks={[
                          {
                            label: 'TypeScript',
                            language: 'ts',
                            code: `import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { FourMicaEvmScheme } from "@4mica/x402/client";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0xYourPrivateKey");
const scheme = await FourMicaEvmScheme.create(account);

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    {
      network: "eip155:11155111", // Ethereum Sepolia
      client: scheme,
    },
  ],
});

const response = await fetchWithPayment("https://api.example.com/premium-content");
const data = await response.json();
console.log(data);`,
                          },
                          {
                            label: 'Python',
                            language: 'python',
                            code: `from x402 import x402ClientSync
from x402.http.clients import x402_requests
from fourmica_x402.client_scheme import FourMicaEvmScheme

client = x402ClientSync()
client.register("eip155:11155111", FourMicaEvmScheme("0xYourPrivateKey"))

session = x402_requests(client)
response = session.get("https://api.example.com/premium-content")
print(response.status_code, response.text)`,
                          },
                          {
                            label: 'Rust',
                            language: 'rust',
                            code: `Will be ready soon!`,
                          },
                        ]}
                      />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-xl font-semibold text-ink-strong">Quick Start (Client Instance Wrapper)</h3>
                      <p className="text-sm text-ink-body">
                        Use a wrapper around your HTTP client instance for drop-in payment handling.
                      </p>
                      <CodeTabs
                        blocks={[
                          {
                            label: 'TypeScript',
                            language: 'ts',
                            code: `import axios from "axios";
import { wrapAxiosWithPaymentFromConfig } from "@x402/axios";
import { FourMicaEvmScheme } from "@4mica/x402/client";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0xYourPrivateKey");
const scheme = await FourMicaEvmScheme.create(account);

const api = wrapAxiosWithPaymentFromConfig(axios.create(), {
  schemes: [
    {
      network: "eip155:11155111", // Ethereum Sepolia
      client: scheme,
    },
  ],
});

const response = await api.get("https://api.example.com/premium-content");
console.log(response.data);`,
                          },
                          {
                            label: 'Python',
                            language: 'python',
                            code: `from x402 import x402ClientSync
from x402.http.clients import x402_requests
from fourmica_x402.client_scheme import FourMicaEvmScheme

client = x402ClientSync()
client.register("eip155:11155111", FourMicaEvmScheme("0xYourPrivateKey"))

api = x402_requests(client)
response = api.get("https://api.example.com/premium-content")
print(response.json())`,
                          },
                          {
                            label: 'Rust',
                            language: 'rust',
                            code: `Will be ready soon!`,
                          },
                        ]}
                      />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-xl font-semibold text-ink-strong">Multi-Network Client Setup</h3>
                      <p className="text-sm text-ink-body">
                        Register multiple networks to route payments to different schemes.
                      </p>
                      <CodeTabs
                        blocks={[
                          {
                            label: 'TypeScript',
                            language: 'ts',
                            code: `import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { FourMicaEvmScheme } from "@4mica/x402/client";

const ethSepoliaScheme = await FourMicaEvmScheme.create(ethSepoliaAccount);
const baseSepoliaScheme = await FourMicaEvmScheme.create(baseSepoliaAccount);

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    {
      network: "eip155:11155111", // Ethereum Sepolia
      client: ethSepoliaScheme,
    },
    {
      network: "eip155:84532", // Base Sepolia
      client: baseSepoliaScheme,
    },
  ],
});`,
                          },
                          {
                            label: 'Python',
                            language: 'python',
                            code: `from x402 import x402ClientSync
from x402.http.clients import x402_requests
from fourmica_x402.client_scheme import FourMicaEvmScheme

client = x402ClientSync()
client.register("eip155:11155111", FourMicaEvmScheme("0xEthSepoliaPrivateKey"))
client.register("eip155:84532", FourMicaEvmScheme("0xBaseSepoliaPrivateKey"))

session = x402_requests(client)`,
                          },
                          {
                            label: 'Rust',
                            language: 'rust',
                            code: `Will be ready soon!`,
                          },
                        ]}
                      />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-xl font-semibold text-ink-strong">Using Builder Pattern</h3>
                      <p className="text-sm text-ink-body">
                        Compose a reusable client registry for additional control.
                      </p>
                      <CodeTabs
                        blocks={[
                          {
                            label: 'TypeScript',
                            language: 'ts',
                            code: `import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { FourMicaEvmScheme } from "@4mica/x402/client";

const scheme = await FourMicaEvmScheme.create(account);
const client = new x402Client().register("eip155:11155111", scheme);

const fetchWithPayment = wrapFetchWithPayment(fetch, client);`,
                          },
                          {
                            label: 'Python',
                            language: 'python',
                            code: `from x402 import x402ClientSync
from x402.http.clients import x402_requests
from fourmica_x402.client_scheme import FourMicaEvmScheme

scheme = FourMicaEvmScheme("0xYourPrivateKey")
client = x402ClientSync()
client.register("eip155:11155111", scheme)

session = x402_requests(client)`,
                          },
                          {
                            label: 'Rust',
                            language: 'rust',
                            code: `Will be ready soon!`,
                          },
                        ]}
                      />
                    </div>
                    <div className="space-y-2 text-sm text-ink-body">
                      <h3 className="text-lg font-semibold text-ink-strong">Flow Summary</h3>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Call the protected resource and receive HTTP 402 with payment requirements.</li>
                        <li>The wrapper opens a tab and signs the guarantee using your key.</li>
                        <li>The request is retried automatically with a payment header (<code className="font-mono">X-PAYMENT</code> for v1, <code className="font-mono">PAYMENT-SIGNATURE</code> for v2).</li>
                        <li>Handle the successful response or surface any 402 retry errors.</li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'facilitator-api' && (
                <div>
                  <h2 className="text-3xl font-bold text-ink-strong mb-6">Facilitator API Reference</h2>
                  <div className="space-y-6">
                    <p className="text-ink-body leading-relaxed">
                      Resource servers call the facilitator directly; end users and SDK clients only hit your
                      <code className="font-mono">tabEndpoint</code> and protected resources. The hosted base URL is typically
                      <code className="font-mono">https://x402.4mica.xyz/</code>, but any compatible deployment exposes the same
                      endpoints.
                    </p>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="border border-white/10 rounded-lg p-5 space-y-2 bg-white/5">
                        <h3 className="text-lg font-semibold text-ink-strong">GET /</h3>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">What it does:</span> Returns service metadata and a quick
                          pointer to supported schemes/networks.
                        </p>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">Gets:</span> No body.
                        </p>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">Returns:</span>{' '}
                          <code className="font-mono">
                            {'{ message, supported: SupportedKind[], health: "/health", docs }'}
                          </code>
                        </p>
                        <CodeBlock
                          code={`{
  "message": "Welcome to the 4mica credit facilitator...",
  "supported": [
    { "scheme": "4mica-credit", "network": "eip155:11155111", "x402Version": 1 },
    { "scheme": "4mica-credit", "network": "eip155:11155111", "x402Version": 2 },
    { "scheme": "4mica-credit", "network": "eip155:84532", "x402Version": 1 },
    { "scheme": "4mica-credit", "network": "eip155:84532", "x402Version": 2 }
  ],
  "health": "/health",
  "docs": "See README.md for a full flow walkthrough."
}`}
                          language="json"
                        />
                      </div>

                      <div className="border border-white/10 rounded-lg p-5 space-y-2 bg-white/5">
                        <h3 className="text-lg font-semibold text-ink-strong">GET /health</h3>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">What it does:</span> Liveness probe for load balancers.
                        </p>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">Gets:</span> No body.
                        </p>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">Returns:</span>{' '}
                          <code className="font-mono">{'{ status: "ok" }'}</code>
                        </p>
                        <CodeBlock code={`{ "status": "ok" }`} language="json" />
                      </div>

                      <div className="border border-white/10 rounded-lg p-5 space-y-2 bg-white/5">
                        <h3 className="text-lg font-semibold text-ink-strong">GET /supported</h3>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">What it does:</span> Lists all supported (scheme, network) pairs
                          for credit and any delegated exact/debit flows.
                        </p>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">Gets:</span> No body.
                        </p>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">Returns:</span>{' '}
                          <code className="font-mono">
                            {'{ kinds: [{ scheme, network, x402Version?, extra? }], extensions: [], signers: {} }'}
                          </code>
                        </p>
                        <CodeBlock
                          code={`{
  "kinds": [
    { "scheme": "4mica-credit", "network": "eip155:11155111", "x402Version": 1 },
    { "scheme": "4mica-credit", "network": "eip155:11155111", "x402Version": 2 },
    { "scheme": "4mica-credit", "network": "eip155:84532", "x402Version": 1 },
    { "scheme": "4mica-credit", "network": "eip155:84532", "x402Version": 2 }
  ],
  "extensions": [],
  "signers": {}
}`}
                          language="json"
                        />
                      </div>

                      <div className="border border-white/10 rounded-lg p-5 space-y-2 bg-white/5">
                        <h3 className="text-lg font-semibold text-ink-strong">POST /tabs</h3>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">What it does:</span> Opens or reuses a payment tab for a
                          (user, recipient, asset) triple. Used by your tab endpoint.
                        </p>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">Gets:</span>{' '}
                          <code className="font-mono">
                            {'{ userAddress, recipientAddress, network?, erc20Token?, ttlSeconds? }'}
                          </code>
                          . Networks use CAIP-2 identifiers (e.g. <code className="font-mono">eip155:11155111</code> for Ethereum Sepolia, <code className="font-mono">eip155:84532</code> for Base Sepolia).
                          Use <code className="font-mono">erc20Token</code> = null or omit for ETH. Aliases:{' '}
                          <code className="font-mono">assetAddress</code> and <code className="font-mono">networkId</code> are accepted.
                          If <code className="font-mono">network</code> is omitted, the facilitator defaults to the first configured network.
                        </p>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">Returns:</span>{' '}
                          <code className="font-mono">
                            {'{ tabId, userAddress, recipientAddress, assetAddress, startTimestamp, ttlSeconds, nextReqId }'}
                          </code>
                          . <code className="font-mono">tabId</code> is a canonical hex string and{' '}
                          <code className="font-mono">nextReqId</code> is the next sequential request id.
                        </p>
                        <CodeTabs
                          blocks={[
                            {
                              label: 'Request',
                              language: 'json',
                              code: `{
  "network": "eip155:84532",
  "userAddress": "0xUser",
  "recipientAddress": "0xRecipient",
  "erc20Token": null,
  "ttlSeconds": 86400
}`,
                            },
                            {
                              label: 'Response',
                              language: 'json',
                              code: `{
  "tabId": "0x0000000000000000000000000000000000000000000000000000000000000042",
  "userAddress": "0xUser",
  "recipientAddress": "0xRecipient",
  "assetAddress": "0xAsset",
  "startTimestamp": 1716500000,
  "ttlSeconds": 86400,
  "nextReqId": "0x0"
}`,
                            },
                          ]}
                        />
                      </div>

                      <div className="border border-white/10 rounded-lg p-5 space-y-2 bg-white/5">
                        <h3 className="text-lg font-semibold text-ink-strong">POST /verify</h3>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">What it does:</span> Validates the structure of the decoded
                          payment envelope against the original payment requirements. No on-chain work is done here.
                        </p>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">Gets:</span>{' '}
                          <code className="font-mono">
                            {'{ x402Version?: 1|2, paymentPayload: { ... }, paymentRequirements }'}
                          </code>
                          . <code className="font-mono">paymentPayload</code> is the decoded payment header
                          (<code className="font-mono">X-PAYMENT</code> for v1, <code className="font-mono">PAYMENT-SIGNATURE</code> for v2).
                        </p>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">Returns:</span>{' '}
                          <code className="font-mono">
                            {'{ isValid: true|false, invalidReason?, certificate? }'}
                          </code>
                          . Invalid requests return <code className="font-mono">isValid: false</code> with a reason.
                        </p>
                        <CodeTabs
                          blocks={[
                            {
                              label: 'Request',
                              language: 'json',
                              code: `{
  "x402Version": 1,
  "paymentPayload": {
    "x402Version": 1,
    "scheme": "4mica-credit",
    "network": "eip155:84532",
    "payload": {
      "claims": {
        "user_address": "0xUser",
        "recipient_address": "0xRecipient",
        "tab_id": "0x42",
        "req_id": "0x0",
        "amount": "0x2386f26fc10000",
        "asset_address": "0xAsset",
        "timestamp": 1716500000,
        "version": 1
      },
      "signature": "0x...",
      "scheme": "eip712"
    }
  },
  "paymentRequirements": {
    "scheme": "4mica-credit",
    "network": "eip155:84532",
    "maxAmountRequired": "10000000000000000",
    "payTo": "0xRecipient",
    "asset": "0xAsset",
    "extra": { "tabEndpoint": "https://api.example.com/x402/tab" }
  }
}`,
                            },
                            {
                              label: 'Response',
                              language: 'json',
                              code: `{
  "isValid": true,
  "invalidReason": null,
  "certificate": null
}`,
                            },
                          ]}
                        />
                      </div>

                      <div className="border border-white/10 rounded-lg p-5 space-y-2 bg-white/5">
                        <h3 className="text-lg font-semibold text-ink-strong">POST /settle</h3>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">What it does:</span> Re-validates the decoded payment header and
                          issues a BLS certificate for 4mica-credit (or proxies exact/debit settlements). This step does
                          not execute ERC-8004 validation; it only returns the certificate used later on-chain.
                        </p>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">Gets:</span>{' '}
                          <code className="font-mono">
                            {'{ x402Version?: 1|2, paymentPayload: { ... }, paymentRequirements }'}
                          </code>
                          .
                        </p>
                        <p className="text-sm text-ink-body">
                          <span className="font-semibold">Returns:</span>{' '}
                          <code className="font-mono">
                            {'{ success, error?, txHash?, networkId?, certificate? }'}
                          </code>
                          . For 4mica-credit, <code className="font-mono">success</code> is true and a{' '}
                          <code className="font-mono">certificate</code> is included. Delegated exact flows may return{' '}
                          <code className="font-mono">txHash</code> instead.
                        </p>
                        <CodeTabs
                          blocks={[
                            {
                              label: 'Request',
                              language: 'json',
                              code: `{
  "x402Version": 1,
  "paymentPayload": {
    "x402Version": 1,
    "scheme": "4mica-credit",
    "network": "eip155:84532",
    "payload": {
      "claims": {
        "user_address": "0xUser",
        "recipient_address": "0xRecipient",
        "tab_id": "0x42",
        "req_id": "0x0",
        "amount": "0x2386f26fc10000",
        "asset_address": "0xAsset",
        "timestamp": 1716500000,
        "version": 1
      },
      "signature": "0x...",
      "scheme": "eip712"
    }
  },
  "paymentRequirements": {
    "scheme": "4mica-credit",
    "network": "eip155:84532",
    "maxAmountRequired": "10000000000000000",
    "payTo": "0xRecipient",
    "asset": "0xAsset",
    "extra": { "tabEndpoint": "https://api.example.com/x402/tab" }
  }
}`,
                            },
                            {
                              label: 'Response',
                              language: 'json',
                              code: `{
  "success": true,
  "error": null,
  "txHash": null,
  "networkId": "eip155:84532",
  "certificate": {
    "claims": "0x...",
    "signature": "0x..."
  }
}`,
                            },
                          ]}
                        />
                      </div>
                    </div>

                    <div className="border border-white/10 rounded-lg p-6 space-y-3">
                      <h3 className="text-lg font-semibold text-ink-strong">Shared payloads</h3>
                      <div className="text-sm text-ink-body space-y-2">
                        <p>
                          <span className="font-semibold">paymentRequirements</span> must include{' '}
                          <code className="font-mono">scheme</code>, <code className="font-mono">network</code>,{' '}
                          <code className="font-mono">maxAmountRequired</code> (x402 v1) or <code className="font-mono">amount</code> (x402 v2),{' '}
                          <code className="font-mono">payTo</code>, <code className="font-mono">asset</code>, plus optional{' '}
                          <code className="font-mono">resource</code>, <code className="font-mono">description</code>,{' '}
                          <code className="font-mono">mimeType</code>, <code className="font-mono">outputSchema</code>,{' '}
                          <code className="font-mono">maxTimeoutSeconds</code>, and <code className="font-mono">extra</code>.
                        </p>
                        <p>
                          <span className="font-semibold">V2 validation fields:</span> when using x402 v2 claims, include
                          <code className="font-mono"> validationRegistryAddress</code>, <code className="font-mono">validatorAddress</code>,{' '}
                          <code className="font-mono">validatorAgentId</code>, and <code className="font-mono">minValidationScore</code> in{' '}
                          <code className="font-mono">paymentRequirements.extra</code>.{' '}
                          <code className="font-mono">requiredValidationTag</code> is optional. For V2 signing with the
                          TypeScript SDK / <code className="font-mono">@4mica/x402</code> packages, include{' '}
                          <code className="font-mono">validationChainId</code> and make it match{' '}
                          <code className="font-mono">network</code> (<code className="font-mono">eip155:&lt;chainId&gt;</code>).
                          Some SDKs can derive it from <code className="font-mono">network</code> when omitted.
                        </p>
                        <p>
                          <span className="font-semibold">paymentPayload</span> is the decoded payment header
                          (<code className="font-mono">X-PAYMENT</code> for v1, <code className="font-mono">PAYMENT-SIGNATURE</code> for v2)
                          and supports <code className="font-mono">x402Version</code> 1 or 2.
                        </p>
                        <p>
                          <span className="font-semibold">certificate</span> is returned as{' '}
                          <code className="font-mono">{'{ claims, signature }'}</code>, both hex strings suitable for
                          on-chain remuneration.
                        </p>
                        <p>
                          <span className="font-semibold">V2 remuneration rule:</span> a V2 certificate can be remunerated only
                          if the configured ERC-8004 Validation Registry has a response for the signed
                          <code className="font-mono"> validation_request_hash</code> and policy checks pass
                          (score threshold, validator/agent, optional tag, canonical hashes, trusted registry).
                        </p>
                        <p>
                          <span className="font-semibold">Versioning:</span> the facilitator only accepts{' '}
                          <code className="font-mono">x402Version = 1</code> or <code className="font-mono">2</code>. If the top-level
                          field is omitted, the server resolves the version from <code className="font-mono">paymentPayload</code>.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'operator-api' && (
                <div>
                  <h2 className="text-3xl font-bold text-ink-strong mb-6">Operator API Reference</h2>
                  <div className="space-y-6">
                    <p className="text-ink-body leading-relaxed">
                      Core operator endpoints are served by <code className="font-mono">4mica-core/core</code>. Core routes live under
                      <code className="font-mono">/core</code>, and auth routes live under <code className="font-mono">/auth</code>. All non-public
                      endpoints require an access token.
                    </p>
                    <div className="bg-white/10 border border-white/10 rounded-lg p-5 text-sm text-ink-body space-y-2">
                      <p>
                        <span className="font-semibold">Public endpoints:</span>{' '}
                        <code className="font-mono">/auth/*</code>, <code className="font-mono">/core/health</code>,{' '}
                        <code className="font-mono">/core/public-params</code>
                      </p>
                      <p>
                        <span className="font-semibold">Auth header:</span>{' '}
                        <code className="font-mono">Authorization: Bearer &lt;access_token&gt;</code>
                      </p>
                      <p>
                        <span className="font-semibold">Scopes:</span>{' '}
                        <code className="font-mono">tab:create</code>, <code className="font-mono">tab:read</code>,{' '}
                        <code className="font-mono">guarantee:issue</code>
                      </p>
                      <p>
                        <span className="font-semibold">Roles:</span>{' '}
                        <code className="font-mono">admin</code>, <code className="font-mono">facilitator</code>
                      </p>
                    </div>
                    <div className="border border-white/10 rounded-lg p-5 text-sm text-ink-body space-y-2">
                      <h3 className="text-lg font-semibold text-ink-strong">Access rules</h3>
                      <ul className="list-disc list-inside space-y-1">
                        <li>
                          <code className="font-mono">tab:create</code> is required for <code className="font-mono">/core/payment-tabs</code>; recipient must
                          match the token subject or the <code className="font-mono">facilitator</code> role.
                        </li>
                        <li>
                          <code className="font-mono">guarantee:issue</code> is required for <code className="font-mono">/core/guarantees</code>; recipient must
                          match the token subject or the <code className="font-mono">facilitator</code> role.
                        </li>
                        <li>
                          <code className="font-mono">tab:read</code> is required for all tab, guarantee, payment, and collateral reads.
                        </li>
                        <li>
                          Recipient-address list routes allow the <code className="font-mono">facilitator</code> role, except
                          <code className="font-mono">/core/recipients/{'{recipient_address}'}/payments</code> which requires recipient match.
                        </li>
                        <li>
                          Tab-specific routes require tab ownership (user or recipient) or the <code className="font-mono">facilitator</code> role.
                        </li>
                        <li>
                          <code className="font-mono">/core/users/{'{user_address}'}/suspension</code> requires the <code className="font-mono">admin</code> role.
                        </li>
                      </ul>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {[
                        {
                          method: 'POST',
                          path: '/auth/nonce',
                          desc: 'Request a SIWE nonce + template.',
                          expects: '{ address }',
                          returns: '{ nonce, siwe: { domain, uri, chain_id, statement, expiration, issued_at } }',
                          examples: [
                            {
                              label: 'Request',
                              language: 'json',
                              code: `{
  "address": "0xUser"
}`,
                            },
                            {
                              label: 'Response',
                              language: 'json',
                              code: `{
  "nonce": "9c1c0c7e",
  "siwe": {
    "domain": "4mica.io",
    "uri": "https://4mica.io",
    "chain_id": 1,
    "statement": "Sign in to 4Mica",
    "expiration": "2026-02-03T00:00:00Z",
    "issued_at": "2026-02-03T00:00:00Z"
  }
}`,
                            },
                          ],
                        },
                        {
                          method: 'POST',
                          path: '/auth/verify',
                          desc: 'Verify SIWE signature and issue tokens.',
                          expects: '{ address, message, signature }',
                          returns: '{ access_token, refresh_token, expires_in }',
                          examples: [
                            {
                              label: 'Request',
                              language: 'json',
                              code: `{
  "address": "0xUser",
  "message": "SIWE message string",
  "signature": "0xSignature"
}`,
                            },
                            {
                              label: 'Response',
                              language: 'json',
                              code: `{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "rfr_...",
  "expires_in": 3600
}`,
                            },
                          ],
                        },
                        {
                          method: 'POST',
                          path: '/auth/refresh',
                          desc: 'Refresh access and refresh tokens.',
                          expects: '{ refresh_token }',
                          returns: '{ access_token, refresh_token, expires_in }',
                          examples: [
                            {
                              label: 'Request',
                              language: 'json',
                              code: `{
  "refresh_token": "rfr_..."
}`,
                            },
                            {
                              label: 'Response',
                              language: 'json',
                              code: `{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "rfr_...",
  "expires_in": 3600
}`,
                            },
                          ],
                        },
                        {
                          method: 'POST',
                          path: '/auth/logout',
                          desc: 'Revoke a refresh token.',
                          expects: '{ refresh_token }',
                          returns: '{ revoked }',
                          examples: [
                            {
                              label: 'Request',
                              language: 'json',
                              code: `{
  "refresh_token": "rfr_..."
}`,
                            },
                            {
                              label: 'Response',
                              language: 'json',
                              code: `{
  "revoked": true
}`,
                            },
                          ],
                        },
                        {
                          method: 'GET',
                          path: '/core/health',
                          desc: 'Liveness + listener readiness.',
                          expects: 'No body.',
                          returns: '{ status: "ok", listener_ready: true }',
                          examples: [
                            {
                              label: 'Response',
                              language: 'json',
                              code: `{
  "status": "ok",
  "listener_ready": true
}`,
                            },
                          ],
                        },
                        {
                          method: 'GET',
                          path: '/core/public-params',
                          desc: 'Public operator parameters.',
                          expects: 'No body.',
                          returns:
                            '{ public_key, contract_address, ethereum_http_rpc_url, eip712_name, eip712_version, chain_id }',
                          examples: [
                            {
                              label: 'Response',
                              language: 'json',
                              code: `{
  "public_key": [1, 2, 3],
  "contract_address": "0xCoreContract",
  "ethereum_http_rpc_url": "https://rpc.example.com",
  "eip712_name": "4Mica",
  "eip712_version": "1",
  "chain_id": 1
}`,
                            },
                          ],
                        },
                        {
                          method: 'POST',
                          path: '/core/payment-tabs',
                          desc: 'Create or reuse a payment tab.',
                          expects:
                            '{ user_address, recipient_address, erc20_token?, ttl? }',
                          returns:
                            '{ id, user_address, recipient_address, erc20_token?, next_req_id }',
                          examples: [
                            {
                              label: 'Request',
                              language: 'json',
                              code: `{
  "user_address": "0xUser",
  "recipient_address": "0xRecipient",
  "erc20_token": null,
  "ttl": 3600
}`,
                            },
                            {
                              label: 'Response',
                              language: 'json',
                              code: `{
  "id": "0x1",
  "user_address": "0xUser",
  "recipient_address": "0xRecipient",
  "erc20_token": null,
  "next_req_id": "0x0"
}`,
                            },
                          ],
                        },
                        {
                          method: 'POST',
                          path: '/core/guarantees',
                          desc: 'Issue a BLS guarantee for a signed request (V1 or V2).',
                          expects:
                            '{ claims: { version: "v1"| "v2", ... }, signature, scheme: "eip712" | "eip191" }',
                          returns: '{ claims, signature } (BLSCert)',
                          examples: [
                            {
                              label: 'Request',
                              language: 'json',
                              code: `{
  "claims": {
    "version": "v1",
    "user_address": "0xUser",
    "recipient_address": "0xRecipient",
    "tab_id": "0x1",
    "req_id": "0x0",
    "amount": "0x64",
    "asset_address": "0xAsset",
    "timestamp": 1716500000
  },
  "signature": "0xUserSig",
  "scheme": "eip712"
}`,
                            },
                            {
                              label: 'Response',
                              language: 'json',
                              code: `{
  "claims": "0xClaimsBytes",
  "signature": "0xBlsSignature"
}`,
                            },
                          ],
                        },
                        {
                          method: 'GET',
                          path: '/core/recipients/{recipient_address}/settled-tabs',
                          desc: 'List settled + remunerated tabs for a recipient.',
                          expects: 'Path param: recipient_address.',
                          returns: 'TabInfo[]',
                          examples: [
                            {
                              label: 'Response',
                              language: 'json',
                              code: `[
  {
    "tab_id": "0x1",
    "user_address": "0xUser",
    "recipient_address": "0xRecipient",
    "asset_address": "0xAsset",
    "start_timestamp": 1716500000,
    "ttl_seconds": 3600,
    "status": "open",
    "settlement_status": "settled",
    "created_at": 1716500000,
    "updated_at": 1716500300
  }
]`,
                            },
                          ],
                        },
                        {
                          method: 'GET',
                          path: '/core/recipients/{recipient_address}/pending-remunerations',
                          desc: 'List pending remunerations for a recipient.',
                          expects: 'Path param: recipient_address.',
                          returns: 'PendingRemunerationInfo[]',
                          examples: [
                            {
                              label: 'Response',
                              language: 'json',
                              code: `[
  {
    "tab": {
      "tab_id": "0x1",
      "user_address": "0xUser",
      "recipient_address": "0xRecipient",
      "asset_address": "0xAsset",
      "start_timestamp": 1716500000,
      "ttl_seconds": 3600,
      "status": "open",
      "settlement_status": "pending",
      "created_at": 1716500000,
      "updated_at": 1716500300
    },
    "latest_guarantee": {
      "tab_id": "0x1",
      "req_id": "0x0",
      "from_address": "0xUser",
      "to_address": "0xRecipient",
      "asset_address": "0xAsset",
      "amount": "0x64",
      "start_timestamp": 1716500000,
      "certificate": "0xCertificateBytes"
    }
  }
]`,
                            },
                          ],
                        },
                        {
                          method: 'GET',
                          path: '/core/tabs/{tab_id}',
                          desc: 'Fetch a single tab.',
                          expects: 'Path param: tab_id.',
                          returns: 'TabInfo | null',
                          examples: [
                            {
                              label: 'Response',
                              language: 'json',
                              code: `{
  "tab_id": "0x1",
  "user_address": "0xUser",
  "recipient_address": "0xRecipient",
  "asset_address": "0xAsset",
  "start_timestamp": 1716500000,
  "ttl_seconds": 3600,
  "status": "open",
  "settlement_status": "pending",
  "created_at": 1716500000,
  "updated_at": 1716500300
}`,
                            },
                          ],
                        },
                        {
                          method: 'GET',
                          path: '/core/recipients/{recipient_address}/tabs',
                          desc: 'List tabs for a recipient.',
                          expects:
                            'Path param: recipient_address. Optional query: settlement_status (repeatable).',
                          returns: 'TabInfo[]',
                          examples: [
                            {
                              label: 'Response',
                              language: 'json',
                              code: `[
  {
    "tab_id": "0x1",
    "user_address": "0xUser",
    "recipient_address": "0xRecipient",
    "asset_address": "0xAsset",
    "start_timestamp": 1716500000,
    "ttl_seconds": 3600,
    "status": "open",
    "settlement_status": "pending",
    "created_at": 1716500000,
    "updated_at": 1716500300
  }
]`,
                            },
                          ],
                        },
                        {
                          method: 'GET',
                          path: '/core/tabs/{tab_id}/guarantees',
                          desc: 'List all guarantees for a tab.',
                          expects: 'Path param: tab_id.',
                          returns: 'GuaranteeInfo[]',
                          examples: [
                            {
                              label: 'Response',
                              language: 'json',
                              code: `[
  {
    "tab_id": "0x1",
    "req_id": "0x0",
    "from_address": "0xUser",
    "to_address": "0xRecipient",
    "asset_address": "0xAsset",
    "amount": "0x64",
    "start_timestamp": 1716500000,
    "certificate": "0xCertificateBytes"
  }
]`,
                            },
                          ],
                        },
                        {
                          method: 'GET',
                          path: '/core/tabs/{tab_id}/guarantees/latest',
                          desc: 'Get the latest guarantee for a tab.',
                          expects: 'Path param: tab_id.',
                          returns: 'GuaranteeInfo | null',
                          examples: [
                            {
                              label: 'Response',
                              language: 'json',
                              code: `{
  "tab_id": "0x1",
  "req_id": "0x0",
  "from_address": "0xUser",
  "to_address": "0xRecipient",
  "asset_address": "0xAsset",
  "amount": "0x64",
  "start_timestamp": 1716500000,
  "certificate": "0xCertificateBytes"
}`,
                            },
                          ],
                        },
                        {
                          method: 'GET',
                          path: '/core/tabs/{tab_id}/guarantees/{req_id}',
                          desc: 'Get a specific guarantee by req_id.',
                          expects: 'Path params: tab_id, req_id.',
                          returns: 'GuaranteeInfo | null',
                          examples: [
                            {
                              label: 'Response',
                              language: 'json',
                              code: `{
  "tab_id": "0x1",
  "req_id": "0x0",
  "from_address": "0xUser",
  "to_address": "0xRecipient",
  "asset_address": "0xAsset",
  "amount": "0x64",
  "start_timestamp": 1716500000,
  "certificate": "0xCertificateBytes"
}`,
                            },
                          ],
                        },
                        {
                          method: 'GET',
                          path: '/core/recipients/{recipient_address}/payments',
                          desc: 'List on-chain payments observed for a recipient.',
                          expects: 'Path param: recipient_address.',
                          returns: 'UserTransactionInfo[]',
                          examples: [
                            {
                              label: 'Response',
                              language: 'json',
                              code: `[
  {
    "user_address": "0xUser",
    "recipient_address": "0xRecipient",
    "tx_hash": "0xTxHash",
    "amount": "0x64",
    "verified": true,
    "finalized": true,
    "failed": false,
    "created_at": 1716500000
  }
]`,
                            },
                          ],
                        },
                        {
                          method: 'GET',
                          path: '/core/tabs/{tab_id}/collateral-events',
                          desc: 'List collateral events tied to a tab.',
                          expects: 'Path param: tab_id.',
                          returns: 'CollateralEventInfo[]',
                          examples: [
                            {
                              label: 'Response',
                              language: 'json',
                              code: `[
  {
    "id": "evt_1",
    "user_address": "0xUser",
    "asset_address": "0xAsset",
    "amount": "0x64",
    "event_type": "guarantee_issued",
    "tab_id": "0x1",
    "req_id": "0x0",
    "tx_id": null,
    "created_at": 1716500000
  }
]`,
                            },
                          ],
                        },
                        {
                          method: 'GET',
                          path: '/core/users/{user_address}/assets/{asset_address}',
                          desc: 'Get a user’s asset balance.',
                          expects: 'Path params: user_address, asset_address.',
                          returns: 'AssetBalanceInfo | null',
                          examples: [
                            {
                              label: 'Response',
                              language: 'json',
                              code: `{
  "user_address": "0xUser",
  "asset_address": "0xAsset",
  "total": "0x64",
  "locked": "0x10",
  "version": 1,
  "updated_at": 1716500000
}`,
                            },
                          ],
                        },
                        {
                          method: 'POST',
                          path: '/core/users/{user_address}/suspension',
                          desc: 'Suspend or unsuspend a user.',
                          expects:
                            'Header: Authorization: Bearer <access_token> (role admin). Body: { suspended: boolean }',
                          returns: '{ user_address, suspended, updated_at }',
                          examples: [
                            {
                              label: 'Request',
                              language: 'json',
                              code: `{
  "suspended": true
}`,
                            },
                            {
                              label: 'Response',
                              language: 'json',
                              code: `{
  "user_address": "0xUser",
  "suspended": true,
  "updated_at": 1716500000
}`,
                            },
                          ],
                        },
                      ].map((endpoint) => (
                        <div key={`${endpoint.method}-${endpoint.path}`} className="border border-white/10 rounded-lg p-5 space-y-2 bg-white/5">
                          <h3 className="text-lg font-semibold text-ink-strong">
                            {endpoint.method} {endpoint.path}
                          </h3>
                          <p className="text-sm text-ink-body">
                            <span className="font-semibold">What it does:</span> {endpoint.desc}
                          </p>
                          <p className="text-sm text-ink-body">
                            <span className="font-semibold">Gets:</span> {endpoint.expects}
                          </p>
                          <p className="text-sm text-ink-body">
                            <span className="font-semibold">Returns:</span> {endpoint.returns}
                          </p>
                          {endpoint.examples && <CodeTabs blocks={endpoint.examples} />}
                        </div>
                      ))}
                    </div>
                    <div className="border border-white/10 rounded-lg p-5 text-sm text-ink-body space-y-2">
                      <h3 className="text-lg font-semibold text-ink-strong">Response shape notes</h3>
                      <ul className="list-disc list-inside space-y-1">
                        <li><code className="font-mono">TabInfo</code>: tab_id, user_address, recipient_address, asset_address, start_timestamp, ttl_seconds, status, settlement_status, created_at, updated_at.</li>
                        <li><code className="font-mono">GuaranteeInfo</code>: tab_id, req_id, from_address, to_address, asset_address, amount, start_timestamp, certificate?.</li>
                        <li><code className="font-mono">PendingRemunerationInfo</code>: tab, latest_guarantee?.</li>
                        <li><code className="font-mono">CollateralEventInfo</code>: id, user_address, asset_address, amount, event_type, tab_id?, req_id?, tx_id?, created_at.</li>
                        <li><code className="font-mono">UserTransactionInfo</code>: user_address, recipient_address, tx_hash, amount, verified, finalized, failed, created_at.</li>
                        <li><code className="font-mono">AssetBalanceInfo</code>: user_address, asset_address, total, locked, version, updated_at.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'payment-flow' && (
                <div>
                  <h2 className="text-3xl font-bold text-ink-strong mb-6">Protocol Flow</h2>
                  <div className="space-y-6">
                    <p className="text-ink-body leading-relaxed">
                      This flow summarizes the internal protocol sequence for credit guarantees, from collateral to settlement and
                      remuneration. It mirrors the internal sequence diagrams in <code className="font-mono">Sequence Diagrams</code>.
                    </p>
                    <p className="text-ink-body leading-relaxed">
                      If you want to see the interactive protocol design, click{' '}
                      <Link href="/interactive-protocol" className="text-brand-teal hover:text-brand-teal/80 underline">
                        here
                      </Link>.
                    </p>
                    <div className="bg-white/10 border border-white/10 rounded-lg p-6">
                      <ol className="list-decimal list-inside space-y-3 text-ink-body">
                        <li>
                          <span className="font-semibold text-ink-body">Deposit collateral.</span> Payers deposit ETH or ERC-20 into the
                          Core4Mica vault; the core listener persists collateral events so wallets are eligible.
                        </li>
                        <li>
                          <span className="font-semibold text-ink-body">Discovery.</span> The resource returns a 402 template with accepted
                          <code className="font-mono"> (scheme, network)</code> pairs and a <code className="font-mono">tabEndpoint</code>.
                        </li>
                        <li>
                          <span className="font-semibold text-ink-body">Tab provisioning.</span> The resource calls the facilitator
                          <code className="font-mono"> /tabs</code> (typically via <code className="font-mono">tabEndpoint</code>) to open or reuse a tab.
                        </li>
                        <li>
                          <span className="font-semibold text-ink-body">Header composition.</span> The payer (or SDK helper) signs
                          V1 claims by default, or V2 claims when validation policy fields are present in
                          <code className="font-mono"> paymentRequirements.extra</code>, then wraps them into a base64
                          payment header (<code className="font-mono">X-PAYMENT</code> for v1, <code className="font-mono">PAYMENT-SIGNATURE</code> for v2).
                        </li>
                        <li>
                          <span className="font-semibold text-ink-body">Verification.</span> The resource calls
                          <code className="font-mono"> /verify</code> for structural validation (no core call).
                        </li>
                        <li>
                          <span className="font-semibold text-ink-body">Settlement.</span> The resource calls
                          <code className="font-mono"> /settle</code>, the facilitator requests a BLS certificate from core, verifies it, and returns it.
                        </li>
                        <li>
                          <span className="font-semibold text-ink-body">Validation (V2 only).</span> If the guarantee is V2 and the payer defaults,
                          the recipient (or validator workflow) must have an ERC-8004 validation response that satisfies the signed
                          policy before calling <code className="font-mono">remunerate</code>.
                        </li>
                        <li>
                          <span className="font-semibold text-ink-body">Tab closure.</span> Happy path: the payer settles on-chain using the
                          <code className="font-mono"> req_id</code> in the certificate. Default path: after grace period, the recipient
                          remunerates on-chain with the certificate.
                        </li>
                        <li>
                          <span className="font-semibold text-ink-body">Withdrawals &amp; sync.</span> Withdrawal requests pause guarantees while
                          events settle; background operators stream events to keep core state aligned.
                        </li>
                      </ol>
                    </div>
                    <div className="border border-white/10 rounded-lg p-6 space-y-3">
                      <h3 className="text-lg font-semibold text-ink-strong">High-level sequence</h3>
                      <MermaidDiagram
                        code={`sequenceDiagram
    autonumber
    participant Client as Payer SDK
    participant Resource as Recipient Resource
    participant Facilitator as x402-4Mica Facilitator
    participant CoreService as 4Mica Core
    participant Contract as Vault
    participant Validation as ERC-8004 ValidationRegistry

    Client->>Contract: Deposit collateral
    Contract-->>CoreService: Collateral event
    CoreService->>CoreService: Sync collateral state

    Client->>Resource: Request protected content
    Resource-->>Client: 402 Payment Required (template + tabEndpoint)
    Client->>Resource: POST tabEndpoint (wallet + requirements)
    Resource->>Facilitator: POST /tabs
    Facilitator->>CoreService: Create/reuse tab
    CoreService-->>Facilitator: Tab metadata
    Facilitator-->>Resource: Tab info
    Resource-->>Client: paymentRequirements + tabId (bound to wallet)

    Client->>Resource: Retry with payment header (X-PAYMENT/PAYMENT-SIGNATURE)
    Resource->>Facilitator: POST /verify
    Facilitator-->>Resource: Valid / invalid decision

    Resource->>Facilitator: POST /settle
    Facilitator->>CoreService: Request guarantee
    CoreService-->>Facilitator: BLS certificate
    Facilitator-->>Resource: Success + certificate
    Resource-->>Client: Serve protected response

    alt User pays tab
        Client->>Contract: payTab/payTabInERC20Token
        Contract-->>CoreService: Payment events
        CoreService->>CoreService: Record payment & unlock collateral
        CoreService-->>Resource: Tab marked settled
    else User defaults and Recipient redeems guarantee
        Note over Resource,Validation: V2 only: validation response must satisfy policy
        Resource->>Validation: getValidationStatus(validation_request_hash)
        Validation-->>Resource: score/tag/validator/agent/lastUpdate
        Resource->>Contract: remunerate(guarantee, signature)
        Contract-->>CoreService: RecipientRemunerated event
        CoreService->>CoreService: Update repo, reduce collateral
        Contract->>Resource: Pay amount of tab from User collateral
    end

    Client->>Contract: Request/cancel/finalize withdrawal
    Contract-->>CoreService: Withdrawal events
    CoreService->>CoreService: Pause/unpause wallet & update balances`}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="border border-white/10 rounded-lg p-4">
                        <h4 className="font-semibold text-ink-body mb-3">Actors</h4>
                        <ul className="space-y-2 text-sm text-ink-body">
                          <li>Payer SDK: deposits collateral, signs guarantees, pays tabs.</li>
                          <li>Recipient resource: issues 402 templates, calls verify/settle.</li>
                          <li>Facilitator (<code className="font-mono">x402-4mica</code>): /tabs, /verify, /settle orchestration.</li>
                          <li>Core service: issues BLS guarantees and tracks tab state.</li>
                          <li>Core4Mica contract: custodies collateral and pays/remunerates.</li>
                        </ul>
                      </div>
                      <div className="border border-white/10 rounded-lg p-4">
                        <h4 className="font-semibold text-ink-body mb-3">Guards &amp; guarantees</h4>
                        <ul className="space-y-2 text-sm text-ink-body">
                          <li>/verify is structural only; no core calls.</li>
                          <li>/settle upgrades claims with monotonic <code className="font-mono">req_id</code> and running totals.</li>
                          <li>Certificates are verified against operator public parameters and domain.</li>
                          <li>Remuneration only succeeds after grace period and if the tab is unpaid.</li>
                          <li>V2 additionally requires passing ERC-8004 validation status that matches the signed policy.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'examples' && (
                <div>
                  <h2 className="text-3xl font-bold text-ink-strong mb-6">Code Examples</h2>
                  <div className="space-y-6">
                    <div className="text-sm text-ink-body">
                      Grab the full demo repo and run it locally:{' '}
                      <a
                        className="text-brand-deep"
                        href="https://github.com/4mica-Network/x402-4mica/blob/feat/x402-ts-utils/packages/typescript/x402/demo"
                        target="_blank"
                        rel="noreferrer"
                      >
                        github.com/4mica-Network/x402-4mica/blob/feat/x402-ts-utils/packages/typescript/x402/demo
                      </a>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-ink-strong mb-3">Demo Walkthrough</h3>
                      <div className="space-y-5 text-sm text-ink-body">
                        <p>
                          This demo shows how to use <code className="font-mono">@4mica/x402</code> to protect an API endpoint with
                          4mica payments. Follow the steps below to build the package, start the server, and run the client.
                        </p>
                        <div className="space-y-3">
                          <h4 className="text-lg font-semibold text-ink-strong">Step 1: Install dependencies</h4>
                          <p>
                            Build the parent package first, then install the demo dependencies from the demo directory.
                          </p>
                          <CodeBlock
                            code={`cd demo
yarn install`}
                            language="bash"
                          />
                        </div>
                        <div className="space-y-3">
                          <h4 className="text-lg font-semibold text-ink-strong">Step 2: Configure environment variables</h4>
                          <p>
                            Copy the example env file and update it with your key and optional pay-to address.
                          </p>
                          <CodeBlock
                            code={`cp .env.example .env
# Edit .env with your private key and settings`}
                            language="bash"
                          />
                          <ul className="list-disc list-inside space-y-1">
                            <li>
                              <code className="font-mono">PRIVATE_KEY</code>: Ethereum private key (0x-prefixed) on Sepolia.
                            </li>
                            <li>
                              <code className="font-mono">PAY_TO_ADDRESS</code>: address that receives payments (optional).
                            </li>
                          </ul>
                        </div>
                        <div className="space-y-3">
                          <h4 className="text-lg font-semibold text-ink-strong">Step 3: Start the server</h4>
                          <p>
                            Run the server from the demo directory, or from the package root using the demo script.
                          </p>
                          <CodeTabs
                            blocks={[
                              {
                                label: 'Demo Directory',
                                language: 'bash',
                                code: `yarn server`,
                              },
                              {
                                label: 'Package Root',
                                language: 'bash',
                                code: `yarn demo:server`,
                              },
                            ]}
                          />
                          <p className="text-sm text-ink-body">You should see output similar to:</p>
                          <CodeBlock
                            code={`x402 Demo Server running on http://localhost:3000
Protected endpoint: http://localhost:3000/api/premium-data
Payment required: $0.05 (4mica credit on Sepolia)`}
                            language="bash"
                          />
                        </div>
                        <div className="space-y-3">
                          <h4 className="text-lg font-semibold text-ink-strong">Step 4: Run the client</h4>
                          <p>
                            The client loads environment variables from <code className="font-mono">.env</code> and handles payment
                            automatically.
                          </p>
                          <CodeTabs
                            blocks={[
                              {
                                label: 'Demo Directory',
                                language: 'bash',
                                code: `yarn client`,
                              },
                              {
                                label: 'Package Root',
                                language: 'bash',
                                code: `yarn demo:client`,
                              },
                            ]}
                          />
                          <p className="text-sm text-ink-body">You can also provide a key inline:</p>
                          <CodeBlock
                            code={`PRIVATE_KEY=0xYourPrivateKey yarn client`}
                            language="bash"
                          />
                        </div>
                        <div className="space-y-3">
                          <h4 className="text-lg font-semibold text-ink-strong">What happens</h4>
                          <ol className="list-decimal list-inside space-y-1">
                            <li>
                              The server starts with a single protected endpoint: <code className="font-mono">GET /api/premium-data</code>.
                            </li>
                            <li>
                              The client makes a request, receives <code className="font-mono">402 Payment Required</code>, opens a tab,
                              signs a guarantee, and retries with a payment header (<code className="font-mono">X-PAYMENT</code> for v1, <code className="font-mono">PAYMENT-SIGNATURE</code> for v2).
                            </li>
                            <li>The server verifies and settles the payment, then returns the protected response.</li>
                          </ol>
                        </div>
                        <div className="space-y-3">
                          <h4 className="text-lg font-semibold text-ink-strong">Payment flow</h4>
                          <CodeBlock
                            code={`Client → GET /api/premium-data
       ← 402 Payment Required (with payment requirements)

Client → POST /payment/tab (open payment tab)
       ← 200 OK (tab details)

Client → Signs payment guarantee (via 4mica SDK)

Client → GET /api/premium-data (with payment proof)
       ← 200 OK (protected data)`}
                            language="bash"
                          />
                        </div>
                        <div className="space-y-3">
                          <h4 className="text-lg font-semibold text-ink-strong">Test without the client</h4>
                          <p>Use curl to sanity-check the server responses.</p>
                          <CodeBlock
                            code={`curl http://localhost:3000/
curl -v http://localhost:3000/api/premium-data`}
                            language="bash"
                          />
                        </div>
                        <div className="space-y-2">
                          <h4 className="text-lg font-semibold text-ink-strong">Notes</h4>
                          <ul className="list-disc list-inside space-y-1">
                            <li>Ensure your account has sufficient balance on Sepolia testnet.</li>
                            <li>The demo uses the default 4mica facilitator configuration.</li>
                            <li>Tab TTL is set to 1 hour (3600 seconds).</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-ink-strong mb-3">Complete Example (Server)</h3>
                      <CodeTabs
                        blocks={[
                          {
                            label: 'TypeScript',
                            language: 'ts',
                            code: `import express from "express";
import { paymentMiddlewareFromConfig } from "@4mica/x402/server/express";

const app = express();
app.use(express.json());

app.use(
  paymentMiddlewareFromConfig(
    {
      "GET /api/data": {
        accepts: {
          scheme: "4mica-credit",
          price: "$0.05",
          network: "eip155:11155111",
          payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        },
        description: "API data access",
      },
      "POST /api/compute": {
        accepts: {
          scheme: "4mica-credit",
          price: "$0.20",
          network: "eip155:11155111",
          payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        },
        description: "Computation service",
      },
    },
    {
      advertisedEndpoint: "https://api.example.com/tabs/open",
      ttlSeconds: 7200,
    }
  )
);

app.get("/api/data", (req, res) => {
  res.json({ data: "Premium data content" });
});

app.post("/api/compute", (req, res) => {
  res.json({ result: "Computation complete" });
});

app.listen(3000);`,
                          },
                          {
                            label: 'Python',
                            language: 'python',
                            code: `from fastapi import FastAPI
from fourmica_x402.http import fastapi_payment_middleware_from_config

app = FastAPI()

routes = {
    "GET /api/data": {
        "accepts": {
            "scheme": "4mica-credit",
            "price": "$0.05",
            "network": "eip155:11155111",
            "payTo": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        },
        "description": "API data access",
    },
    "POST /api/compute": {
        "accepts": {
            "scheme": "4mica-credit",
            "price": "$0.20",
            "network": "eip155:11155111",
            "payTo": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        },
        "description": "Computation service",
    },
}

middleware = fastapi_payment_middleware_from_config(
    routes,
    tab_endpoint="https://api.example.com/tabs/open",
    ttl_seconds=7200,
)

@app.middleware("http")
async def x402_middleware(request, call_next):
    return await middleware(request, call_next)

@app.get("/api/data")
async def api_data():
    return {"data": "Premium data content"}

@app.post("/api/compute")
async def api_compute():
    return {"result": "Computation complete"}`,
                          },
                          {
                            label: 'Rust',
                            language: 'rust',
                            code: `Will be ready soon!`,
                          },
                        ]}
                      />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-ink-strong mb-3">Complete Example (Client)</h3>
                      <CodeTabs
                        blocks={[
                          {
                            label: 'TypeScript',
                            language: 'ts',
                            code: `import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { FourMicaEvmScheme } from "@4mica/x402/client";
import { privateKeyToAccount } from "viem/accounts";

async function main() {
  const account = privateKeyToAccount("0xYourPrivateKey");
  const scheme = await FourMicaEvmScheme.create(account);

  const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      {
        network: "eip155:11155111",
        client: scheme,
      },
    ],
  });

  const dataResponse = await fetchWithPayment("https://api.example.com/api/data");
  const data = await dataResponse.json();
  console.log("Data:", data);

  const computeResponse = await fetchWithPayment("https://api.example.com/api/compute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: "some data" }),
  });
  const result = await computeResponse.json();
  console.log("Result:", result);
}

main();`,
                          },
                          {
                            label: 'Python',
                            language: 'python',
                            code: `from x402 import x402ClientSync
from x402.http.clients import x402_requests
from fourmica_x402.client_scheme import FourMicaEvmScheme

client = x402ClientSync()
client.register("eip155:11155111", FourMicaEvmScheme("0xYourPrivateKey"))

session = x402_requests(client)

data_response = session.get("https://api.example.com/api/data")
print("Data:", data_response.json())

compute_response = session.post(
    "https://api.example.com/api/compute",
    json={"input": "some data"},
)
print("Result:", compute_response.json())`,
                          },
                          {
                            label: 'Rust',
                            language: 'rust',
                            code: `Will be ready soon!`,
                          },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'guarantee-modes' && (
                <div>
                  <h2 className="text-3xl font-bold text-ink-strong mb-6">Guarantee Modes (V1 vs V2)</h2>
                  <div className="space-y-6">
                    <p className="text-ink-body leading-relaxed">
                      A <strong>guarantee</strong> is the signed credit commitment used as the payment instrument in the 4Mica x402
                      flow. After a 402 challenge, the payer signs guarantee claims and sends them as the payment header
                      (<code className="font-mono">X-PAYMENT</code> for v1, <code className="font-mono">PAYMENT-SIGNATURE</code> for v2).
                      The recipient settles that guarantee into a certificate and can later enforce repayment on-chain if needed.
                    </p>
                    <p className="text-ink-body leading-relaxed">
                      Choose the mode based on whether payout should depend on external validation evidence: use V1 for standard
                      credit payments, and V2 when payout must be gated by ERC-8004 validation outcomes (for example “pay only if job validated”).
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <h3 className="text-lg font-semibold text-ink-strong mb-2">V1</h3>
                        <p className="text-sm text-ink-body">
                          Use for normal credit-backed API/service payments when no external job-validation attestation is required for payout.
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <h3 className="text-lg font-semibold text-ink-strong mb-2">V2</h3>
                        <p className="text-sm text-ink-body">
                          Use for integrations such as ERC-8004 where remuneration must succeed only after a matching on-chain validation status passes policy checks.
                        </p>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-white/10">
                      <table className="w-full text-sm">
                        <thead className="bg-white/5 text-ink-strong">
                          <tr>
                            <th className="text-left p-3">Capability</th>
                            <th className="text-left p-3">V1</th>
                            <th className="text-left p-3">V2</th>
                          </tr>
                        </thead>
                        <tbody className="text-ink-body">
                          <tr className="border-t border-white/10">
                            <td className="p-3">Signed claim fields</td>
                            <td className="p-3">tab/payment fields only</td>
                            <td className="p-3">V1 fields + validation policy fields</td>
                          </tr>
                          <tr className="border-t border-white/10">
                            <td className="p-3">x402 requirements</td>
                            <td className="p-3">standard 4mica-credit requirements</td>
                            <td className="p-3">adds validation inputs in <code className="font-mono">extra</code></td>
                          </tr>
                          <tr className="border-t border-white/10">
                            <td className="p-3">/verify and /settle</td>
                            <td className="p-3">structural check + certificate issuance</td>
                            <td className="p-3">same behavior, but certificate carries validation policy</td>
                          </tr>
                          <tr className="border-t border-white/10">
                            <td className="p-3">remunerate preconditions</td>
                            <td className="p-3">grace window + unpaid tab + valid cert</td>
                            <td className="p-3">V1 checks + passing ERC-8004 validation status</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <CodeTabs
                      blocks={[
                        {
                          label: 'V1 claims',
                          language: 'json',
                          code: `{
  "version": "v1",
  "user_address": "0xUser",
  "recipient_address": "0xRecipient",
  "tab_id": "0x1",
  "req_id": "0x0",
  "amount": "0x64",
  "asset_address": "0xAsset",
  "timestamp": 1716500000
}`,
                        },
                        {
                          label: 'V2 claims',
                          language: 'json',
                          code: `{
  "version": "v2",
  "user_address": "0xUser",
  "recipient_address": "0xRecipient",
  "tab_id": "0x1",
  "req_id": "0x0",
  "amount": "0x64",
  "asset_address": "0xAsset",
  "timestamp": 1716500000,
  "validation_registry_address": "0xRegistry",
  "validation_request_hash": "0xRequestHash",
  "validation_chain_id": 80002,
  "validator_address": "0xValidator",
  "validator_agent_id": "0x7",
  "min_validation_score": 80,
  "validation_subject_hash": "0xSubjectHash",
  "required_validation_tag": "hard-finality"
}`,
                        },
                      ]}
                    />
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
