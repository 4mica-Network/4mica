import CodeTabs from "../../blog/CodeTabs";

const endpoints = [
  {
    method: "POST",
    path: "/auth/nonce",
    desc: "Request a SIWE nonce + template.",
    expects: "{ address }",
    returns:
      "{ nonce, siwe: { domain, uri, chain_id, statement, expiration, issued_at } }",
    examples: [
      {
        label: "Request",
        language: "json",
        code: `{\n  "address": "0xUser"\n}`,
      },
      {
        label: "Response",
        language: "json",
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
    method: "POST",
    path: "/auth/verify",
    desc: "Verify SIWE signature and issue tokens.",
    expects: "{ address, message, signature }",
    returns: "{ access_token, refresh_token, expires_in }",
    examples: [
      {
        label: "Request",
        language: "json",
        code: `{\n  "address": "0xUser",\n  "message": "SIWE message string",\n  "signature": "0xSignature"\n}`,
      },
      {
        label: "Response",
        language: "json",
        code: `{\n  "access_token": "eyJhbGciOi...",\n  "refresh_token": "rfr_...",\n  "expires_in": 3600\n}`,
      },
    ],
  },
  {
    method: "POST",
    path: "/auth/refresh",
    desc: "Refresh access and refresh tokens.",
    expects: "{ refresh_token }",
    returns: "{ access_token, refresh_token, expires_in }",
    examples: [
      {
        label: "Request",
        language: "json",
        code: `{\n  "refresh_token": "rfr_..."\n}`,
      },
      {
        label: "Response",
        language: "json",
        code: `{\n  "access_token": "eyJhbGciOi...",\n  "refresh_token": "rfr_...",\n  "expires_in": 3600\n}`,
      },
    ],
  },
  {
    method: "POST",
    path: "/auth/logout",
    desc: "Revoke a refresh token.",
    expects: "{ refresh_token }",
    returns: "{ revoked }",
    examples: [
      {
        label: "Request",
        language: "json",
        code: `{\n  "refresh_token": "rfr_..."\n}`,
      },
      {
        label: "Response",
        language: "json",
        code: `{\n  "revoked": true\n}`,
      },
    ],
  },
  {
    method: "GET",
    path: "/core/health",
    desc: "Health status for the database and chain RPC dependencies.",
    expects: "No body.",
    returns:
      '{ status: "ok" | "fail", db: "ok" | "fail", chain_rpc: "ok" | "fail" }',
    examples: [
      {
        label: "Response",
        language: "json",
        code: `{\n  "status": "ok",\n  "db": "ok",\n  "chain_rpc": "ok"\n}`,
      },
    ],
  },
  {
    method: "GET",
    path: "/core/public-params",
    desc: "Public operator parameters.",
    expects: "No body.",
    returns:
      "{ public_key, contract_address, ethereum_http_rpc_url, eip712_name, eip712_version, chain_id, max_accepted_guarantee_version, accepted_guarantee_versions, active_guarantee_domain_separator, trusted_validation_registries, validation_hash_canonicalization_version }",
    examples: [
      {
        label: "Response",
        language: "json",
        code: `{
  "public_key": [1, 2, 3],
  "contract_address": "0xCoreContract",
  "ethereum_http_rpc_url": "https://rpc.example.com",
  "eip712_name": "4Mica",
  "eip712_version": "1",
  "chain_id": 1,
  "max_accepted_guarantee_version": 2,
  "accepted_guarantee_versions": [1, 2],
  "active_guarantee_domain_separator": "0xDomainSeparator",
  "trusted_validation_registries": ["0xRegistry"],
  "validation_hash_canonicalization_version": "4MICA_VALIDATION_REQUEST_V2"
}`,
      },
    ],
  },
  {
    method: "GET",
    path: "/core/tokens",
    desc: "List ERC-20 tokens supported by the active core deployment.",
    expects: "No body.",
    returns: "{ chain_id, tokens: [{ symbol, address, decimals }] }",
    examples: [
      {
        label: "Response",
        language: "json",
        code: `{\n  "chain_id": 84532,\n  "tokens": [\n    {\n      "symbol": "USDC",\n      "address": "0xAsset",\n      "decimals": 6\n    }\n  ]\n}`,
      },
    ],
  },
  {
    method: "POST",
    path: "/core/payment-tabs",
    desc: "Create or reuse a payment tab.",
    expects:
      "{ user_address, recipient_address, erc20_token?, ttl?, guarantee_version }",
    returns:
      "{ id, user_address, recipient_address, erc20_token?, asset_address, guarantee_version, next_req_id }",
    examples: [
      {
        label: "Request",
        language: "json",
        code: `{\n  "user_address": "0xUser",\n  "recipient_address": "0xRecipient",\n  "erc20_token": null,\n  "ttl": 3600,\n  "guarantee_version": 2\n}`,
      },
      {
        label: "Response",
        language: "json",
        code: `{\n  "id": "0x1",\n  "user_address": "0xUser",\n  "recipient_address": "0xRecipient",\n  "erc20_token": null,\n  "asset_address": "0xAsset",\n  "guarantee_version": 2,\n  "next_req_id": "0x0"\n}`,
      },
    ],
  },
  {
    method: "POST",
    path: "/core/guarantees",
    desc: "Issue a BLS guarantee for a signed request (V1 or V2).",
    expects:
      '{ claims: { version: "v1"| "v2", ... }, signature, scheme: "eip712" | "eip191" }',
    returns: "{ claims, signature } (BLSCert)",
    examples: [
      {
        label: "Request",
        language: "json",
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
        label: "Response",
        language: "json",
        code: `{\n  "claims": "0xClaimsBytes",\n  "signature": "0xBlsSignature"\n}`,
      },
    ],
  },
  {
    method: "GET",
    path: "/core/recipients/{recipient_address}/settled-tabs",
    desc: "List settled + remunerated tabs for a recipient.",
    expects: "Path param: recipient_address.",
    returns: "TabInfo[]",
    examples: [
      {
        label: "Response",
        language: "json",
        code: `[
  {
    "tab_id": "0x1",
    "user_address": "0xUser",
    "recipient_address": "0xRecipient",
    "asset_address": "0xAsset",
    "accepted_guarantee_version": 2,
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
    method: "GET",
    path: "/core/recipients/{recipient_address}/pending-remunerations",
    desc: "List pending remunerations for a recipient.",
    expects: "Path param: recipient_address.",
    returns: "PendingRemunerationInfo[]",
    examples: [
      {
        label: "Response",
        language: "json",
        code: `[
  {
    "tab": {
      "tab_id": "0x1",
      "user_address": "0xUser",
      "recipient_address": "0xRecipient",
      "asset_address": "0xAsset",
      "accepted_guarantee_version": 2,
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
      "version": 2,
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
    method: "GET",
    path: "/core/tabs/{tab_id}",
    desc: "Fetch a single tab.",
    expects: "Path param: tab_id.",
    returns: "TabInfo | null",
    examples: [
      {
        label: "Response",
        language: "json",
        code: `{
  "tab_id": "0x1",
  "user_address": "0xUser",
  "recipient_address": "0xRecipient",
  "asset_address": "0xAsset",
  "accepted_guarantee_version": 2,
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
    method: "GET",
    path: "/core/recipients/{recipient_address}/tabs",
    desc: "List tabs for a recipient.",
    expects:
      "Path param: recipient_address. Optional query: settlement_status (repeatable).",
    returns: "TabInfo[]",
    examples: [
      {
        label: "Response",
        language: "json",
        code: `[
  {
    "tab_id": "0x1",
    "user_address": "0xUser",
    "recipient_address": "0xRecipient",
    "asset_address": "0xAsset",
    "accepted_guarantee_version": 2,
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
    method: "GET",
    path: "/core/tabs/{tab_id}/guarantees",
    desc: "List all guarantees for a tab.",
    expects: "Path param: tab_id.",
    returns: "GuaranteeInfo[]",
    examples: [
      {
        label: "Response",
        language: "json",
        code: `[
  {
    "tab_id": "0x1",
    "req_id": "0x0",
    "version": 2,
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
    method: "GET",
    path: "/core/tabs/{tab_id}/guarantees/latest",
    desc: "Get the latest guarantee for a tab.",
    expects: "Path param: tab_id.",
    returns: "GuaranteeInfo | null",
    examples: [
      {
        label: "Response",
        language: "json",
        code: `{
  "tab_id": "0x1",
  "req_id": "0x0",
  "version": 2,
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
    method: "GET",
    path: "/core/tabs/{tab_id}/guarantees/{req_id}",
    desc: "Get a specific guarantee by req_id.",
    expects: "Path params: tab_id, req_id.",
    returns: "GuaranteeInfo | null",
    examples: [
      {
        label: "Response",
        language: "json",
        code: `{
  "tab_id": "0x1",
  "req_id": "0x0",
  "version": 2,
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
    method: "GET",
    path: "/core/recipients/{recipient_address}/payments",
    desc: "List on-chain payments observed for a recipient.",
    expects: "Path param: recipient_address.",
    returns: "UserTransactionInfo[]",
    examples: [
      {
        label: "Response",
        language: "json",
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
    method: "GET",
    path: "/core/tabs/{tab_id}/collateral-events",
    desc: "List collateral events tied to a tab.",
    expects: "Path param: tab_id.",
    returns: "CollateralEventInfo[]",
    examples: [
      {
        label: "Response",
        language: "json",
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
    method: "GET",
    path: "/core/users/{user_address}/assets/{asset_address}",
    desc: "Get a user\u2019s asset balance.",
    expects: "Path params: user_address, asset_address.",
    returns: "AssetBalanceInfo | null",
    examples: [
      {
        label: "Response",
        language: "json",
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
    method: "POST",
    path: "/core/users/{user_address}/suspension",
    desc: "Suspend or unsuspend a user.",
    expects:
      "Header: Authorization: Bearer <access_token> (role admin). Body: { suspended: boolean }",
    returns: "{ user_address, suspended, updated_at }",
    examples: [
      {
        label: "Request",
        language: "json",
        code: `{\n  "suspended": true\n}`,
      },
      {
        label: "Response",
        language: "json",
        code: `{\n  "user_address": "0xUser",\n  "suspended": true,\n  "updated_at": 1716500000\n}`,
      },
    ],
  },
];

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
