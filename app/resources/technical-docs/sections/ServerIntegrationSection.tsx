import CodeBlock from '../../../../components/CodeBlock';
import CodeTabs from '../../blog/CodeTabs';
import type { Language } from '../navigation';

interface ServerIntegrationSectionProps {
  language: Language;
}

function TypeScriptServerIntegration() {
  return (
    <div className="space-y-8">
      <p className="text-ink-body leading-relaxed">
        Use <code className="font-mono">paymentMiddlewareFromConfig</code> to add payment-protected routes to your
        Express app. It configures the 4Mica facilitator, registers <code className="font-mono">FourMicaEvmScheme</code>,
        and injects the tab endpoint into <code className="font-mono">paymentRequirements.extra.tabEndpoint</code> automatically.
      </p>
      <p className="text-sm text-ink-body">
        Already using Coinbase x402? The only change is: use scheme <code className="font-mono">4mica-credit</code>,
        register <code className="font-mono">FourMicaEvmScheme</code>, and expose a tab endpoint so payers can open tabs.
      </p>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-ink-strong">Install</h3>
        <CodeBlock code={`pnpm install @4mica/x402`} language="bash" />
      </div>
      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-ink-strong">Quick Start</h3>
        <CodeBlock
          language="ts"
          code={`import express from "express";
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
});`}
        />
      </div>
      <div className="space-y-2 text-sm text-ink-body">
        <h3 className="text-lg font-semibold text-ink-strong">What Happens on Each Request</h3>
        <ol className="list-decimal list-inside space-y-1">
          <li>The client requests your protected route without payment.</li>
          <li>The server returns HTTP 402 with <code className="font-mono">paymentRequirements</code> and a tab endpoint.</li>
          <li>The client opens a tab, signs a payment guarantee, and retries with a payment header (<code className="font-mono">X-PAYMENT</code> for v1, <code className="font-mono">PAYMENT-SIGNATURE</code> for v2).</li>
          <li>The server verifies and settles the payment, then serves the protected response.</li>
        </ol>
      </div>
      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-ink-strong">paymentMiddlewareFromConfig(routes, tabConfig, ...options)</h3>
        <p className="text-sm text-ink-body">
          Provide protected routes and the tab configuration. The middleware wires 402 responses,
          tab openings, and verify/settle calls automatically.
        </p>
        <CodeBlock
          language="ts"
          code={`app.use(
  paymentMiddlewareFromConfig(
    {
      "GET /path": {
        accepts: {
          scheme: "4mica-credit",
          price: "$0.10",
          network: "eip155:11155111", // or "eip155:84532" for Base Sepolia
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
);`}
        />
      </div>
      <div className="space-y-2 text-sm text-ink-body">
        <h3 className="text-lg font-semibold text-ink-strong">Options</h3>
        <ul className="list-disc list-inside space-y-1">
          <li><code className="font-mono">routes</code> (required) — protected route definitions keyed by method + path.</li>
          <li><code className="font-mono">tabConfig</code> (required) — tab endpoint + optional TTL.</li>
          <li><code className="font-mono">facilitatorClients</code> (optional) — add other facilitator clients.</li>
          <li><code className="font-mono">schemes</code> (optional) — register additional schemes/networks.</li>
          <li><code className="font-mono">paywallConfig</code> (optional) — configuration for the built-in paywall UI.</li>
          <li><code className="font-mono">paywall</code> (optional) — custom paywall provider.</li>
          <li><code className="font-mono">syncFacilitatorOnStart</code> (optional) — sync supported kinds at startup (default: true).</li>
        </ul>
      </div>
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-ink-strong">Advanced: Custom Resource Server</h3>
        <p className="text-sm text-ink-body">
          For custom facilitators or additional schemes, use <code className="font-mono">paymentMiddleware</code> directly
          and build your own <code className="font-mono">x402ResourceServer</code>.
        </p>
        <CodeBlock
          language="ts"
          code={`import { paymentMiddleware } from "@4mica/x402/server/express";
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
);`}
        />
      </div>
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-ink-strong">Advanced: HTTP Hooks</h3>
        <p className="text-sm text-ink-body">
          Use <code className="font-mono">paymentMiddlewareFromHTTPServer</code> to attach lifecycle hooks
          to protected request events.
        </p>
        <CodeBlock
          language="ts"
          code={`import { paymentMiddlewareFromHTTPServer } from "@4mica/x402/server/express";
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
);`}
        />
      </div>
    </div>
  );
}

