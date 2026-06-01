import CodeBlock from "../../../../components/CodeBlock";
import CodeTabs from "../../blog/CodeTabs";
import type { Language } from "../navigation";

interface InstallationSectionProps {
  language: Language;
}

function TypeScriptInstallation() {
  return (
    <div className="space-y-6">
      <p className="text-ink-body leading-relaxed">
        Install the <code className="font-mono">@4mica/x402</code> package to
        add payment-protected routes to your Express server. Then optionally add
        the fetch or Axios client wrappers to automatically handle 402 responses
        on the paying side.
      </p>
      <div>
        <h3 className="mb-3 font-semibold text-ink-strong text-xl">
          Server Package
        </h3>
        <CodeBlock code={`pnpm install @4mica/x402`} language="bash" />
        <p className="mt-3 text-ink-body text-sm">
          Installs the Express middleware, server helpers, and automatic
          facilitator and scheme registration. No additional configuration is
          required to connect to the 4Mica facilitator.
        </p>
      </div>
      <div>
        <h3 className="mb-3 font-semibold text-ink-strong text-xl">
          Client Wrappers (optional)
        </h3>
        <CodeBlock
          code={`pnpm install @x402/fetch @x402/axios`}
          language="bash"
        />
        <p className="mt-3 text-ink-body text-sm">
          Use <code className="font-mono">@x402/fetch</code> to wrap the native{" "}
          <code className="font-mono">fetch</code> function and{" "}
          <code className="font-mono">@x402/axios</code> for Axios-based apps.
          Both wrappers automatically open tabs, sign guarantees, and retry
          requests on a 402 response.
        </p>
      </div>
    </div>
  );
}

function PythonInstallation() {
  return (
    <div className="space-y-6">
      <p className="text-ink-body leading-relaxed">
        Install the <code className="font-mono">4mica-x402</code> package with
        the extra that matches your web framework. For collateral management,
        balance queries, and on-chain operations (deposits, remuneration,
        withdrawals), also install <code className="font-mono">sdk-4mica</code>{" "}
        directly. Then optionally add a client wrapper for your HTTP library to
        handle 402 responses automatically.
      </p>
      <div>
        <h3 className="mb-3 font-semibold text-ink-strong text-xl">
          Direct SDK (collateral, remuneration, balances)
        </h3>
        <CodeBlock code={`pip install sdk-4mica`} language="bash" />
        <p className="mt-3 text-ink-body text-sm">
          Provides <code className="font-mono">Client</code>,{" "}
          <code className="font-mono">ConfigBuilder</code>, and all on-chain
          operations. Auth is enabled by default - no extra configuration needed
          to connect to the 4Mica core API.
        </p>
      </div>
      <div>
        <h3 className="mb-3 font-semibold text-ink-strong text-xl">
          Server Package
        </h3>
        <CodeTabs
          blocks={[
            {
              label: "FastAPI",
              language: "bash",
              code: `pip install "4mica-x402[fastapi]"`,
            },
            {
              label: "Flask",
              language: "bash",
              code: `pip install "4mica-x402[flask]"`,
            },
          ]}
        />
        <p className="mt-3 text-ink-body text-sm">
          Both extras install the same core middleware logic. Choose the one
          that matches your framework. The middleware automatically connects to
          the 4Mica facilitator and handles tab endpoint injection.
        </p>
      </div>
      <div>
        <h3 className="mb-3 font-semibold text-ink-strong text-xl">
          Client Wrappers (optional)
        </h3>
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
        <p className="mt-3 text-ink-body text-sm">
          Use <code className="font-mono">httpx</code> for async codebases (e.g.
          FastAPI clients) and
          <code className="font-mono"> requests</code> for synchronous scripts
          or Flask clients. Both automatically open tabs, sign guarantees, and
          retry on a 402 response.
        </p>
      </div>
    </div>
  );
}

function RustInstallation() {
  return (
    <div className="space-y-6">
      <p className="text-ink-body leading-relaxed">
        Add the <code className="font-mono">sdk-4mica</code> crate for
        collateral management and wallet operations. Server-side middleware and
        HTTP client wrappers are not yet available for Rust - they are on the
        roadmap.
      </p>
      <div>
        <h3 className="mb-3 font-semibold text-ink-strong text-xl">
          SDK Crate
        </h3>
        <CodeBlock
          code={`cargo add sdk-4mica alloy\ncargo add tokio --features macros,rt-multi-thread`}
          language="bash"
        />
        <p className="mt-3 text-ink-body text-sm">
          Requires Tokio for the async runtime. The SDK points directly at the
          network RPC URL (e.g.{" "}
          <code className="font-mono">https://base.sepolia.api.4mica.xyz/</code>
          ) - no separate facilitator package is needed.
        </p>
      </div>
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-ink-body text-sm">
        <p className="mb-1 font-semibold text-ink-strong">
          What is available today
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            Collateral deposit and withdrawal via{" "}
            <code className="font-mono">client.user</code>
          </li>
          <li>Balance and position queries</li>
          <li>
            Direct RPC interaction via <code className="font-mono">alloy</code>
          </li>
        </ul>
        <p className="mt-3 mb-1 font-semibold text-ink-strong">Coming soon</p>
        <ul className="list-inside list-disc space-y-1">
          <li>Axum / Actix-Web server middleware</li>
          <li>reqwest-based HTTP client wrapper with automatic 402 handling</li>
        </ul>
      </div>
    </div>
  );
}

export default function InstallationSection({
  language,
}: InstallationSectionProps) {
  return (
    <div>
      <h2 className="mb-6 font-bold text-3xl text-ink-strong">Installation</h2>
      {language === "typescript" && <TypeScriptInstallation />}
      {language === "python" && <PythonInstallation />}
      {language === "rust" && <RustInstallation />}
    </div>
  );
}
