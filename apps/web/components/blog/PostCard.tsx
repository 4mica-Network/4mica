import AuthorAvatar from "@components/blog/AuthorAvatar";
import ShinyHoverBorder from "@components/ShinyHoverBorder";
import { type BlogPostMeta, formatPostDate } from "@lib/blog";
import Image from "next/image";
import Link from "next/link";

// Cards sit in a grid, so every optional field keeps its slot even when it is
// empty: the thumbnail falls back to a monogram plate, title/description clamp
// to a fixed number of lines, and the tag row reserves one row of height. That
// keeps titles, tags, and bylines on the same baseline across the whole grid.
const MAX_VISIBLE_TAGS = 3;

export default function PostCard({ post }: { post: BlogPostMeta }) {
  const visibleTags = post.tags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenTagCount = post.tags.length - visibleTags.length;

  return (
    <article className="group relative h-full overflow-hidden rounded-md border border-overlay/10 bg-surface-deep/25 transition-colors duration-500 hover:bg-overlay/[0.018]">
      <ShinyHoverBorder />
      <Link
        href={`/blog/${post.slug}`}
        className="relative z-10 flex h-full flex-col"
      >
        <div className="relative aspect-video w-full overflow-hidden border-overlay/10 border-b bg-surface-solid">
          {post.thumbnail ? (
            <Image
              src={post.thumbnail}
              alt={post.thumbnailAlt ?? post.title}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
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

        <div className="flex flex-1 flex-col p-6">
          <h2 className="line-clamp-2 min-h-14 font-semibold text-ink-strong text-xl">
            {post.title}
          </h2>
          <p className="mt-2 line-clamp-3 min-h-18 text-ink-muted text-md leading-relaxed">
            {post.description}
          </p>

          <ul className="mt-5 flex h-6 flex-wrap gap-1.5 overflow-hidden">
            {visibleTags.map((tag) => (
              <li
                key={tag}
                className="max-w-36 truncate rounded-full bg-overlay/[0.06] px-3 py-1 text-2xs text-ink-muted uppercase tracking-wider"
              >
                {tag}
              </li>
            ))}
            {hiddenTagCount > 0 ? (
              <li className="rounded-full bg-overlay/[0.06] px-3 py-1 text-2xs text-ink-subtle uppercase tracking-wider">
                +{hiddenTagCount}
              </li>
            ) : null}
          </ul>

          <div className="mt-auto flex items-center gap-2 pt-6 text-ink-subtle text-md">
            <AuthorAvatar name={post.author} src={post.authorAvatar} />
            <span className="min-w-0 truncate">{post.author}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={post.date} className="shrink-0">
              {formatPostDate(post.date)}
            </time>
          </div>
        </div>
      </Link>
    </article>
  );
}
