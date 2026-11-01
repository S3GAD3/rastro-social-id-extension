// Utilidades compartidas (service worker, popup e informe)

export const PLATFORMS = {
  instagram: {
    label: "Instagram", short: "IG", color: "#e1306c",
    profileUrl: (u) => `https://www.instagram.com/${encodeURIComponent(u)}/`,
    postsLabel: "Publicaciones", supportsId: true,
  },
  tiktok: {
    label: "TikTok", short: "TT", color: "#25f4ee",
    profileUrl: (u) => `https://www.tiktok.com/@${encodeURIComponent(u)}`,
    postsLabel: "Vídeos", supportsId: false,
  },
  x: {
    label: "X", short: "X", color: "#e7e9ea",
    profileUrl: (u) => `https://x.com/${encodeURIComponent(u)}`,
    postsLabel: "Posts", supportsId: true,
  },
};

const PREFIXES = {
  ig: "instagram", insta: "instagram", instagram: "instagram",
  tt: "tiktok", tiktok: "tiktok",
  x: "x", tw: "x", twitter: "x",
};
const IG_RESERVED = ["p", "reel", "reels", "explore", "stories", "direct", "accounts", "tv", "about", "legal"];
const X_RESERVED = ["home", "explore", "i", "search", "settings", "messages", "notifications", "compose", "login", "signup", "tos", "privacy"];

/**
 * Identifica red y valor a partir de lo que pega el usuario.
 * Devuelve { platform|null, value, mode|null }
 */
export function detect(raw) {
  let s = String(raw ?? "").trim();
  let m;
  if ((m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i)) && !IG_RESERVED.includes(m[1].toLowerCase()))
    return { platform: "instagram", value: m[1], mode: "username" };
  if ((m = s.match(/tiktok\.com\/@([A-Za-z0-9._-]+)/i)))
    return { platform: "tiktok", value: m[1], mode: "username" };
  if ((m = s.match(/(?:x|twitter)\.com\/i\/user\/(\d+)/i)))
    return { platform: "x", value: m[1], mode: "id" };
  if ((m = s.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i)) && !X_RESERVED.includes(m[1].toLowerCase()))
    return { platform: "x", value: m[1], mode: "username" };
  if ((m = s.match(/^([a-z]+):\s*(.+)$/i)) && PREFIXES[m[1].toLowerCase()])
    return { platform: PREFIXES[m[1].toLowerCase()], value: m[2].trim().replace(/^@/, ""), mode: null };
  return { platform: null, value: s.replace(/^@/, ""), mode: null };
}

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const fmtNum = (n) => (n == null || n === "" ? "—" : Number(n).toLocaleString("es-ES"));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function sha256Hex(data) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** JSON canónico: claves ordenadas a todos los niveles (para hashes reproducibles). */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

export function bytesToB64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export function localTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "local"; } catch { return "local"; }
}
export function fmtLocal(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-ES", { hour12: false }); } catch { return iso; }
}
