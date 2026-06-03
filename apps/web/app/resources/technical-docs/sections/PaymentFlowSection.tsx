import Link from "next/link";
import MermaidDiagram from "../../../../components/MermaidDiagram";

const sequenceDiagram = `sequenceDiagram
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
    CoreService->>CoreService: Pause/unpause wallet & update balances`;

export default function PaymentFlowSection() {
  return (
    <div>
      <h2 className="mb-6 font-bold text-3xl text-ink-strong">Protocol Flow</h2>
      <div className="space-y-6">
        <p className="text-ink-body leading-relaxed">
          This flow summarizes the internal protocol sequence for credit
          guarantees, from collateral to settlement and remuneration.
        </p>
        <p className="text-ink-body leading-relaxed">
          If you want to see the interactive protocol design, click{" "}
          <Link
            href="/interactive-protocol"
            className="text-brand-teal underline hover:text-brand-teal/80"
          >
            here
          </Link>
          .
        </p>
        <div className="rounded-lg border border-white/10 bg-white/10 p-6">
          <ol className="list-inside list-decimal space-y-3 text-ink-body">
            <li>
              <span className="font-semibold text-ink-body">
                Deposit collateral.
              </span>{" "}
              Payers deposit ETH or ERC-20 into the Core4Mica vault; the core
              listener persists collateral events so wallets are eligible.
            </li>
            <li>
              <span className="font-semibold text-ink-body">Discovery.</span>{" "}
              The resource returns a 402 template with accepted
              <code className="font-mono"> (scheme, network)</code> pairs and a{" "}
              <code className="font-mono">tabEndpoint</code>.
            </li>
            <li>
              <span className="font-semibold text-ink-body">
                Tab provisioning.
              </span>{" "}
              The resource calls the facilitator
              <code className="font-mono"> /tabs</code> (typically via{" "}
              <code className="font-mono">tabEndpoint</code>) to open or reuse a
              tab.
            </li>
            <li>
              <span className="font-semibold text-ink-body">
                Header composition.
              </span>{" "}
              The payer (or SDK helper) signs V1 claims by default, or V2 claims
              when validation policy fields are present in
              <code className="font-mono"> paymentRequirements.extra</code>,
              then wraps them into a base64 payment header (
              <code className="font-mono">X-PAYMENT</code> for v1,{" "}
              <code className="font-mono">PAYMENT-SIGNATURE</code> for v2).
            </li>
            <li>
              <span className="font-semibold text-ink-body">Verification.</span>{" "}
              The resource calls
              <code className="font-mono"> /verify</code> for structural
              validation (no core call).
            </li>
            <li>
              <span className="font-semibold text-ink-body">Settlement.</span>{" "}
              The resource calls
              <code className="font-mono"> /settle</code>, the facilitator
              requests a BLS certificate from core, verifies it, and returns it.
            </li>
            <li>
              <span className="font-semibold text-ink-body">
                Validation (V2 only).
              </span>{" "}
              If the guarantee is V2 and the payer defaults, the recipient (or
              validator workflow) must have an ERC-8004 validation response that
              satisfies the signed policy before calling{" "}
              <code className="font-mono">remunerate</code>.
            </li>
            <li>
              <span className="font-semibold text-ink-body">Tab closure.</span>{" "}
              Happy path: the payer settles on-chain using the
              <code className="font-mono"> req_id</code> in the certificate.
              Default path: the recipient calls{" "}
              <code className="font-mono">remunerate</code> on-chain with the
              BLS certificate within the window{" "}
              <code className="font-mono">
                [timestamp + 14 days, timestamp + 21 days)
              </code>
              . Calling before the window opens reverts with{" "}
              <code className="font-mono">TabNotYetOverdue()</code>; calling
              after it closes reverts with{" "}
              <code className="font-mono">TabExpired()</code> and the collateral
              is unclaimable.
            </li>
            <li>
              <span className="font-semibold text-ink-body">
                Withdrawals &amp; sync.
              </span>{" "}
              Withdrawal requests pause guarantees while events settle;
              background operators stream events to keep core state aligned.
            </li>
          </ol>
        </div>
        <div className="space-y-3 rounded-lg border border-white/10 p-6">
          <h3 className="font-semibold text-ink-strong text-lg">
            High-level sequence
          </h3>
          <MermaidDiagram code={sequenceDiagram} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-white/10 p-4">
            <h4 className="mb-3 font-semibold text-ink-body">Actors</h4>
            <ul className="space-y-2 text-ink-body text-sm">
              <li>
                Payer SDK: deposits collateral, signs guarantees, pays tabs.
              </li>
              <li>
                Recipient resource: issues 402 templates, calls verify/settle.
              </li>
              <li>
                Facilitator (<code className="font-mono">x402-4mica</code>):
                /tabs, /verify, /settle orchestration.
              </li>
              <li>Core service: issues BLS guarantees and tracks tab state.</li>
              <li>
                Core4Mica contract: custodies collateral and pays/remunerates.
              </li>
            </ul>
          </div>
          <div className="rounded-lg border border-white/10 p-4">
            <h4 className="mb-3 font-semibold text-ink-body">
              Guards &amp; guarantees
            </h4>
            <ul className="space-y-2 text-ink-body text-sm">
              <li>/verify is structural only; no core calls.</li>
              <li>
                /settle upgrades claims with monotonic{" "}
                <code className="font-mono">req_id</code> and running totals.
              </li>
              <li>
                Certificates are verified against operator public parameters and
                domain.
              </li>
              <li>
                Remuneration only succeeds within the window{" "}
                <code className="font-mono">
                  [timestamp + 14d, timestamp + 21d)
                </code>{" "}
                and if the tab is unpaid. Missing the 21-day deadline makes the
                collateral permanently unclaimable.
              </li>
              <li>
                V2 additionally requires passing ERC-8004 validation status that
                matches the signed policy.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
