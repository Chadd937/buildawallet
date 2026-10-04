import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

/** Keeps "Try it out" calls on the current origin when the spec's server is the production domain. */
function sameOrigin(req: Record<string, unknown>) {
  try {
    const u = new URL(String(req["url"]));
    if (u.hostname === "buildawallet.xyz" && window.location.hostname !== "buildawallet.xyz") req["url"] = window.location.origin + u.pathname + u.search;
  } catch { /* keep original */ }
  return req;
}

export default function SwaggerExplorer() {
  return <SwaggerUI url="/openapi.json" docExpansion="list" defaultModelsExpandDepth={-1} tryItOutEnabled persistAuthorization requestInterceptor={sameOrigin} />;
}
