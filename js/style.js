"use strict";
// ================= Стиль видео (цвет) =================
const G_DEF = { gB: 100, gC: 100, gS: 100, gT: 0, gTint: "#ff3d8b", gTA: 0, gSep: 0, gSh: 0, gVig: 0, gGr: 0, gBars: "none", gFade: false };
const G_PRESETS = {
  none: ["Без обработки", {}],
  cinema: ["🎬 Кинематограф", { gC: 112, gS: 88, gB: 97, gT: 8, gTint: "#00a5b5", gTA: 12, gVig: 38, gGr: 10, gSh: 15, gBars: "2.39", gFade: true }],
  vice: ["🌴 Вайс-Сити закат", { gB: 102, gC: 106, gS: 128, gT: 22, gTint: "#ff3d8b", gTA: 18, gVig: 22, gSh: 10 }],
  gta: ["🎮 Сочно, как GTA", { gC: 118, gS: 122, gT: 8, gSh: 25, gVig: 15 }],
  cold: ["🧊 Холодный триллер", { gB: 97, gC: 112, gS: 78, gT: -28, gVig: 32, gSh: 10 }],
  noir: ["🕶 Нуар Ч/Б", { gS: 0, gC: 130, gB: 96, gVig: 48, gGr: 24, gSh: 15 }],
  vintage: ["📼 Винтаж 80-х", { gC: 92, gS: 82, gSep: 28, gT: 14, gVig: 30, gGr: 32, gFade: true }],
  vivid: ["✨ Яркий", { gC: 108, gS: 138, gB: 103, gSh: 20 }],
  dream: ["☁ Мечта", { gB: 106, gC: 90, gS: 110, gTint: "#ffc0e0", gTA: 20, gVig: 18 }],
  matrix: ["🟩 Матрица", { gC: 115, gS: 70, gTint: "#33ff77", gTA: 24, gVig: 30, gGr: 10 }],
  drama: ["🎭 Драма", { gC: 126, gS: 88, gB: 94, gVig: 52, gSh: 15, gBars: "2", gFade: true }],
  sharp: ["🔍 Чётче (старое видео)", { gSh: 45, gC: 104, gS: 105 }],
};
const G_IDS = Object.keys(G_DEF);
SET_IDS.push(...G_IDS);
$("gChips").innerHTML = Object.entries(G_PRESETS).map(([k, [n]]) => `<button class="chip" data-gp="${k}">${n}</button>`).join("");
const gradeOf = () => { const o = {}; for (const k of G_IDS) { const el = $(k); o[k] = el.type === "checkbox" ? el.checked : el.tagName === "SELECT" || el.type === "color" ? el.value : +el.value; } return o; };
const gradeNeutral = (g = gradeOf()) => G_IDS.every((k) => k === "gTint" || g[k] === G_DEF[k]);
const gradeCss = (g) => [g.gSh ? "url(#voSharp)" : "", g.gB !== 100 ? `brightness(${g.gB / 100})` : "", g.gC !== 100 ? `contrast(${g.gC / 100})` : "",
  g.gS !== 100 ? `saturate(${g.gS / 100})` : "", g.gSep ? `sepia(${g.gSep / 100})` : ""].filter(Boolean).join(" ") || "none";
