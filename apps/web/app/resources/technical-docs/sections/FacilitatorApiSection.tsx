import CodeBlock from "../../../../components/CodeBlock";
import CodeTabs from "../../blog/CodeTabs";

export default function FacilitatorApiSection() {
  return (
    <div>
      <h2 className="mb-6 font-bold text-3xl text-ink-strong">
        Facilitator API Reference
      </h2>
      <div className="space-y-6">
        <p className="text-ink-body leading-relaxed">
          Resource servers call the facilitator directly; end users and SDK
          clients only hit your
          <code className="font-mono"> tabEndpoint</code> and protected
          resources. The hosted base URL is typically
          <code className="font-mono"> https://x402.4mica.xyz/</code>, but any
          compatible deployment exposes the same endpoints.
        </p>
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-5">
            <h3 className="font-semibold text-ink-strong text-lg">GET /</h3>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">What it does:</span> Returns
              service metadata and a quick pointer to supported
              schemes/networks.
            </p>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">Gets:</span> No body.
            </p>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">Returns:</span>{" "}
              <code className="font-mono">
                {
                  '{ message, supported: SupportedKind[], health: "/health", docs }'
                }
              </code>
            </p>
            <CodeBlock
              code={`{
  "message": "Welcome to the 4mica credit facilitator...",
  "supported": [
    { "scheme": "4mica-credit", "network": "eip155:8453", "x402Version": 1 },
    { "scheme": "4mica-credit", "network": "eip155:8453", "x402Version": 2 },
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

          <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-5">
            <h3 className="font-semibold text-ink-strong text-lg">
              GET /health
            </h3>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">What it does:</span> Liveness
              probe for load balancers.
            </p>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">Gets:</span> No body.
            </p>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">Returns:</span>{" "}
              <code className="font-mono">{'{ status: "ok" }'}</code>
            </p>
            <CodeBlock code={`{ "status": "ok" }`} language="json" />
          </div>

          <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-5">
            <h3 className="font-semibold text-ink-strong text-lg">
              GET /supported
            </h3>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">What it does:</span> Lists all
              supported (scheme, network) pairs for credit and any delegated
              exact/debit flows.
            </p>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">Gets:</span> No body.
            </p>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">Returns:</span>{" "}
              <code className="font-mono">
                {
                  "{ kinds: [{ scheme, network, x402Version?, extra? }], extensions: [], signers: {} }"
                }
              </code>
            </p>
            <CodeBlock
              code={`{
  "kinds": [
    { "scheme": "4mica-credit", "network": "eip155:8453", "x402Version": 1 },
    { "scheme": "4mica-credit", "network": "eip155:8453", "x402Version": 2 },
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

          <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-5">
            <h3 className="font-semibold text-ink-strong text-lg">
              POST /tabs
            </h3>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">What it does:</span> Opens or
              reuses a payment tab for a (user, recipient, asset) triple. Used
              by your tab endpoint.
            </p>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">Gets:</span>{" "}
              <code className="font-mono">
                {
                  "{ userAddress, recipientAddress, x402Version?, guaranteeVersion?, network?, erc20Token?, ttlSeconds? }"
                }
              </code>
              . Networks use CAIP-2 identifiers (e.g.{" "}
              <code className="font-mono">eip155:8453</code> for Base,{" "}
              <code className="font-mono">eip155:11155111</code> for Ethereum
              Sepolia, <code className="font-mono">eip155:84532</code> for Base
              Sepolia). Use <code className="font-mono">erc20Token</code> = null
              or omit for ETH. Aliases:{" "}
              <code className="font-mono">assetAddress</code> and{" "}
              <code className="font-mono">networkId</code> are accepted. If{" "}
              <code className="font-mono">network</code> is omitted, the
              facilitator defaults to the first configured network.
              <code className="font-mono"> x402Version</code> is the preferred
              version field and maps to the underlying core
              <code className="font-mono"> guaranteeVersion</code>. If both are
              supplied they must match; if neither is supplied the facilitator
              defaults to version <code className="font-mono">1</code>.
            </p>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">Returns:</span>{" "}
              <code className="font-mono">
                {
                  "{ tabId, userAddress, recipientAddress, assetAddress, startTimestamp, ttlSeconds, nextReqId }"
                }
              </code>
              . <code className="font-mono">tabId</code> is a canonical hex
              string and <code className="font-mono">nextReqId</code> is the
              next sequential request id.
            </p>
            <CodeTabs
              blocks={[
                {
                  label: "Request",
                  language: "json",
                  code: `{
  "network": "eip155:84532",
  "x402Version": 2,
  "userAddress": "0xUser",
  "recipientAddress": "0xRecipient",
  "erc20Token": null,
  "ttlSeconds": 86400
}`,
                },
                {
                  label: "Response",
                  language: "json",
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

          <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-5">
            <h3 className="font-semibold text-ink-strong text-lg">
              POST /verify
            </h3>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">What it does:</span> Validates the
              structure of the decoded payment envelope against the original
              payment requirements. No on-chain work is done here.
            </p>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">Gets:</span>{" "}
              <code className="font-mono">
                {
                  "{ x402Version?: 1|2, paymentPayload: { ... }, paymentRequirements }"
                }
              </code>
              . <code className="font-mono">paymentPayload</code> is the decoded
              payment header (<code className="font-mono">X-PAYMENT</code> for
              v1, <code className="font-mono">PAYMENT-SIGNATURE</code> for v2).
            </p>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">Returns:</span>{" "}
              <code className="font-mono">
                {"{ isValid: true|false, invalidReason?, certificate? }"}
              </code>
              . Invalid requests return{" "}
              <code className="font-mono">isValid: false</code> with a reason.
            </p>
            <CodeTabs
              blocks={[
                {
                  label: "Request",
                  language: "json",
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
                  label: "Response",
                  language: "json",
                  code: `{
  "isValid": true,
  "invalidReason": null,
  "certificate": null
}`,
                },
              ]}
            />
          </div>

          <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-5">
            <h3 className="font-semibold text-ink-strong text-lg">
              POST /settle
            </h3>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">What it does:</span> Re-validates
              the decoded payment header and issues a BLS certificate for
              4mica-credit (or proxies exact/debit settlements). This step does
              not execute ERC-8004 validation; it only returns the certificate
              used later on-chain.
            </p>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">Gets:</span>{" "}
              <code className="font-mono">
                {
                  "{ x402Version?: 1|2, paymentPayload: { ... }, paymentRequirements }"
                }
              </code>
              .
            </p>
            <p className="text-ink-body text-sm">
              <span className="font-semibold">Returns:</span>{" "}
              <code className="font-mono">
                {"{ success, error?, txHash?, networkId?, certificate? }"}
              </code>
              . For 4mica-credit, <code className="font-mono">success</code> is
              true and a <code className="font-mono">certificate</code> is
              included. Delegated exact flows may return{" "}
              <code className="font-mono">txHash</code> instead.
            </p>
            <CodeTabs
              blocks={[
                {
                  label: "Request",
                  language: "json",
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
                  label: "Response",
                  language: "json",
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

        <div className="space-y-3 rounded-lg border border-white/10 p-6">
          <h3 className="font-semibold text-ink-strong text-lg">
            Shared payloads
          </h3>
          <div className="space-y-2 text-ink-body text-sm">
            <p>
              <span className="font-semibold">paymentRequirements</span> must
              include <code className="font-mono">scheme</code>,{" "}
              <code className="font-mono">network</code>,{" "}
              <code className="font-mono">maxAmountRequired</code> (x402 v1) or{" "}
              <code className="font-mono">amount</code> (x402 v2),{" "}
              <code className="font-mono">payTo</code>,{" "}
              <code className="font-mono">asset</code>, plus optional{" "}
              <code className="font-mono">resource</code>,{" "}
              <code className="font-mono">description</code>,{" "}
              <code className="font-mono">mimeType</code>,{" "}
              <code className="font-mono">outputSchema</code>,{" "}
              <code className="font-mono">maxTimeoutSeconds</code>, and{" "}
              <code className="font-mono">extra</code>.
            </p>
            <p>
              <span className="font-semibold">V2 validation fields:</span> when
              using x402 v2 claims, include
              <code className="font-mono"> validationRegistryAddress</code>,{" "}
              <code className="font-mono">validatorAddress</code>,{" "}
              <code className="font-mono">validatorAgentId</code>,{" "}
              <code className="font-mono">minValidationScore</code>,{" "}
              <code className="font-mono">validationChainId</code>, and{" "}
              <code className="font-mono">jobHash</code> in{" "}
              <code className="font-mono">paymentRequirements.extra</code>.{" "}
              <code className="font-mono">requiredValidationTag</code> is
              optional. <code className="font-mono">validationChainId</code>{" "}
              must match the CAIP-2 <code className="font-mono"> network</code>{" "}
              chain id and is carried in the signed V2 claim as{" "}
              <code className="font-mono"> validation_chain_id</code>.
            </p>
            <p>
              <span className="font-semibold">paymentPayload</span> is the
              decoded payment header (
              <code className="font-mono">X-PAYMENT</code> for v1,{" "}
              <code className="font-mono">PAYMENT-SIGNATURE</code> for v2) and
              supports <code className="font-mono">x402Version</code> 1 or 2. V1
              envelopes carry top-level
              <code className="font-mono"> scheme</code> and{" "}
              <code className="font-mono">network</code>; V2 envelopes carry
              those fields inside
              <code className="font-mono"> accepted</code>.
            </p>
            <p>
              <span className="font-semibold">certificate</span> is returned as{" "}
              <code className="font-mono">{"{ claims, signature }"}</code>, both
              hex strings suitable for on-chain remuneration.
            </p>
            <p>
              <span className="font-semibold">V2 remuneration rule:</span> a V2
              certificate can be remunerated only if the configured ERC-8004
              Validation Registry has a response for the signed
              <code className="font-mono"> validation_request_hash</code> and
              policy checks pass (score threshold, validator/agent, optional
              tag, canonical hashes, trusted registry).
            </p>
            <p>
              <span className="font-semibold">Versioning:</span> the facilitator
              only accepts <code className="font-mono">x402Version = 1</code> or{" "}
              <code className="font-mono">2</code>. If the top-level field is
              omitted, the server resolves the version from{" "}
              <code className="font-mono">paymentPayload</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
