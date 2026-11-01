// Generación de informes (HTML imprimible y TXT) a partir del historial.
import { PLATFORMS, esc, fmtNum, sha256Hex, canonical, localTz, fmtLocal } from "./common.js";

const MODE_LABEL = { username: "Username → ID", id: "ID → Username" };
const EXTRA_LABEL = {
  fbid: "FBID (Meta)",
  secUid: "secUid",
  region: "Región",
  language: "Idioma",
  username_changed_at: "Último cambio de username",
  nickname_changed_at: "Último cambio de nombre",
  likes_given: "Me gusta dados",
  friends: "Amigos",
  is_organization: "Organización",
  is_blue_verified: "Verificación azul",
  verified_type: "Tipo de verificación",
  media_count: "Multimedia",
  listed_count: "En listas",
  banner_url: "Banner",
  default_profile_image: "Foto por defecto",
};

export const profileKey = (r) => `${r.platform}:${r.id}`;

/**
 * Perfiles únicos del historial (la consulta más reciente de cada uno), del más reciente al más antiguo.
 * Cada elemento: { key, rec, count } — count = nº de consultas con resultado de ese perfil.
 */
export function uniqueProfiles(history) {
  const map = new Map();
  for (const r of history) {
    if (r.error || !r.id) continue;
    const k = profileKey(r);
    const e = map.get(k);
    if (e) e.count++;
    else map.set(k, { key: k, rec: r, count: 1 });
  }
  return [...map.values()];
}

/**
 * Registros del informe:
 *  - opts.profileKeys: perfiles elegidos (red:ID). Se usa su consulta más reciente,
 *    o todas sus consultas si opts.allQueries.
 *  - opts.includeErrors: añade las consultas sin resultado de la referencia actual.
 * Devuelve orden cronológico ascendente.
 */
export function selectRecords(history, opts) {
  const keys = new Set(opts.profileKeys || []);
  const ok = history.filter((r) => !r.error && r.id && keys.has(profileKey(r)));
  let profiles = ok;
  if (!opts.allQueries) {
    const seen = new Map(); // history va del más reciente al más antiguo
    for (const r of ok) if (!seen.has(profileKey(r))) seen.set(profileKey(r), r);
    profiles = [...seen.values()];
  }
  const errors = opts.includeErrors
    ? history.filter((r) => r.error && (r.case_ref || "") === (opts.case_ref || ""))
    : [];
  const byTime = (a, b) => a.timestamp_utc.localeCompare(b.timestamp_utc);
  return { profiles: profiles.sort(byTime), errors: errors.sort(byTime) };
}

function stripForHash(r) {
  const { profile_pic_b64, ...rest } = r;
  return rest;
}

export async function datasetHash(sel) {
  return sha256Hex(canonical({ profiles: sel.profiles.map(stripForHash), errors: sel.errors.map(stripForHash) }));
}

const yesNo = (v) => (v == null ? "—" : v ? "Sí" : "No");
const fmtDate = (iso) => (iso ? `${iso.replace("T", " ").replace(/\.\d+Z$/, "Z").replace(/Z$/, " UTC")}` : "—");

