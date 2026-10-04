import { createFileRoute } from "@tanstack/react-router";
import { openapi } from "@/lib/machine/spec";
export const Route = createFileRoute("/api/public/openapi")({ server: { handlers: { GET: () => Response.json(openapi, { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" } }) } } });
