/**
 * Worker for the Mahyong app's About feature.
 *
 * - GET /config      -> plain-text body, exactly one HTTPS URL, chosen by the caller's country
 *                        (Cloudflare's CF-IPCountry request header - no extra product needed,
 *                        every Worker request carries it). This is the contract the Android app's
 *                        AboutUrlResolver expects (see AboutConfig.kt#parseAboutUrl): a bare https
 *                        URL, nothing else on the line.
 * - everything else  -> served from ./public as static assets (the About page itself, robots.txt).
 *
 * Country resolution happens entirely at the edge so the app never needs to know - or ask a third
 * party like ipinfo.io - what country it's in.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/config") {
      return handleConfig(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
};

function handleConfig(request, env, url) {
  // ?cc=XX lets a human (or curl) verify country routing without needing a VPN. It only ever
  // selects which About URL comes back - nothing sensitive rides on it.
  const country = (url.searchParams.get("cc") ?? request.headers.get("CF-IPCountry") ?? "")
    .trim()
    .toUpperCase();

  const aboutUrl =
    country === "ID"
      ? env.ABOUT_URL_ID ?? `${url.origin}/`
      : env.ABOUT_URL_DEFAULT;

  if (!aboutUrl) {
    // Misconfiguration (ABOUT_URL_DEFAULT missing) - fail loudly with 500 rather than serving a
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
