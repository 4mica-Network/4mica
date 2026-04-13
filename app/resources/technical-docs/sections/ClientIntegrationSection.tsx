import CodeBlock from '../../../../components/CodeBlock';
import CodeTabs from '../../blog/CodeTabs';
import type { Language } from '../navigation';

interface ClientIntegrationSectionProps {
  language: Language;
}

function TypeScriptClientIntegration() {
  return (
    <div className="space-y-8">
      <p className="text-ink-body leading-relaxed">
        Use <code className="font-mono">@x402/fetch</code> or <code className="font-mono">@x402/axios</code> to wrap your
        HTTP client with automatic 402 handling. The wrappers open tabs, sign payment guarantees using
        <code className="font-mono"> FourMicaEvmScheme</code>, and retry requests without any additional code.
      </p>
      <p className="text-sm text-ink-body">
        Already using Coinbase x402 clients? Keep the same wrapper and swap in
        <code className="font-mono"> FourMicaEvmScheme</code> instead of the exact scheme.
      </p>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-ink-strong">Install</h3>
        <CodeBlock code={`pnpm install @x402/fetch @x402/axios`} language="bash" />
      </div>
      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-ink-strong">Using wrapFetchWithPaymentFromConfig</h3>
        <p className="text-sm text-ink-body">
          The convenience config wrapper is the quickest way to get started. Pass your scheme registrations
          and the wrapper handles everything else.
        </p>
        <CodeBlock
          language="ts"
          code={`import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { Client, ConfigBuilder } from "@4mica/sdk";

const cfg = new ConfigBuilder()
  .network("base-sepolia") // or "ethereum-sepolia"
  .walletPrivateKey("0xYourPrivateKey")
  .build();
const client = await Client.new(cfg);

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    {
      network: "eip155:84532", // Base Sepolia
      client: client,
    },
  ],
});

const response = await fetchWithPayment("https://api.example.com/premium-content");
const data = await response.json();
console.log(data);`}
        />
      </div>
      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-ink-strong">Using wrapAxiosWithPaymentFromConfig</h3>
        <p className="text-sm text-ink-body">
          Drop-in replacement for Axios instances. Wraps an existing <code className="font-mono">axios.create()</code> instance
          so you can use it exactly as before.
        </p>
        <CodeBlock
          language="ts"
          code={`import axios from "axios";
import { wrapAxiosWithPaymentFromConfig } from "@x402/axios";
import { Client, ConfigBuilder } from "@4mica/sdk";

const cfg = new ConfigBuilder()
  .network("base-sepolia") // or "ethereum-sepolia"
  .walletPrivateKey("0xYourPrivateKey")
  .build();
const client = await Client.new(cfg);

const api = wrapAxiosWithPaymentFromConfig(axios.create(), {
  schemes: [
    {
      network: "eip155:84532", // Base Sepolia
      client: client,
    },
  ],
});

const response = await api.get("https://api.example.com/premium-content");
console.log(response.data);`}
        />
      </div>
      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-ink-strong">Multi-Network Setup</h3>
        <p className="text-sm text-ink-body">
          Register multiple networks to route payments to the right scheme based on
          what the server advertises in its 402 response.
        </p>
        <CodeBlock
          language="ts"
          code={`import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { Client, ConfigBuilder } from "@4mica/sdk";

const ethSepoliaClient = await Client.new(
  new ConfigBuilder().network("ethereum-sepolia").walletPrivateKey("0xEthSepoliaPrivateKey").build()
);
const baseSepoliaClient = await Client.new(
  new ConfigBuilder().network("base-sepolia").walletPrivateKey("0xBaseSepoliaPrivateKey").build()
);

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    { network: "eip155:11155111", client: ethSepoliaClient }, // Ethereum Sepolia
    { network: "eip155:84532",    client: baseSepoliaClient }, // Base Sepolia
  ],
});`}
        />
      </div>
      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-ink-strong">Builder Pattern</h3>
        <p className="text-sm text-ink-body">
          Build a reusable <code className="font-mono">x402Client</code> registry when you need to share
          the client across multiple wrappers or want explicit control over scheme registration.
        </p>
        <CodeBlock
          language="ts"
          code={`import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { Client, ConfigBuilder } from "@4mica/sdk";

const cfg = new ConfigBuilder()
  .network("base-sepolia") // or "ethereum-sepolia"
  .walletPrivateKey("0xYourPrivateKey")
  .build();
const scheme = await Client.new(cfg);
const client = new x402Client().register("eip155:84532", scheme);

const fetchWithPayment = wrapFetchWithPayment(fetch, client);`}
        />
      </div>
      <div className="space-y-2 text-sm text-ink-body">
        <h3 className="text-lg font-semibold text-ink-strong">Flow Summary</h3>
        <ol className="list-decimal list-inside space-y-1">
          <li>Call the protected resource — receive HTTP 402 with payment requirements.</li>
          <li>The wrapper opens a tab using the <code className="font-mono">tabEndpoint</code> in the 402 response.</li>
          <li>Signs a guarantee with your key and retries with a payment header (<code className="font-mono">X-PAYMENT</code> for v1, <code className="font-mono">PAYMENT-SIGNATURE</code> for v2).</li>
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
        Use <code className="font-mono">x402_requests</code> (synchronous) or <code className="font-mono">x402_httpx</code> (async)
        to wrap your Python HTTP client with automatic 402 handling. Register
        <code className="font-mono"> FourMicaEvmScheme</code> for your network and the wrapper handles tab opening,
        guarantee signing, and request retrying transparently.
      </p>
      <p className="text-sm text-ink-body">
        Already using Coinbase x402 clients? Keep the same wrapper and swap in
        <code className="font-mono"> FourMicaEvmScheme</code> instead of the exact scheme.
      </p>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-ink-strong">Install</h3>
        <CodeTabs
          blocks={[
            { label: 'httpx (async)', language: 'bash', code: `pip install "4mica-x402[httpx]"` },
            { label: 'requests (sync)', language: 'bash', code: `pip install "4mica-x402[requests]"` },
          ]}
        />
      </div>
      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-ink-strong">Using x402_requests (synchronous)</h3>
        <p className="text-sm text-ink-body">
          Wraps a <code className="font-mono">requests</code> session. Use this for synchronous scripts, Flask
          clients, or any blocking code.
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
        <h3 className="text-xl font-semibold text-ink-strong">Using x402_httpx (async)</h3>
        <p className="text-sm text-ink-body">
          Wraps an <code className="font-mono">httpx</code> async client. Use this in FastAPI clients or
          any <code className="font-mono">asyncio</code>-based code.
        </p>
        <CodeBlock
          language="python"
          code={`import asyncio
from x402 import x402ClientAsync
from x402.http.clients import x402_httpx
from fourmica_x402.client_scheme import FourMicaEvmScheme

async def main():
    client = x402ClientAsync()
    client.register("eip155:11155111", FourMicaEvmScheme("0xYourPrivateKey"))

    async with x402_httpx(client) as session:
        response = await session.get("https://api.example.com/premium-content")
        print(response.status_code, response.json())

asyncio.run(main())`}
        />
      </div>
      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-ink-strong">Multi-Network Setup</h3>
        <p className="text-sm text-ink-body">
          Register multiple networks to route payments to the right scheme based on
          what the server advertises in its 402 response.
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
      <div className="space-y-2 text-sm text-ink-body">
        <h3 className="text-lg font-semibold text-ink-strong">Flow Summary</h3>
        <ol className="list-decimal list-inside space-y-1">
          <li>Call the protected resource — receive HTTP 402 with payment requirements.</li>
          <li>The wrapper opens a tab using the <code className="font-mono">tabEndpoint</code> in the 402 response.</li>
          <li>Signs a guarantee with your key and retries with a payment header (<code className="font-mono">X-PAYMENT</code> for v1, <code className="font-mono">PAYMENT-SIGNATURE</code> for v2).</li>
          <li>Returns the successful response or raises an exception for unresolvable 402s.</li>
        </ol>
      </div>
    </div>
  );
}

