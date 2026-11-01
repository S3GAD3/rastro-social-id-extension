import { selectRecords, buildHtml, buildTxt, fileBase, downloadWithHash } from "../lib/report.js";

const $ = (s) => document.querySelector(s);

(async () => {
  const st = await chrome.storage.local.get(["history", "reportOptions"]);
  const opts = st.reportOptions || {};
  const meta = { ...opts, tool: `Rastro ID v${chrome.runtime.getManifest().version}` };
  const sel = selectRecords(st.history || [], opts);
  const html = await buildHtml(sel, meta);

  const frame = $("#doc");
  frame.srcdoc = html;
  frame.addEventListener("load", () => {
    frame.style.height = frame.contentDocument.documentElement.scrollHeight + 40 + "px";
  });
  $("#info").textContent = `${sel.profiles.length} perfiles${sel.errors.length ? ` · ${sel.errors.length} sin resultado` : ""}${opts.case_ref ? ` · ${opts.case_ref}` : ""}`;
  if (opts.case_ref) document.title = `Informe ${opts.case_ref} · Rastro ID`;

  const base = fileBase(meta);
  $("#print").addEventListener("click", () => frame.contentWindow.print());
  $("#dlHtml").addEventListener("click", async () => {
    const h = await downloadWithHash(`${base}.html`, html, "text/html;charset=utf-8");
    $("#hash").textContent = `SHA-256 ${base}.html: ${h}`;
  });
  $("#dlTxt").addEventListener("click", async () => {
    const txt = await buildTxt(sel, meta);
    const h = await downloadWithHash(`${base}.txt`, txt, "text/plain;charset=utf-8");
    $("#hash").textContent = `SHA-256 ${base}.txt: ${h}`;
  });
})();
