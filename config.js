// Public site config. VORTEX_API = URL of the Cloudflare Worker (e.g. "https://meme-vortex.<subdomain>.workers.dev").
// Empty => the site only reads the bundled data/*.json. On localhost only, ?api=<url> overrides it for testing.
(function () {
  var DEFAULT_API = "https://meme-vortex.aronsonkyllian.workers.dev";
  var local = location.hostname === "127.0.0.1" || location.hostname === "localhost";
  var q = local ? new URLSearchParams(location.search).get("api") : null;
  window.VORTEX_API = q || DEFAULT_API;
})();
