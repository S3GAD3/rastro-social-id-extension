// Rastro ID — interfaz
import { PLATFORMS, detect, esc, fmtNum, sleep } from "../lib/common.js";
import { selectRecords, uniqueProfiles, profileKey, buildTxt, fileBase, downloadWithHash } from "../lib/report.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const HIST_KEY = "history";
const SEL_KEY = "reportSelection";
const MAX_HIST = 3000;
const MIN_DELAY = { instagram: 1, tiktok: 2, x: 6 };
const TOOL = `Rastro ID v${chrome.runtime.getManifest().version}`;

function toast(msg, ms = 1600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), ms);
}
async function copy(text) {
  await navigator.clipboard.writeText(String(text));
  toast("Copiado");
}
const netBadge = (p) => `<span class="net ${esc(p)}">${esc(PLATFORMS[p]?.short || p)}</span>`;
const shortDate = (iso) => (iso ? iso.slice(0, 16).replace("T", " ") : "");

// ---------- almacenamiento ----------
async function getHistory() {
  return (await chrome.storage.local.get(HIST_KEY))[HIST_KEY] || [];
}
async function addHistory(rec) {
  const h = await getHistory();
  h.unshift(rec);
  await chrome.storage.local.set({ [HIST_KEY]: h.slice(0, MAX_HIST) });
  renderHistCount(Math.min(h.length, MAX_HIST));
}
async function persist(key, val) { await chrome.storage.local.set({ [key]: val }); }

// ---------- selección del informe (tipo "carrito") ----------
const sel = new Set(); // claves red:ID
function saveSel() {
  persist(SEL_KEY, [...sel]);
  $("#repCount").textContent = sel.size || "";
  $$("[data-addrep]").forEach((b) => paintAddBtn(b));
}
function paintAddBtn(b) {
  const on = sel.has(b.dataset.addrep);
  b.classList.toggle("on", on);
  b.textContent = on ? "✓ En el informe" : "＋ Añadir al informe";
  if (b.classList.contains("mini")) b.textContent = on ? "✓ informe" : "＋ informe";
}
function toggleSel(key, force) {
  const on = force ?? !sel.has(key);
  on ? sel.add(key) : sel.delete(key);
  saveSel();
  return on;
}

// ---------- consulta ----------
async function runLookup(platform, query, mode) {
  const res = await chrome.runtime.sendMessage({
    type: "lookup", platform, query, mode, meta: { case_ref: $("#caseRef").value.trim() || null },
  });
  await addHistory(res);
  return res;
}

