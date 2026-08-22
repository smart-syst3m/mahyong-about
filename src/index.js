/**
 * Worker for the Mahyong app's About feature.
 *
 * - GET /config      -> plain-text body, exactly one HTTPS URL, chosen by the caller's country
 *                        (Cloudflare's CF-IPCountry request header - no extra product needed,
 *                        every Worker request carries it). This is the contract the Android app's
 *                        AboutUrlResolver expects (see AboutConfig.kt#parseAboutUrl): a bare https
 *                        URL, nothing else on the line. Requires the X-Mahyong-Token header (see
 *                        isAuthorized) - anything else gets 403.
 *                        Indonesia (env.ABOUT_URL_ID) gets an externally-hosted page; every other
 *                        country gets this Worker's own static page at `/` (see handleConfig).
 * - everything else  -> served from ./public as static assets (the About page itself, robots.txt).
 *                        Not gated by the token - it's just static marketing copy, and the
 *                        Android app loads it directly via WebView, which can't attach the same
 *                        custom header on WebView-driven navigation anyway.
 *
 * Country resolution happens entirely at the edge so the app never needs to know - or ask a third
 * party like ipinfo.io - what country it's in.
 */
const TOKEN_HEADER = "X-Mahyong-Token";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/config") {
      if (!isAuthorized(request, env)) {
        return new Response("forbidden", { status: 403 });
      }
      return handleConfig(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
};

/**
 * Filters out casual bots/scrapers hitting /config directly - NOT real access control. The
 * matching token lives in the Android app's AboutConfig.kt (APP_ACCESS_TOKEN, obfuscated) and
 * anyone decompiling the APK can recover it, same honest limit documented there. Fails CLOSED:
 * if the APP_TOKEN secret was never set (env.APP_TOKEN is undefined), this returns false and
 * /config 403s everyone, app included, rather than silently staying open.
 *
 * Plain string comparison, not constant-time - proportional to the fact this token is already
 * extractable from the APK, so a timing side-channel wouldn't be a meaningfully bigger hole.
 */
function isAuthorized(request, env) {
  const token = request.headers.get(TOKEN_HEADER);
  return Boolean(env.APP_TOKEN) && token === env.APP_TOKEN;
}

function handleConfig(request, env, url) {
  // ?cc=XX lets a human (or curl) verify country routing without needing a VPN. It only ever
  // selects which About URL comes back - nothing sensitive rides on it.
  const country = (url.searchParams.get("cc") ?? request.headers.get("CF-IPCountry") ?? "")
    .trim()
    .toUpperCase();

  const aboutUrl =
    country === "ID"
      ? env.ABOUT_URL_ID // externally-hosted - no self-fallback, see the check right below
      : `${url.origin}/`; // every other country always gets this Worker's own static page

  if (!aboutUrl) {
    // Misconfiguration (ABOUT_URL_ID missing) - fail loudly with 500 rather than serving a
    // blank/garbage body the app's parseAboutUrl would just silently reject anyway.
    return new Response("about url not configured", { status: 500 });
  }

  return new Response(aboutUrl + "\n", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Never cache this at any layer: a stale response could hand a US caller an ID-only URL
      // (or vice versa), and country routing changing without a client-visible signal is exactly
      // the kind of bug a shared cache would hide.
      "cache-control": "no-store",
    },
  });
}
