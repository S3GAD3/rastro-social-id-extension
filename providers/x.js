// Proveedor X (Twitter) — username → ID e ID → username
// Abre el perfil en una pestaña en segundo plano y captura la respuesta GraphQL
// (UserByScreenName / UserByRestId) que pide la propia web de X. Así no hay que
// replicar queryId, features ni x-client-transaction-id, que X cambia a menudo.

import { withBackgroundTab, tabUrl } from "../lib/tabrunner.js";
import { sleep } from "../lib/common.js";

const TIMEOUT = 35000;
const captures = new Map(); // tabId -> [{op, url, data, t}]

export async function session() {
  try {
    const a = await chrome.cookies.get({ url: "https://x.com", name: "auth_token" });
    const twid = await chrome.cookies.get({ url: "https://x.com", name: "twid" });
    const uid = twid?.value ? decodeURIComponent(twid.value).replace(/^u=/, "") : null;
    return { loggedIn: Boolean(a?.value), sessionUserId: uid };
  } catch {
    return { loggedIn: false, sessionUserId: null };
  }
}

/** Llamado por background.js con cada respuesta capturada en una pestaña de x.com. */
export function onCapture(tabId, msg) {
  if (tabId == null) return;
  const now = Date.now();
  for (const [k, v] of captures) if (now - v[v.length - 1].t > 120000) captures.delete(k); // limpieza
  const arr = captures.get(tabId) || [];
  arr.push({ op: msg.op, url: msg.url, data: msg.data, t: now });
  captures.set(tabId, arr.slice(-20));
}
chrome.tabs.onRemoved.addListener((tabId) => captures.delete(tabId));

function variablesOf(url) {
  try { return JSON.parse(new URL(url, "https://x.com").searchParams.get("variables") || "{}"); }
  catch { return {}; }
}

export function normalizeUsername(raw) {
  let s = String(raw || "").trim();
  const m = s.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})/i);
  if (m) s = m[1];
  return s.replace(/^@/, "").replace(/\/+$/, "").toLowerCase();
}

/** Convierte la respuesta GraphQL de X al modelo común. Admite el esquema antiguo (legacy) y el nuevo (core/avatar/…). */
export function parseUserResponse(data) {
  const user = data?.data?.user;
  const r = user?.result;
  if (!user || !r) return { error: "Cuenta no encontrada", final: true };
  if (r.__typename === "UserUnavailable")
    return { error: `Cuenta no disponible${r.reason ? ` (${r.reason})` : ""}${r.message ? `: ${r.message}` : ""}`, final: true, id: r.rest_id || null };
  const L = r.legacy || {};
  const core = r.core || {};
  const created = core.created_at ?? L.created_at;
  const pic = (r.avatar?.image_url ?? L.profile_image_url_https ?? null);
  return {
    id: r.rest_id ? String(r.rest_id) : null,
    username: core.screen_name ?? L.screen_name ?? null,
    full_name: core.name ?? L.name ?? null,
    biography: L.description ?? r.profile_bio?.description ?? null,
    followers: L.followers_count ?? null,
    following: L.friends_count ?? null,
    posts: L.statuses_count ?? null,
    is_private: r.privacy?.protected ?? L.protected ?? null,
    is_verified: Boolean(r.verification?.verified ?? L.verified ?? false) || Boolean(r.is_blue_verified),
    is_business: r.professional?.professional_type ? r.professional.professional_type === "Business" : null,
    category: r.professional?.category?.[0]?.name ?? null,
    location: (r.location?.location ?? L.location) || null,
    external_url: L.entities?.url?.urls?.[0]?.expanded_url ?? null,
    profile_pic_url: pic ? pic.replace("_normal.", "_400x400.") : null,
    created_at: created ? new Date(created).toISOString() : null,
    created_at_source: created ? "API" : null,
    extra: {
      is_blue_verified: r.is_blue_verified ?? null,
      verified_type: r.verification?.verified_type ?? L.verified_type ?? null,
      likes_given: L.favourites_count ?? null,
      media_count: L.media_count ?? null,
      listed_count: L.listed_count ?? null,
      banner_url: L.profile_banner_url ?? r.banner?.image_url ?? null,
      default_profile_image: L.default_profile_image ?? null,
    },
  };
}

function matches(cap, mode, target) {
  const v = variablesOf(cap.url);
  if (mode === "username") {
    return cap.op === "UserByScreenName" && String(v.screen_name || "").toLowerCase() === target;
  }
  if (cap.op === "UserByRestId" && String(v.userId) === target) return true;
  return cap.data?.data?.user?.result?.rest_id === target;
}

async function waitCapture(tabId, mode, target) {
  const end = Date.now() + TIMEOUT;
  while (Date.now() < end) {
    const hit = (captures.get(tabId) || []).find((c) => matches(c, mode, target));
    if (hit) return hit;
    const url = await tabUrl(tabId);
    if (/\/i\/flow\/login|\/login\b|\/i\/flow\/signup/.test(url)) return { loginWall: true };
    await sleep(400);
  }
  return null;
}

// Una consulta de X cada vez (cada una abre una pestaña).
let chain = Promise.resolve();
export function lookup(query, mode) {
  const run = chain.then(() => doLookup(query, mode));
  chain = run.catch(() => {});
  return run;
}

async function doLookup(query, mode) {
  let target, url;
  if (mode === "id") {
    target = String(query).trim().replace(/\D/g, "");
    if (!target) return { error: "ID no válido" };
    url = `https://x.com/i/user/${target}`;
  } else {
    target = normalizeUsername(query);
    if (!/^[a-z0-9_]{1,15}$/.test(target)) return { error: "Username de X no válido" };
    url = `https://x.com/${target}`;
  }
  try {
    return await withBackgroundTab(url, async (tabId) => {
      const cap = await waitCapture(tabId, mode, target);
      captures.delete(tabId);
      if (!cap) return { error: "X no respondió a tiempo. Comprueba que tienes sesión iniciada en x.com y reintenta." };
      if (cap.loginWall) return { error: "X exige sesión: inicia sesión en x.com en este navegador." };
      const res = parseUserResponse(cap.data);
      if (res.final) delete res.final;
      if (!res.error) res.method = `pestaña + captura ${cap.op}`;
      return res;
    });
  } catch (e) {
    return { error: e.message || String(e) };
  }
}