function renderCard(r) {
  const P = PLATFORMS[r.platform];
  if (r.error) {
    return `<div class="card err">${netBadge(r.platform)} <b>${esc(r.query)}</b><br>${esc(r.error)}</div>`;
  }
  const badges = [
    r.is_private == null ? "" : r.is_private ? '<span class="badge">privada</span>' : '<span class="badge">pública</span>',
    r.is_verified ? '<span class="badge">verificada</span>' : "",
    r.is_business ? '<span class="badge">profesional</span>' : "",
  ].join("");
  const extra = Object.entries(r.extra || {}).filter(([k]) => ["fbid", "secUid", "username_changed_at", "is_blue_verified", "verified_type", "counts_note"].includes(k));
  const extraLabel = { fbid: "FBID", secUid: "secUid", username_changed_at: "Cambio username", is_blue_verified: "Blue", verified_type: "Tipo verif.", counts_note: "Nota" };
  const pic = r.profile_pic_b64 || r.profile_pic_url;
  const key = profileKey(r);
  return `
  <div class="card">
    <div class="card-head">
      ${pic ? `<img src="${esc(pic)}" alt="" referrerpolicy="no-referrer">` : ""}
      <div class="who">${netBadge(r.platform)} <b style="display:inline">${esc(r.full_name || r.username || "")}</b><br>
        <span class="muted">@${esc(r.username || "?")}</span>${badges}</div>
    </div>
    <div class="bigid"><span>${esc(r.id)}</span>
      <button class="ghost copy" data-copy="${esc(r.id)}">Copiar ID</button></div>
    <dl>
      <dt>Username</dt><dd class="mono">${esc(r.username || "—")}</dd>
      ${extra.map(([k, v]) => `<dt>${extraLabel[k]}</dt><dd class="mono">${esc(typeof v === "boolean" ? (v ? "Sí" : "No") : v)}</dd>`).join("")}
      <dt>Seguidores</dt><dd>${fmtNum(r.followers)}</dd>
      <dt>Seguidos</dt><dd>${fmtNum(r.following)}</dd>
      <dt>${P.postsLabel}</dt><dd>${fmtNum(r.posts)}</dd>
      ${r.likes != null ? `<dt>Me gusta</dt><dd>${fmtNum(r.likes)}</dd>` : ""}
      ${r.created_at ? `<dt>Creación</dt><dd class="mono">${esc(r.created_at.slice(0, 19).replace("T", " "))} <span class="muted">(${esc(r.created_at_source)})</span></dd>` : ""}
      ${r.location ? `<dt>Ubicación</dt><dd>${esc(r.location)}</dd>` : ""}
      ${r.category ? `<dt>Categoría</dt><dd>${esc(r.category)}</dd>` : ""}
      ${r.biography ? `<dt>Bio</dt><dd>${esc(r.biography)}</dd>` : ""}
      ${r.external_url ? `<dt>Enlace</dt><dd class="mono">${esc(r.external_url)}</dd>` : ""}
      ${r.photo_error ? `<dt>Foto</dt><dd class="muted">${esc(r.photo_error)}</dd>` : ""}
      <dt>Consulta UTC</dt><dd class="mono">${esc(r.timestamp_utc)}</dd>
      <dt>Método</dt><dd>${esc(r.method)} · ${esc(r.session)}</dd>
    </dl>
    <div class="card-foot">
      ${r.profile_url ? `<a href="${esc(r.profile_url)}" target="_blank" class="link">Abrir perfil ↗</a>` : "<span></span>"}
      <span>
        <button class="ghost copy" data-copyhash="${esc(r.record_sha256)}">Copiar JSON</button>
        <button class="ghost copy addrep" data-addrep="${esc(key)}"></button>
      </span>
    </div>
  </div>`;
}

const lastRecords = new Map();
document.addEventListener("click", async (e) => {
  const add = e.target.closest("[data-addrep]");
  if (add) {
    const on = toggleSel(add.dataset.addrep);
    toast(on ? `Añadido al informe (${sel.size})` : `Quitado del informe (${sel.size})`);
    return;
  }
  const b = e.target.closest("[data-copy],[data-copyhash]");
  if (!b) return;
  if (b.dataset.copy != null) return copy(b.dataset.copy);
  let rec = lastRecords.get(b.dataset.copyhash);
  if (!rec) rec = (await getHistory()).find((r) => r.record_sha256 === b.dataset.copyhash);
  if (rec) {
    const { profile_pic_b64, ...rest } = rec;
    copy(JSON.stringify(rest, null, 2));
  }
});
document.addEventListener("error", (e) => {
  if (e.target.tagName === "IMG") e.target.style.visibility = "hidden";
}, true);