function PythonServerIntegration() {
  return (
    <div className="space-y-8">
      <p className="text-ink-body leading-relaxed">
        Use <code className="font-mono">fastapi_payment_middleware_from_config</code> (FastAPI) or the Flask equivalent
        to add payment-protected routes to your Python API. The middleware configures the 4Mica facilitator and
        injects the tab endpoint into payment requirements automatically.
      </p>
      <p className="text-sm text-ink-body">
        Already using Coinbase x402? The only change is: use scheme <code className="font-mono">4mica-credit</code>,
        register <code className="font-mono">FourMicaEvmScheme</code>, and expose a tab endpoint so payers can open tabs.
      </p>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-ink-strong">Install</h3>
        <CodeTabs
          blocks={[
            { label: 'FastAPI', language: 'bash', code: `pip install "4mica-x402[fastapi]"` },
            { label: 'Flask', language: 'bash', code: `pip install "4mica-x402[flask]"` },
          ]}
        />
      </div>
      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-ink-strong">Quick Start</h3>
        <CodeTabs
          blocks={[
            {
              label: 'FastAPI',
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
              label: 'Flask',
              language: 'python',
              code: `from flask import Flask, jsonify
from fourmica_x402.http import flask_payment_middleware_from_config

app = Flask(__name__)

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

flask_payment_middleware_from_config(
    app,
    routes,
    tab_endpoint="https://api.example.com/tabs/open",
)

@app.route("/premium-content")
def premium_content():
    return jsonify({"message": "This is premium content behind a paywall"})`,
            },
          ]}
        />
      </div>
      <div className="space-y-2 text-sm text-ink-body">
        <h3 className="text-lg font-semibold text-ink-strong">What Happens on Each Request</h3>
        <ol className="list-decimal list-inside space-y-1">
          <li>The client requests your protected route without payment.</li>
          <li>The server returns HTTP 402 with <code className="font-mono">paymentRequirements</code> and a tab endpoint.</li>
          <li>The client opens a tab, signs a payment guarantee, and retries with a payment header (<code className="font-mono">X-PAYMENT</code> for v1, <code className="font-mono">PAYMENT-SIGNATURE</code> for v2).</li>
          <li>The server verifies and settles the payment, then serves the protected response.</li>
        </ol>
      </div>
      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-ink-strong">fastapi_payment_middleware_from_config(routes, tab_endpoint, ...options)</h3>
        <p className="text-sm text-ink-body">
          Provide protected routes and the tab endpoint URL. Optionally pass <code className="font-mono">ttl_seconds</code> to
          control how long tabs stay open.
        </p>
        <CodeBlock
          language="python"
          code={`middleware = fastapi_payment_middleware_from_config(
    {
        "GET /path": {
            "accepts": {
                "scheme": "4mica-credit",
                "price": "$0.10",
                "network": "eip155:11155111",  # or "eip155:84532" for Base Sepolia
                "payTo": "0xRecipientAddress",
            },
            "description": "What the user is paying for",
        },
    },
    tab_endpoint="https://api.example.com/tabs/open",
    ttl_seconds=3600,
)`}
        />
      </div>
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-ink-strong">Advanced: Custom Resource Server</h3>
        <p className="text-sm text-ink-body">
          For custom facilitators or additional schemes, build an <code className="font-mono">x402ResourceServer</code> directly.
        </p>
        <CodeBlock
          language="python"
          code={`from fastapi import FastAPI
from x402.http import HTTPFacilitatorClient
from x402.http.middleware import fastapi as fastapi_mw
from x402.server import x402ResourceServer
from fourmica_x402 import FourMicaEvmScheme, FourMicaFacilitatorClient

app = FastAPI()

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
    return resp.__dict__`}
        />
      </div>
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-ink-strong">Advanced: Request Hooks</h3>
        <p className="text-sm text-ink-body">
          Intercept protected requests inside the middleware for logging or custom logic.
        </p>
        <CodeBlock
          language="python"
          code={`from fastapi import FastAPI, Request
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
    return await middleware(request, call_next)`}
        />
      </div>
    </div>
  );
}

function RustServerIntegration() {
  return (
    <div className="space-y-6">
      <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-center space-y-3">
        <i className="ri-time-line text-3xl text-ink-body" />
        <h3 className="text-xl font-semibold text-ink-strong">Server middleware for Rust is coming soon</h3>
        <p className="text-sm text-ink-body max-w-lg mx-auto">
          Axum and Actix-Web middleware are on the roadmap. In the meantime, you can use the Rust SDK
          for collateral management and wallet operations, and protect routes manually by calling the
          facilitator API directly.
        </p>
      </div>
      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-ink-strong">Manually calling the facilitator from Rust</h3>
        <p className="text-sm text-ink-body">
          Until the middleware crate is available, you can issue HTTP requests to the facilitator endpoints
          directly from your Rust server using <code className="font-mono">reqwest</code> or any HTTP client.
          The facilitator API is documented in the{' '}
          <span className="font-semibold text-ink-strong">Facilitator API</span> section.
        </p>
      </div>
      <div className="space-y-2 text-sm text-ink-body bg-white/5 border border-white/10 rounded-lg p-4">
        <p className="font-semibold text-ink-strong">What is planned for Rust server support</p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>Axum middleware layer (<code className="font-mono">tower::Layer</code>)</li>
          <li>Actix-Web middleware wrapper</li>
          <li>Automatic <code className="font-mono">FourMicaEvmScheme</code> registration</li>
          <li>Tab endpoint handler helpers</li>
        </ul>
      </div>
    </div>
  );
}

export default function ServerIntegrationSection({ language }: ServerIntegrationSectionProps) {
  return (
    <div>
      <h2 className="text-3xl font-bold text-ink-strong mb-6">Server Integration</h2>
      {language === 'typescript' && <TypeScriptServerIntegration />}
      {language === 'python' && <PythonServerIntegration />}
      {language === 'rust' && <RustServerIntegration />}
    </div>
  );
}
