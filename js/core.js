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

// ---- длина слова «на слух»: числа звучат длиннее, чем пишутся («1866» — «тысяча восемьсот шестьдесят шесть») ----
const letters = (s) => (s.match(/[\p{L}\p{N}]/gu) || []).length;
const NUMW = {
  ru: {
    one: ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"],
    teen: ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"],
    ten: ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"],
    hun: ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"],
    sc: [null, ["тысяча", "тысячи", "тысяч"], ["миллион", "миллиона", "миллионов"], ["миллиард", "миллиарда", "миллиардов"]],
    zero: "ноль", point: "целых", frac: "десятых",
    sym: { "%": "процентов", "$": "долларов", "€": "евро", "£": "фунтов", "₽": "рублей", "№": "номер", "°": "градусов", "+": "плюс" }, k: "тысяч",
  },
  en: {
    one: ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"],
    teen: ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"],
    ten: ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"],
    hun: null, sc: [null, "thousand", "million", "billion"],
    zero: "zero", point: "point", frac: "",
    sym: { "%": "percent", "$": "dollars", "€": "euros", "£": "pounds", "₽": "rubles", "№": "number", "°": "degrees", "+": "plus" }, k: "thousand",
  },
};
const numL = (l) => NUMW[l] || NUMW.en;
// 0…999 словами
function words3(n, l) {
  const W = numL(l), h = Math.floor(n / 100), t = Math.floor(n / 10) % 10, o = n % 10, out = [];
  if (h) out.push(W.hun ? W.hun[h] : W.one[h] + " hundred");
  if (t === 1) out.push(W.teen[o]); else { if (t) out.push(W.ten[t]); if (o) out.push(W.one[o]); }
  return out.join(" ");
}
// целое число словами (как его скажет голос); длинные и с нулём впереди — по цифрам
function numWords(s, l) {
  const W = numL(l);
  if (s.length > 12 || (s.length > 1 && s[0] === "0")) return [...s].map((d) => (d === "0" ? W.zero : W.one[+d])).join(" ");
  const n = +s;
  if (!n) return W.zero;
  // английские годы читаются парами: 1866 — eighteen sixty-six
  if (l === "en" && s.length === 4 && ((n >= 1100 && n < 2000) || n >= 2010) && n % 1000 >= 10) return n % 100 ? words3(Math.floor(n / 100), l) + " " + words3(n % 100, l) : words3(Math.floor(n / 100), l) + " hundred";
  const out = [];
  for (let g = 3, rest = n; g >= 0; g--) {
    const v = Math.floor(rest / 1000 ** g) % 1000; if (!v) continue;
    if (!g) { out.push(words3(v, l)); continue; }
    const sc = W.sc[g];
    if (Array.isArray(sc)) { const d = v % 10, dd = v % 100, f = dd >= 11 && dd <= 14 ? 2 : d === 1 ? 0 : d >= 2 && d <= 4 ? 1 : 2; out.push((v === 1 && g === 1 ? "" : words3(v, l) + " ") + sc[f]); }
    else out.push(words3(v, l) + " " + sc);
  }
  return out.join(" ");
}
const wordsLen = (s) => letters(s) + Math.max(0, s.split(" ").filter(Boolean).length - 1);
// слово → сколько «букв» оно занимает в речи; без цифр и знаков — просто буквы
function spoken(w, l = "ru") {
  w = String(w);
  const W = numL(l);
  let n = 0;
  for (const ch of w) if (W.sym[ch]) n += W.sym[ch].length + 1;
  if (!/\d/.test(w)) return letters(w) + n;
  let s = w.replace(/[\u00a0\u202f\u2009]/g, "");
  if (l === "en") s = s.replace(/(\d),(?=\d{3}(?!\d))/g, "$1");   // 1,000,000
  // «000» после «1» (1 000 000 написано через пробел) — это слово «тысяч», а не «ноль ноль ноль»
  if (/^0\d\d$/.test(s)) return W.k.length + 1 + (+s ? wordsLen(numWords(String(+s), l)) + 1 : 0) + n;
  s = s.replace(/(\d+)[.,](\d+)/g, (m, a, b) => ` ${numWords(a, l)} ${W.point} ${l === "en" ? [...b].map((d) => numWords(d, l)).join(" ") : numWords(b, l) + " " + W.frac} `);
  s = s.replace(/(\d+)[кkK](?![\p{L}])/gu, (m, a) => ` ${numWords(a, l)} ${W.k} `);
  s = s.replace(/\d+/g, (m) => ` ${numWords(m, l)} `);
  return wordsLen(s.trim()) + n;
}
// длина текста «на слух» в знаках — для оценки, сколько секунд займёт голос
const sayLen = (t, l) => { t = String(t).replace(/\s+/g, " ").trim(); let n = t.length; for (const w of t.split(" ")) if (/[\d%$€£₽№°]/.test(w)) n += spoken(w, l) - w.length; return n; };