// ---------- pestañas ----------
function showTab(name) {
  $$(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === name));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${name}`));
  if (name === "history") renderHistory();
  if (name === "report") renderReportList();
}
$$(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));

// ---------- consulta individual ----------
let platform = "instagram";
const singleMode = () => $('input[name="mode"]:checked').value;

function setPlatform(p) {
  platform = p;
  $$("#platformSeg button").forEach((b) => b.classList.toggle("active", b.dataset.p === p));
  const idOk = PLATFORMS[p].supportsId;
  const idRadio = $('input[name="mode"][value="id"]');
  idRadio.disabled = !idOk;
  $("#idModeLabel").classList.toggle("disabled", !idOk);
  $("#idModeLabel").title = idOk ? "" : "TikTok no permite ID → username";
  if (!idOk && idRadio.checked) $('input[name="mode"][value="username"]').checked = true;
  updatePlaceholder();
  $("#hint").textContent = p === "x" ? "X requiere sesión iniciada en x.com" : p === "tiktok" ? "Sin sesión necesaria" : "";
  persist("lastPlatform", p);
}
function updatePlaceholder() {
  $("#query").placeholder = singleMode() === "id" ? "ID numérico" : "@usuario o URL de perfil";
}
$$("#platformSeg button").forEach((b) => b.addEventListener("click", () => setPlatform(b.dataset.p)));
$$('input[name="mode"]').forEach((r) => r.addEventListener("change", updatePlaceholder));

$("#query").addEventListener("input", () => {
  const d = detect($("#query").value);
  if (d.platform && d.platform !== platform) setPlatform(d.platform);
  if (d.mode) $(`input[name="mode"][value="${d.mode}"]`).checked = true;
});

async function doSingle() {
  const raw = $("#query").value.trim();
  if (!raw) return;
  const d = detect(raw);
  const p = d.platform || platform;
  const mode = d.mode || singleMode();
  if (p === "tiktok" && mode === "id") return toast("TikTok: ID → username no está soportado");
  const btn = $("#go");
  btn.disabled = true;
  btn.textContent = p === "x" ? "Abriendo X…" : "Buscando…";
  $("#result").innerHTML = "";
  try {
    const r = await runLookup(p, d.value, mode);
    lastRecords.set(r.record_sha256, r);
    $("#result").innerHTML = renderCard(r);
    $$("#result [data-addrep]").forEach(paintAddBtn);
  } finally {
    btn.disabled = false;
    btn.textContent = "Buscar";
  }
}
$("#go").addEventListener("click", doSingle);
$("#query").addEventListener("keydown", (e) => { if (e.key === "Enter") doSingle(); });

$("#fromTab").addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  let url = tabs[0]?.url || "";
  if (url.startsWith("chrome-extension://")) {
    const all = await chrome.tabs.query({ url: ["https://www.instagram.com/*", "https://www.tiktok.com/*", "https://x.com/*", "https://twitter.com/*"] });
    url = all.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0]?.url || "";
  }
  const d = detect(url);
  if (!d.platform) return toast("Abre un perfil de Instagram, TikTok o X en la pestaña activa");
  setPlatform(d.platform);
  $(`input[name="mode"][value="${d.mode || "username"}"]`).checked = true;
  $("#query").value = d.value;
  doSingle();
});

// ---------- lotes ----------
let stopFlag = false;
let batchKeys = [];
$("#batchGo").addEventListener("click", async () => {
  const defP = $("#bPlatform").value;
  const defMode = $('input[name="bmode"]:checked').value;
  const lines = [...new Set($("#batchInput").value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];
  if (!lines.length) return;
  const items = lines.map((l) => {
    const d = detect(l);
    return { line: l, platform: d.platform || defP, value: d.value, mode: d.mode || defMode };
  });
  const userDelay = Math.max(1, Number($("#delay").value) || 3);
  const tbody = $("#batchTable tbody");
  tbody.innerHTML = "";
  batchKeys = [];
  $("#batchToReport").classList.add("hidden");
  $("#batchTable").classList.remove("hidden");
  $("#progress").classList.remove("hidden");
  $("#batchGo").disabled = true;
  $("#batchStop").disabled = false;
  stopFlag = false;
  let ok = 0, haltMsg = "";
  for (let i = 0; i < items.length && !stopFlag; i++) {
    const it = items[i];
    $("#batchStatus").textContent = `Consultando ${i + 1}/${items.length}: ${PLATFORMS[it.platform].label} · ${it.value}`;
    let r;
    if (it.platform === "tiktok" && it.mode === "id") {
      r = { platform: "tiktok", query: it.value, error: "ID → username no soportado en TikTok" };
    } else {
      r = await runLookup(it.platform, it.value, it.mode);
    }
    if (!r.error) { ok++; batchKeys.push(profileKey(r)); }
    const tr = document.createElement("tr");
    tr.innerHTML = r.error
      ? `<td>${netBadge(it.platform)}</td><td>${esc(it.value)}</td><td colspan="3" class="err">${esc(r.error)}</td>`
      : `<td>${netBadge(it.platform)}</td><td>${esc(it.value)}</td><td class="mono">${esc(r.id)}</td><td class="mono">${esc(r.username)}</td>
         <td><button class="ghost copy" data-copy="${esc(r.id)}">ID</button></td>`;
    tbody.appendChild(tr);
    $("#progress > div").style.width = `${((i + 1) / items.length) * 100}%`;
    if (r.error && /\(429\)/.test(r.error)) { haltMsg = "Detenido por límite de peticiones (429)."; break; }
    if (r.error && it.platform === "x" && /exige sesión|\(403\)/.test(r.error)) { haltMsg = "Detenido: X exige sesión o ha denegado el acceso."; break; }
    if (i < items.length - 1 && !stopFlag) await sleep(Math.max(userDelay, MIN_DELAY[it.platform]) * 1000);
  }
  $("#batchStatus").textContent = haltMsg ||
    `${stopFlag ? "Detenido" : "Terminado"}: ${ok} resueltas de ${tbody.children.length}. Guardado en el historial.`;
  if (batchKeys.length) {
    $("#batchToReport").textContent = `＋ Añadir los ${batchKeys.length} perfiles encontrados al informe`;
    $("#batchToReport").classList.remove("hidden");
  }
  $("#batchGo").disabled = false;
  $("#batchStop").disabled = true;
});
$("#batchStop").addEventListener("click", () => { stopFlag = true; });
$("#batchToReport").addEventListener("click", () => {
  batchKeys.forEach((k) => sel.add(k));
  saveSel();
  showTab("report");
  toast(`${batchKeys.length} perfiles añadidos al informe`);
});

// ---------- historial ----------
function renderHistCount(n) { $("#histCount").textContent = n ? `(${n})` : ""; }

async function filteredHistory() {
  const f = $("#histFilter").value.trim().toLowerCase();
  const net = $("#histNet").value;
  return (await getHistory()).filter((r) => (!net || r.platform === net) && (!f ||
    [r.username, r.id, r.query, r.case_ref, r.full_name].some((v) => String(v ?? "").toLowerCase().includes(f))));
}

async function renderHistory() {
  const h = await filteredHistory();
  $("#histList").innerHTML = h.length ? h.map((r) => `
    <div class="hist-item">
      <div>${netBadge(r.platform)}</div>
      <div>${r.error ? `<span class="muted">${esc(r.query)}</span>` : `@${esc(r.username)} <span class="id">${esc(r.id)}</span>`}</div>
      <div>${r.error ? '<span class="muted">error</span>' : `<button class="ghost addrep mini" data-addrep="${esc(profileKey(r))}"></button>`}</div>
      <div class="meta">${esc(r.timestamp_utc)} · ${esc(r.mode === "id" ? "ID→user" : "user→ID")}${r.case_ref ? " · " + esc(r.case_ref) : ""}${r.error ? " · " + esc(r.error) : ""}</div>
    </div>`).join("") : '<p class="muted">Sin consultas registradas.</p>';
  $$("#histList [data-addrep]").forEach(paintAddBtn);
}
$("#histFilter").addEventListener("input", renderHistory);
$("#histNet").addEventListener("change", renderHistory);

$("#clearHist").addEventListener("click", async () => {
  if (!confirm("¿Borrar todo el historial de consultas? Exporta antes si lo necesitas.")) return;
  await chrome.storage.local.set({ [HIST_KEY]: [] });
  sel.clear();
  saveSel();
  renderHistCount(0);
  renderHistory();
});

const CSV_COLS = ["timestamp_utc", "case_ref", "platform", "mode", "query", "id", "username", "full_name",
  "followers", "following", "posts", "likes", "is_private", "is_verified", "is_business", "category", "location",
  "created_at", "created_at_source", "id_derived_created_at", "external_url", "profile_url", "biography", "extra",
  "method", "session", "session_user_id", "photo_sha256", "photo_error", "record_sha256", "error", "tool"];
const csvCell = (v) => {
  let s = v != null && typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = "'" + s; // evita inyección de fórmulas en Excel
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function exportAs(kind) {
  const h = await filteredHistory();
  if (!h.length) return toast("Nada que exportar");
  const meta = { case_ref: $("#caseRef").value.trim() };
  const base = fileBase(meta);
  let hash;
  if (kind === "json") {
    const text = JSON.stringify({ tool: TOOL, exported_at_utc: new Date().toISOString(), case_ref: meta.case_ref || null, records: h.length, data: h }, null, 2);
    hash = await downloadWithHash(`${base}.json`, text, "application/json");
  } else {
    const text = "﻿" + [CSV_COLS.join(","), ...h.map((r) => CSV_COLS.map((c) => csvCell(r[c])).join(","))].join("\r\n");
    hash = await downloadWithHash(`${base}.csv`, text, "text/csv;charset=utf-8");
  }
  toast(`Exportado · SHA-256 ${hash.slice(0, 12)}…`);
}
$("#expJson").addEventListener("click", () => exportAs("json"));
$("#expCsv").addEventListener("click", () => exportAs("csv"));

// ---------- informe ----------
let onlySelected = false;
let visibleKeys = [];

async function renderReportList() {
  const profiles = uniqueProfiles(await getHistory());
  const known = new Set(profiles.map((p) => p.key));
  for (const k of [...sel]) if (!known.has(k)) sel.delete(k); // perfiles borrados del historial
  const f = $("#rSearch").value.trim().toLowerCase();
  const net = $("#rNet").value;
  const ref = $("#caseRef").value.trim();
  const onlyRef = $("#rOnlyRef").checked;
  const vis = profiles.filter(({ key, rec: r }) =>
    (!onlySelected || sel.has(key)) &&
    (!net || r.platform === net) &&
    (!onlyRef || (r.case_ref || "") === ref) &&
    (!f || [r.username, r.id, r.full_name, r.case_ref].some((v) => String(v ?? "").toLowerCase().includes(f))));
  visibleKeys = vis.map((p) => p.key);
  $("#rOnlySel").textContent = onlySelected ? "Ver todos" : "Seleccionados";
  $("#rList").innerHTML = vis.length ? vis.map(({ key, rec: r, count }) => `
    <div class="prow ${sel.has(key) ? "sel" : ""}" data-key="${esc(key)}">
      <input type="checkbox" ${sel.has(key) ? "checked" : ""} tabindex="-1">
      ${r.profile_pic_b64 ? `<img class="th" src="${r.profile_pic_b64}" alt="">` : '<span class="th none"></span>'}
      <div class="nm">${netBadge(r.platform)} <b>@${esc(r.username || "?")}</b> <span class="muted">${esc(r.full_name || "")}</span></div>
      <div class="pid">${esc(r.id)}</div>
      <div class="pm">Última consulta ${esc(shortDate(r.timestamp_utc))} UTC${r.case_ref ? ` · ${esc(r.case_ref)}` : ""}${count > 1 ? ` · ${count} consultas` : ""}${r.profile_pic_b64 ? "" : " · sin foto"}</div>
    </div>`).join("")
    : `<div class="empty">${profiles.length ? "Ningún perfil coincide con el filtro." : "Aún no hay perfiles consultados. Haz una consulta y aparecerán aquí."}</div>`;
  updateSelInfo(profiles);
}

function updateSelInfo(profiles) {
  const n = sel.size;
  const hidden = [...sel].filter((k) => !visibleKeys.includes(k)).length;
  const byNet = {};
  for (const p of profiles) if (sel.has(p.key)) byNet[p.rec.platform] = (byNet[p.rec.platform] || 0) + 1;
  const parts = Object.entries(byNet).map(([k, v]) => `${v} ${PLATFORMS[k].label}`).join(", ");
  $("#rSelInfo").innerHTML = n
    ? `<b>${n}</b> perfil${n > 1 ? "es" : ""} en el informe (${esc(parts)})${hidden ? ` · ${hidden} oculto${hidden > 1 ? "s" : ""} por el filtro` : ""}`
    : "Ningún perfil seleccionado. Márcalos en la lista o usa «＋ Añadir al informe» en Consulta, Lotes o Historial.";
  $("#rHtml").disabled = $("#rTxt").disabled = !n;
  $("#rHtml").textContent = n ? `Abrir informe HTML (${n})` : "Abrir informe HTML";
  $("#repCount").textContent = n || "";
}

$("#rList").addEventListener("click", (e) => {
  const row = e.target.closest(".prow");
  if (!row) return;
  const on = toggleSel(row.dataset.key);
  row.classList.toggle("sel", on);
  row.querySelector("input").checked = on;
  getHistory().then((h) => updateSelInfo(uniqueProfiles(h)));
});
$("#rSearch").addEventListener("input", renderReportList);
$("#rNet").addEventListener("change", renderReportList);
$("#rOnlyRef").addEventListener("change", renderReportList);
$("#rOnlySel").addEventListener("click", () => { onlySelected = !onlySelected; renderReportList(); });
$("#rAll").addEventListener("click", () => { visibleKeys.forEach((k) => sel.add(k)); saveSel(); renderReportList(); });
$("#rNone").addEventListener("click", () => { sel.clear(); saveSel(); onlySelected = false; renderReportList(); });

function reportOptions() {
  return {
    case_ref: $("#caseRef").value.trim(),
    unit: $("#rUnit").value.trim(),
    investigator: $("#rInv").value.trim(),
    notes: $("#rNotes").value.trim(),
    profileKeys: [...sel],
    allQueries: $("#rAllQ").checked,
    includeErrors: $("#rErrors").checked,
    includePhotos: $("#rPhotos").checked,
  };
}
async function saveReportPrefs() {
  const o = reportOptions();
  await persist("reportPrefs", { unit: o.unit, investigator: o.investigator, allQueries: o.allQueries,
    includeErrors: o.includeErrors, includePhotos: o.includePhotos });
}
["#rUnit", "#rInv", "#rAllQ", "#rErrors", "#rPhotos"].forEach((s) => $(s).addEventListener("change", saveReportPrefs));

$("#rHtml").addEventListener("click", async () => {
  if (!sel.size) return;
  await saveReportPrefs();
  await persist("reportOptions", reportOptions());
  chrome.tabs.create({ url: chrome.runtime.getURL("report/report.html") });
});
$("#rTxt").addEventListener("click", async () => {
  if (!sel.size) return;
  await saveReportPrefs();
  const o = reportOptions();
  const s = selectRecords(await getHistory(), o);
  const meta = { ...o, tool: TOOL };
  const hash = await downloadWithHash(`${fileBase(meta)}.txt`, await buildTxt(s, meta), "text/plain;charset=utf-8");
  toast(`TXT exportado · SHA-256 ${hash.slice(0, 12)}…`);
});

// ---------- arranque ----------
$("#openTab").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("ui/popup.html?full=1") });
  window.close();
});
if (new URLSearchParams(location.search).has("full")) {
  document.body.classList.add("full");
  $("#openTab").classList.add("hidden");
}

(async () => {
  const st = await chrome.storage.local.get(["caseRef", "lastPlatform", "reportPrefs", SEL_KEY]);
  $("#caseRef").value = st.caseRef || "";
  $("#caseRef").addEventListener("change", () => {
    persist("caseRef", $("#caseRef").value.trim());
    if ($("#tab-report").classList.contains("active")) renderReportList();
  });
  setPlatform(st.lastPlatform && PLATFORMS[st.lastPlatform] ? st.lastPlatform : "instagram");
  const rp = st.reportPrefs || {};
  if (rp.unit) $("#rUnit").value = rp.unit;
  if (rp.investigator) $("#rInv").value = rp.investigator;
  if (rp.allQueries != null) $("#rAllQ").checked = rp.allQueries;
  if (rp.includeErrors != null) $("#rErrors").checked = rp.includeErrors;
  if (rp.includePhotos != null) $("#rPhotos").checked = rp.includePhotos;
  (st[SEL_KEY] || []).forEach((k) => sel.add(k));
  $("#repCount").textContent = sel.size || "";

  renderHistCount((await getHistory()).length);
  $("#query").focus();

  const s = await chrome.runtime.sendMessage({ type: "sessions" });
  $("#sessions").innerHTML = Object.entries(PLATFORMS).map(([k, P]) => {
    const on = s?.[k]?.loggedIn;
    const tip = on
      ? `${P.label}: sesión activa${s[k].sessionUserId ? ` (cuenta ID ${s[k].sessionUserId})` : ""}. Las consultas quedan asociadas a ella.`
      : `${P.label}: sin sesión${k === "x" ? " — X la necesita" : ""}`;
    return `<span class="pill ${on ? "on" : "off"}" title="${esc(tip)}">${P.short}</span>`;
  }).join("");
})();
