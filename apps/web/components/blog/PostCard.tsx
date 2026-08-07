import { type BlogPostMeta, formatPostDate } from "@lib/blogMeta";
import Image from "next/image";
import Link from "next/link";

export default function PostCard({ post }: { post: BlogPostMeta }) {
  return (
    <article className="h-full">
      <Link href={`/blog/${post.slug}`} className="group flex h-full flex-col">
        <div className="relative aspect-video w-full overflow-hidden rounded-md border border-overlay/10 bg-surface-solid">
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

        <div className="mt-5 flex h-7 items-center gap-3 text-md">
          {post.category ? (
            <span className="max-w-40 truncate rounded-md bg-overlay/6 px-2.5 py-1 text-ink-body text-md">
              {post.category}
            </span>
          ) : null}
          <time dateTime={post.date} className="shrink-0 text-ink-subtle">
            {formatPostDate(post.date)}
          </time>
        </div>

        <h3 className="mt-3 line-clamp-2 min-h-14 font-medium text-ink-strong text-xl transition-colors group-hover:text-ink-body">
          {post.title}
        </h3>
        <p className="mt-2 line-clamp-2 min-h-12 text-ink-muted text-md leading-relaxed">
          {post.description}
        </p>
      </Link>
    </article>
  );
}
