import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { listBlogPosts } = await import("@/lib/blog.server");
        const paths = [
          "/",
          "/blog",
          "/human/setup",
          "/nonhuman",
          "/nonhuman/api",
          "/nonhuman/mcp",
          "/nonhuman/chains",
          "/nonhuman/pricing",
          "/terms",
          "/privacy",
          "/privacy-choices",
          "/support",
          "/advertising",
        ];
        const entries = [
          ...paths.map((path) => `<url><loc>https://buildawallet.xyz${path}</loc></url>`),
          ...listBlogPosts().map(
            (post) =>
              `<url><loc>https://buildawallet.xyz/blog/${post.slug}</loc><lastmod>${post.updatedAt}</lastmod></url>`,
          ),
        ];
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`,
          {
            headers: {
              "content-type": "application/xml; charset=utf-8",
              "cache-control": "public, max-age=300",
            },
          },
        );
      },
    },
  },
});
