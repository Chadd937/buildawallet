import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/human")({
  component: HumanLayout,
});

function HumanLayout() {
  return <Outlet />;
}
