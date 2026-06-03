"use client";
import Link from "next/link";

export default function ResourcesSection() {
  const resources = [
    {
      title: "One-Pager",
      href: "/resources/one-pager",
      description:
        "Concise overview of 4Mica's real-time, non-custodial payments stack and value proposition",
      icon: "ri-file-text-line",
      gradient: "from-brand-deep to-brand-strong",
    },
    {
      title: "Technical Documents",
      href: "/resources/technical-docs",
      description:
        "SDK usage, facilitator and operator APIs, plus protocol flow references for teams and developers",
      icon: "ri-book-line",
      gradient: "from-brand-strong to-brand-violet",
    },
    {
      title: "Blog",
      href: "/resources/blog",
      description:
        "Product updates, practical guides, and perspectives on 4Mica payments and infrastructure",
      icon: "ri-article-line",
      gradient: "from-brand to-brand-deep",
    },
  ];

  return (
    <section id="resources" className="section-gloss py-20">
      <div className="container mx-auto px-6">
        <div className="mb-16 text-center">
          <h2 className="section-title mb-6">Resources</h2>
          <div className="mx-auto mb-8 accent-bar"></div>
        </div>

        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {resources.map((resource) => (
              <Link
                key={resource.title}
                href={resource.href}
                className="group cursor-pointer"
              >
                <div className="glass-panel h-full rounded-2xl p-8 transition-all duration-300 group-hover:scale-105">
                  <div
                    className={`h-16 w-16 bg-gradient-to-r ${resource.gradient} mx-auto mb-6 flex items-center justify-center rounded-full`}
                  >
                    <div className="flex h-8 w-8 items-center justify-center">
                      <i className={`${resource.icon} text-2xl text-white`}></i>
                    </div>
                  </div>

                  <h3 className="mb-4 text-center font-bold text-2xl text-ink-strong">
                    {resource.title}
                  </h3>

                  <p className="text-center text-ink-body leading-relaxed">
                    {resource.description}
                  </p>

                  <div className="mt-6 text-center">
                    <span className="link-accent inline-flex items-center font-semibold">
                      Learn More
                      <div className="ml-1 flex h-4 w-4 items-center justify-center">
                        <i className="ri-arrow-right-line"></i>
                      </div>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
