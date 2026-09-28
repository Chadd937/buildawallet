import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/human/setup")({
  beforeLoad: () => {
    throw redirect({
      to: "/human/setup",
    });
  },
});
