import CodeBlock from "../../../../components/CodeBlock";
import CodeTabs from "../../blog/CodeTabs";

export default function ExamplesSection() {
  return (
    <div>
      <h2 className="mb-6 font-bold text-3xl text-ink-strong">Code Examples</h2>
      <div className="space-y-6">
        <div className="text-ink-body text-sm">
          Grab the full demo repo and run it locally:{" "}
          <a
            className="text-brand-deep"
            href="https://github.com/4mica-Network/x402-4mica/tree/main/packages/typescript/x402/demo"
            target="_blank"
            rel="noreferrer"
          >
            github.com/4mica-Network/x402-4mica/tree/main/packages/typescript/x402/demo
          </a>
        </div>
        <div>
          <h3 className="mb-3 font-semibold text-ink-strong text-xl">
            Demo Walkthrough
          </h3>
          <div className="space-y-5 text-ink-body text-sm">
            <p>
              This demo shows how to use{" "}
              <code className="font-mono">@4mica/x402</code> to protect an API
              endpoint with 4mica payments. Follow the steps below to build the
              package, start the server, and run the client.
            </p>
            <div className="space-y-3">
              <h4 className="font-semibold text-ink-strong text-lg">
                Step 1: Install dependencies
              </h4>
              <p>
                Build the parent package first, then install the demo
                dependencies from the demo directory.
              </p>
              <CodeBlock
                code={`cd ..
yarn install
yarn build

cd demo
yarn install`}
                language="bash"
              />
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-ink-strong text-lg">
                Step 2: Configure environment variables
              </h4>
              <p>
                Copy the example env file and update it with your key and
                optional pay-to address.
              </p>
              <CodeBlock
                code={`cp .env.example .env\n# Edit .env with your private key and settings`}
                language="bash"
              />
              <ul className="list-inside list-disc space-y-1">
                <li>
                  <code className="font-mono">PRIVATE_KEY</code>: Ethereum
                  private key (0x-prefixed) on Sepolia.
                </li>
                <li>
                  <code className="font-mono">PAY_TO_ADDRESS</code>: address
                  that receives payments.
                </li>
                <li>
                  <code className="font-mono">ADVERTISED_ENDPOINT</code>:
                  optional resource-server tab endpoint URL.
                </li>
                <li>
                  <code className="font-mono">API_URL</code>: optional client
                  base URL (defaults to{" "}
                  <code className="font-mono">http://localhost:3000</code>).
                </li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-ink-strong text-lg">
                Step 3: Start the server
              </h4>
              <p>
                Run the server from the demo directory, or from the package root
                using the demo script.
              </p>
              <CodeTabs
                blocks={[
                  {
                    label: "Demo Directory",
                    language: "bash",
                    code: `yarn server`,
                  },
                  {
                    label: "Package Root",
                    language: "bash",
                    code: `yarn demo:server`,
                  },
                ]}
              />
              <p className="text-ink-body text-sm">
                You should see output similar to:
              </p>
              <CodeBlock
                code={`x402 Demo Server running on http://localhost:3000
Protected endpoint: http://localhost:3000/api/premium-data
Payment required: $0.01 (4mica credit on Sepolia)
Tab endpoint hosted by this server: POST http://localhost:3000/payment/tab
Who calls it: payer clients after a 402 Payment Required response
What it does: opens or reuses a tab via the 4Mica facilitator and returns tab JSON`}
                language="bash"
              />
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-ink-strong text-lg">
                Step 4: Run the client
              </h4>
              <p>
                The client loads environment variables from{" "}
                <code className="font-mono">.env</code> and handles payment
                automatically.
              </p>
              <CodeTabs
                blocks={[
                  {
                    label: "Demo Directory",
                    language: "bash",
                    code: `yarn client`,
                  },
                  {
                    label: "Package Root",
                    language: "bash",
                    code: `yarn demo:client`,
                  },
                ]}
              />
              <p className="text-ink-body text-sm">
                You can also provide a key inline:
              </p>
              <CodeBlock
                code={`PRIVATE_KEY=0xYourPrivateKey yarn client`}
                language="bash"
              />
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-ink-strong text-lg">
                What happens
              </h4>
              <ol className="list-inside list-decimal space-y-1">
                <li>
                  The server starts with a single protected endpoint:{" "}
                  <code className="font-mono">GET /api/premium-data</code>.
                </li>
                <li>
                  The client makes a request, receives{" "}
                  <code className="font-mono">402 Payment Required</code>, opens
                  a tab, signs a guarantee, and retries with a payment header (
                  <code className="font-mono">X-PAYMENT</code> for v1,{" "}
                  <code className="font-mono">PAYMENT-SIGNATURE</code> for v2).
                </li>
                <li>
                  The server verifies and settles the payment, then returns the
                  protected response.
                </li>
              </ol>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-ink-strong text-lg">
                Payment flow
              </h4>
              <CodeBlock
                code={`Client → GET /api/premium-data\n       ← 402 Payment Required (with payment requirements)\n\nClient → POST /payment/tab (open payment tab)\n       ← 200 OK (tab details)\n\nClient → Signs payment guarantee (via 4mica SDK)\n\nClient → GET /api/premium-data (with payment proof)\n       ← 200 OK (protected data)`}
                language="bash"
              />
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-ink-strong text-lg">
                Test without the client
              </h4>
              <p>Use curl to sanity-check the server responses.</p>
              <CodeBlock
                code={`curl http://localhost:3000/\ncurl -v http://localhost:3000/api/premium-data`}
                language="bash"
              />
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-ink-strong text-lg">Notes</h4>
              <ul className="list-inside list-disc space-y-1">
                <li>
                  Ensure your account has sufficient balance on Sepolia testnet.
                </li>
                <li>
                  The demo uses the default 4mica facilitator configuration.
                </li>
                <li>Tab TTL is set to 1 hour (3600 seconds).</li>
              </ul>
            </div>
          </div>
        </div>
        <div>
          <h3 className="mb-3 font-semibold text-ink-strong text-xl">
            Complete Example (Server)
          </h3>
          <CodeTabs
            blocks={[
              {
                label: "TypeScript",
                language: "ts",
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
                label: "Python",
                language: "python",
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
                label: "Rust",
                language: "rust",
                code: `Will be ready soon!`,
              },
            ]}
          />
        </div>
        <div>
          <h3 className="mb-3 font-semibold text-ink-strong text-xl">
            Complete Example (Client)
          </h3>
          <CodeTabs
            blocks={[
              {
                label: "TypeScript",
                language: "ts",
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
                label: "Python",
                language: "python",
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
                label: "Rust",
                language: "rust",
                code: `Will be ready soon!`,
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
