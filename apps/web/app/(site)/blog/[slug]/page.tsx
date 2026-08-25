import BlogPostLayout from "@components/blog/BlogPostLayout";
import JsonLd from "@components/JsonLd";
import { getBlogPost, getBlogSlugs } from "@lib/blog";
import { metaForBlogPost } from "@seo/pages";
import { blogPostSchema } from "@seo/structuredData";
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

  const { default: Post } = await import(`@/content/blog/${slug}.mdx`);

  return (
    <>
      <JsonLd data={blogPostSchema(post)} />
      <BlogPostLayout post={post} toc={post.toc}>
        <Post />
      </BlogPostLayout>
    </>
  );
}
