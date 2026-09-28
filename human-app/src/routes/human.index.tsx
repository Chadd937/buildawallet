import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/human/")({
  beforeLoad: () => {
    throw redirect({
      to: "/human/setup",
      replace: true,
    });
  },
});
