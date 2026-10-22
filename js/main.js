"use strict";
// ================= Проект =================
$("projSave").onclick = () => {
  if (!S.cues.length) return toast("Нечего сохранять — нет реплик");
  downloadBlob(new Blob([JSON.stringify(projData(), null, 1)], { type: "application/json" }), `${baseName()}_озвучка.json`);
};
$("projOpen").onclick = () => $("projInput").click();
$("projInput").onchange = async (e) => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; try { loadProj(JSON.parse(await f.text())); } catch (er) { toast(er.message || "Не удалось открыть проект"); } };

// ================= Старт =================
initVoices(); restoreSet(); vLabels(); applyAR(); aiCostHint(); subPosLoad(); afLabels(); edShow(edCur);
if (!SUB_PRESETS[LS.get("vo-subpreset", "yellow")]) LS.set("vo-subpreset", "yellow"); gLabels(); applyGradePreview();
document.querySelector(`.preset[data-p="${LS.get("vo-subpreset", "yellow")}"]`)?.classList.add("on");
accSums();
loadSubFonts().then(drawOverlay);
window.addEventListener("resize", () => { drawOverlay(); applyGradePreview(); });
(function () {
  const p = LS.get("vo-project", null);
  if (p?.cues?.length) { try { loadProj(p, true); hist.length = 0; if (p.video?.name) toast(`Восстановлен проект «${p.video.name}»: ${p.cues.length} реплик. Загрузите это видео.`); } catch {} }
  else renderAll();
})();