function RustClientIntegration() {
  return (
    <div className="space-y-6">
      <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-center space-y-3">
        <i className="ri-time-line text-3xl text-ink-body" />
        <h3 className="text-xl font-semibold text-ink-strong">HTTP client wrappers for Rust are coming soon</h3>
        <p className="text-sm text-ink-body max-w-lg mx-auto">
          A <code className="font-mono">reqwest</code>-based wrapper with automatic 402 handling is on the roadmap.
          In the meantime, you can call the facilitator API directly or use the Rust SDK for collateral and wallet operations.
        </p>
      </div>
      <div className="space-y-2 text-sm text-ink-body bg-white/5 border border-white/10 rounded-lg p-4">
        <p className="font-semibold text-ink-strong">What is planned for Rust client support</p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li><code className="font-mono">reqwest</code> middleware layer with automatic 402 retry</li>
          <li><code className="font-mono">FourMicaEvmScheme</code> Rust implementation for EIP-712 guarantee signing</li>
          <li>Tab opening and <code className="font-mono">X-PAYMENT</code> / <code className="font-mono">PAYMENT-SIGNATURE</code> header construction</li>
          <li>Multi-network client registry</li>
        </ul>
      </div>
    </div>
  );
}

export default function ClientIntegrationSection({ language }: ClientIntegrationSectionProps) {
  return (
    <div>
      <h2 className="text-3xl font-bold text-ink-strong mb-6">Client Integration</h2>
      {language === 'typescript' && <TypeScriptClientIntegration />}
      {language === 'python' && <PythonClientIntegration />}
      {language === 'rust' && <RustClientIntegration />}
    </div>
  );
}
