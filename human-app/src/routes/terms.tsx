import { createFileRoute } from "@tanstack/react-router";
import html from "@/lib/legal/terms.html?raw";
export const Route = createFileRoute("/terms")({
  component: () => <main className="mx-auto my-10 max-w-4xl rounded-3xl border border-border bg-background/90 p-6 leading-7 sm:p-10 [&_h1]:mb-5 [&_h1]:text-4xl [&_h1]:font-black [&_h2]:mb-3 [&_h2]:mt-7 [&_h2]:text-xl [&_h2]:font-bold [&_p]:mb-3 [&_a]:text-primary" dangerouslySetInnerHTML={{ __html: html }} />,
});
