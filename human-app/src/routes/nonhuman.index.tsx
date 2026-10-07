import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/nonhuman/")({
  beforeLoad: () => {
    throw redirect({ to: "/nonhuman/pricing", statusCode: 302 });
  },
});
