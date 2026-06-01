import CodeTabs from "../../blog/CodeTabs";

export default function GuaranteeModesSection() {
  return (
    <div>
      <h2 className="mb-2 font-bold text-3xl text-ink-strong">
        Verified Payment
      </h2>
      <p className="mb-6 text-ink-muted text-sm">Guarantee V1 vs V2</p>

      <div className="space-y-10">
        {/* ── What is a guarantee ── */}
        <section>
          <p className="text-ink-body leading-relaxed">
            A <strong>guarantee</strong> is the signed credit commitment used as
            the payment instrument in the x402 flow. After a 402 challenge, the
            payer signs guarantee claims (EIP-712) and sends them as the payment
            header. The recipient submits those claims to the 4Mica core
            service, which issues a <strong>BLS-signed certificate</strong>. A
            valid BLS signature from the core means the payment is committed,
            meaning the payer&apos;s collateral has been locked and the
            obligation is cryptographically attested.
          </p>
          <p className="mt-4 text-ink-body leading-relaxed">
            Settlement happens later. The payer can settle voluntarily by
            calling <code className="font-mono">payTabInERC20Token</code> on the
            vault contract, which is a direct ERC-20 transfer that records
            payment against the tab once the job is done. If the payer defaults
            and does not settle, the recipient can submit the BLS certificate to
            the <strong>4Mica vault contract</strong> via{" "}
            <code className="font-mono">remunerate</code> after the grace period
            expires. The vault verifies the BLS signature and seizes the
            payer&apos;s collateral.
          </p>
          <p className="mt-4 text-ink-body leading-relaxed">
            Currently, two guarantee versions are supported:
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <h3 className="mb-2 font-semibold text-base text-ink-strong">
                V1: Standard
              </h3>
              <p className="text-ink-body text-sm">
                Payment is committed at issuance. If the payer does not settle
                voluntarily, the recipient calls{" "}
                <code className="font-mono">remunerate</code> after the grace
                period. The vault verifies the BLS cert and releases collateral.
                No job-validation condition is attached.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <h3 className="mb-2 font-semibold text-base text-ink-strong">
                V2: Verified
              </h3>
              <p className="text-ink-body text-sm">
                Same as V1, but when the recipient calls{" "}
                <code className="font-mono">remunerate</code> the vault&apos;s
                V2 decoder reads the ERC-8004 registry on-chain and reverts if
                the validation result is missing or does not meet the embedded
                policy. Payment is enforced{" "}
                <strong>only if the job was validated</strong>.
              </p>
            </div>
          </div>
        </section>

        {/* ── Remuneration time window ── */}
        <section>
          <h3 className="mb-4 font-semibold text-ink-strong text-xl">
            Collecting on User Default
          </h3>
          <p className="mb-4 text-ink-body leading-relaxed">
            If the payer does not settle voluntarily, the recipient enforces
            payment by calling <code className="font-mono">remunerate</code> on
            the vault contract with the stored BLS certificate. The vault checks
            the BLS signature, verifies the guarantee has not already been paid
            or previously remunerated, and transfers the locked collateral to
            the recipient.
          </p>
          <p className="mb-4 text-ink-body leading-relaxed">
            <code className="font-mono">remunerate</code> can only be called
            within a strict time window anchored to the{" "}
            <code className="font-mono">timestamp</code> field embedded in the
            guarantee:
          </p>
          <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4 font-mono text-ink-body text-sm">
            guarantee.timestamp + 14 days &nbsp;≤&nbsp; block.timestamp
            &nbsp;&lt;&nbsp; guarantee.timestamp + 21 days
          </div>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="mb-1 font-semibold text-ink-muted text-xs uppercase tracking-wide">
                Opens
              </p>
              <p className="text-ink-body text-sm">
                14 days after guarantee timestamp - the grace period for
                voluntary settlement.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="mb-1 font-semibold text-ink-muted text-xs uppercase tracking-wide">
                Closes
              </p>
              <p className="text-ink-body text-sm">
                21 days after guarantee timestamp. Calling after this reverts
                with <code className="font-mono">TabExpired()</code>.
              </p>
            </div>
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-4">
              <p className="mb-1 font-semibold text-amber-400/80 text-xs uppercase tracking-wide">
                Window
              </p>
              <p className="text-ink-body text-sm">
                <strong>7 days</strong> to act. Missing this window means the
                collateral is never claimable - there is no recovery path.
              </p>
            </div>
          </div>
          <div className="mb-6 rounded-lg border border-amber-400/20 bg-amber-400/5 p-4">
            <p className="text-ink-body text-sm">
              <strong className="text-ink-strong">
                Store the BLS certificate at issuance.
              </strong>{" "}
              The cert (<code className="font-mono">claims</code> +{" "}
              <code className="font-mono">signature</code>) returned by{" "}
              <code className="font-mono">issuePaymentGuarantee</code> - or by
              the facilitator&apos;s <code className="font-mono">/settle</code>{" "}
              endpoint - must be persisted. It can also be retrieved later via{" "}
              <code className="font-mono">getLatestGuarantee</code>, but only
              while the 4Mica core service is accessible. Do not rely on
              retrieval as your only recovery path.
            </p>
          </div>
          <p className="mb-4 text-ink-body leading-relaxed">
            Use <code className="font-mono">listPendingRemunerations()</code> to
            poll for tabs with outstanding guarantees, then retrieve the stored
            certificate and submit it on-chain once the window opens.
          </p>
          <CodeTabs
            blocks={[
              {
                label: "Monitor defaults (TS)",
                language: "typescript",
                code: `// Returns all tabs with settlementStatus = PENDING for this recipient,
// each paired with their latest guarantee.
const pending = await client.recipient.listPendingRemunerations();

for (const { tab, latestGuarantee } of pending) {
  if (!latestGuarantee?.certificate) continue;

  const now = Math.floor(Date.now() / 1000);
  const ts = latestGuarantee.timestamp;
  const windowOpen = ts + 14 * 24 * 3600;
  const windowClose = ts + 21 * 24 * 3600;

  if (now < windowOpen) {
    console.log(\`Tab \${tab.tabId}: opens in \${Math.round((windowOpen - now) / 3600)}h\`);
  } else if (now >= windowClose) {
    console.log(\`Tab \${tab.tabId}: EXPIRED - window closed\`);
  } else {
    console.log(\`Tab \${tab.tabId}: READY - submitting remuneration\`);
    const cert = JSON.parse(latestGuarantee.certificate);
    const receipt = await client.recipient.remunerate(cert);
    console.log('Settled in tx', receipt.transactionHash);
  }
}`,
              },
              {
                label: "Retrieve cert by tab ID (TS)",
                language: "typescript",
                code: `// If you lost the cert returned at issuance, retrieve it from the core.
// The certificate field is the JSON-serialized BLS cert stored by the core service.
const guarantee = await client.recipient.getLatestGuarantee(tabId);
if (!guarantee?.certificate) throw new Error('No guarantee found');

const cert = JSON.parse(guarantee.certificate); // { claims: '0x...', signature: '0x...' }
const receipt = await client.recipient.remunerate(cert);
console.log('Settled in tx', receipt.transactionHash);`,
              },
              {
                label: "Monitor defaults (Python)",
                language: "python",
                code: `import json, time
from fourmica_sdk.models import BLSCert

# Returns all tabs with settlement_status = PENDING for this recipient,
# each paired with their latest guarantee.
pending = await client.recipient.list_pending_remunerations()

for item in pending:
    g = item.latest_guarantee
    if not g or not g.certificate:
        continue

    now = int(time.time())
    window_open = g.timestamp + 14 * 24 * 3600
    window_close = g.timestamp + 21 * 24 * 3600

    if now < window_open:
        print(f"Tab {item.tab.tab_id}: opens in {(window_open - now) // 3600}h")
    elif now >= window_close:
        print(f"Tab {item.tab.tab_id}: EXPIRED - window closed")
    else:
        print(f"Tab {item.tab.tab_id}: READY - submitting remuneration")
        data = json.loads(g.certificate)
        cert = BLSCert(claims=data["claims"], signature=data["signature"])
        receipt = await client.recipient.remunerate(cert)
        print("Settled in tx", receipt["transactionHash"])`,
              },
              {
                label: "Retrieve cert by tab ID (Python)",
                language: "python",
                code: `import json
from fourmica_sdk.models import BLSCert

# If you lost the cert returned at issuance, retrieve it from the core.
# The certificate field is the JSON-serialized BLS cert stored by the core service.
guarantee = await client.recipient.get_latest_guarantee(tab_id)
if not guarantee or not guarantee.certificate:
    raise RuntimeError("No guarantee found")

data = json.loads(guarantee.certificate)  # {"claims": "0x...", "signature": "0x..."}
cert = BLSCert(claims=data["claims"], signature=data["signature"])
receipt = await client.recipient.remunerate(cert)
print("Settled in tx", receipt["transactionHash"])`,
              },
            ]}
          />
        </section>

        {/* ── V2 structure ── */}
        <section>
          <h3 className="mb-4 font-semibold text-ink-strong text-xl">
            V2 Guarantee Structure
          </h3>
          <p className="mb-4 text-ink-body leading-relaxed">
            V2 extends the V1 base fields with a{" "}
            <strong>validation policy</strong>, which is a set of constraints
            the vault&apos;s decoder checks against the ERC-8004 registry before
            releasing collateral.
          </p>

          <h4 className="mb-3 font-semibold text-ink-strong text-sm uppercase tracking-wide">
            Base payment fields (shared with V1)
          </h4>
          <div className="mb-6 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-ink-strong">
                <tr>
                  <th className="p-3 text-left">Field</th>
                  <th className="p-3 text-left">Why it&apos;s needed</th>
                </tr>
              </thead>
              <tbody className="text-ink-body">
                <tr className="border-white/10 border-t">
                  <td className="p-3 font-mono text-xs">user_address</td>
                  <td className="p-3">
                    Payer, whose collateral is locked at issuance and seized on{" "}
                    <code className="font-mono">remunerate</code>.
                  </td>
                </tr>
                <tr className="border-white/10 border-t">
                  <td className="p-3 font-mono text-xs">recipient_address</td>
                  <td className="p-3">
                    Payee, who calls{" "}
                    <code className="font-mono">remunerate</code> to enforce
                    payment.
                  </td>
                </tr>
                <tr className="border-white/10 border-t">
                  <td className="p-3 font-mono text-xs">tab_id</td>
                  <td className="p-3">
                    Identifies the payment session (tab). The vault maps payment
                    status and the remuneration flag by{" "}
                    <code className="font-mono">tabId</code>, and all payment
                    events are indexed by it. Also committed into{" "}
                    <code className="font-mono">validation_subject_hash</code>{" "}
                    so the validator attests to this exact tab.
                  </td>
                </tr>
                <tr className="border-white/10 border-t">
                  <td className="p-3 font-mono text-xs">req_id</td>
                  <td className="p-3">
                    Monotonic request counter within the tab&apos;s active
                    cycle. Makes each guarantee unique and prevents replay. Also
                    committed into{" "}
                    <code className="font-mono">validation_subject_hash</code>.
                  </td>
                </tr>
                <tr className="border-white/10 border-t">
                  <td className="p-3 font-mono text-xs">amount</td>
                  <td className="p-3">
                    Payment amount in token base units, locked from the
                    payer&apos;s collateral at issuance.
                  </td>
                </tr>
                <tr className="border-white/10 border-t">
                  <td className="p-3 font-mono text-xs">asset_address</td>
                  <td className="p-3">
                    ERC-20 token address, or zero address for the native asset.
                  </td>
                </tr>
                <tr className="border-white/10 border-t">
                  <td className="p-3 font-mono text-xs">timestamp</td>
                  <td className="p-3">
                    Unix timestamp of the payment request. The core rejects
                    future timestamps and uses it to scope the active cycle. The
                    vault enforces the grace-period and expiry window relative
                    to this value.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4 className="mb-3 font-semibold text-ink-strong text-sm uppercase tracking-wide">
            Validation policy fields (V2 only)
          </h4>
          <div className="mb-6 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-ink-strong">
                <tr>
                  <th className="p-3 text-left">Field</th>
                  <th className="p-3 text-left">Why it&apos;s needed</th>
                </tr>
              </thead>
              <tbody className="text-ink-body">
                <tr className="border-white/10 border-t">
                  <td className="p-3 font-mono text-xs">
                    validation_registry_address
                  </td>
                  <td className="p-3">
                    Address of the ERC-8004{" "}
                    <code className="font-mono">ValidationRegistry</code> the
                    decoder will call. Must be on the decoder&apos;s trust-list,
                    and untrusted registries revert immediately.
                  </td>
                </tr>
                <tr className="border-white/10 border-t">
                  <td className="p-3 font-mono text-xs">validation_chain_id</td>
                  <td className="p-3">
                    Chain where the registry lives. Must equal{" "}
                    <code className="font-mono">block.chainid</code> at
                    remuneration time; mismatches revert.
                  </td>
                </tr>
                <tr className="border-white/10 border-t">
                  <td className="p-3 font-mono text-xs">validator_address</td>
                  <td className="p-3">
                    On-chain address of the validator agent. The decoder checks
                    that the registry result was submitted by exactly this
                    address.
                  </td>
                </tr>
                <tr className="border-white/10 border-t">
                  <td className="p-3 font-mono text-xs">validator_agent_id</td>
                  <td className="p-3">
                    Numeric ID of the validator agent in the registry. The
                    decoder checks it matches the result, ensuring a specific
                    registered agent performed the job.
                  </td>
                </tr>
                <tr className="border-white/10 border-t">
                  <td className="p-3 font-mono text-xs">
                    min_validation_score
                  </td>
                  <td className="p-3">
                    Minimum score (1–100) the validation result must reach. The
                    decoder reverts with{" "}
                    <code className="font-mono">ValidationScoreTooLow</code> if
                    the recorded score is below this threshold.
                  </td>
                </tr>
                <tr className="border-white/10 border-t">
                  <td className="p-3 font-mono text-xs">
                    required_validation_tag
                  </td>
                  <td className="p-3">
                    String tag the validation result must carry (e.g.{" "}
                    <code className="font-mono">&quot;hard-finality&quot;</code>
                    ). The decoder compares keccak256 hashes of expected vs
                    actual. An empty string disables the check.
                  </td>
                </tr>
                <tr className="border-white/10 border-t">
                  <td className="p-3 font-mono text-xs">job_hash</td>
                  <td className="p-3">
                    Keccak-256 hash of the job input. Committed into{" "}
                    <code className="font-mono">validation_request_hash</code>,
                    binding this payment to one specific computation. Must be
                    non-zero.
                  </td>
                </tr>
                <tr className="border-white/10 border-t">
                  <td className="p-3 font-mono text-xs">
                    validation_subject_hash
                  </td>
                  <td className="p-3">
                    <code className="font-mono text-xs">
                      keccak256(bindingDomain, tab_id, req_id, user, recipient,
                      amount, asset, timestamp)
                    </code>
                    . The validator submits this hash to the registry alongside
                    the result, binding the attestation to this exact tab and
                    request. The decoder recomputes it from the certificate
                    fields and rejects any mismatch.
                  </td>
                </tr>
                <tr className="border-white/10 border-t">
                  <td className="p-3 font-mono text-xs">
                    validation_request_hash
                  </td>
                  <td className="p-3">
                    <code className="font-mono text-xs">
                      keccak256(bindingDomain, chainId, registry,
                      validatorAddress, validatorAgentId, validationSubjectHash,
                      minScore, tagHash, jobHash)
                    </code>
                    . This is the key the decoder passes to{" "}
                    <code className="font-mono">getValidationStatus()</code> on
                    the registry. The decoder recomputes it and rejects any
                    mismatch.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-4">
            <p className="text-ink-body text-sm">
              <strong className="text-ink-strong">
                Both hashes are canonical.
              </strong>{" "}
              They are computed deterministically from the other fields, so you
              cannot set them to arbitrary values. The core rejects requests
              where they do not match, and the on-chain decoder recomputes them
              again at remuneration time. Use{" "}
              <code className="font-mono">computeValidationSubjectHash()</code>{" "}
              and{" "}
              <code className="font-mono">computeValidationRequestHash()</code>{" "}
              from the SDK.
            </p>
          </div>
        </section>

        {/* ── On-chain enforcement ── */}
        <section>
          <h3 className="mb-4 font-semibold text-ink-strong text-xl">
            On-Chain Enforcement
          </h3>
          <p className="mb-4 text-ink-body leading-relaxed">
            When the recipient calls{" "}
            <code className="font-mono">remunerate</code> with a V2 certificate,
            the vault routes it through the{" "}
            <code className="font-mono">
              ValidationRegistryGuaranteeDecoder
            </code>
            . The decoder runs the following checks before the vault releases
            collateral:
          </p>
          <ol className="list-none space-y-2 text-ink-body text-sm">
            {(
              [
                {
                  id: "subject-hash",
                  content: (
                    <>
                      Recomputes{" "}
                      <code className="font-mono">validation_subject_hash</code>{" "}
                      from the certificate fields, and reverts on mismatch.
                    </>
                  ),
                },
                {
                  id: "request-hash",
                  content: (
                    <>
                      Recomputes{" "}
                      <code className="font-mono">validation_request_hash</code>{" "}
                      from the policy fields, and reverts on mismatch.
                    </>
                  ),
                },
                {
                  id: "registry-status",
                  content: (
                    <>
                      Calls{" "}
                      <code className="font-mono">
                        registry.getValidationStatus(validationRequestHash)
                      </code>
                      . Reverts with{" "}
                      <code className="font-mono">ValidationPending</code> if no
                      result exists yet.
                    </>
                  ),
                },
                {
                  id: "min-score",
                  content: (
                    <>
                      Checks{" "}
                      <code className="font-mono">
                        response &gt;= min_validation_score
                      </code>
                      .
                    </>
                  ),
                },
                {
                  id: "validator-agent",
                  content: (
                    <>
                      Checks <code className="font-mono">validatorAddress</code>{" "}
                      and <code className="font-mono">agentId</code> match the
                      policy.
                    </>
                  ),
                },
                {
                  id: "validation-tag",
                  content: (
                    <>
                      If{" "}
                      <code className="font-mono">required_validation_tag</code>{" "}
                      is set, checks the tag hash matches.
                    </>
                  ),
                },
              ] as { id: string; content: React.ReactNode }[]
            ).map((step, i) => (
              <li key={step.id} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/10 font-bold text-ink-muted text-xs">
                  {i + 1}
                </span>
                <span>{step.content}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-ink-body text-sm leading-relaxed">
            All checks happen on-chain during the{" "}
            <code className="font-mono">remunerate</code> call, and no off-chain
            coordination is required for enforcement. The validator simply needs
            to have written a passing result to the registry before the
            recipient submits the certificate.
          </p>
        </section>

        {/* ── How to use it ── */}
        <section>
          <h3 className="mb-4 font-semibold text-ink-strong text-xl">
            How to Use Verified Payments
          </h3>
          <p className="mb-6 text-ink-body leading-relaxed">
            The goal: the recipient only gets paid if the job was validated. In
            normal x402 integrations,{" "}
            <code className="font-mono">@4mica/x402</code> handles tab creation,
            V2 claim construction, canonical hash computation, signing, and
            request retrying. Use the lower-level SDK flow only when you are
            issuing guarantees directly.
          </p>

          <CodeTabs
            blocks={[
              {
                label: "x402 server policy",
                language: "typescript",
                code: `import express from "express";
import { paymentMiddlewareFromConfig } from "@4mica/x402/server/express";

const app = express();
app.use(express.json());

const TAB_ENDPOINT = "http://localhost:3030/payment/tab";

app.use(
  paymentMiddlewareFromConfig(
    {
      "GET /premium-content": {
        accepts: {
          scheme: "4mica-credit",
          price: "$0.10",
          network: "eip155:84532",
          payTo: "0xRecipientAddress",
          extra: {
            validationRegistryAddress: "0xYourValidationRegistryAddress",
            validationChainId: 84532,
            validatorAddress: "0xYourValidatorAddress",
            validatorAgentId: "1",
            minValidationScore: 80,
            jobHash: "0x" + "ab".repeat(32),
            requiredValidationTag: "hard-finality",
          },
        },
        description: "Access to validated premium content",
      },
    },
    { advertisedEndpoint: TAB_ENDPOINT },
  )
);`,
              },
              {
                label: "x402 client",
                language: "typescript",
                code: `import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { FourMicaEvmScheme } from "@4mica/x402/client";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0xYourPrivateKey");
const scheme = await FourMicaEvmScheme.create(account);

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "eip155:84532", client: scheme }],
});

// The wrapper reads paymentRequirements.extra, opens a tab, computes
// validationSubjectHash and validationRequestHash, signs V2 claims,
// and retries with the payment header.
const response = await fetchWithPayment("http://localhost:3030/premium-content");
console.log(await response.json());`,
              },
              {
                label: "Manual SDK claims",
                language: "typescript",
                code: `import {
  computeValidationSubjectHash,
  computeValidationRequestHash,
  PaymentGuaranteeRequestClaims,
  PaymentGuaranteeRequestClaimsV2,
} from '@4mica/sdk';

// Build the V1 base claims first. Use assetAddress and nextReqId
// from the tab response returned by the resource server or core.
const baseClaims = PaymentGuaranteeRequestClaims.new(
  userAddress,
  recipientAddress,
  tabId,
  amount,
  timestamp,
  assetAddress,
  nextReqId
);

const validationSubjectHash = computeValidationSubjectHash(baseClaims);

const unsignedV2Claims = new PaymentGuaranteeRequestClaimsV2({
  ...baseClaims,
  validationRegistryAddress,
  validationRequestHash: '0x' + '00'.repeat(32),
  validationChainId,
  validatorAddress,
  validatorAgentId: BigInt(validatorAgentId),
  minValidationScore,
  validationSubjectHash,
  jobHash,
  requiredValidationTag: requiredValidationTag ?? '',
});

const v2Claims = new PaymentGuaranteeRequestClaimsV2({
  ...unsignedV2Claims,
  validationRequestHash: computeValidationRequestHash(unsignedV2Claims),
});`,
              },
              {
                label: "Manual SDK issue",
                language: "typescript",
                code: `import { SigningScheme } from '@4mica/sdk';

const { signature } = await client.user.signPayment(v2Claims, SigningScheme.EIP712);

// Core verifies both canonical hashes, locks payer collateral,
// and returns the BLS certificate used later for remuneration.
const cert = await client.recipient.issuePaymentGuarantee(
  v2Claims,
  signature,
  SigningScheme.EIP712
);

// Persist cert.claims and cert.signature, needed later to remunerate.`,
              },
              {
                label: "Manual SDK remunerate",
                language: "typescript",
                code: `// Once the validator has written a passing result to the ERC-8004
// registry, the recipient can call remunerate.
//
// The vault's V2 decoder calls:
//   registry.getValidationStatus(validationRequestHash)
// and reverts if the result is missing, the score is too low,
// or any other policy condition is not met.
//
// No off-chain coordination needed, all checks happen on-chain.
const receipt = await client.recipient.remunerate(cert);
console.log('Settled in tx', receipt.transactionHash);`,
              },
            ]}
          />
        </section>

        {/* ── Wire format reference ── */}
        <section>
          <h3 className="mb-4 font-semibold text-ink-strong text-xl">
            Wire-Format Reference
          </h3>
          <p className="mb-4 text-ink-body leading-relaxed">
            The claims object sent to{" "}
            <code className="font-mono">POST /core/guarantees</code> is tagged
            with a <code className="font-mono">version</code> field. V2 adds the
            validation policy fields inline.
          </p>
          <CodeTabs
            blocks={[
              {
                label: "V1 claims",
                language: "json",
                code: `{
  "version": "v1",
  "user_address": "0xUser",
  "recipient_address": "0xRecipient",
  "tab_id": "0x1",
  "req_id": "0x0",
  "amount": "0x64",
  "asset_address": "0xAsset",
  "timestamp": 1716500000
}`,
              },
              {
                label: "V2 claims",
                language: "json",
                code: `{
  "version": "v2",
  "user_address": "0xUser",
  "recipient_address": "0xRecipient",
  "tab_id": "0x1",
  "req_id": "0x0",
  "amount": "0x64",
  "asset_address": "0xAsset",
  "timestamp": 1716500000,
  "validation_registry_address": "0xRegistry",
  "validation_chain_id": 84532,
  "validator_address": "0xValidator",
  "validator_agent_id": "0x7",
  "min_validation_score": 80,
  "required_validation_tag": "hard-finality",
  "job_hash": "0xJobHash",
  "validation_subject_hash": "0xSubjectHash",
  "validation_request_hash": "0xRequestHash"
}`,
              },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
