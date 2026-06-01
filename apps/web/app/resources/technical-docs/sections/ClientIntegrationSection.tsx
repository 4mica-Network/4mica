import CodeBlock from "../../../../components/CodeBlock";
import CodeTabs from "../../blog/CodeTabs";
import type { Language } from "../navigation";

interface ClientIntegrationSectionProps {
  language: Language;
}

function TypeScriptClientIntegration() {
  return (
    <div className="space-y-8">
      <p className="text-ink-body leading-relaxed">
        Use <code className="font-mono">@x402/fetch</code> or{" "}
        <code className="font-mono">@x402/axios</code> to wrap your HTTP client
        with automatic 402 handling. The wrappers open tabs, sign payment
        guarantees using
        <code className="font-mono"> FourMicaEvmScheme</code>, and retry
        requests without any additional code.
      </p>
      <p className="text-ink-body text-sm">
        Already using Coinbase x402 clients? Keep the same wrapper and swap in
        <code className="font-mono"> FourMicaEvmScheme</code> instead of the
        exact scheme.
      </p>
      <div className="space-y-2">
        <h3 className="font-semibold text-ink-strong text-lg">Install</h3>
        <CodeBlock
          code={`pnpm install @x402/fetch @x402/axios @4mica/x402 viem`}
          language="bash"
        />
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold text-ink-strong text-xl">
          Using wrapFetchWithPaymentFromConfig
        </h3>
        <p className="text-ink-body text-sm">
          The convenience config wrapper is the quickest way to get started.
          Pass your scheme registrations and the wrapper handles everything
          else.
        </p>
        <CodeBlock
          language="ts"
          code={`import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { FourMicaEvmScheme } from "@4mica/x402/client";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0xYourPrivateKey");

// This scheme client handles the 4Mica x402 flow for fetch:
// 1. request the protected resource
// 2. receive a 402 with paymentRequirements.extra.tabEndpoint
// 3. POST to that tab endpoint on the resource server
// 4. receive tab JSON, sign the payment, and retry the request
const scheme = await FourMicaEvmScheme.create(account);

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    {
      network: "eip155:84532", // Base Sepolia
      client: scheme,
    },
  ],
});

const response = await fetchWithPayment("http://localhost:3000/premium-content");
const data = await response.json();
console.log(data);`}
        />
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold text-ink-strong text-xl">
          Using wrapAxiosWithPaymentFromConfig
        </h3>
        <p className="text-ink-body text-sm">
          Drop-in replacement for Axios instances. Wraps an existing{" "}
          <code className="font-mono">axios.create()</code> instance so you can
          use it exactly as before.
        </p>
        <CodeBlock
          language="ts"
          code={`import axios from "axios";
import { wrapAxiosWithPaymentFromConfig } from "@x402/axios";
import { FourMicaEvmScheme } from "@4mica/x402/client";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0xYourPrivateKey");
const scheme = await FourMicaEvmScheme.create(account);

const api = wrapAxiosWithPaymentFromConfig(axios.create(), {
  schemes: [
    {
      network: "eip155:84532", // Base Sepolia
      client: scheme,
    },
  ],
});

const response = await api.get("http://localhost:3000/premium-content");
console.log(response.data);`}
        />
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold text-ink-strong text-xl">
          Multi-Network Setup
        </h3>
        <p className="text-ink-body text-sm">
          Register multiple networks to route payments to the right scheme based
          on what the server advertises in its 402 response.
        </p>
        <CodeBlock
          language="ts"
          code={`import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { FourMicaEvmScheme } from "@4mica/x402/client";
import { privateKeyToAccount } from "viem/accounts";

const ethSepoliaScheme = await FourMicaEvmScheme.create(
  privateKeyToAccount("0xEthSepoliaPrivateKey")
);
const baseSepoliaScheme = await FourMicaEvmScheme.create(
  privateKeyToAccount("0xBaseSepoliaPrivateKey")
);

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    { network: "eip155:11155111", client: ethSepoliaScheme }, // Ethereum Sepolia
    { network: "eip155:84532", client: baseSepoliaScheme }, // Base Sepolia
  ],
});`}
        />
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold text-ink-strong text-xl">
          Builder Pattern
        </h3>
        <p className="text-ink-body text-sm">
          Build a reusable <code className="font-mono">x402Client</code>{" "}
          registry when you need to share the client across multiple wrappers or
          want explicit control over scheme registration.
        </p>
        <CodeBlock
          language="ts"
          code={`import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { FourMicaEvmScheme } from "@4mica/x402/client";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0xYourPrivateKey");
const scheme = await FourMicaEvmScheme.create(account);
const client = new x402Client().register("eip155:84532", scheme);

const fetchWithPayment = wrapFetchWithPayment(fetch, client);`}
        />
      </div>
      <div className="space-y-2 text-ink-body text-sm">
        <h3 className="font-semibold text-ink-strong text-lg">Flow Summary</h3>
        <ol className="list-inside list-decimal space-y-1">
          <li>
            Call the protected resource - receive HTTP 402 with payment
            requirements.
          </li>
          <li>
            The wrapper reads{" "}
            <code className="font-mono">
              paymentRequirements.extra.tabEndpoint
            </code>{" "}
            from the 402 response and opens a tab on the resource server.
          </li>
          <li>
            Signs a guarantee with your key and retries with a payment header (
            <code className="font-mono">X-PAYMENT</code> for v1,{" "}
            <code className="font-mono">PAYMENT-SIGNATURE</code> for v2).
          </li>
          <li>Returns the successful response or surfaces any retry errors.</li>
        </ol>
      </div>
    </div>
  );
}