function profileRows(r) {
  const P = PLATFORMS[r.platform];
  const rows = [
    ["Red social", P.label],
    ["ID numérico", r.id],
    ["Username", r.username ? `@${r.username}` : null],
    ["Nombre visible", r.full_name],
    ["URL del perfil", r.profile_url],
    ["Biografía", r.biography],
    ["Enlace externo", r.external_url],
    ["Ubicación declarada", r.location],
    ["Seguidores", fmtNum(r.followers)],
    ["Seguidos", fmtNum(r.following)],
    [P.postsLabel, fmtNum(r.posts)],
  ];
  if (r.likes != null) rows.push(["Me gusta recibidos", fmtNum(r.likes)]);
  rows.push(
    ["Cuenta privada / protegida", yesNo(r.is_private)],
    ["Verificada", yesNo(r.is_verified)],
    ["Cuenta profesional / empresa", yesNo(r.is_business)],
  );
  if (r.category) rows.push(["Categoría", r.category]);
  if (r.created_at) rows.push(["Fecha de creación", `${fmtDate(r.created_at)} (${r.created_at_source || "—"})`]);
  if (r.id_derived_created_at && r.created_at_source === "API")
    rows.push(["Fecha derivada del ID", fmtDate(r.id_derived_created_at)]);
  for (const [k, v] of Object.entries(r.extra || {})) {
    let val = v;
    if (typeof v === "boolean") val = yesNo(v);
    else if (/_at$/.test(k)) val = fmtDate(v);
    else if (typeof v === "number") val = fmtNum(v);
    rows.push([EXTRA_LABEL[k] || k, val]);
  }
  rows.push(
    ["Consulta realizada", `${r.query} · ${MODE_LABEL[r.mode] || r.mode}`],
    ["Fecha y hora de consulta", `${fmtDate(r.timestamp_utc)} · ${fmtLocal(r.timestamp_utc)} (${localTz()})`],
    ["Método de obtención", `${r.method || "—"} · ${r.session}`],
  );
  if (r.case_ref) rows.push(["Referencia", r.case_ref]);
  if (r.photo_sha256) rows.push(["SHA-256 foto de perfil", r.photo_sha256]);
  else if (r.photo_error) rows.push(["Foto de perfil", r.photo_error]);
  rows.push(["SHA-256 del registro", r.record_sha256]);
  return rows.filter(([, v]) => v != null && v !== "");
}

const METHODOLOGY = [
  ["Instagram", "Consulta al endpoint web interno web_profile_info (cabecera X-IG-App-ID de la web de Instagram); respaldo: identificador incrustado en el HTML del perfil. ID → username mediante users/{id}/info con sesión iniciada. Los ID de Instagram son secuenciales y no codifican fecha."],
  ["TikTok", "Descarga del perfil público tiktok.com/@usuario y lectura del bloque JSON incrustado (__UNIVERSAL_DATA_FOR_REHYDRATION__ › webapp.user-detail); respaldo: apertura del perfil en pestaña del navegador y lectura del mismo bloque. Fecha de creación derivada del ID (32 bits superiores = segundos Unix)."],
  ["X", "Apertura del perfil en pestaña del navegador con sesión iniciada y captura pasiva de la respuesta GraphQL que solicita la propia web de X (UserByScreenName / UserByRestId), sin alterar peticiones. Fecha derivada del ID Snowflake: (ID >> 22) + 1288834974657 ms, contrastada con created_at."],
];

const CSS = `
*{box-sizing:border-box}body{font:10.5pt/1.45 "Segoe UI",Roboto,Arial,sans-serif;color:#111;margin:0;background:#fff}
.page{max-width:820px;margin:0 auto;padding:28px 34px}
h1{font-size:15pt;margin:0 0 2px;letter-spacing:.3px}h2{font-size:12pt;border-bottom:2px solid #111;padding-bottom:3px;margin:26px 0 10px}
h3{font-size:11pt;margin:0}.sub{color:#555;font-size:9.5pt}
table{width:100%;border-collapse:collapse;font-size:9.5pt}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#eee}.meta td:first-child{width:32%;background:#f6f6f6;font-weight:600}
.mono{font-family:Consolas,"Courier New",monospace;word-break:break-all}
.card{border:1px solid #999;margin:0 0 14px;page-break-inside:avoid;break-inside:avoid}
.card-h{display:flex;gap:12px;align-items:center;padding:8px 10px;background:#f2f2f2;border-bottom:1px solid #999}
.card-h img{width:72px;height:72px;object-fit:cover;border:1px solid #999}
.nopic{width:72px;height:72px;border:1px dashed #999;display:flex;align-items:center;justify-content:center;font-size:8pt;color:#777;text-align:center;flex:none}
.card table{border:0}.card td{border:0;border-top:1px solid #ddd}.card td:first-child{width:34%;color:#333;font-weight:600}
.tag{display:inline-block;border:1px solid #333;padding:0 5px;font-size:8.5pt;margin-left:6px}
.err{color:#9b1c1c}.foot{margin-top:28px;font-size:8.5pt;color:#555;border-top:1px solid #bbb;padding-top:6px}
.sign{margin-top:40px;display:flex;justify-content:space-between;gap:40px}.sign div{flex:1;border-top:1px solid #111;padding-top:4px;font-size:9pt;text-align:center}
@page{size:A4;margin:14mm}@media print{.page{padding:0;max-width:none}}`;

