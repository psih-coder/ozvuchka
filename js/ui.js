"use strict";
// ---- свёрнутые блоки: что выбрано + помним, открыт ли ----
function accSums() {
  const sp = document.querySelector("#subPresets .preset.on");
  $("subsSum").textContent = "· " + (sp ? SUB_PRESETS[sp.dataset.p][0] : "свой стиль") + ($("ovOn").checked ? "" : " (на превью выключены)");
  const gp = document.querySelector("#gChips .chip.on");
  $("gradeSum").textContent = "· " + (gp ? G_PRESETS[gp.dataset.gp][0].replace(/^[^\p{L}]+/u, "") : "свои настройки");
}
for (const id of ["subsAcc", "gradeAcc", "voicesBox"]) {
  $(id).open = !!LS.get("vo-acc", {})[id];
  $(id).addEventListener("toggle", () => { const o = LS.get("vo-acc", {}); o[id] = $(id).open; LS.set("vo-acc", o); if ($(id).open) requestAnimationFrame(paintPreviews); });
}

// ---- на весь экран ----
const fsReal = () => document.fullscreenElement === $("screen") || document.webkitFullscreenElement === $("screen");
const fsOn = () => fsReal() || $("screen").classList.contains("fsfake");
// если браузер не даёт настоящий полный экран (iPhone, встроенные браузеры) — растягиваем на всё окно, субтитры остаются
function fakeFs(on) {
  $("screen").classList.toggle("fsfake", on); document.body.classList.toggle("fsbody", on);
  fitLayers(); requestAnimationFrame(() => { drawOverlay(); applyGradePreview(); });
}
$("fsBtn").onclick = async (e) => {
  e.stopPropagation();
  const el = $("screen");
  if ($("screen").classList.contains("fsfake")) return fakeFs(false);
  if (fsReal()) { try { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch {} return; }
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
    try {
      // некоторые браузеры молча не открывают полный экран — ждём не дольше секунды
      await Promise.race([req.call(el, { navigationUI: "hide" }), new Promise((res) => setTimeout(res, 1000))]);
      if (fsReal()) { try { await screen.orientation.lock(curAR() === "16:9" ? "landscape" : "portrait"); } catch {} return; }
    } catch {}
  }
  fakeFs(true);
};
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("screen").classList.contains("fsfake")) fakeFs(false); });
// в полноэкранном режиме субтитры и слои стиля — ровно поверх картинки, а не поверх чёрных полос
function fitLayers() {
  const on = fsOn(), cv = $("subCan"), gr = $("grade");
  if (!on) { for (const el of [cv, gr]) Object.assign(el.style, { left: "", top: "", width: "", height: "" }); $("fsBtn").textContent = "⛶"; return; }
  const [a, b] = curAR().split(":").map(Number), ar = a / b, W = innerWidth, H = innerHeight;
  let w = W, h = W / ar; if (h > H) { h = H; w = H * ar; }
  for (const el of [cv, gr]) Object.assign(el.style, { left: (W - w) / 2 + "px", top: (H - h) / 2 + "px", width: w + "px", height: h + "px" });
  $("fsBtn").textContent = "✕";
}
["fullscreenchange", "webkitfullscreenchange"].forEach((ev) => document.addEventListener(ev, () => { fitLayers(); requestAnimationFrame(() => { drawOverlay(); applyGradePreview(); }); }));
window.addEventListener("resize", () => { if (fsOn()) fitLayers(); paintPreviews(); });
