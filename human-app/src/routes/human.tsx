import { Outlet, createFileRoute } from "@tanstack/react-router";
import { WalletGuide } from "@/components/human/wallet-guide";

export const Route = createFileRoute("/human")({
  component: () => <><Outlet /><WalletGuide /></>,
});
