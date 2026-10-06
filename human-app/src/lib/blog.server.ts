import { z } from "zod";
import { BLOG_MEDIA } from "./blog-media";

const articleSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  body_markdown: z.string().min(1),
  meta_title: z.string().min(1),
  meta_description: z.string(),
  excerpt: z.string(),
  image: z.object({ url: z.string().url(), alt: z.string() }),
  published_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  status: z.literal("published"),
  blocks: z.array(z.object({ type: z.string(), data: z.unknown() })).default([]),
});

// Keep the publisher's existing JSON directory as the source of truth.
const source = import.meta.glob("../../../blog/data/*.json", { eager: true, import: "default" });
const articles = Object.values(source)
  .flatMap((value) => {
    const parsed = articleSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  })
  .sort((a, b) => b.published_at.localeCompare(a.published_at) || a.slug.localeCompare(b.slug));

function summary(article: z.infer<typeof articleSchema>) {
  return {
    slug: article.slug,
    title: article.title,
    metaTitle: article.meta_title,
    description: article.meta_description,
    excerpt: article.excerpt,
    image: { url: BLOG_MEDIA[article.image.url] ?? article.image.url, alt: article.image.alt },
    publishedAt: article.published_at,
    updatedAt: article.updated_at,
    readingMinutes: Math.max(1, Math.ceil(article.body_markdown.split(/\s+/).length / 220)),
  };
}

export function listBlogPosts() {
  return articles.map(summary);
}

export function findBlogPost(slug: string) {
  const article = articles.find((post) => post.slug === slug);
  if (!article) return null;
  let markdown = article.body_markdown;
  for (const [url, local] of Object.entries(BLOG_MEDIA)) markdown = markdown.split(url).join(local);
  const highlights = article.blocks
    .filter((block) => block.type === "ryze-tldr")
    .flatMap((block) => {
      const parsed = z.object({ points: z.array(z.string()) }).safeParse(block.data);
      return parsed.success ? parsed.data.points : [];
    });
  return { ...summary(article), markdown, highlights };
}
