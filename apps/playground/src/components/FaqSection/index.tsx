import { Disclosure, DisclosureList } from "@/components/Disclosure";
import { messages } from "@/i18n";

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

export function FaqSection({ faqs }: { faqs: FaqEntry[] }) {
  if (faqs.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-semibold text-ink-strong text-lg tracking-tight">
        {messages.faq.heading}
      </h2>

      <DisclosureList>
        {faqs.map((faq, index) => (
          <Disclosure index={index + 1} key={faq.id} title={faq.question}>
            <p className="whitespace-pre-line text-ink-body text-sm leading-relaxed">
              {faq.answer}
            </p>
          </Disclosure>
        ))}
      </DisclosureList>
    </section>
  );
}