export async function buildHtml(sel, meta) {
  const generated = new Date().toISOString();
  const dsHash = await datasetHash(sel);
  const nets = [...new Set(sel.profiles.map((r) => PLATFORMS[r.platform].label))].join(", ") || "—";
  const summary = sel.profiles.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(PLATFORMS[r.platform].label)}</td>
    <td class="mono">${esc(r.username ? "@" + r.username : "—")}</td><td class="mono">${esc(r.id)}</td>
    <td>${esc(r.full_name || "—")}</td><td class="mono">${esc(fmtDate(r.timestamp_utc))}</td></tr>`).join("");
  const cards = sel.profiles.map((r, i) => {
    const img = !meta.includePhotos ? ""
      : r.profile_pic_b64 ? `<img src="${r.profile_pic_b64}" alt="">`
      : '<div class="nopic">Sin foto</div>';
    return `<div class="card"><div class="card-h">${img}<div><h3>${i + 1}. ${esc(PLATFORMS[r.platform].label)} · @${esc(r.username || "?")}
      ${r.is_verified ? '<span class="tag">verificada</span>' : ""}${r.is_private ? '<span class="tag">privada</span>' : ""}</h3>
      <div class="mono">ID ${esc(r.id)}</div></div></div>
      <table>${profileRows(r).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="${/SHA|ID num|URL|Enlace|secUid|FBID/.test(k) ? "mono" : ""}">${esc(v)}</td></tr>`).join("")}</table></div>`;
  }).join("");
  const errors = sel.errors.length ? `<h2>4. Consultas sin resultado</h2><table><tr><th>Red</th><th>Consulta</th><th>Fecha UTC</th><th>Motivo</th></tr>
    ${sel.errors.map((r) => `<tr><td>${esc(PLATFORMS[r.platform]?.label || r.platform)}</td><td class="mono">${esc(r.query)}</td>
    <td class="mono">${esc(fmtDate(r.timestamp_utc))}</td><td class="err">${esc(r.error)}</td></tr>`).join("")}</table>` : "";
  const usedNets = new Set([...sel.profiles, ...sel.errors].map((r) => PLATFORMS[r.platform]?.label));
  const methods = METHODOLOGY.filter(([n]) => usedNets.has(n)).map(([n, t]) => `<tr><td>${n}</td><td>${esc(t)}</td></tr>`).join("");
  const nM = sel.errors.length ? 5 : 4;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Informe Rastro ID${meta.case_ref ? " · " + esc(meta.case_ref) : ""}</title><style>${CSS}</style></head><body><div class="page">
