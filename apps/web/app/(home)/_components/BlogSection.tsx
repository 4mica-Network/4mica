import { links } from "@4mica/url";
import AuthorAvatar from "@components/blog/AuthorAvatar";
import { getAllBlogPosts } from "@lib/blog";
import type { BlogPostMeta } from "@lib/blogMeta";
import Image from "next/image";
import Link from "next/link";
import { messages } from "@/i18n";

const POSTS_SHOWN = 4;
const sections = messages.home.sections;

function FeaturedCard({ post }: { post: BlogPostMeta }) {
  return (
    <article className="group flex h-full min-w-0 flex-col rounded-2xl border border-overlay/10 bg-surface p-2 transition-colors duration-500 hover:border-overlay/20">
      <Link
        href={`${links.blog}/${post.slug}`}
        className="flex h-full flex-col"
      >
        <div className="rounded-xl border border-overlay/10 bg-surface-solid p-6 sm:p-8">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-overlay/10 bg-surface-solid">
            {post.thumbnail ? (
              <Image
                src={post.thumbnail}
                alt={post.thumbnailAlt ?? post.title}
                fill
                sizes="(min-width: 768px) 33vw, 100vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgb(var(--overlay)/0.12),transparent_70%)]"
              >
                <span className="font-semibold text-4xl text-ink-strong/15">
                  4M
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col px-5 pt-6 pb-5">
          <h3 className="line-clamp-2 font-medium text-2xl text-ink-strong transition-colors group-hover:text-ink-body">
            {post.title}
          </h3>
          <p className="mt-2 line-clamp-2 text-ink-muted text-lg leading-relaxed">
            {post.description}
          </p>
          <div className="mt-auto flex items-center justify-between gap-4 pt-6 text-md">
            <span className="flex min-w-0 items-center gap-2.5 text-ink-muted">
              <AuthorAvatar
                name={post.author}
                src={post.authorAvatar}
                size={28}
              />
              <span className="truncate font-medium text-ink-strong">
                {post.author}
              </span>
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap">
                {post.readingMinutes} {messages.blog.minRead}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-ink-body transition-colors group-hover:text-ink-strong">
              {messages.blog.readPost}
              <i className="ri-arrow-right-line text-md" />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

function CompactCard({ post }: { post: BlogPostMeta }) {
  return (
    <article className="group flex min-w-0 flex-1 rounded-2xl border border-overlay/10 bg-surface p-2 transition-colors duration-500 hover:border-overlay/20">
      <Link
        href={`${links.blog}/${post.slug}`}
        className="flex w-full items-stretch gap-4"
      >
        <div className="relative w-40 shrink-0 self-stretch overflow-hidden rounded-xl border border-overlay/10 bg-surface-solid sm:w-52">
          {post.thumbnail ? (
            <Image
              src={post.thumbnail}
              alt={post.thumbnailAlt ?? post.title}
              fill
              sizes="208px"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgb(var(--overlay)/0.12),transparent_70%)]"
            >
              <span className="font-semibold text-ink-strong/15 text-xl">
                4M
              </span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col py-2 pr-3">
          <h3 className="line-clamp-2 font-medium text-ink-strong text-lg leading-snug transition-colors group-hover:text-ink-body">
            {post.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-ink-muted text-md leading-relaxed">
            {post.description}
          </p>
          <div className="mt-auto flex items-center justify-between gap-3 pt-3 text-md">
            <span className="flex min-w-0 items-center gap-2">
              <AuthorAvatar
                name={post.author}
                src={post.authorAvatar}
                size={22}
              />
              <span className="truncate font-medium text-ink-strong">
                {post.author}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center text-ink-body transition-colors group-hover:text-ink-strong">
              <span className="sr-only">{messages.blog.readPost}</span>
              <i aria-hidden="true" className="ri-arrow-right-line text-lg" />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

export default function BlogSection() {
  const [latest, ...rest] = getAllBlogPosts().slice(0, POSTS_SHOWN);
  if (!latest) return null;

  return (
    <section id="blog" className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <div className="mb-12 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-kicker">{sections.blogKicker}</p>
            <h2 className="section-title mt-2 font-normal">
              {sections.blogTitle}
            </h2>
            <p className="section-lead mt-1 max-w-xl">{sections.blogLead}</p>
          </div>
          <Link
            href={links.blog}
            className="inline-flex shrink-0 items-center gap-1.5 font-medium text-ink-body text-md transition-colors hover:text-ink-strong"
          >
            {sections.blogViewAll}
            <i className="ri-arrow-right-line text-md" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <FeaturedCard post={latest} />
          </div>
          {rest.length > 0 ? (
            <div className="flex flex-col gap-4 lg:col-span-2">
              {rest.map((post) => (
                <CompactCard key={post.slug} post={post} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
