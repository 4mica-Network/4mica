/**
 * Renders a JSON-LD block. The payload is built at build time from our own
 * content registries (`seo/structuredData.ts`) — never from user input — so the
 * serialized string is safe to inline.
 */
export default function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: build-time, self-authored structured data with no user input.
      dangerouslySetInnerHTML={{
        // `<` is escaped so a stray sequence in copy cannot close the script tag.
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