<h1>INFORME DE IDENTIFICACIÓN DE PERFILES EN REDES SOCIALES</h1>
<div class="sub">Obtención de identificadores numéricos y datos públicos de perfil</div>
<h2>1. Datos del informe</h2>
<table class="meta">
<tr><td>Referencia / diligencias</td><td>${esc(meta.case_ref || "—")}</td></tr>
<tr><td>Unidad</td><td>${esc(meta.unit || "—")}</td></tr>
<tr><td>Investigador / TIP</td><td>${esc(meta.investigator || "—")}</td></tr>
<tr><td>Fecha de generación</td><td>${esc(fmtDate(generated))} · ${esc(fmtLocal(generated))} (${esc(localTz())})</td></tr>
<tr><td>Redes consultadas</td><td>${esc(nets)}</td></tr>
<tr><td>Perfiles identificados</td><td>${sel.profiles.length}${sel.errors.length ? ` · ${sel.errors.length} consultas sin resultado` : ""}</td></tr>
<tr><td>Herramienta</td><td>${esc(meta.tool)}</td></tr>
<tr><td>SHA-256 del conjunto de datos</td><td class="mono">${dsHash}</td></tr>
</table>
<h2>2. Resumen</h2>
<table><tr><th>#</th><th>Red</th><th>Username</th><th>ID</th><th>Nombre</th><th>Consulta (UTC)</th></tr>${summary || '<tr><td colspan="6">Sin perfiles.</td></tr>'}</table>
<h2>3. Fichas de perfil</h2>${cards || "<p>Sin perfiles.</p>"}
${errors}
<h2>${nM}. Metodología</h2>
<table><tr><th style="width:16%">Red</th><th>Procedimiento</th></tr>${methods}</table>
<p class="sub">Las consultas se realizaron desde el navegador del investigador. Los datos reflejan el estado público del perfil en el momento indicado y pueden variar después. El identificador numérico es permanente aunque el titular cambie el username. Cada registro incluye su hash SHA-256 (JSON canónico sin la imagen embebida, representada por su propio hash). El hash del conjunto se calcula sobre todos los registros incluidos en este informe.</p>
${meta.notes ? `<h2>${nM + 1}. Observaciones</h2><p>${esc(meta.notes).replace(/\n/g, "<br>")}</p>` : ""}
<div class="sign"><div>Firma del investigador</div><div>Visto bueno</div></div>
<div class="foot">Generado con ${esc(meta.tool)} · ${esc(fmtDate(generated))}</div>
</div></body></html>`;
}

function wrap(label, value, width = 30) {
  const pad = label.padEnd(width, " ");
  const lines = String(value ?? "—").split(/\r?\n/);
  return lines.map((l, i) => (i === 0 ? pad : " ".repeat(width)) + l).join("\n");
}

export async function buildTxt(sel, meta) {
  const generated = new Date().toISOString();
  const dsHash = await datasetHash(sel);
  const L = "=".repeat(78), l = "-".repeat(78);
  const out = [];
  out.push(L, "INFORME DE IDENTIFICACIÓN DE PERFILES EN REDES SOCIALES", L, "");
  out.push(wrap("Referencia / diligencias:", meta.case_ref || "—"));
  out.push(wrap("Unidad:", meta.unit || "—"));
  out.push(wrap("Investigador / TIP:", meta.investigator || "—"));
  out.push(wrap("Fecha de generación:", `${fmtDate(generated)} | ${fmtLocal(generated)} (${localTz()})`));
  out.push(wrap("Perfiles identificados:", `${sel.profiles.length}${sel.errors.length ? ` | ${sel.errors.length} consultas sin resultado` : ""}`));
  out.push(wrap("Herramienta:", meta.tool));
  out.push(wrap("SHA-256 conjunto de datos:", dsHash), "");
  out.push(l, "RESUMEN", l);
  sel.profiles.forEach((r, i) => out.push(
    `${String(i + 1).padStart(3)}. ${PLATFORMS[r.platform].label.padEnd(10)} @${String(r.username || "?").padEnd(26)} ID ${r.id}`));
  if (!sel.profiles.length) out.push("Sin perfiles.");
  out.push("");
  sel.profiles.forEach((r, i) => {
    out.push(l, `FICHA ${i + 1} · ${PLATFORMS[r.platform].label} · @${r.username || "?"}`, l);
    for (const [k, v] of profileRows(r)) out.push(wrap(`${k}:`, v));
    out.push("");
  });
  if (sel.errors.length) {
    out.push(l, "CONSULTAS SIN RESULTADO", l);
    for (const r of sel.errors) out.push(`${fmtDate(r.timestamp_utc)} | ${PLATFORMS[r.platform]?.label || r.platform} | ${r.query} | ${r.error}`);
    out.push("");
  }
  out.push(l, "METODOLOGÍA", l);
  const used = new Set([...sel.profiles, ...sel.errors].map((r) => PLATFORMS[r.platform]?.label));
  for (const [n, t] of METHODOLOGY) if (used.has(n)) out.push(`${n}: ${t}`, "");
  out.push("Los datos reflejan el estado público del perfil en el momento de la consulta. Cada registro",
    "incluye su hash SHA-256 (JSON canónico sin la imagen embebida, representada por su propio hash).", "");
  if (meta.notes) out.push(l, "OBSERVACIONES", l, meta.notes, "");
  out.push(L, `Generado con ${meta.tool} · ${fmtDate(generated)}`, L);
  return out.join("\r\n") + "\r\n";
}

export function fileBase(meta) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
  const ref = (meta.case_ref || "").replace(/[^\w.-]+/g, "_");
  return `rastro-social-id_${ref ? ref + "_" : ""}${stamp}`;
}

export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/** Descarga un fichero y su .sha256. Devuelve el hash. */
export async function downloadWithHash(name, text, type) {
  const hash = await sha256Hex(text);
  download(name, text, type);
  setTimeout(() => download(`${name}.sha256`, `${hash}  ${name}\n`, "text/plain"), 400);
  return hash;
}
