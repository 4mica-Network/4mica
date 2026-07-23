import PostCard from "@components/blog/PostCard";
import Footer from "@components/Footer";
import Header from "@components/Header";
import { getAllBlogPosts } from "@lib/blog";
import { metaFor } from "@seo/pages";
import { messages } from "@/i18n";

export const metadata = metaFor("/blog");

export default function BlogPage() {
  const posts = getAllBlogPosts();

  return (
    <div className="min-h-screen">
      <Header />
      <div className="pt-36 pb-20">
        <section className="w-full">
          <div className="mx-auto max-w-3xl text-center">
            <p className="section-kicker">{messages.blog.kicker}</p>
            <h1 className="section-title font-normal">{messages.blog.title}</h1>
            <p className="section-lead mx-auto max-w-2xl">
              {messages.blog.lead}
            </p>
          </div>

          {posts.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-3 rounded-md border border-overlay/10 border-dashed bg-surface-deep/25 px-6 py-20 text-center">
              <i
                className="ri-article-line text-3xl text-ink-strong/25"
                aria-hidden="true"
              />
              <p className="text-ink-muted text-md">{messages.blog.empty}</p>
            </div>
          ) : (
            <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <PostCard key={post.slug} post={post} />
              ))}
            </div>
          )}
        </section>
      </div>
      <Footer />
    </div>
  );
}
