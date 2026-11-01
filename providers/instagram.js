// Proveedor Instagram — misma lógica que Rastro InstaId v1.0.0
// (web_profile_info → respaldo HTML; ID → username con users/{id}/info)

const IG_APP_ID = "936619743392459"; // app ID público de la web de Instagram

async function getCookie(name) {
  try {
    const c = await chrome.cookies.get({ url: "https://www.instagram.com", name });
    return c ? c.value : null;
  } catch {
    return null;
  }
}

export async function session() {
  const uid = await getCookie("ds_user_id");
  const sid = await getCookie("sessionid");
  return { loggedIn: Boolean(uid && sid), sessionUserId: uid || null };
}

async function igHeaders() {
  const h = {
    "X-IG-App-ID": IG_APP_ID,
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "*/*",
  };
  const csrf = await getCookie("csrftoken");
  if (csrf) h["X-CSRFToken"] = csrf;
  return h;
}

export function normalizeUsername(raw) {
  let s = String(raw || "").trim();
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (m) s = m[1];
  return s.replace(/^@/, "").replace(/\/+$/, "").toLowerCase();
}

function mapUser(u, method) {
  return {
    id: u.id || u.pk_id || (u.pk != null ? String(u.pk) : null),
    username: u.username || null,
    full_name: u.full_name || null,
    followers: u.edge_followed_by?.count ?? u.follower_count ?? null,
    following: u.edge_follow?.count ?? u.following_count ?? null,
    posts: u.edge_owner_to_timeline_media?.count ?? u.media_count ?? null,
    is_private: u.is_private ?? null,
    is_verified: u.is_verified ?? null,
    is_business: u.is_business_account ?? u.is_business ?? null,
    category: u.category_name || u.category || null,
    biography: u.biography || null,
    external_url: u.external_url || null,
    profile_pic_url: u.profile_pic_url_hd || u.hd_profile_pic_url_info?.url || u.profile_pic_url || null,
    // URLs alternativas de la foto (otras resoluciones) por si la principal no se puede descargar
    _pic_alts: [u.hd_profile_pic_url_info?.url, ...(u.hd_profile_pic_versions || []).map((v) => v.url), u.profile_pic_url]
      .filter(Boolean),
    extra: { fbid: u.fbid || u.fbid_v2 || null },
    method,
  };
}

// --- Datos públicos del perfil a partir de los metadatos del HTML (respaldo sin API) ---
const decodeEntities = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function metaContent(html, key) {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i"))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, "i"));
  return m ? decodeEntities(m[1]) : null;
}

/** "1.2M" → 1200000 · "7,800" → 7800 · "12,5 mil" → 12500 */
export function parseCount(s) {
  if (!s) return null;
  const t = String(s).trim().toLowerCase().replace(/\s+/g, " ");
  const m = t.match(/^([\d.,]+)\s?(k|m|b|mil|mill\.?|millones)?$/);
  if (!m) return null;
  let num = m[1];
  const mult = { k: 1e3, mil: 1e3, m: 1e6, "mill.": 1e6, mill: 1e6, millones: 1e6, b: 1e9 }[m[2]] || 1;
  if (mult === 1) num = num.replace(/[.,]/g, "");
  else num = num.replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "");
  const v = Number(num) * mult;
  return Number.isFinite(v) ? Math.round(v) : null;
}

export function parseProfileMeta(html) {
  const out = {};
  const img = metaContent(html, "og:image");
  if (img) out.profile_pic_url = img;
  const title = metaContent(html, "og:title");
  if (title) {
    const m = title.match(/^(.*?)\s*\(@([A-Za-z0-9._]+)\)/);
    if (m) { out.full_name = m[1].trim() || null; out.username = m[2]; }
  }
  const desc = metaContent(html, "og:description") || metaContent(html, "description");
  if (desc) {
    const N = "([\\d.,]+\\s?(?:[KMB]|mil|mill\\.?|millones)?)";
    const en = desc.match(new RegExp(`${N}\\s+Followers?,\\s*${N}\\s+Following,\\s*${N}\\s+Posts?`, "i"));
    const es = desc.match(new RegExp(`${N}\\s+seguidores?,\\s*${N}\\s+seguidos?,\\s*${N}\\s+publicaci`, "i"));
    const c = en || es;
    if (c) {
      out.followers = parseCount(c[1]);
      out.following = parseCount(c[2]);
      out.posts = parseCount(c[3]);
      out._approx = /[kmb]|mil|mill/i.test(c[1] + c[2] + c[3]);
    }
  }
  return out;
}

