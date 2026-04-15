'use client';

export default function FaqSection() {
  const faqs = [
    {
      question: 'What is a payment tab?',
      answer:
        'A tab is a credit session opened by the recipient via POST /tabs. It is identified by a tabId, a TTL, and a guarantee version (V1 or V2). The version determines which on-chain decoder the contract uses when the recipient calls remunerate(). Each individual spend within the tab is tracked by a reqId, which increments with every signed guarantee.',
    },
    {
      question: 'What is a payment guarantee?',
      answer:
        'A guarantee is a signed claim the payer attaches to their request as an X-PAYMENT header. It carries tabId, reqId, userAddress, recipientAddress, amount, totalAmount, asset, and a timestamp. Payers sign with EIP-712 (default) or EIP-191. The facilitator verifies the signature and issues a BLS-signed certificate on-chain.',
    },
    {
      question: 'How does 4Mica integrate with ERC-8004?',
      answer:
        'ERC-8004 defines the ValidationRegistry — an on-chain registry where validators post scored responses (0–100) to validation requests. In V2 guarantees, the payer signs a guarantee that commits to a validationRequestHash binding a specific validator, agentId, minValidationScore, requiredValidationTag, and jobHash to the payment claims. When the recipient calls remunerate(), the ValidationRegistryGuaranteeDecoder reads the ValidationRegistry: if no response exists, the score is below the minimum, or the validator or tag do not match, the call reverts. Validators — stakers re-running the job, zkML verifiers, or TEE oracles — call validationResponse() on the registry with a score and tag, and can update it for progressive finality. V1 guarantees use plain EIP-712 signatures with no on-chain validation policy.',
    },
    {
      question: 'When can recipients claim collateral?',
      answer:
        'Recipients call remunerate() after the remunerationGracePeriod (default 14 days) and before tabExpirationTime (default 21 days). For V2 guarantees, the ValidationRegistry must also return a passing status that satisfies the signed policy before the contract releases funds.',
    },
    {
      question: 'When do users settle?',
      answer:
        'The product flow asks users to call payTabInERC20Token() after 7 days. If they do not, the recipient\'s on-chain claim window opens at 14 days (remunerationGracePeriod) and closes at 21 days (tabExpirationTime).',
    },
    {
      question: 'How do withdrawals work?',
      answer:
        'Users call requestWithdrawal() to start the timelock, then finalizeWithdrawal() once withdrawalGracePeriod (default 22 days) has elapsed. A synchronizationDelay (default 6 hours) prevents race conditions between a withdrawal request and a tab opened at the same time.',
    },
    {
      question: 'Which assets are supported?',
      answer:
        'ETH and stablecoins. Stablecoin deposits route through depositStablecoin() and are forwarded to Aave to earn yield. USDC and USDT are enabled by default; other ERC-20s revert unless explicitly configured.',
    },
    {
      question: 'How is a dispute handled?',
      answer:
        'With V2 guarantees, dispute resolution is fully on-chain via ERC-8004\'s ValidationRegistry. The payer signs a guarantee that commits to a validationRequestHash — a hash binding the specific validator, agentId, minValidationScore, requiredValidationTag, and jobHash to the exact payment claims (tabId, reqId, amounts, asset). When the recipient calls remunerate(), the ValidationRegistryGuaranteeDecoder checks the ValidationRegistry on-chain: if the validation is still pending, the response score is below minValidationScore, the validator or agentId don\'t match, or the tag doesn\'t match, the call reverts and collateral stays locked. Validators — stakers re-running the job, zkML verifiers, or TEE oracles — post a response (0–100) to the registry, and can update it multiple times for progressive finality.',
    },
    {
      question: 'How does the facilitator work?',
      answer:
        'The facilitator (x402-4mica) exposes /tabs, /verify, /settle, and /supported. POST /tabs issues a tab JSON with tabId and nextReqId. POST /verify checks the X-PAYMENT signature. POST /settle issues a BLS-signed certificate the recipient uses for on-chain remuneration.',
    },
  ];

  return (
    <section id="faq" className="py-20 section-gloss">
      <div className="container mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto">
          <p className="section-kicker">FAQ</p>
          <h2 className="section-title">Common questions</h2>
          <p className="section-lead">
            Defaults are pulled from Core4Mica contract parameters.
          </p>
        </div>

        <div className="mt-12 max-w-4xl mx-auto space-y-4">
          {faqs.map((faq) => (
            <details key={faq.question} className="glass-panel rounded-2xl p-6">
              <summary className="cursor-pointer text-base font-semibold text-ink-strong">
                {faq.question}
              </summary>
              <p className="mt-3 text-sm text-ink-body leading-relaxed">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
