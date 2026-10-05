import type { ResourceDescriptor } from "@/lib/descriptor";

export const buildJsonLd = (
  descriptor: ResourceDescriptor,
): Record<string, unknown> => {
  const offer = descriptor.payment
    ? {
        "@type": "Offer",
        url: descriptor.page,
        ...(descriptor.payment.price.amount
          ? { price: descriptor.payment.price.amount }
          : {}),
        ...(descriptor.payment.price.currency
          ? { priceCurrency: descriptor.payment.price.currency }
          : {}),
        availability: descriptor.invocable
          ? "https://schema.org/InStock"
          : "https://schema.org/PreOrder",
      }
    : null;

  return {
    "@context": "https://schema.org",
    "@type": descriptor.kind === "api" ? "WebAPI" : "SoftwareApplication",
    name: descriptor.name,
    ...(descriptor.summary || descriptor.description
      ? { description: descriptor.summary ?? descriptor.description }
      : {}),
    url: descriptor.page,
    ...(descriptor.docs ? { documentation: descriptor.docs } : {}),
    ...(descriptor.category
      ? { applicationCategory: descriptor.category }
      : {}),
    ...(descriptor.tags.length > 0 ? { keywords: descriptor.tags } : {}),
    ...(descriptor.publishedAt
      ? { datePublished: descriptor.publishedAt }
      : {}),
    provider: {
      "@type": "Organization",
      name: descriptor.seller.name,
      url: descriptor.seller.profile,
    },
    ...(offer ? { offers: offer } : {}),
    potentialAction: {
      "@type": "ConsumeAction",
      target: descriptor.resource?.url ?? descriptor.page,
    },
  };
};

export const serializeJsonLd = (value: Record<string, unknown>): string =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

export function JsonLd({ descriptor }: { descriptor: ResourceDescriptor }) {
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: a JSON-LD block has to be the script body
      dangerouslySetInnerHTML={{
        __html: serializeJsonLd(buildJsonLd(descriptor)),
      }}
      type="application/ld+json"
    />
  );
}
