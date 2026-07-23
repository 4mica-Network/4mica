import { links } from "@4mica/url";
import type { BlogPostMeta } from "@lib/blogMeta";
import { messages } from "@/i18n";
import { SITE_NAME } from "./shared";

/**
 * JSON-LD builders. Structured data is rendered by `components/JsonLd.tsx`;
 * every builder returns a plain object so it can be serialized at build time
 * (the site is a static export — nothing here runs in the browser).
 */

const absolute = (path: string) =>
  path === "/" ? links.website : new URL(path, links.website).toString();

const ORGANIZATION_ID = `${links.website}/#organization`;
const WEBSITE_ID = `${links.website}/#website`;

/** Publisher identity — reused by every other node via `@id`. */
export const organizationSchema = () => ({
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: SITE_NAME,
  url: links.website,
  logo: {
    "@type": "ImageObject",
    url: absolute("/assets/og-logo.png"),
  },
  description: messages.seo.home.description,
  email: links.email.support,
  sameAs: [
    links.social.x,
    links.social.github,
    links.social.linkedin,
    links.docs,
  ],
});

export const websiteSchema = () => ({
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  url: links.website,
  name: SITE_NAME,
  description: messages.seo.home.description,
  publisher: { "@id": ORGANIZATION_ID },
  inLanguage: "en",
});

/** Home page: Organization + WebSite + the FAQ block rendered on the page. */
export const homeSchema = () => ({
  "@context": "https://schema.org",
  "@graph": [
    organizationSchema(),
    websiteSchema(),
    {
      "@type": "FAQPage",
      "@id": `${links.website}/#faq`,
      mainEntity: messages.home.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
  ],
});

/**
 * A plain content page: publisher identity plus the trail that leads to it.
 * `extra` carries page-specific nodes (an FAQ block, a service, …).
 */
export const pageSchema = (
  trail: { name: string; path: string }[],
  extra: object[] = [],
) => ({
  "@context": "https://schema.org",
  "@graph": [
    ...extra,
    organizationSchema(),
    websiteSchema(),
    breadcrumbSchema(trail),
  ],
});

/** An FAQ block rendered on a page, keyed to that page. */
export const faqSchema = (
  path: string,
  faqs: readonly { question: string; answer: string }[],
) => ({
  "@type": "FAQPage",
  "@id": `${absolute(path)}#faq`,
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
});

/** The blog index: the Blog itself plus the posts it lists. */
export const blogListSchema = (posts: BlogPostMeta[]) =>
  pageSchema(
    [{ name: "Blog", path: "/blog" }],
    [
      {
        "@type": "Blog",
        "@id": `${absolute("/blog")}#blog`,
        name: messages.seo.blog.title,
        description: messages.seo.blog.description,
        url: absolute("/blog"),
        publisher: { "@id": ORGANIZATION_ID },
        blogPost: posts.map((post) => ({
          "@type": "BlogPosting",
          "@id": `${absolute(`/blog/${post.slug}`)}#article`,
          headline: post.title,
          description: post.description,
          datePublished: post.date,
          url: absolute(`/blog/${post.slug}`),
          author: { "@type": "Person", name: post.author },
        })),
      },
    ],
  );

/** A blog post: BlogPosting + the breadcrumb trail that leads to it. */
export const blogPostSchema = (post: BlogPostMeta) => {
  const url = absolute(`/blog/${post.slug}`);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": `${url}#article`,
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        dateModified: post.date,
        keywords: [...post.tags, ...post.keywords].join(", "),
        articleSection: post.category || undefined,
        image: post.thumbnail ? absolute(post.thumbnail) : undefined,
        author: { "@type": "Person", name: post.author },
        publisher: { "@id": ORGANIZATION_ID },
        isPartOf: { "@id": WEBSITE_ID },
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
      },
      organizationSchema(),
      breadcrumbSchema([
        { name: "Blog", path: "/blog" },
        { name: post.title, path: `/blog/${post.slug}` },
      ]),
    ],
  };
};

/** Breadcrumb trail, always rooted at the home page. */
export const breadcrumbSchema = (trail: { name: string; path: string }[]) => ({
  "@type": "BreadcrumbList",
  itemListElement: [{ name: "Home", path: "/" }, ...trail].map(
    (item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absolute(item.path),
    }),
  ),
});

/** A solution page: the service 4Mica offers for that audience. */
export const solutionSchema = (solution: {
  slug: string;
  label: string;
  intro: string;
  faqs: readonly { question: string; answer: string }[];
}) => {
  const url = absolute(`/solutions/${solution.slug}`);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `${url}#service`,
        name: `4Mica for ${solution.label}`,
        description: solution.intro,
        serviceType: "x402 payment clearing and settlement infrastructure",
        provider: { "@id": ORGANIZATION_ID },
        url,
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: solution.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      },
      organizationSchema(),
      breadcrumbSchema([
        { name: "Solutions", path: "/solution" },
        { name: solution.label, path: `/solutions/${solution.slug}` },
      ]),
    ],
  };
};
