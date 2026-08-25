/**
 * Reverse proxy for the Appwrite API, sitting in front of the static site.
 *
 * Why this exists: the browser SDK talks to Appwrite over cookie-based
 * sessions. Appwrite Cloud's endpoint (nyc.cloud.appwrite.io) lives on a
 * different site than xanthus.app.br, so every `account.get()` call after
 * OAuth login is cross-site from the browser's point of view — and browsers
 * with third-party cookie blocking (an increasing default, not an edge case)
 * silently drop the session cookie on that call, reading the app back as
 * "guests" even though the login itself succeeded a moment earlier. See
 * PROJECT-CONTEXT.md's "Web (Sala de Treino...)" entry for the full story,
 * including the attempted fix (an Appwrite custom API domain) that got stuck
 * on a certificate that never finished issuing on Appwrite's own side.
 *
 * The fix here needs no cooperation from Appwrite at all: every request
 * under /v1/* (exactly what the Appwrite Web SDK already calls) is forwarded
 * to the real Appwrite endpoint from this Worker, server-side. The browser
 * only ever talks to xanthus.app.br — same-origin, not cross-site — so no
 * cookie policy ever comes into play. Everything else falls through to the
 * static site (Workers Assets), unchanged.
 */

const APPWRITE_ORIGIN = "https://nyc.cloud.appwrite.io";

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/v1/")) {
      return proxyToAppwrite(request, url);
    }

    return env.ASSETS.fetch(request);
  },
};

export default worker;

async function proxyToAppwrite(request, url) {
  const targetUrl = new URL(url.pathname + url.search, APPWRITE_ORIGIN);
  // `new Request(url, request)` clones method/headers/body from the
  // original request onto the new URL — the same idiom Cloudflare's own
  // docs use for proxying, including WebSocket upgrades (Appwrite Realtime,
  // used for live-run tracking): `fetch()` recognizes the `Upgrade:
  // websocket` header on this cloned request and returns a 101 response
  // carrying the socket pair, which falls straight through the early
  // return below (upgrade responses never carry Set-Cookie).
  const upstreamResponse = await fetch(new Request(targetUrl, request));

  // Same-origin proxy: the browser only ever talks to *this* origin, so
  // Appwrite's session cookie needs to land as a host-only cookie scoped to
  // xanthus.app.br — not whatever `Domain=` (if any) Appwrite's own
  // response names for its real hostname. A `Domain=` that doesn't match
  // the host the browser thinks it just talked to gets the cookie silently
  // dropped, so it's stripped here rather than trusted through unmodified.
  const setCookies = upstreamResponse.headers.getSetCookie?.() ?? [];
  if (setCookies.length === 0) return upstreamResponse;

  const response = new Response(upstreamResponse.body, upstreamResponse);
  response.headers.delete("Set-Cookie");
  for (const cookie of setCookies) {
    response.headers.append("Set-Cookie", cookie.replace(/;\s*Domain=[^;]*/i, ""));
  }
  return response;
}
