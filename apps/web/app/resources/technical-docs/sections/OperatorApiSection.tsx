import CodeTabs from "../../blog/CodeTabs";
import { endpoints } from "./data";

export default function OperatorApiSection() {
  return (
    <div>
      <h2 className="mb-6 font-bold text-3xl text-ink-strong">
        Core API Reference
      </h2>
      <div className="space-y-6">
        <p className="text-ink-body leading-relaxed">
          Core operator endpoints are served by{" "}
          <code className="font-mono">4mica-core/core</code>. Core routes live
          under
          <code className="font-mono"> /core</code>, and auth routes live under{" "}
          <code className="font-mono">/auth</code>. All non-public endpoints
          require an access token.
        </p>
        <div className="space-y-2 rounded-lg border border-white/10 bg-white/10 p-5 text-ink-body text-sm">
          <p>
            <span className="font-semibold">Public endpoints:</span>{" "}
            <code className="font-mono">/auth/*</code>,{" "}
            <code className="font-mono">/core/health</code>,{" "}
            <code className="font-mono">/core/public-params</code>,{" "}
            <code className="font-mono">/core/tokens</code>,{" "}
            <code className="font-mono">/metrics</code>
          </p>
          <p>
            <span className="font-semibold">Auth header:</span>{" "}
            <code className="font-mono">
              Authorization: Bearer &lt;access_token&gt;
            </code>
          </p>
          <p>
            <span className="font-semibold">Scopes:</span>{" "}
            <code className="font-mono">tab:create</code>,{" "}
            <code className="font-mono">tab:read</code>,{" "}
            <code className="font-mono">guarantee:issue</code>
          </p>
          <p>
            <span className="font-semibold">Roles:</span>{" "}
            <code className="font-mono">admin</code>,{" "}
            <code className="font-mono">facilitator</code>
          </p>
        </div>
        <div className="space-y-2 rounded-lg border border-white/10 p-5 text-ink-body text-sm">
          <h3 className="font-semibold text-ink-strong text-lg">
            Access rules
          </h3>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <code className="font-mono">tab:create</code> is required for{" "}
              <code className="font-mono">/core/payment-tabs</code>; recipient
              must match the token subject or the{" "}
              <code className="font-mono">facilitator</code> role.
            </li>
            <li>
              <code className="font-mono">guarantee:issue</code> is required for{" "}
              <code className="font-mono">/core/guarantees</code>; recipient
              must match the token subject or the{" "}
              <code className="font-mono">facilitator</code> role.
            </li>
            <li>
              <code className="font-mono">tab:read</code> is required for all
              tab, guarantee, payment, and collateral reads.
            </li>
            <li>
              Recipient-address list routes allow the{" "}
              <code className="font-mono">facilitator</code> role, except
              <code className="font-mono">
                {" "}
                /core/recipients/{"{recipient_address}"}/payments
              </code>{" "}
              which requires recipient match.
            </li>
            <li>
              Tab-specific routes require tab ownership (user or recipient) or
              the <code className="font-mono">facilitator</code> role.
            </li>
            <li>
              <code className="font-mono">
                /core/users/{"{user_address}"}/assets/{"{asset_address}"}
              </code>{" "}
              currently requires only
              <code className="font-mono"> tab:read</code>; it does not enforce
              user-address matching.
            </li>
            <li>
              <code className="font-mono">
                /core/users/{"{user_address}"}/suspension
              </code>{" "}
              requires the <code className="font-mono">admin</code> role.
            </li>
          </ul>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {endpoints.map((endpoint) => (
            <div
              key={`${endpoint.method}-${endpoint.path}`}
              className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-5"
            >
              <h3 className="font-semibold text-ink-strong text-lg">
                {endpoint.method} {endpoint.path}
              </h3>
              <p className="text-ink-body text-sm">
                <span className="font-semibold">What it does:</span>{" "}
                {endpoint.desc}
              </p>
              <p className="text-ink-body text-sm">
                <span className="font-semibold">Gets:</span> {endpoint.expects}
              </p>
              <p className="text-ink-body text-sm">
                <span className="font-semibold">Returns:</span>{" "}
                {endpoint.returns}
              </p>
              {endpoint.examples && <CodeTabs blocks={endpoint.examples} />}
            </div>
          ))}
        </div>
        <div className="space-y-2 rounded-lg border border-white/10 p-5 text-ink-body text-sm">
          <h3 className="font-semibold text-ink-strong text-lg">
            Response shape notes
          </h3>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <code className="font-mono">TabInfo</code>: tab_id, user_address,
              recipient_address, asset_address, accepted_guarantee_version,
              start_timestamp, ttl_seconds, status, settlement_status,
              created_at, updated_at.
            </li>
            <li>
              <code className="font-mono">GuaranteeInfo</code>: tab_id, req_id,
              version, from_address, to_address, asset_address, amount,
              start_timestamp, certificate?.
            </li>
            <li>
              <code className="font-mono">PendingRemunerationInfo</code>: tab,
              latest_guarantee?.
            </li>
            <li>
              <code className="font-mono">CollateralEventInfo</code>: id,
              user_address, asset_address, amount, event_type, tab_id?, req_id?,
              tx_id?, created_at.
            </li>
            <li>
              <code className="font-mono">UserTransactionInfo</code>:
              user_address, recipient_address, tx_hash, amount, verified,
              finalized, failed, created_at.
            </li>
            <li>
              <code className="font-mono">AssetBalanceInfo</code>: user_address,
              asset_address, total, locked, version, updated_at.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
