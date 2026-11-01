// Puente (mundo aislado): recibe lo capturado por x-hook.js y lo envía al service worker.
// El service worker solo lo usa si la pestaña fue abierta por una consulta de Rastro.
window.addEventListener("message", (e) => {
  if (e.source !== window || e.data?.__rastro !== "x-capture") return;
  const { op, url, data } = e.data;
  try {
    chrome.runtime.sendMessage({ type: "x-capture", op, url, data }).catch(() => {});
  } catch { /* extensión recargada */ }
});
