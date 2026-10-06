import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getBlogPosts = createServerFn({ method: "GET" }).handler(async () => {
  const { listBlogPosts } = await import("./blog.server");
  return listBlogPosts();
});

export const getBlogPost = createServerFn({ method: "GET" })
  .validator((input) => z.object({ slug: z.string().max(160) }).parse(input))
  .handler(async ({ data }) => {
    const { findBlogPost } = await import("./blog.server");
    return findBlogPost(data.slug);
  });
