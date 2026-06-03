"use client";

import Link from "next/link";
import { useState } from "react";

export default function BlogContent() {
  const [subscribedEmail, setSubscribedEmail] = useState("");
  const [isSubscribed, setIsSubscribed] = useState(false);

  const handleNewsletterSubmit = async (
    e: React.FormEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("email", subscribedEmail);

    setIsSubscribed(true);
    setSubscribedEmail("");
  };

  const blogPosts = [
    {
      id: 1,
      title: "Getting Paid with 4Mica",
      excerpt:
        "This post explains V1 vs V2 first, then dives into tabs, req_ids, guarantees, certificates, and ERC-8004 validation-gated remuneration.",
      author: "Mairon",
      date: "2026-01-29",
      readTime: "15 min read",
      category: "Integration",
      href: "/resources/blog/getting-paid-by-4mica",
    },
    {
      id: 2,
      title: "Paying with 4Mica",
      excerpt:
        "A payer guide for 4Mica credit with V1/V2 signing, versioned payment-header retries (X-PAYMENT/PAYMENT-SIGNATURE), and validation-aware settlement behavior.",
      author: "Mairon",
      date: "2026-01-29",
      readTime: "10 min read",
      category: "Integration",
      href: "/resources/blog/paying-with-4mica",
    },
  ];

  const categories = [
    "All",
    "Payments",
    "Technology",
    "Architecture",
    "Integration",
    "Security",
    "Case Study",
    "Economics",
  ];
  const [selectedCategory, setSelectedCategory] = useState("All");

  const filteredPosts =
    selectedCategory === "All"
      ? blogPosts
      : blogPosts.filter((post) => post.category === selectedCategory);

  return (
    <div className="min-h-screen pt-20 text-ink-body">
      <div className="container mx-auto px-6">
        {/* Header */}
        <div className="mb-16 text-center">
          <h1 className="section-title mb-6">4Mica Blog</h1>
          <div className="mx-auto mb-8 accent-bar"></div>
          <p className="section-lead mx-auto max-w-3xl text-xl">
            Insights, updates, and thought leadership on onchain payments,
            blockchain infrastructure, and the future of decentralized finance.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Category Filter */}
            <div className="mb-8">
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-2 transition-colors ${
                      selectedCategory === category
                        ? "bg-brand-deep text-ink"
                        : "bg-white/10 text-ink-body hover:bg-white/15 hover:text-ink-strong"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {/* Blog Posts Grid */}
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              {filteredPosts.map((post) => (
                <article
                  key={post.id}
                  className="glass-panel overflow-hidden rounded-lg transition-all hover:-translate-y-0.5"
                >
                  <div className="p-6">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="rounded-full bg-brand-deep px-3 py-1 font-medium text-ink text-sm">
                        {post.category}
                      </span>
                      <span className="text-ink-muted text-sm">
                        {post.readTime}
                      </span>
                    </div>

                    <h2 className="mb-3 line-clamp-2 font-bold text-ink-strong text-xl">
                      {post.title}
                    </h2>

                    <p className="mb-4 line-clamp-3 text-ink-body">
                      {post.excerpt}
                    </p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-brand-strong">
                          <span className="font-semibold text-sm text-white">
                            {post.author
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-ink-strong text-sm">
                            {post.author}
                          </p>
                          <p className="text-ink-muted text-xs">{post.date}</p>
                        </div>
                      </div>

                      <Link
                        href={post.href}
                        className="link-accent cursor-pointer whitespace-nowrap"
                      >
                        Read More →
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Load More Button */}
            <div className="mt-12 text-center">
              <button
                type="button"
                className="btn btn-primary btn-md whitespace-nowrap"
              >
                Load More Articles
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="space-y-8">
              {/* Newsletter Signup */}
              <div className="glass-panel rounded-lg p-6">
                <h3 className="mb-4 font-bold text-ink-strong text-xl">
                  Stay Updated
                </h3>
                <p className="mb-4 text-ink-body">
                  Get the latest insights on onchain payments and blockchain
                  infrastructure.
                </p>

                {isSubscribed ? (
                  <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 p-4 text-center">
                    <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400">
                      <div className="flex h-4 w-4 items-center justify-center">
                        <i className="ri-check-line text-white"></i>
                      </div>
                    </div>
                    <p className="text-emerald-200 text-sm">
                      Successfully subscribed!
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={handleNewsletterSubmit}
                    id="newsletter-signup"
                  >
                    <input
                      type="email"
                      name="email"
                      value={subscribedEmail}
                      onChange={(e) => setSubscribedEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                      className="form-field-dark mb-3 w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-strong/60"
                    />
                    <button
                      type="submit"
                      className="btn btn-primary btn-md w-full whitespace-nowrap"
                    >
                      Subscribe
                    </button>
                  </form>
                )}
              </div>

              {/* Recent Posts */}
              <div className="glass-panel rounded-lg p-6">
                <h3 className="mb-4 font-bold text-ink-strong text-xl">
                  Recent Posts
                </h3>
                <div className="space-y-4">
                  {blogPosts.slice(0, 3).map((post) => (
                    <Link
                      key={post.id}
                      href={post.href}
                      className="block cursor-pointer"
                    >
                      <div className="flex space-x-3 rounded p-2 transition-colors hover:bg-white/5">
                        <div className="min-w-0 flex-1">
                          <h4 className="mb-1 line-clamp-2 font-semibold text-ink-strong text-sm">
                            {post.title}
                          </h4>
                          <p className="text-ink-muted text-xs">{post.date}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Popular Tags */}
              <div className="glass-panel rounded-lg p-6">
                <h3 className="mb-4 font-bold text-ink-strong text-xl">
                  Popular Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Payments",
                    "Blockchain",
                    "DeFi",
                    "Security",
                    "Integration",
                    "Architecture",
                    "AI Agents",
                  ].map((tag) => (
                    <span
                      key={tag}
                      className="cursor-pointer rounded-full bg-white/10 px-3 py-1 text-ink-body text-sm transition-colors hover:bg-brand-deep hover:text-ink"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
