import CodeBlock from '../../../../components/CodeBlock';
import CodeTabs from '../../blog/CodeTabs';
import type { Language } from '../navigation';

interface InstallationSectionProps {
  language: Language;
}

function TypeScriptInstallation() {
  return (
    <div className="space-y-6">
      <p className="text-ink-body leading-relaxed">
        Install the <code className="font-mono">@4mica/x402</code> package to add payment-protected routes to your
        Express server. Then optionally add the fetch or Axios client wrappers to automatically handle 402 responses
        on the paying side.
      </p>
      <div>
        <h3 className="text-xl font-semibold text-ink-strong mb-3">Server Package</h3>
        <CodeBlock code={`pnpm install @4mica/x402`} language="bash" />
        <p className="text-sm text-ink-body mt-3">
          Installs the Express middleware, server helpers, and automatic facilitator and scheme registration.
          No additional configuration is required to connect to the 4Mica facilitator.
        </p>
      </div>
      <div>
        <h3 className="text-xl font-semibold text-ink-strong mb-3">Client Wrappers (optional)</h3>
        <CodeBlock code={`pnpm install @x402/fetch @x402/axios`} language="bash" />
        <p className="text-sm text-ink-body mt-3">
          Use <code className="font-mono">@x402/fetch</code> to wrap the native <code className="font-mono">fetch</code> function
          and <code className="font-mono">@x402/axios</code> for Axios-based apps. Both wrappers automatically open tabs,
          sign guarantees, and retry requests on a 402 response.
        </p>
      </div>
    </div>
  );
}

function PythonInstallation() {
  return (
    <div className="space-y-6">
      <p className="text-ink-body leading-relaxed">
        Install the <code className="font-mono">4mica-x402</code> package with the extra that matches your web framework.
        Then optionally add a client wrapper for your HTTP library to handle 402 responses automatically.
      </p>
      <div>
        <h3 className="text-xl font-semibold text-ink-strong mb-3">Server Package</h3>
        <CodeTabs
          blocks={[
            {
              label: 'FastAPI',
              language: 'bash',
              code: `pip install "4mica-x402[fastapi]"`,
            },
            {
              label: 'Flask',
              language: 'bash',
              code: `pip install "4mica-x402[flask]"`,
            },
          ]}
        />
        <p className="text-sm text-ink-body mt-3">
          Both extras install the same core middleware logic. Choose the one that matches your framework.
          The middleware automatically connects to the 4Mica facilitator and handles tab endpoint injection.
        </p>
      </div>
      <div>
        <h3 className="text-xl font-semibold text-ink-strong mb-3">Client Wrappers (optional)</h3>
        <CodeTabs
          blocks={[
            {
              label: 'httpx (async)',
              language: 'bash',
              code: `pip install "4mica-x402[httpx]"`,
            },
            {
              label: 'requests (sync)',
              language: 'bash',
              code: `pip install "4mica-x402[requests]"`,
            },
          ]}
        />
        <p className="text-sm text-ink-body mt-3">
          Use <code className="font-mono">httpx</code> for async codebases (e.g. FastAPI clients) and
          <code className="font-mono"> requests</code> for synchronous scripts or Flask clients. Both automatically
          open tabs, sign guarantees, and retry on a 402 response.
        </p>
      </div>
    </div>
  );
}

function RustInstallation() {
  return (
    <div className="space-y-6">
      <p className="text-ink-body leading-relaxed">
        Add the <code className="font-mono">sdk-4mica</code> crate for collateral management and wallet operations.
        Server-side middleware and HTTP client wrappers are not yet available for Rust — they are on the roadmap.
      </p>
      <div>
        <h3 className="text-xl font-semibold text-ink-strong mb-3">SDK Crate</h3>
        <CodeBlock
          code={`cargo add sdk-4mica alloy\ncargo add tokio --features macros,rt-multi-thread`}
          language="bash"
        />
        <p className="text-sm text-ink-body mt-3">
          Requires Tokio for the async runtime. The SDK points directly at the network RPC URL
          (e.g. <code className="font-mono">https://base.sepolia.api.4mica.xyz/</code>) — no separate
          facilitator package is needed.
        </p>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-sm text-ink-body">
        <p className="font-semibold text-ink-strong mb-1">What is available today</p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>Collateral deposit and withdrawal via <code className="font-mono">client.user</code></li>
          <li>Balance and position queries</li>
          <li>Direct RPC interaction via <code className="font-mono">alloy</code></li>
        </ul>
        <p className="font-semibold text-ink-strong mt-3 mb-1">Coming soon</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Axum / Actix-Web server middleware</li>
          <li>reqwest-based HTTP client wrapper with automatic 402 handling</li>
        </ul>
      </div>
    </div>
  );
}

export default function InstallationSection({ language }: InstallationSectionProps) {
  return (
    <div>
      <h2 className="text-3xl font-bold text-ink-strong mb-6">Installation</h2>
      {language === 'typescript' && <TypeScriptInstallation />}
      {language === 'python' && <PythonInstallation />}
      {language === 'rust' && <RustInstallation />}
    </div>
  );
}
