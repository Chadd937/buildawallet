import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, FileText, Globe2 } from "lucide-react";
import { getBlogPosts } from "@/lib/blog.functions";

const pages = [
  { to: "/", label: "Home", description: "Choose the BuildAWallet experience for people or autonomous agents." },
  { to: "/blog", label: "Blog", description: "Guides and articles about wallets, self-custody, and Web3." },
  { to: "/human/setup", label: "Human wallet setup", description: "Set up a self-custody wallet for personal use." },
  { to: "/nonhuman", label: "Agent overview", description: "Explore wallet and API infrastructure for autonomous agents." },
  { to: "/nonhuman/api", label: "Agent API", description: "Discover the API interface for agent access." },
  { to: "/nonhuman/mcp", label: "MCP integration", description: "Connect compatible agents through Model Context Protocol." },
  { to: "/nonhuman/chains", label: "Supported chains", description: "Review supported blockchain networks." },
  { to: "/nonhuman/pricing", label: "Pricing", description: "Review pricing for agent infrastructure." },
  { to: "/terms", label: "Terms of service", description: "Read the terms governing use of BuildAWallet." },
  { to: "/privacy", label: "Privacy policy", description: "Learn how BuildAWallet handles privacy." },
  { to: "/privacy-choices", label: "Privacy choices", description: "Manage available privacy choices." },
  { to: "/support", label: "Support", description: "Get help with BuildAWallet." },
  { to: "/advertising", label: "Advertising", description: "Learn about advertising on BuildAWallet." },
] as const;

export const Route = createFileRoute("/sitemap")({
  loader: () => getBlogPosts(),
  head: () => ({
    meta: [
      { title: "Sitemap | BuildAWallet" },
      {
        name: "description",
        content: "Browse the pages, resources, and articles available on BuildAWallet.",
      },
      { property: "og:title", content: "BuildAWallet Sitemap" },
      {
        property: "og:description",
        content: "A human-readable directory of BuildAWallet pages and articles.",
      },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://buildawallet.xyz/sitemap" }],
  }),
  component: SitemapPage,
});

function SitemapPage() {
  const posts = Route.useLoaderData();

  return (
    <main className="min-h-screen px-5 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="size-4" />
          BuildAWallet home
        </Link>

        <p className="num mt-10 text-xs uppercase tracking-[0.25em] text-primary">
          Site directory
        </p>
        <h1 className="mt-3 text-4xl font-black sm:text-6xl">Sitemap</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-foreground">
          Find the main pages and published articles across BuildAWallet. For search engines and
          automated crawlers, the machine-readable sitemap is also available as XML.
        </p>
        <a
          href="/sitemap.xml"
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <Globe2 className="size-4" />
          View XML sitemap
          <ArrowUpRight className="size-4" />
        </a>

        <section className="mt-12" aria-labelledby="main-pages-heading">
          <h2 id="main-pages-heading" className="text-2xl font-bold">
            Main pages
          </h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {pages.map((page) => (
              <li key={page.to} className="rounded-2xl border border-border bg-surface/70 p-5">
                <Link
                  to={page.to}
                  className="inline-flex items-center gap-2 font-bold text-foreground hover:text-primary"
                >
                  <FileText className="size-4 shrink-0 text-primary" />
                  {page.label}
                  <ArrowUpRight className="size-4" />
                </Link>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{page.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12" aria-labelledby="articles-heading">
          <h2 id="articles-heading" className="text-2xl font-bold">
            Articles
          </h2>
          {posts.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No articles have been published yet.</p>
          ) : (
            <ul className="mt-5 divide-y divide-border rounded-2xl border border-border">
              {posts.map((post) => (
                <li key={post.slug} className="p-5">
                  <Link
                    to="/blog/$slug"
                    params={{ slug: post.slug }}
                    className="inline-flex items-center gap-2 font-bold text-foreground hover:text-primary"
                  >
                    {post.title}
                    <ArrowUpRight className="size-4 shrink-0" />
                  </Link>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{post.excerpt}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
