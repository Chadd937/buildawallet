import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Clock3 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getBlogPost } from "@/lib/blog.functions";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const post = await getBlogPost({ data: { slug: params.slug } });
    if (!post) throw notFound();
    return post;
  },
  head: ({ loaderData: post }) =>
    post
      ? {
          meta: [
            { title: `${post.metaTitle} : BuildAWallet` },
            { name: "description", content: post.description },
            { property: "og:title", content: post.metaTitle },
            { property: "og:description", content: post.description },
            { property: "og:type", content: "article" },
            { property: "og:url", content: `https://buildawallet.xyz/blog/${post.slug}` },
            {
              property: "og:image",
              content: new URL(post.image.url, "https://buildawallet.xyz").href,
            },
            { property: "og:image:alt", content: post.image.alt },
            { property: "article:published_time", content: post.publishedAt },
            { property: "article:modified_time", content: post.updatedAt },
            { name: "twitter:card", content: "summary_large_image" },
          ],
          links: [{ rel: "canonical", href: `https://buildawallet.xyz/blog/${post.slug}` }],
        }
      : {},
  component: BlogArticle,
  notFoundComponent: () => (
    <main className="mx-auto min-h-[60vh] max-w-4xl px-5 py-20">
      <h1 className="text-4xl font-bold">Article not found</h1>
      <p className="mt-4">This article is unavailable.</p>
      <Link to="/blog" className="mt-6 inline-flex text-primary hover:underline">
        Back to the blog
      </Link>
    </main>
  ),
});

function BlogArticle() {
  const post = Route.useLoaderData();
  return (
    <main className="px-5 py-10 sm:px-6 sm:py-16">
      <article className="mx-auto max-w-4xl">
        <Link
          to="/blog"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="size-4" />
          All articles
        </Link>
        <header className="mt-8 rounded-3xl border border-border bg-surface/95 p-6 sm:p-10">
          <p className="num text-xs uppercase tracking-[0.25em] text-primary">BuildAWallet Blog</p>
          <h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl">{post.title}</h1>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <time dateTime={post.publishedAt}>
              {new Date(post.publishedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                timeZone: "UTC",
              })}
            </time>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-4" />
              {post.readingMinutes} min read
            </span>
          </div>
        </header>
        <img
          src={post.image.url}
          alt={post.image.alt}
          fetchPriority="high"
          className="mt-6 aspect-[16/9] w-full rounded-3xl border border-border object-cover"
        />
        <div className="mt-6 rounded-3xl border border-border bg-surface/95 p-6 sm:p-10">
          {post.highlights.length > 0 && (
            <aside className="mb-10 rounded-2xl border border-primary/25 bg-primary/5 p-5">
              <h2 className="text-lg font-bold">At a glance</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">
                {post.highlights.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </aside>
          )}
          <div className="blog-article">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({ node: _node, ...props }) => (
                  <div className="my-6 overflow-x-auto">
                    <table {...props} />
                  </div>
                ),
                img: ({ node: _node, ...props }) => <img {...props} loading="lazy" />,
              }}
            >
              {post.markdown}
            </ReactMarkdown>
          </div>
        </div>
        <Link
          to="/blog"
          className="my-8 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"
        >
          <ArrowLeft className="size-4" />
          More wallet guides
        </Link>
      </article>
    </main>
  );
}
