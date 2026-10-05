import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/advertising")({
  beforeLoad: () => {
    throw redirect({ to: "/support" });
  },
  head: () => ({
    meta: [
      { title: "Advertising : BuildAWallet" },
      { name: "description", content: "Advertising and partnership requests route to BuildAWallet support." },
      { property: "og:title", content: "Advertising : BuildAWallet" },
      { property: "og:description", content: "Contact BuildAWallet support for advertising and partnership requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
