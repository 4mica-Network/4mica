import BlogPostLayout from "@components/blog/BlogPostLayout";
import { getBlogPost, getBlogSlugs } from "@lib/blog";
import { metaForBlogPost } from "@seo/pages";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type RouteParams = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  return metaForBlogPost(slug) ?? {};
}

export default async function BlogPostPage({ params }: RouteParams) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    notFound();
  }

  // Every slug is pre-generated above, so this template-literal import resolves
  // to a build-time module graph — no runtime module loading in the export.
  const { default: Post } = await import(`@/content/blog/${slug}.mdx`);

  return (
    <BlogPostLayout post={post} toc={post.toc}>
      <Post />
    </BlogPostLayout>
  );
}