function PythonClientIntegration() {
  return (
    <div className="space-y-8">
      <p className="text-ink-body leading-relaxed">
        Use <code className="font-mono">x402_requests</code> (synchronous) or{" "}
        <code className="font-mono">x402_httpx_transport</code> (async) to wrap
        your Python HTTP client with automatic 402 handling. Register
        <code className="font-mono"> FourMicaEvmScheme</code> for your network
        and the wrapper handles tab opening, guarantee signing, and request
        retrying transparently.
      </p>
      <p className="text-ink-body text-sm">
        Already using Coinbase x402 clients? Keep the same wrapper and swap in
        <code className="font-mono"> FourMicaEvmScheme</code> instead of the
        exact scheme.
      </p>
      <div className="space-y-2">
        <h3 className="font-semibold text-ink-strong text-lg">Install</h3>
        <CodeTabs
          blocks={[
            {
              label: "httpx (async)",
              language: "bash",
              code: `pip install "4mica-x402[httpx]"`,
            },
            {
              label: "requests (sync)",
              language: "bash",
              code: `pip install "4mica-x402[requests]"`,
            },
          ]}
        />
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold text-ink-strong text-xl">
          Using x402_requests (synchronous)
        </h3>
        <p className="text-ink-body text-sm">
          Wraps a <code className="font-mono">requests</code> session. Use this
          for synchronous scripts, Flask clients, or any blocking code.
        </p>
        <CodeBlock
          language="python"
          code={`from x402 import x402ClientSync
from x402.http.clients import x402_requests
from fourmica_x402.client_scheme import FourMicaEvmScheme

client = x402ClientSync()
client.register("eip155:11155111", FourMicaEvmScheme("0xYourPrivateKey"))

session = x402_requests(client)
response = session.get("https://api.example.com/premium-content")
print(response.status_code, response.json())`}
        />
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold text-ink-strong text-xl">
          Using x402_httpx_transport (async)
        </h3>
        <p className="text-ink-body text-sm">
          Wraps an <code className="font-mono">httpx.AsyncClient</code>{" "}
          transport. Use this in FastAPI clients or any{" "}
          <code className="font-mono">asyncio</code>-based code.
        </p>
        <CodeBlock
          language="python"
          code={`import asyncio
import httpx
from x402 import x402Client
from x402.http.clients import x402_httpx_transport
from fourmica_x402.client_scheme import FourMicaEvmScheme

async def main():
    client = x402Client()
    client.register("eip155:11155111", FourMicaEvmScheme("0xYourPrivateKey"))

    async with httpx.AsyncClient(
        transport=x402_httpx_transport(client)
    ) as session:
        response = await session.get("https://api.example.com/premium-content")
        print(response.status_code, response.json())

asyncio.run(main())`}
        />
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold text-ink-strong text-xl">
          Multi-Network Setup
        </h3>
        <p className="text-ink-body text-sm">
          Register multiple networks to route payments to the right scheme based
          on what the server advertises in its 402 response.
        </p>
        <CodeBlock
          language="python"
          code={`from x402 import x402ClientSync
from x402.http.clients import x402_requests
from fourmica_x402.client_scheme import FourMicaEvmScheme

client = x402ClientSync()
client.register("eip155:11155111", FourMicaEvmScheme("0xEthSepoliaPrivateKey"))
client.register("eip155:84532",    FourMicaEvmScheme("0xBaseSepoliaPrivateKey"))

session = x402_requests(client)`}
        />
      </div>
      <div className="space-y-2 text-ink-body text-sm">
        <h3 className="font-semibold text-ink-strong text-lg">Flow Summary</h3>
        <ol className="list-inside list-decimal space-y-1">
          <li>
            Call the protected resource - receive HTTP 402 with payment
            requirements.
          </li>
          <li>
            The wrapper reads{" "}
            <code className="font-mono">
              paymentRequirements.extra.tabEndpoint
            </code>{" "}
            from the 402 response and opens a tab on the resource server.
          </li>
          <li>
            Signs a guarantee with your key and retries with a payment header (
            <code className="font-mono">X-PAYMENT</code> for v1,{" "}
            <code className="font-mono">PAYMENT-SIGNATURE</code> for v2).
          </li>
          <li>
            Returns the successful response or raises an exception for
            unresolvable 402s.
          </li>
        </ol>
      </div>
    </div>
  );
}

