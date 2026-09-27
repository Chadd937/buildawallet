export async function onRequest() {
  const upstream = await fetch(
    "https://raw.githubusercontent.com/Chadd937/buildawallet/main/static/agentic-human-robot-hero.jpg",
    { cf: { cacheTtl: 3600, cacheEverything: true } }
  );

  if (!upstream.ok) {
    return new Response("Landing hero image unavailable", { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