const tempColor = (t) => (t > 0 ? "#ff8a2a" : "#2a8cff");
const barH = (g, W, H) => { const r = +g.gBars; return r && W / H > 1.3 && W / H < r ? Math.round((H - W / r) / 2) : 0; };
const fadeA = (g, t, dur) => (g.gFade ? clamp(Math.min(t / 0.7, (dur - t) / 0.7), 0, 1) : 1);
let grainTile = null;
function grainCanvas() {
  if (grainTile) return grainTile;
  grainTile = document.createElement("canvas"); grainTile.width = grainTile.height = 256;
  const x = grainTile.getContext("2d"), im = x.createImageData(256, 256);
  for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0); return grainTile;
}
function setSharp(g) {
  const a = g.gSh / 100 * 0.9;
  $("voSharpM").setAttribute("kernelMatrix", `0 ${-a} 0 ${-a} ${1 + 4 * a} ${-a} 0 ${-a} 0`);
}
// превью: CSS-фильтр на видео + слои поверх (так же смешиваются, как в рендере)
function applyGradePreview() {
  const g = gradeOf(), sc = $("screen"), L = (c) => sc.querySelector(c);
  setSharp(g);
  V.style.filter = gradeCss(g) === "none" ? "" : gradeCss(g);
  Object.assign(L(".g-temp").style, { background: tempColor(g.gT), opacity: Math.abs(g.gT) / 100 * 0.7 });
  Object.assign(L(".g-tint").style, { background: g.gTint, opacity: g.gTA / 100 * 1.2 });
  L(".g-vig").style.background = g.gVig ? `radial-gradient(circle farthest-corner at center, transparent 45%, rgba(0,0,0,${g.gVig / 100 * 0.85}) 100%)` : "none";
  const gr = L(".g-grain");
  if (g.gGr) { if (!gr.style.backgroundImage) gr.style.backgroundImage = `url(${grainCanvas().toDataURL()})`; gr.style.opacity = g.gGr / 100 * 0.5; } else gr.style.opacity = 0;
  const r = sc.getBoundingClientRect(), bh = barH(g, r.width, r.height);
  sc.querySelectorAll(".g-bar").forEach((b) => b.style.height = bh + "px");
  gradeTick();
}
function gradeTick() {
  const g = gradeOf(), sc = $("screen");
  sc.querySelector(".g-fade").style.opacity = 1 - fadeA(g, V.currentTime || 0, S.dur || 1);
  if (g.gGr) sc.querySelector(".g-grain").style.backgroundPosition = `${(Math.random() * 256) | 0}px ${(Math.random() * 256) | 0}px`;
}
// рендер: тот же порядок — фильтр при отрисовке кадра, затем слои
function gradeFrame(cx, W, H, t, dur, g) {
  if (Math.abs(g.gT) > 0) { cx.globalCompositeOperation = "soft-light"; cx.globalAlpha = Math.abs(g.gT) / 100 * 0.7; cx.fillStyle = tempColor(g.gT); cx.fillRect(0, 0, W, H); }
  if (g.gTA) { cx.globalCompositeOperation = "soft-light"; cx.globalAlpha = Math.min(1, g.gTA / 100 * 1.2); cx.fillStyle = g.gTint; cx.fillRect(0, 0, W, H); }
  cx.globalCompositeOperation = "source-over"; cx.globalAlpha = 1;
  if (g.gVig) {
    const R = Math.hypot(W, H) / 2, gr = cx.createRadialGradient(W / 2, H / 2, R * 0.45, W / 2, H / 2, R);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, `rgba(0,0,0,${g.gVig / 100 * 0.85})`);
    cx.fillStyle = gr; cx.fillRect(0, 0, W, H);
  }
  if (g.gGr) {
    cx.save(); cx.globalCompositeOperation = "overlay"; cx.globalAlpha = g.gGr / 100 * 0.5;
    const k = Math.max(1, Math.round(Math.min(W, H) / 720)), pat = cx.createPattern(grainCanvas(), "repeat");
    cx.translate(-Math.random() * 256 * k, -Math.random() * 256 * k); cx.scale(k, k); cx.fillStyle = pat; cx.fillRect(0, 0, W / k + 512, H / k + 512);
    cx.restore();
  }
  const bh = barH(g, W, H);
  if (bh) { cx.fillStyle = "#000"; cx.fillRect(0, 0, W, bh); cx.fillRect(0, H - bh, W, bh); }
  const fa = fadeA(g, t, dur);
  if (fa < 1) { cx.fillStyle = `rgba(0,0,0,${1 - fa})`; cx.fillRect(0, 0, W, H); }
}
function gLabels() {
  const g = gradeOf();
  $("gBV").textContent = g.gB + "%"; $("gCV").textContent = g.gC + "%"; $("gSV").textContent = g.gS + "%";
  $("gTV").textContent = g.gT === 0 ? "0" : (g.gT > 0 ? "теплее +" : "холоднее ") + g.gT;
  $("gTAV").textContent = g.gTA + "%"; $("gSepV").textContent = g.gSep + "%"; $("gShV").textContent = g.gSh + "%"; $("gVigV").textContent = g.gVig + "%"; $("gGrV").textContent = g.gGr + "%";
  const p = Object.entries(G_PRESETS).find(([, [, o]]) => { const f = { ...G_DEF, ...o }; return G_IDS.every((k) => (k === "gTint" && !f.gTA) || f[k] === g[k]); });
  document.querySelectorAll("#gChips .chip").forEach((b) => b.classList.toggle("on", !!p && b.dataset.gp === p[0]));
}
function setGrade(o) {
  const f = { ...G_DEF, ...o };
  for (const k of G_IDS) { const el = $(k); if (el.type === "checkbox") el.checked = f[k]; else el.value = f[k]; }
  gChanged();
}
function gChanged() { gLabels(); applyGradePreview(); saveSet(); if (typeof rInfo === "function") rInfo(); paintPreviews(); accSums(); }
G_IDS.forEach((id) => $(id).addEventListener("input", gChanged));
$("gChips").onclick = (e) => { const b = e.target.closest("[data-gp]"); if (b) setGrade(G_PRESETS[b.dataset.gp][1]); };
$("gReset").onclick = () => setGrade({});
const cmp = $("gCompare");
cmp.addEventListener("pointerdown", () => { $("screen").classList.add("compare-hold"); $("gradeCard").classList.add("cmp"); paintPreviews(); });
["pointerup", "pointerleave", "pointercancel"].forEach((ev) => cmp.addEventListener(ev, () => { $("screen").classList.remove("compare-hold"); $("gradeCard").classList.remove("cmp"); paintPreviews(); }));
