"use client";

import PostCard from "@components/blog/PostCard";
import type { BlogPostMeta } from "@lib/blogMeta";
import { useMemo, useState } from "react";
import { messages } from "@/i18n";

const ALL = messages.blog.allArticles;

export default function PostList({ posts }: { posts: BlogPostMeta[] }) {
  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const post of posts) {
      if (post.category) seen.add(post.category);
    }
    return [ALL, ...[...seen].sort((a, b) => a.localeCompare(b))];
  }, [posts]);

  const [active, setActive] = useState<string>(ALL);

  const visible =
    active === ALL ? posts : posts.filter((post) => post.category === active);

  return (
    <div>
      {categories.length > 1 ? (
        <div className="overflow-x-auto border-overlay/10 border-b">
          <div className="flex min-w-max gap-6">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActive(category)}
                aria-pressed={active === category}
                className={`-mb-px shrink-0 border-b-2 px-1 pb-3 text-md transition-colors ${
                  active === category
                    ? "border-ink-strong text-ink-strong"
                    : "border-transparent text-ink-muted hover:text-ink-body"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="py-16 text-center text-ink-muted text-md">
          {messages.blog.emptyCategory}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-12 pt-12 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
