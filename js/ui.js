"use strict";
// ---- свёрнутые блоки: что выбрано + помним, открыт ли ----
function accSums() {
  const sp = document.querySelector("#subPresets .preset.on");
  $("subsSum").textContent = "· " + (sp ? SUB_PRESETS[sp.dataset.p][0] : "свой стиль") + ($("ovOn").checked ? "" : " (на превью выключены)");
  const gp = document.querySelector("#gChips .chip.on");
  $("gradeSum").textContent = "· " + (gp ? G_PRESETS[gp.dataset.gp][0].replace(/^[^\p{L}]+/u, "") : "свои настройки");
}
// шаги 2 и 3: сколько текста и сколько озвучено — видно и в свёрнутом виде
function stepSums() {
  const sc = LANGS.map((l) => [l, plainText(S.script[l], l).replace(/\s+/g, " ").trim().length]).filter(([, n]) => n).map(([l, n]) => `${l.toUpperCase()} ${n} симв.`);
  $("scriptSum").textContent = "· " + (sc.length ? sc.join(", ") : "пусто");
  const vo = LANGS.map((l) => { const w = S.cues.filter((c) => c[l].trim()); return w.length ? `${l.toUpperCase()} ${w.filter((c) => voiceFresh(c, l)).length} из ${w.length}` : ""; }).filter(Boolean);
  $("voiceSum").textContent = "· " + (vo.length ? "озвучено " + vo.join(", ") : "ещё не озвучено");
}
// шаг 6: что получится
function renderSum() {
  const res = $("rRes").value === "src" ? "как у исходника" : $("rRes").selectedOptions[0].text;
  $("renderSum").textContent = `· ${$("rVoice").selectedOptions[0].text.split(" — ")[0]}, ${res}`;
}
["rVoice", "rRes"].forEach((id) => $(id).addEventListener("change", renderSum));
renderSum();
for (const id of ["scriptAcc", "voiceAcc", "musicAcc", "subsAcc", "gradeAcc", "renderAcc", "voicesBox"]) {
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

// ---- ползунки под галочкой: на телефоне их легко задеть пальцем, пока листаешь ----
// «Голоса и эффекты» — своя галочка слева у каждого ползунка (карточки голосов пересоздаются — следим за новыми)
function lockRange(r) {
  if (r.dataset.lock) return;
  r.dataset.lock = "1"; r.disabled = true;
  const cb = document.createElement("input"); cb.type = "checkbox"; cb.className = "rlock"; cb.title = "Разрешить менять";
  cb.addEventListener("change", () => { r.disabled = !cb.checked; });
  const lab = r.previousElementSibling?.matches("label") ? r.previousElementSibling : null;
  (lab || r.parentElement).prepend(cb);
}
const lockAll = () => $("voicesBox").querySelectorAll("input[type=range]").forEach(lockRange);
new MutationObserver(lockAll).observe($("voicesBox"), { childList: true, subtree: true });
lockAll();
// «Субтитры» — одна галочка на все ползунки блока
const subRanges = () => $("subsAcc").querySelectorAll("input[type=range]");
$("subUnlock").addEventListener("change", () => subRanges().forEach((r) => { r.disabled = !$("subUnlock").checked; }));
subRanges().forEach((r) => { r.disabled = true; });

// ---- шапка: меню «Ключ» и «Проект» закрываются касанием мимо них и после выбора пункта ----
document.addEventListener("click", (e) => { document.querySelectorAll("details.menu[open]").forEach((d) => { if (!d.contains(e.target)) d.open = false; }); });
document.querySelectorAll("#projMenu .mi").forEach((b) => b.addEventListener("click", () => { $("projMenu").open = false; }));
$("projClear").onclick = () => $("clearProj").click();
function keyPill(bal) {
  const k = $("key").value.trim();
  $("keyPill").classList.toggle("nokey", !k); $("keyPill").classList.toggle("ok", !!k);
  $("keyPillT").textContent = !k ? "Ввести ключ" : bal != null ? `${Math.floor(bal)} ₽` : "Ключ";
}
$("key").addEventListener("input", () => keyPill());
