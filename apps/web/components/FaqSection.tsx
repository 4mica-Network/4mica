"use client";

const FAQS = [
  {
    question: "What exactly is a credit layer for x402?",
    answer:
      "Standard x402 settles every payment on-chain, one transaction per request. 4Mica adds a credit layer: agents sign off-chain guarantees and spend against pooled collateral. Settlements are batched and happen once per window, resulting in orders of magnitude fewer transactions.",
  },
  {
    question: "What is a payment tab?",
    answer:
      "A tab is a credit session opened by the recipient (POST /tabs). It has a tabId, TTL, and version. Individual spends within the tab are identified by a reqId that increments with each signed guarantee.",
  },
  {
    question: "What is a payment guarantee?",
    answer:
      "A payment guarantee is an EIP-712 signed claim that the payer attaches as an X-PAYMENT header. It commits to tabId, reqId, amounts, addresses, and timestamp. The facilitator verifies the signature and issues a BLS-signed certificate for on-chain settlement.",
  },
  {
    question: "How does yield work?",
    answer:
      "Stablecoin deposits route through Aave via depositStablecoin(). The protocol holds aTokens on your behalf. APY accrues continuously and offsets the cost of payments.",
  },
  {
    question: "When do users settle?",
    answer:
      "Users call payTabInERC20Token() after 7 days. If they don't, the recipient's on-chain claim window opens at day 14 (remunerationGracePeriod) and closes at day 21 (tabExpirationTime).",
  },
  {
    question: "How are disputes handled?",
    answer:
      "V2 guarantees use ERC-8004's ValidationRegistry. The payer signs a guarantee committing to a specific validator, agent, score threshold, and job hash. If the validation fails on-chain, remunerate() reverts and collateral stays locked. Validators post a 0–100 score on-chain.",
  },
  {
    question: "How do withdrawals work?",
    answer:
      "Call requestWithdrawal() to start the timelock, then finalizeWithdrawal() after the withdrawalGracePeriod (default 22 days). A 6-hour synchronizationDelay prevents race conditions with open tabs.",
  },
  {
    question: "Which assets are supported?",
    answer:
      "ETH and stablecoins. USDC and USDT are enabled by default. Other ERC-20s can be configured by the operator.",
  },
  {
    question: "Does it work with existing x402 clients?",
    answer:
      "Yes. 4Mica is x402-compatible. Wrap your existing fetch or requests client with the 4Mica scheme adapter. One line of code. No changes to your server or HTTP logic.",
  },
];

export default function FaqSection() {
  return (
    <section id="faq" className="section-gloss py-24">
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <p className="section-kicker">FAQ</p>
          <h2 className="section-title">Common questions</h2>
        </div>

        <div className="mx-auto max-w-3xl space-y-3">
          {FAQS.map((faq) => (
            <details
              key={faq.question}
              className="glass-panel group rounded-xl"
            >
              <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-ink-strong text-sm">
                <span>{faq.question}</span>
                <i className="ri-add-line shrink-0 text-ink-subtle group-open:hidden" />
                <i className="ri-subtract-line hidden shrink-0 text-ink-subtle group-open:block" />
              </summary>
              <div className="px-5 pb-4">
                <p className="text-ink-muted text-sm leading-relaxed">
                  {faq.answer}
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
