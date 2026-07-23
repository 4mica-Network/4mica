import FeaturedPost from "@components/blog/FeaturedPost";
import PostList from "@components/blog/PostList";
import Footer from "@components/Footer";
import Header from "@components/Header";
import { getAllBlogPosts } from "@lib/blog";
import { metaFor } from "@seo/pages";
import { messages } from "@/i18n";

export const metadata = metaFor("/blog");

export default function BlogPage() {
  const posts = getAllBlogPosts();
  const [featured, ...rest] = posts;

  return (
    <div className="min-h-screen">
      <Header />
      <div className="pt-28 pb-20">
        <section className="w-full">
          {featured ? (
            <>
              <FeaturedPost post={featured} />
              {rest.length > 0 ? (
                <div className="mt-16">
                  <PostList posts={rest} />
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-16 flex flex-col items-center gap-3 rounded-md border border-overlay/10 border-dashed bg-surface-deep/25 px-6 py-20 text-center">
              <i
                className="ri-article-line text-3xl text-ink-strong/25"
                aria-hidden="true"
              />
              <p className="text-ink-muted text-md">{messages.blog.empty}</p>
            </div>
          )}
        </section>
      </div>
      <Footer />
    </div>
  );
}
