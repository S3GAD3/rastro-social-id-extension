// Se ejecuta en el contexto de la página de x.com (world: MAIN).
// Observa las respuestas GraphQL UserByScreenName / UserByRestId que pide la propia web
// y las pasa al script puente. No modifica peticiones ni respuestas.
(() => {
  if (window.__rastroXHook) return;
  window.__rastroXHook = true;
  const RE = /\/graphql\/[^/]+\/(UserByScreenName|UserByRestId)\b/;

  const emit = (url, text) => {
    const m = String(url).match(RE);
    if (!m) return;
    try {
      window.postMessage({ __rastro: "x-capture", op: m[1], url: String(url), data: JSON.parse(text) }, location.origin);
    } catch { /* respuesta no JSON */ }
  };

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input?.url;
    const p = origFetch.apply(this, arguments);
    if (url && RE.test(url)) {
      p.then((res) => res.clone().text().then((t) => emit(url, t))).catch(() => {});
    }
    return p;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (url && RE.test(String(url))) {
      this.addEventListener("load", () => {
        try {
          const t = this.responseType === "" || this.responseType === "text"
            ? this.responseText
            : this.responseType === "json" ? JSON.stringify(this.response) : null;
          if (t) emit(url, t);
        } catch { /* ignorar */ }
      });
    }
    return origOpen.apply(this, arguments);
  };
})();
