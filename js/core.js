"use strict";
const $ = (id) => document.getElementById(id);
const LANGS = ["ru", "en"];
const LN = { ru: "русский", en: "английский (English)" };
const CPS = { ru: 13.5, en: 15 };          // сколько символов голос произносит за секунду
const STOP = new Error("Остановлено");
const CANCEL = new Error("Отменено");
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const n1 = (x) => (+x).toFixed(1).replace(".", ",");
function fmt(t, d = 1) {
  if (!isFinite(t)) t = 0;
  const k = 10 ** d; t = Math.round(Math.max(0, t) * k) / k;
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t - h * 3600 - m * 60;
  const ss = s.toFixed(d).padStart(d ? 3 + d : 2, "0");
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + ss;
}
function parseTime(str) {
  str = String(str).trim().replace(",", ".");
  if (!/^\d+(:\d{1,2})*(\.\d+)?$/.test(str)) return NaN;
  return str.split(":").map(Number).reduce((a, p) => a * 60 + p, 0);
}
function srtTime(t) {
  const ms = Math.round(Math.max(0, t) * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}
let toastT;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600); }
function say(id, m, cls = "") { const el = $(id); el.textContent = m; el.style.color = cls === "err" ? "var(--err)" : cls === "ok" ? "var(--ok)" : ""; }
function downloadBlob(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}
const once = (el, ev) => new Promise((res, rej) => {
  const ok = () => { off(); res(); }, bad = () => { off(); rej(new Error("Браузер не смог открыть это видео. Попробуйте mp4 (H.264).")); };
  const off = () => { el.removeEventListener(ev, ok); el.removeEventListener("error", bad); };
  el.addEventListener(ev, ok); el.addEventListener("error", bad);
});
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
function logTo(ul, text, cls = "run") {
  const li = document.createElement("li"); li.className = cls; li.textContent = (cls === "run" ? "⏳ " : cls === "ok" ? "✔ " : cls === "err" ? "✖ " : cls === "warn" ? "⚠ " : "") + text;
  $(ul).appendChild(li); return li;
}
const done = (li, text, cls = "ok") => { li.className = cls; li.textContent = (cls === "ok" ? "✔ " : "⚠ ") + text; };