function httpError(status) {
  if (status === 404) return "Cuenta no encontrada (404)";
  if (status === 401 || status === 403) return `Acceso denegado (${status}). Inicia sesión en instagram.com en este navegador.`;
  if (status === 429) return "Límite de peticiones (429). Espera unos minutos.";
  return `Error HTTP ${status}`;
}

// Método 1: endpoint JSON web_profile_info
async function byUsernameApi(username) {
  const headers = await igHeaders();
  let lastStatus = null;
  for (const host of ["https://www.instagram.com", "https://i.instagram.com"]) {
    const r = await fetch(`${host}/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
      headers,
      credentials: "include",
    });
    lastStatus = r.status;
    if (r.status === 404) return { error: httpError(404) };
    const ct = r.headers.get("content-type") || "";
    if (r.ok && ct.includes("json")) {
      const j = await r.json();
      const u = j?.data?.user;
      if (u) return mapUser(u, "web_profile_info");
      if (j?.data && j.data.user === null) return { error: "Cuenta no encontrada" };
    }
  }
  return { error: httpError(lastStatus), _status: lastStatus };
}

// Método 2 (respaldo): ID incrustado en el HTML del perfil
async function byUsernameHtml(username) {
  const r = await fetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
    credentials: "include",
    headers: { Accept: "text/html" },
  });
  if (!r.ok) return null;
  const html = await r.text();
  const esc = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    /"profilePage_(\d+)"/,
    /"profile_id":"(\d+)"/,
    new RegExp(`"id":"(\\d+)","username":"${esc}"`, "i"),
    /"user_id":"(\d+)"/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) {
      // Además del ID, recoger los datos públicos de los metadatos (nombre, contadores, foto)
      const meta = parseProfileMeta(html);
      const approx = meta._approx;
      delete meta._approx;
      return {
        username, ...meta, id: m[1], method: "html",
        extra: approx ? { counts_note: "Contadores aproximados (metadatos del perfil)" } : {},
      };
    }
  }
  return null;
}

// ID -> username (requiere sesión iniciada)
async function byId(id) {
  const headers = await igHeaders();
  const r = await fetch(`https://i.instagram.com/api/v1/users/${encodeURIComponent(id)}/info/`, {
    headers,
    credentials: "include",
  });
  const ct = r.headers.get("content-type") || "";
  if (r.ok && ct.includes("json")) {
    const j = await r.json();
    if (j?.user) return mapUser(j.user, "users_info");
  }
  return { error: httpError(r.status) };
}

export async function lookup(query, mode) {
  let result;
  try {
    if (mode === "id") {
      const id = String(query).trim().replace(/\D/g, "");
      if (!id) throw new Error("ID no válido");
      result = await byId(id);
    } else {
      const u = normalizeUsername(query);
      if (!/^[a-z0-9._]{1,30}$/.test(u)) throw new Error("Username no válido");
      result = await byUsernameApi(u);
      if (result.error && result._status !== 404 && !/no encontrada/.test(result.error)) {
        const alt = await byUsernameHtml(u);
        if (alt) result = alt;
      }
      // Si el ID salió del HTML, completar la ficha con users/{id}/info (funciona con sesión)
      if (result.method === "html" && result.id) {
        try {
          const full = await byId(result.id);
          if (!full.error && String(full.id) === String(result.id)) result = { ...full, method: "html + users_info" };
        } catch { /* se mantienen los datos del HTML */ }
      }
    }
  } catch (e) {
    result = { error: e.message || String(e) };
  }
  delete result._status;
  return result;
}
