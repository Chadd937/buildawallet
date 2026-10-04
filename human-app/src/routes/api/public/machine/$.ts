import { createFileRoute } from "@tanstack/react-router";
import { handleMachineRequest } from "@/lib/machine/router.server";
export const Route = createFileRoute("/api/public/machine/$")({ server: { handlers: {
  GET: ({ request }) => handleMachineRequest(request), POST: ({ request }) => handleMachineRequest(request),
  DELETE: ({ request }) => handleMachineRequest(request), OPTIONS: ({ request }) => handleMachineRequest(request),
} } });
