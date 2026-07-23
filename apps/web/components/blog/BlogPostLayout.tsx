import { routes } from "@4mica/url";
import AuthorAvatar from "@components/blog/AuthorAvatar";
import Footer from "@components/Footer";
import Header from "@components/Header";
import TableOfContent, { type TocItem } from "@components/TableOfContent";
import { type BlogPostMeta, formatPostDate } from "@lib/blog";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { messages } from "@/i18n";

type BlogPostLayoutProps = {
  post: BlogPostMeta;
  toc: TocItem[];
  children: ReactNode;
};

export default function BlogPostLayout({
  post,
  toc,
  children,
}: BlogPostLayoutProps) {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="pt-36 pb-20">
        <header className="mx-auto max-w-3xl text-center">
          <Link
            href={routes.blog}
            className="section-kicker inline-flex items-center gap-1.5 transition-opacity hover:opacity-80"
          >
            <i className="ri-arrow-left-line text-md" aria-hidden="true" />
            {messages.blog.backToBlog}
          </Link>
          <h1 className="section-title font-normal">{post.title}</h1>
          <p className="section-lead mx-auto max-w-2xl">{post.description}</p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-ink-subtle text-md">
            <AuthorAvatar
              name={post.author}
              src={post.authorAvatar}
              size={36}
            />
            <span className="text-ink-body">{post.author}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={post.date}>{formatPostDate(post.date)}</time>
          </div>

          {post.tags.length > 0 ? (
            <ul className="mt-5 flex flex-wrap justify-center gap-1.5">
              {post.tags.map((tag) => (
                <li
                  key={tag}
                  className="wrap-break-word max-w-full rounded-full bg-overlay/[0.06] px-3 py-1 text-2xs text-ink-muted uppercase tracking-wider"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}
        </header>

        {post.thumbnail ? (
          <div className="relative mx-auto mt-14 aspect-2/1 w-full max-w-5xl overflow-hidden rounded-md border border-overlay/10 bg-surface-solid">
            <Image
              src={post.thumbnail}
              alt={post.thumbnailAlt ?? post.title}
              fill
              sizes="(min-width: 1024px) 1024px, 100vw"
              priority
              className="object-cover"
            />
          </div>
        ) : null}

        <div className="mx-auto mt-16 flex max-w-5xl gap-12">
          <TableOfContent toc={toc} />
          <article className="blog-content min-w-0 flex-1">{children}</article>
        </div>
      </div>
      <Footer />
    </div>
  );
}
