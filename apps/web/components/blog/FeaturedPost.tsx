import AuthorAvatar from "@components/blog/AuthorAvatar";
import ShinyHoverBorder from "@components/ShinyHoverBorder";
import { type BlogPostMeta, formatPostDate } from "@lib/blogMeta";
import Image from "next/image";
import Link from "next/link";
import { messages } from "@/i18n";

export default function FeaturedPost({ post }: { post: BlogPostMeta }) {
  return (
    <article className="group relative overflow-hidden rounded-md border border-overlay/10 bg-surface-deep/25 transition-colors duration-500 hover:bg-overlay/[0.018]">
      <ShinyHoverBorder />
      <Link href={`/blog/${post.slug}`} className="relative z-10 block">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="order-2 p-8 sm:p-10 lg:order-1 lg:py-16">
            <div className="flex flex-wrap items-center gap-2 text-ink-subtle text-md">
              <time dateTime={post.date}>{formatPostDate(post.date)}</time>
              <span aria-hidden="true">·</span>
              <span>
                {post.readingMinutes} {messages.blog.minRead}
              </span>
            </div>

            <h2 className="mt-3 font-semibold text-3xl text-ink-strong tracking-tight md:text-4xl">
              {post.title}
            </h2>
            <p className="mt-4 max-w-xl text-ink-muted text-md leading-relaxed">
              {post.description}
            </p>

            <div className="mt-8 flex items-center gap-3">
              <AuthorAvatar
                name={post.author}
                src={post.authorAvatar}
                size={44}
              />
              <div className="min-w-0">
                <div className="truncate font-medium text-ink-strong text-md">
                  {post.author}
                </div>
                {post.authorRole ? (
                  <div className="truncate text-ink-subtle text-md">
                    {post.authorRole}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {post.thumbnail ? (
            <div className="relative order-1 aspect-video w-full overflow-hidden border-overlay/10 border-b bg-surface-solid lg:order-2 lg:aspect-auto lg:h-full lg:min-h-100 lg:border-b-0 lg:border-l">
              <Image
                src={post.thumbnail}
                alt={post.thumbnailAlt ?? post.title}
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                priority
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
