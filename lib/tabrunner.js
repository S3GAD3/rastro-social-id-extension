// Abre una pestaña en segundo plano, ejecuta un trabajo y la cierra siempre.
import { sleep } from "./common.js";

export async function withBackgroundTab(url, job) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    return await job(tab.id);
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

/** Ejecuta `func` en la pestaña repetidamente hasta que devuelva algo no nulo o se agote el tiempo. */
export async function pollInTab(tabId, func, { timeout = 30000, interval = 700 } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId }, func });
      if (res?.result != null) return res.result;
    } catch { /* la página aún no está lista */ }
    await sleep(interval);
  }
  return null;
}

export async function tabUrl(tabId) {
  try { return (await chrome.tabs.get(tabId)).url || ""; } catch { return ""; }
}
