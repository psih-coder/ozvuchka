"use strict";
// ================= Состояние =================
const V = $("vid");
const S = { ver: 0, file: null, url: "", name: "", dur: 0, w: 0, h: 0, arAuto: "16:9", cues: [], sel: null, nextId: 1, aiStop: false, vStop: false, tab: "manual" };
const newCue = (start, end = null) => ({ id: S.nextId++, start, end, ru: "", en: "", prompt: "", vp: { ru: null, en: null }, v: { ru: null, en: null } });
// голоса (их может быть сколько угодно); у каждого свой язык
let VOICES = [];
const prof = (pid) => VOICES.find((v) => v.id === pid);
const voicesOf = (l) => VOICES.filter((v) => v.lang === l);
const pidFor = (c, l) => { const p = c.vp?.[l]; return p && prof(p)?.lang === l ? p : voicesOf(l)[0]?.id || null; };
const sortCues = () => S.cues.sort((a, b) => a.start - b.start || a.id - b.id);
const cueById = (id) => S.cues.find((c) => c.id === +id);
const num = (c) => S.cues.indexOf(c) + 1;
const totalDur = () => S.dur || Math.max(60, ...S.cues.map((c) => (c.end ?? c.start) + 5));
function effEnd(c) {
  if (c.end != null) return c.end;
  const n = S.cues[S.cues.indexOf(c) + 1];
  return n ? Math.max(c.start, n.start) : Math.max(c.start + 0.5, totalDur());
}
const slotOf = (c) => Math.max(0, effEnd(c) - c.start);
const baseSpeed = () => +$("vSpeed").value;
const estDur = (c, l) => sayLen(c[l], l) / CPS[l] / baseSpeed();
const voiceKey = (c, l) => { const o = vset(pidFor(c, l)); return [o.model, o.voice, o.style, c[l].trim()].concat(o.extra ? [o.extra] : []).join("¦"); };
const voiceFresh = (c, l) => c.v[l] && c.v[l].key === voiceKey(c, l);
const overlaps = (c) => { const i = S.cues.indexOf(c), p = S.cues[i - 1]; return p && p.end != null && p.end > c.start + 0.01; };

// отмена
const hist = [];
function snap() { S.handEdited = true; hist.push(S.cues.map((c) => ({ ...c }))); if (hist.length > 100) hist.shift(); }
function undo() { const h = hist.pop(); if (!h) return toast("Нечего отменять"); S.cues = h; renderAll(); save(); toast("Отменено"); }

// ================= Сохранение =================
let saveT;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => LS.set("vo-project", projData()), 300);
}
function projData() {
  return { app: "voiceover", ver: 2, video: { name: S.name, dur: S.dur }, script: S.script, builtSig: S.builtSig || null, handEdited: !!S.handEdited, arec: S.arec || null, cues: S.cues.map(({ start, end, ru, en, prompt, vp }) => ({ start, end, ru, en, prompt, vp })) };
}
function loadProj(p, quiet) {
  if (!p || !Array.isArray(p.cues)) throw new Error("Это не файл проекта озвучки.");
  snap();
  S.cues = p.cues.map((x) => Object.assign(newCue(+x.start || 0, x.end == null ? null : +x.end), { ru: x.ru || "", en: x.en || "", prompt: x.prompt || "", vp: { ru: x.vp?.ru || null, en: x.vp?.en || null } }));
  if (!S.name && p.video?.name) S.name = p.video.name;
  S.arec = p.arec?.words?.length ? p.arec : null;
  if (p.script) { S.script = { ru: p.script.ru || "", en: p.script.en || "" }; S.builtSig = p.builtSig || null; S.handEdited = !!p.handEdited; }
  else if (S.cues.length) { S.handEdited = true; for (const l of LANGS) S.script[l] = S.cues.filter((c) => c[l].trim()).map((c) => `${fmt(c.start)} - ${fmt(effEnd(c))} ${c[l]}`).join("\n"); }
  if (typeof edShow === "function") edShow(edCur);
  renderAll(); save(); restoreVoices();
  if (!quiet) toast(`Проект открыт: ${S.cues.length} реплик`);
  if (p.video?.name && S.file && p.video.name !== S.file.name) toast(`Проект был для «${p.video.name}» — загружено другое видео`);
}
const SET_IDS = ["aiModel", "aiCustom", "aiLangs", "aiTone", "aiCtx", "aiWish", "aiFrames", "aiTimed", "segLen", "scFrom", "scTo", "solV_ru", "solV_en", "fsSplit", "fsPlace", "fsGap", "afDens", "afN", "afSpk", "voRu", "voEn",
  "vSpeed", "vMax", "vFit", "vTrim", "mixOrig", "volOrig", "volVoice", "ovOn", "arSel", "rateSel", "asrWhere", "audLang"];
function saveSet() {
  const o = {}; SET_IDS.forEach((id) => { const el = $(id); o[id] = el.type === "checkbox" ? el.checked : el.value; });
  o.prevLang = prevLang(); o.vmode = vmode(); o.edLang = edCur;
  LS.set("vo-settings", o);
}
function restoreSet() {
  const o = LS.get("vo-settings", {});
  for (const id of SET_IDS) {
    if (o[id] == null) continue;
    const el = $(id);
    if (el.type === "checkbox") el.checked = o[id];
    else if (el.tagName !== "SELECT" || [...el.options].some((x) => x.value === o[id])) el.value = o[id];
  }
  if (o.prevLang) setSeg("prevLang", o.prevLang);
  if (o.vmode) setVmode(o.vmode);
  if (o.edLang) edCur = o.edLang;
  try { $("key").value = localStorage.getItem("vt-polza-key") || ""; } catch {}
}

// ================= Переключатели =================
function setSeg(id, v) { document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle("on", b.dataset.v === v)); }
const prevLang = () => document.querySelector("#prevLang button.on")?.dataset.v || "ru";
$("prevLang").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; setSeg("prevLang", b.dataset.v); saveSet(); scheduleVoices(); drawOverlay(); drawTL(); };
