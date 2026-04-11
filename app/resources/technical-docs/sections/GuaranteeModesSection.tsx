import CodeTabs from '../../blog/CodeTabs';

export default function GuaranteeModesSection() {
  return (
    <div>
      <h2 className="text-3xl font-bold text-ink-strong mb-6">Guarantee Modes (V1 vs V2)</h2>
      <div className="space-y-6">
        <p className="text-ink-body leading-relaxed">
          A <strong>guarantee</strong> is the signed credit commitment used as the payment instrument in the 4Mica x402
          flow. After a 402 challenge, the payer signs guarantee claims and sends them as the payment header
          (<code className="font-mono">X-PAYMENT</code> for v1, <code className="font-mono">PAYMENT-SIGNATURE</code> for v2).
          The recipient settles that guarantee into a certificate and can later enforce repayment on-chain if needed.
        </p>
        <p className="text-ink-body leading-relaxed">
          Choose the mode based on whether payout should depend on external validation evidence: use V1 for standard
          credit payments, and V2 when payout must be gated by ERC-8004 validation outcomes (for example "pay only if job validated").
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="text-lg font-semibold text-ink-strong mb-2">V1</h3>
            <p className="text-sm text-ink-body">
              Use for normal credit-backed API/service payments when no external job-validation attestation is required for payout.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="text-lg font-semibold text-ink-strong mb-2">V2</h3>
            <p className="text-sm text-ink-body">
              Use for integrations such as ERC-8004 where remuneration must succeed only after a matching on-chain validation status passes policy checks.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-ink-strong">
              <tr>
                <th className="text-left p-3">Capability</th>
                <th className="text-left p-3">V1</th>
                <th className="text-left p-3">V2</th>
              </tr>
            </thead>
            <tbody className="text-ink-body">
              <tr className="border-t border-white/10">
                <td className="p-3">Signed claim fields</td>
                <td className="p-3">tab/payment fields only</td>
                <td className="p-3">V1 fields + validation policy fields</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="p-3">x402 requirements</td>
                <td className="p-3">standard 4mica-credit requirements</td>
                <td className="p-3">adds validation inputs in <code className="font-mono">extra</code></td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="p-3">/verify and /settle</td>
                <td className="p-3">structural check + certificate issuance</td>
                <td className="p-3">same behavior, but certificate carries validation policy</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="p-3">remunerate preconditions</td>
                <td className="p-3">grace window + unpaid tab + valid cert</td>
                <td className="p-3">V1 checks + passing ERC-8004 validation status</td>
              </tr>
            </tbody>
          </table>
        </div>
        <CodeTabs
          blocks={[
            {
              label: 'V1 claims',
              language: 'json',
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
              label: 'V2 claims',
              language: 'json',
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
  "validation_request_hash": "0xRequestHash",
  "validation_chain_id": 80002,
  "validator_address": "0xValidator",
  "validator_agent_id": "0x7",
  "min_validation_score": 80,
  "validation_subject_hash": "0xSubjectHash",
  "required_validation_tag": "hard-finality"
}`,
            },
          ]}
        />
      </div>
    </div>
  );
}
