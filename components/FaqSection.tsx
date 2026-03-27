'use client';

export default function FaqSection() {
  const faqs = [
    {
      question: 'What is a payment tab?',
      answer:
        'A tab is a credit line identified by tab_id. The recipient opens it, and req_id tracks each spend against the tab.',
    },
    {
      question: 'What is a payment guarantee?',
      answer:
        'A guarantee is a BLS-signed claim with tab_id, req_id, client, recipient, asset, amount, total_amount, timestamp, and a domain separator. V2 also embeds ERC-8004 validation policy fields.',
    },
    {
      question: 'Do you support both V1 and V2?',
      answer:
        'Yes. Both are supported. V1 is the baseline credit guarantee flow; V2 adds ERC-8004 validation-gated remuneration checks.',
    },
    {
      question: 'When can recipients claim collateral?',
      answer:
        'After the remuneration grace period (default 14 days) and before tab expiration (default 21 days). For V2, claim/remuneration also requires a passing ERC-8004 validation status that matches the signed policy.',
    },
    {
      question: 'How does V2 validation work?',
      answer:
        'V2 claims commit a validation request hash, validator, agent id, and score threshold. During remuneration, core checks ValidationRegistry status on-chain and reverts unless the policy constraints pass.',
    },
    {
      question: 'When do users settle?',
      answer:
        'The product flow asks users to settle after 7 days. If they do not, the on-chain claim window opens at 14 days by default.',
    },
    {
      question: 'How do withdrawals work for users?',
      answer:
        'Users request a withdrawal, then finalize after the withdrawal grace period (default 22 days). A synchronization delay (default 6 hours) protects tabs opened near a withdrawal request.',
    },
    {
      question: 'Which assets are supported by default?',
      answer:
        'ETH, USDC, and USDT are supported. Stablecoin flows require USDC or USDT; other assets revert.',
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
