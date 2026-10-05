const LEGAL_VERSION = "2026-10-03-v1";
const COOKIE_NAME = "baw_legal_accept";

// The website legal acknowledgment is a front-door gate for the public landing
// page. HUMAN deep links (especially email-confirmation returns) must not be
// intercepted and redirected away from the builder flow.
function isGatedPath(pathname) {
  return pathname === "/";
}

function hasAccepted(request) {
  const cookie = request.headers.get("Cookie") || "";
  return cookie.split(";").some((part) => part.trim() === `${COOKIE_NAME}=${LEGAL_VERSION}`);
}

function safeReturnTo(value) {
  if (typeof value !== "string") return "/";
  const candidate = value.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return "/";
  try {
    const parsed = new URL(candidate, "https://buildawallet.invalid");
    if (parsed.origin !== "https://buildawallet.invalid") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function escapeHtmlAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function gateHtml(returnTo = "/") {
  const safeTarget = escapeHtmlAttribute(safeReturnTo(returnTo));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Terms & Privacy | BuildAWallet</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 20% 0%,#17363b 0,transparent 38%),radial-gradient(circle at 85% 100%,#352044 0,transparent 42%),#070a14;color:#f5f7fb;font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{width:min(700px,100%);border:1px solid #31405a;border-radius:24px;background:rgba(18,24,39,.96);box-shadow:0 30px 90px rgba(0,0,0,.55);padding:28px}.eyebrow{font:700 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;color:#56ebd3}.card h1{font-size:clamp(30px,6vw,48px);line-height:1;margin:10px 0 14px}.card p{color:#aebbd0}.links{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}.links a{color:#8cf7e6;border:1px solid #355462;border-radius:999px;padding:8px 12px;text-decoration:none}.notice{border:1px solid #5f5433;background:#17170f;border-radius:14px;padding:14px;color:#ffe29a;margin:14px 0}.collection{border:1px solid #31405a;background:#0b101c;border-radius:14px;padding:14px;color:#c8d2e2;margin:14px 0}.check{display:flex;align-items:flex-start;gap:12px;padding:16px;border:1px solid #31405a;border-radius:14px;background:#0b101c}.check input{width:20px;height:20px;margin-top:2px;accent-color:#56ebd3;flex:none}.check label{color:#f5f7fb}.check a{color:#8cf7e6}.fine{font-size:12px;color:#91a0b7;margin-top:12px}.enter{width:100%;margin-top:18px;min-height:54px;border:0;border-radius:14px;background:#56ebd3;color:#061213;font-weight:800;font-size:16px;cursor:pointer}.enter:focus{outline:3px solid #fff;outline-offset:3px}
</style>
</head>
<body>
<main class="card" role="main" aria-labelledby="legal-title">
  <div class="eyebrow">BUILDAWALLET · BEFORE YOU CONTINUE</div>
  <h1 id="legal-title">Terms & privacy acknowledgment</h1>
  <p>BuildAWallet is self-custody software. Before using the HUMAN website or wallet tools, review the Terms of Service and Privacy Policy.</p>
  <div class="links">
    <a href="/terms" target="_blank" rel="noopener">Terms of Service</a>
    <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>
    <a href="/privacy-choices" target="_blank" rel="noopener">Your Privacy Choices</a>
  </div>
  <div class="collection"><strong>Notice at collection:</strong> Cloudflare may process ordinary network and security metadata when delivering this page. If you sign in, BuildAWallet and its transactional email provider process the email/authentication data needed to deliver and verify a login code. If you use wallet or API features, public wallet addresses, transaction identifiers and blockchain/RPC requests may be processed to provide the feature you requested. See the Privacy Policy for categories, purposes, recipients and retention.</div>
  <div class="notice"><strong>Privacy baseline:</strong> BuildAWallet does not sell personal information or share it for cross-context behavioral advertising, and does not use session-replay, keystroke-recording, or advertising-pixel tracking on its own pages. Wallet recovery phrases and private keys must never be submitted to BuildAWallet.</div>
  <form method="post" action="/legal/accept">
    <input type="hidden" name="policy_version" value="${LEGAL_VERSION}">
    <input type="hidden" name="return_to" value="${safeTarget}">
    <div class="check">
      <input id="agree" name="agree" type="checkbox" value="yes" required>
      <label for="agree">I am at least 18 years old (or the age of legal majority where I live), I have read and agree to the <a href="/terms" target="_blank" rel="noopener">Terms of Service</a>, and I acknowledge the <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</label>
    </div>
    <p class="fine">This acknowledgment does not waive any privacy right that cannot legally be waived. Privacy choices remain available whether or not you use the service.</p>
    <button class="enter" type="submit">I agree · Enter BuildAWallet</button>
  </form>
</main>
</body>
</html>`;
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);

  if (url.pathname === "/legal/accept" && request.method === "POST") {
    const form = await request.formData();
    const agreed = form.get("agree") === "yes";
    const version = form.get("policy_version");
    const returnTo = safeReturnTo(form.get("return_to"));
    if (!agreed || version !== LEGAL_VERSION) {
      return new Response("Terms and Privacy acknowledgment is required.", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return new Response(null, {
      status: 303,
      headers: {
        "Location": returnTo,
        "Set-Cookie": `${COOKIE_NAME}=${LEGAL_VERSION}; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax`,
        "Cache-Control": "no-store",
      },
    });
  }

  if ((request.method === "GET" || request.method === "HEAD") && isGatedPath(url.pathname) && !hasAccepted(request)) {
    const returnTo = safeReturnTo(`${url.pathname}${url.search}`);
    return new Response(request.method === "HEAD" ? null : gateHtml(returnTo), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
    });
  }

  return context.next();
}
