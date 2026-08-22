/**
 * Worker for the Mahyong app's About feature.
 *
 * - GET /config      -> plain-text body, exactly one HTTPS URL, chosen by the caller's country -
 *                        passed explicitly as the `cc` query param, NOT read from CF-IPCountry
 *                        (see the note on that below). This is the contract the Android app's
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
 * Country resolution moved from this Worker to the app itself (see the Android app's
 * CountryProvider.kt/AboutUrlResolver.kt). CF-IPCountry alone turned out unreliable for this:
 * many VPN clients only tunnel one IP stack (commonly IPv4) and leak the other straight to the
 * real ISP, so consecutive requests from the very same device/VPN session could arrive over
 * different stacks and report different countries - the page would flip mid-session with no
 * change from the user. The app now resolves its own country from an IPv4-pinned source (with an
 * on-device fallback if that's unreachable) and tells this Worker via `cc`, once, per request.
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
  // The app resolves its own country now (see the header comment above) and passes it explicitly
  // via `cc` - this is the ONLY source of country consulted here. Deliberately no CF-IPCountry
  // fallback: a stale/leaked edge-detected country silently overriding what the app itself
  // determined would reintroduce exactly the inconsistency this move was meant to fix.
  const country = (url.searchParams.get("cc") ?? "").trim().toUpperCase();

  // Per-country URL lives as env.ABOUT_URL_<CC> - e.g. ABOUT_URL_ID for Indonesia - so adding a
  // new country's page is just a new env var, no code change. Anything without one configured
  // (including an empty/malformed `cc`) gets this Worker's own static page at `/`, which is a
  // safe, always-available default rather than a 500 - a missing/garbled `cc` shouldn't be able
  // to break the About screen.
  const aboutUrl = (country && env[`ABOUT_URL_${country}`]) || `${url.origin}/`;

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