function RustClientIntegration() {
  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-6 text-center">
        <i className="ri-time-line text-3xl text-ink-body" />
        <h3 className="font-semibold text-ink-strong text-xl">
          HTTP client wrappers for Rust are coming soon
        </h3>
        <p className="mx-auto max-w-lg text-ink-body text-sm">
          A <code className="font-mono">reqwest</code>-based wrapper with
          automatic 402 handling is on the roadmap. In the meantime, you can
          call the facilitator API directly or use the Rust SDK for collateral
          and wallet operations.
        </p>
      </div>
      <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-4 text-ink-body text-sm">
        <p className="font-semibold text-ink-strong">
          What is planned for Rust client support
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            <code className="font-mono">reqwest</code> middleware layer with
            automatic 402 retry
          </li>
          <li>
            <code className="font-mono">FourMicaEvmScheme</code> Rust
            implementation for EIP-712 guarantee signing
          </li>
          <li>
            Tab opening and <code className="font-mono">X-PAYMENT</code> /{" "}
            <code className="font-mono">PAYMENT-SIGNATURE</code> header
            construction
          </li>
          <li>Multi-network client registry</li>
        </ul>
      </div>
    </div>
  );
}

export default function ClientIntegrationSection({
  language,
}: ClientIntegrationSectionProps) {
  return (
    <div>
      <h2 className="mb-6 font-bold text-3xl text-ink-strong">
        Client Integration
      </h2>
      {language === "typescript" && <TypeScriptClientIntegration />}
      {language === "python" && <PythonClientIntegration />}
      {language === "rust" && <RustClientIntegration />}
    </div>
  );
}
