"use strict";
// ================= Проект =================
$("projSave").onclick = () => {
  if (!S.cues.length) return toast("Нечего сохранять — нет реплик");
  downloadBlob(new Blob([JSON.stringify(projData(), null, 1)], { type: "application/json" }), `${baseName()}_озвучка.json`);
};
$("projOpen").onclick = () => $("projInput").click();
$("projInput").onchange = async (e) => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; try { loadProj(JSON.parse(await f.text())); } catch (er) { toast(er.message || "Не удалось открыть проект"); } };
// очистить проект: видео, сценарий, фразы, озвучка (и её кэш), субтитры; голоса, ключ и настройки стиля остаются
$("clearProj").onclick = async () => {
  if (!confirm("Очистить проект?\n\nУдалятся видео, сценарий RU и EN, «о чём видео», фразы, вся озвучка (и её копия в памяти браузера — повторная озвучка будет платной), субтитры и музыка.\n\nГолоса, «Мои голоса», ключ Polza и настройки стиля останутся.")) return;
  clearTimeout(saveT); S.vStop = S.aiStop = S.sStop = true;
  try { localStorage.removeItem("vo-project"); } catch {}
  const o = LS.get("vo-settings", {}); for (const k of ["scFrom", "scTo", "aiCtx"]) delete o[k]; LS.set("vo-settings", o);
  try { const db = await idb(); await new Promise((res) => { const t = db.transaction("clips", "readwrite"); t.objectStore("clips").clear(); t.oncomplete = t.onerror = t.onabort = res; }); } catch {}
  mem.clear(); await mdbPut(null);
  location.reload();
};

// ================= Старт =================
initVoices(); restoreSet(); keyPill(); vLabels(); applyAR(); aiCostHint(); subPosLoad(); afLabels(); edShow(edCur);
if (!SUB_PRESETS[LS.get("vo-subpreset", "yellow")]) LS.set("vo-subpreset", "yellow"); gLabels(); applyGradePreview();
document.querySelector(`.preset[data-p="${LS.get("vo-subpreset", "yellow")}"]`)?.classList.add("on");
accSums();
loadSubFonts().then(drawOverlay);
window.addEventListener("resize", () => { drawOverlay(); applyGradePreview(); });
(function () {
  const p = LS.get("vo-project", null);
  if (p?.cues?.length) { try { loadProj(p, true); hist.length = 0; if (p.video?.name) toast(`Восстановлен проект «${p.video.name}»: ${p.cues.length} реплик. Загрузите это видео.`); } catch {} }
  else { renderAll(); if (p?.music) for (const k of M_KEYS) if (p.music[k] != null) M[k] = p.music[k]; }
  restoreMusic();
})();
