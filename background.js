// Rastro ID — service worker
// Recibe cada consulta, la envía al proveedor de su red y devuelve un registro
// con formato común, fecha derivada del ID, foto embebida y hash SHA-256.

import * as instagram from "./providers/instagram.js";
import * as tiktok from "./providers/tiktok.js";
import * as x from "./providers/x.js";
import { PLATFORMS, canonical, sha256Hex, bytesToB64 } from "./lib/common.js";
import { tiktokDateFromId, xDateFromId } from "./lib/snowflake.js";

const PROVIDERS = { instagram, tiktok, x };
const VERSION = chrome.runtime.getManifest().version;
const MAX_PIC = 700 * 1024;

// Las CDN de imágenes esperan peticiones "como desde su web": Referer de la red y sin Origin de extensión.
// Reglas de sesión limitadas a peticiones sin pestaña (las del propio service worker).
async function setupPhotoRules() {
  const rule = (id, domains, referer) => ({
    id, priority: 1,
    action: { type: "modifyHeaders", requestHeaders: [
      { header: "referer", operation: "set", value: referer },
      { header: "origin", operation: "remove" },
    ] },
    condition: { requestDomains: domains, tabIds: [chrome.tabs.TAB_ID_NONE], resourceTypes: ["xmlhttprequest", "other", "image"] },
  });
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [1, 2, 3],
      addRules: [
        rule(1, ["cdninstagram.com", "fbcdn.net"], "https://www.instagram.com/"),
        rule(2, ["tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com"], "https://www.tiktok.com/"),
        rule(3, ["pbs.twimg.com"], "https://x.com/"),
      ],
    });
  } catch (e) {
    console.warn("Reglas de foto no aplicadas:", e);
  }
}
const rulesReady = setupPhotoRules();

/** Descarga la foto de perfil probando varias URLs y modos. Devuelve base64 + hash, o el motivo del fallo. */
async function capturePhoto(urls) {
  await rulesReady;
  const list = [...new Set(urls.filter(Boolean))];
  if (!list.length) return { photo_error: "La red no facilitó URL de foto" };
  let lastErr = "";
  for (const url of list) {
    for (const credentials of ["omit", "include"]) {
      try {
        const r = await fetch(url, { credentials, cache: "no-store", referrerPolicy: "no-referrer" });
        if (!r.ok) { lastErr = `HTTP ${r.status}`; continue; }
        const type = (r.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
        if (!type.startsWith("image/")) { lastErr = `tipo ${type}`; continue; }
        const bytes = new Uint8Array(await r.arrayBuffer());
        if (!bytes.length) { lastErr = "imagen vacía"; continue; }
        if (bytes.length > MAX_PIC) { lastErr = `imagen demasiado grande (${bytes.length} B)`; continue; }
        return { profile_pic_b64: `data:${type};base64,${bytesToB64(bytes)}`, photo_sha256: await sha256Hex(bytes) };
      } catch (e) {
        lastErr = e.message || String(e);
      }
    }
  }
  return { photo_error: `No se pudo descargar la foto (${lastErr})` };
}

function derivedDate(platform, id) {
  if (!id) return null;
  if (platform === "tiktok") return tiktokDateFromId(id);
  if (platform === "x") return xDateFromId(id);
  return null; // Instagram: IDs secuenciales, no codifican fecha
}

/** Hash del registro: JSON canónico sin la foto en base64 (se representa por photo_sha256). */
export async function recordHash(rec) {
  const { record_sha256, profile_pic_b64, ...rest } = rec;
  return sha256Hex(canonical(rest));
}

async function lookup(platform, query, mode, meta = {}) {
  const prov = PROVIDERS[platform];
  const ts = new Date().toISOString();
  if (!prov) return { platform, query, mode, timestamp_utc: ts, error: "Red no soportada" };
  const sess = await prov.session();
  let res;
  try {
    res = await prov.lookup(query, mode);
  } catch (e) {
    res = { error: e.message || String(e) };
  }
  if (/^(Failed to fetch|NetworkError|Load failed)/i.test(res.error || ""))
    res.error = "Error de red: sin conexión o petición bloqueada";
  const picAlts = res._pic_alts || [];
  delete res._pic_alts;
  const rec = {
    platform,
    query: String(query).trim(),
    mode,
    ...res,
    extra: Object.fromEntries(Object.entries(res.extra || {}).filter(([, v]) => v != null && v !== "")),
    timestamp_utc: ts,
    session: sess.loggedIn ? "con sesión" : "sin sesión",
    session_user_id: sess.sessionUserId || null,
    case_ref: meta.case_ref || null,
    tool: `Rastro ID v${VERSION}`,
  };
  if (!rec.error) {
    rec.profile_url = rec.username ? PLATFORMS[platform].profileUrl(rec.username) : null;
    rec.id_derived_created_at = derivedDate(platform, rec.id);
    if (!rec.created_at && rec.id_derived_created_at) {
      rec.created_at = rec.id_derived_created_at;
      rec.created_at_source = "derivada del ID";
    }
    Object.assign(rec, await capturePhoto([rec.profile_pic_url, ...picAlts]));
  }
  rec.record_sha256 = await recordHash(rec);
  return rec;
}

async function sessions() {
  const out = {};
  for (const [k, p] of Object.entries(PROVIDERS)) out[k] = await p.session();
  return out;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "lookup") {
    lookup(msg.platform, msg.query, msg.mode || "username", msg.meta).then(sendResponse);
    return true;
  }
  if (msg?.type === "sessions") {
    sessions().then(sendResponse);
    return true;
  }
  if (msg?.type === "x-capture") {
    x.onCapture(sender.tab?.id, msg);
  }
});
