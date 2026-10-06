import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, Clock3 } from "lucide-react";
import { getBlogPosts } from "@/lib/blog.functions";

export const Route = createFileRoute("/blog/")({
  loader: () => getBlogPosts(),
  head: () => ({
    meta: [
      { title: "Blog : BuildAWallet" },
      {
        name: "description",
        content:
          "BuildAWallet articles on crypto wallets, self-custody, Web3 and wallet access for AI agents.",
      },
      { property: "og:title", content: "BuildAWallet Blog" },
      { property: "og:description", content: "Wallet guides for people and autonomous agents." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://buildawallet.xyz/blog" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://buildawallet.xyz/blog" }],
  }),
  component: BlogIndex,
});

function BlogIndex() {
  const posts = Route.useLoaderData();
  return (
    <main className="min-h-screen px-5 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="size-4" />
          BuildAWallet home
        </Link>
        <p className="num mt-10 text-xs uppercase tracking-[0.25em] text-primary">Learn & build</p>
        <h1 className="mt-3 text-4xl font-black sm:text-6xl">BuildAWallet Blog</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-foreground">
          Wallet guides for people and autonomous agents. Explore self-custody, Web3 and the choices
          behind your next wallet.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {posts.map((post) => (
            <article
              key={post.slug}
              className="overflow-hidden rounded-3xl border border-border bg-surface/95 shadow-lg"
            >
              <Link
                to="/blog/$slug"
                params={{ slug: post.slug }}
                className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <img
                  src={post.image.url}
                  alt={post.image.alt}
                  loading="lazy"
                  className="aspect-[16/9] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
                <div className="p-6">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <time dateTime={post.publishedAt}>
                      {new Date(post.publishedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      })}
                    </time>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="size-3.5" />
                      {post.readingMinutes} min read
                    </span>
                  </div>
                  <h2 className="mt-4 text-xl font-bold leading-7 group-hover:text-primary">
                    {post.title}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-foreground">{post.excerpt}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary">
                    Read article
                    <ArrowUpRight className="size-4" />
                  </span>
                </div>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
