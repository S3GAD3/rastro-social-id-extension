// Proveedor TikTok — username → ID
// 1) Petición directa al perfil y lectura del JSON incrustado (__UNIVERSAL_DATA_FOR_REHYDRATION__)
// 2) Respaldo: abrir el perfil en pestaña en segundo plano y leer el mismo JSON del DOM

import { withBackgroundTab, pollInTab } from "../lib/tabrunner.js";

const tsIso = (s) => (Number(s) > 0 ? new Date(Number(s) * 1000).toISOString() : null);

export async function session() {
  try {
    const c = await chrome.cookies.get({ url: "https://www.tiktok.com", name: "sessionid" });
    return { loggedIn: Boolean(c?.value), sessionUserId: null };
  } catch {
    return { loggedIn: false, sessionUserId: null };
  }
}

export function normalizeUsername(raw) {
  let s = String(raw || "").trim();
  const m = s.match(/tiktok\.com\/@([A-Za-z0-9._-]+)/i);
  if (m) s = m[1];
  return s.replace(/^@/, "").replace(/\/+$/, "").toLowerCase();
}

function mapUser(user, stats = {}, statsV2 = {}) {
  const num = (a, b) => (a ?? (b != null ? Number(b) : null));
  return {
    id: user.id ? String(user.id) : null,
    username: user.uniqueId || null,
    full_name: user.nickname || null,
    biography: user.signature || null,
    followers: num(stats.followerCount, statsV2.followerCount),
    following: num(stats.followingCount, statsV2.followingCount),
    posts: num(stats.videoCount, statsV2.videoCount),
    likes: num(stats.heartCount ?? stats.heart, statsV2.heartCount),
    is_private: user.privateAccount ?? null,
    is_verified: user.verified ?? null,
    is_business: user.commerceUserInfo?.commerceUser ?? null,
    category: user.commerceUserInfo?.category || null,
    external_url: user.bioLink?.link || null,
    profile_pic_url: user.avatarLarger || user.avatarMedium || user.avatarThumb || null,
    created_at: tsIso(user.createTime),
    created_at_source: Number(user.createTime) > 0 ? "API" : null,
    extra: {
      secUid: user.secUid || null,
      region: user.region || null,
      language: user.language || null,
      username_changed_at: tsIso(user.uniqueIdModifyTime),
      nickname_changed_at: tsIso(user.nickNameModifyTime),
      likes_given: num(stats.diggCount, statsV2.diggCount),
      friends: num(stats.friendCount, statsV2.friendCount),
      is_organization: user.isOrganization ? true : null,
    },
  };
}

function fromUniversal(j) {
  const d = j?.__DEFAULT_SCOPE__?.["webapp.user-detail"];
  if (!d) return null;
  const u = d.userInfo?.user;
  if (!u?.id) return { error: `Cuenta no encontrada o no disponible (statusCode ${d.statusCode ?? "?"})`, final: true };
  return mapUser(u, d.userInfo.stats || {}, d.userInfo.statsV2 || {});
}

function fromSigi(j) {
  const users = j?.UserModule?.users;
  if (!users) return null;
  const key = Object.keys(users)[0];
  if (!key) return { error: "Cuenta no encontrada", final: true };
  return mapUser(users[key], j.UserModule.stats?.[key] || {});
}

/** Extrae los datos de perfil del HTML de tiktok.com/@usuario. Devuelve null si no hay JSON (captcha/WAF). */
export function parseProfileHtml(html) {
  let m = html.match(/<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) { try { return fromUniversal(JSON.parse(m[1])); } catch { /* sigue */ } }
  m = html.match(/<script[^>]*id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
  if (m) { try { return fromSigi(JSON.parse(m[1])); } catch { /* sigue */ } }
  return null;
}

export function parseScriptPayload(p) {
  if (!p?.text) return null;
  try {
    const j = JSON.parse(p.text);
    return p.id === "SIGI_STATE" ? fromSigi(j) : fromUniversal(j);
  } catch {
    return null;
  }
}

async function direct(username) {
  const r = await fetch(`https://www.tiktok.com/@${encodeURIComponent(username)}`, {
    credentials: "include",
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  if (r.status === 404) return { error: "Cuenta no encontrada (404)", final: true };
  if (r.status === 429) return { error: "Límite de peticiones (429). Espera unos minutos.", final: true };
  if (!r.ok) return null;
  return parseProfileHtml(await r.text());
}

async function viaTab(username) {
  return withBackgroundTab(`https://www.tiktok.com/@${encodeURIComponent(username)}`, async (tabId) => {
    const payload = await pollInTab(tabId, () => {
      const el = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__") || document.getElementById("SIGI_STATE");
      return el && el.textContent.length > 50 ? { id: el.id, text: el.textContent } : null;
    }, { timeout: 30000 });
    return parseScriptPayload(payload);
  });
}

export async function lookup(query, mode) {
  if (mode === "id") return { error: "TikTok: la búsqueda ID → username no está soportada" };
  const u = normalizeUsername(query);
  if (!/^[a-z0-9._]{2,24}$/.test(u)) return { error: "Username de TikTok no válido" };
  try {
    let res = await direct(u).catch(() => null); // error de red/CORS → respaldo en pestaña
    if (res && !res.error) return { ...res, method: "html_rehydration" };
    if (res?.final) { delete res.final; return res; }
    res = await viaTab(u);
    if (res && !res.error) return { ...res, method: "pestaña (DOM)" };
    if (res?.error) { delete res.final; return res; }
    return { error: "TikTok no devolvió datos del perfil (posible captcha). Abre tiktok.com, resuélvelo y reintenta." };
  } catch (e) {
    return { error: e.message || String(e) };
  }
}
