import { createFileRoute, redirect } from "@tanstack/react-router";

// Preserve old bookmarks without inviting a new per-call blockchain payment.
export const Route = createFileRoute("/nonhuman/pay-per-call")({
  beforeLoad: () => {
    throw redirect({ to: "/nonhuman/prepaid", statusCode: 308 });
  },
});
