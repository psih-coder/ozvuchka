"use strict";
// ================= Голоса: карточки =================
const V_COLORS = ["#ff5fa2", "#3ee6ff", "#ffc94d", "#3ddc97", "#b38cff", "#ff8a3c", "#7aa2ff", "#ff6b6b", "#c6ff4d", "#ff9de2"];
const STYLE_DEF = { ru: "Говори энергично и увлекательно, как ведущий популярного YouTube-канала", en: "Speak with energy and excitement, like a popular YouTube host" };
function cardHtml(p) {
  return `<div class="vcol vcard" data-pid="${p.id}" style="box-shadow: inset 0 3px 0 ${p.color}">
    <div class="vhead"><span class="dot" style="background:${p.color}"></span>
      <input class="inp vname" id="vn_${p.id}" value="${esc(p.name)}" title="Имя голоса — его видно в репликах">
      <span class="lbadge ${p.lang}">${p.lang.toUpperCase()}<span class="lb-long">${p.lang === "ru" ? " · русский" : " · English"}</span></span>
      <button class="ib" data-va="save" title="Сохранить настройки этого голоса в «Мои голоса»">💾</button>
      <button class="ib" data-va="dup" title="Копия этого голоса">⧉</button><button class="ib del" data-va="del" title="Удалить голос">🗑</button></div>
    <div><select class="libpick" data-lib="${p.id}" title="Подставить сохранённые настройки голоса"></select></div>
    <div><label class="f">Модель</label><select id="tm_${p.id}">${TTS_OPTS}</select></div>
    <div><label class="f">Голос</label><select id="tv_${p.id}"></select>
      <input type="text" id="tvc_${p.id}" class="inp" placeholder="voice_id из ElevenLabs, например pNInz6obpgDQGcFmaJgB" style="margin-top:6px" hidden></div>
    <div class="elbox" id="el_${p.id}" hidden>
      <div class="two2">
        <div><label class="f">Стабильность: <b id="elsV_${p.id}">0,50</b></label><input type="range" id="els_${p.id}" min="0" max="1" step="0.05" value="0.5" title="Меньше — живее и эмоциональнее, больше — ровнее"></div>
        <div><label class="f">Похожесть на голос: <b id="elmV_${p.id}">0,75</b></label><input type="range" id="elm_${p.id}" min="0" max="1" step="0.05" value="0.75"></div>
      </div>
      <div class="hint">Эмоции — тегами прямо в тексте сценария: <span class="mono">[whispers] [laughs] [sighs] [excited]</span>. В субтитры теги не попадают.</div>
    </div>
    <div><label class="f">Манера речи (подсказка голосу)</label><input type="text" id="ts_${p.id}" class="inp"></div>
    <div class="two2"><div><label class="f">Акцент</label><select id="acc_${p.id}">${ACCENTS.map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></div>
      <div><label class="f">Характер</label><select id="chr_${p.id}">${CHARS.map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></div></div>
    <div class="hint" id="instrNote_${p.id}" hidden>Эта модель не понимает манеру, акцент и характер — выберите Gemini или gpt-4o-mini-tts.</div>
    ${fxHtml(p.id)}
    <div class="row"><button class="btn ghost sm" data-va="test">▶ Прослушать голос</button><span class="hint" data-vcount></span></div>
    <audio data-audio="${p.id}" controls hidden></audio>
  </div>`;
}
function readVals(pid) {
  return { tm: $("tm_" + pid).value, tv: $("tv_" + pid).value, tvc: $("tvc_" + pid).value.trim(), els: +$("els_" + pid).value, elm: +$("elm_" + pid).value,
    ts: $("ts_" + pid).value, acc: $("acc_" + pid).value, chr: $("chr_" + pid).value, fx: fxOf(pid) };
}
function mountCard(p, vals = {}) {
  $("vCards").insertAdjacentHTML("beforeend", cardHtml(p));
  applyVals(p, vals);
  fillLibPicks();
}
function applyVals(p, vals = {}) {
  if (vals.tm && TTS_MODELS.some((m) => m.id === vals.tm)) $("tm_" + p.id).value = vals.tm;
  $("ts_" + p.id).value = vals.ts ?? STYLE_DEF[p.lang];
  if (vals.acc != null) $("acc_" + p.id).value = vals.acc;
  if (vals.chr != null) $("chr_" + p.id).value = vals.chr;
  setFx(p.id, vals.fx || {});
  if (vals.tvc != null) $("tvc_" + p.id).value = vals.tvc;
  if (vals.els != null) $("els_" + p.id).value = vals.els;
  if (vals.elm != null) $("elm_" + p.id).value = vals.elm;
  fillVoices(p.id, vals.tv);
  elLabels(p.id);
}
function elLabels(pid) {
  $("elsV_" + pid).textContent = (+$("els_" + pid).value).toFixed(2).replace(".", ",");
  $("elmV_" + pid).textContent = (+$("elm_" + pid).value).toFixed(2).replace(".", ",");
}
function saveVoices() { LS.set("vo-voices", VOICES.map((p) => ({ ...p, vals: readVals(p.id) }))); }
function voiceCounts() {
  if (typeof fillSolSel === "function") { fillSolSel(); afLabels(); edInfo(); }
  document.querySelectorAll(".vcard").forEach((el) => {
    const pid = el.dataset.pid, l = prof(pid)?.lang, n = l ? S.cues.filter((c) => c[l].trim() && pidFor(c, l) === pid).length : 0;
    el.querySelector("[data-vcount]").textContent = n ? `говорит реплик: ${n}` : "пока ни одной реплики";
  });
}
function initVoices() {
  let saved = LS.get("vo-voices", null);
  if (!Array.isArray(saved) || !saved.length) {
    // перенос со старой версии: были ровно RU и EN
    const o = LS.get("vo-settings", {});
    saved = LANGS.map((l, i) => ({ id: l, name: l === "ru" ? "Рассказчик" : "Narrator", lang: l, color: V_COLORS[i],
      vals: { tm: o["tm_" + l], tv: o["tv_" + l], ts: o["ts_" + l], acc: o["acc_" + l], chr: o["chr_" + l],
        fx: Object.fromEntries(Object.keys(FX_DEF).filter((k) => o[`fx_${l}_${k}`] != null).map((k) => [k, typeof FX_DEF[k] === "number" ? +o[`fx_${l}_${k}`] : o[`fx_${l}_${k}`]])) } }));
  }
  for (const l of LANGS) if (!saved.some((p) => p.lang === l)) saved.push({ id: l, name: l === "ru" ? "Рассказчик" : "Narrator", lang: l, color: V_COLORS[LANGS.indexOf(l)], vals: {} });
  VOICES = saved.map(({ id, name, lang, color }) => ({ id, name, lang, color }));
  $("vCards").innerHTML = "";
  saved.forEach((p) => mountCard(VOICES.find((v) => v.id === p.id), p.vals || {}));
  saveVoices(); voiceCounts();
}
function addVoice(lang, name, fromPid) {
  const id = "v" + Date.now().toString(36);
  const n = voicesOf(lang).length + 1;
  const p = { id, lang, name: name || (lang === "ru" ? `Голос ${n}` : `Voice ${n}`), color: V_COLORS.find((c) => !VOICES.some((v) => v.color === c)) || V_COLORS[VOICES.length % V_COLORS.length] };
  VOICES.push(p);
  const vals = fromPid ? readVals(fromPid) : {};
  mountCard(p, vals);
  saveVoices(); renderAll();
  const el = document.querySelector(`.vcard[data-pid="${id}"]`); el.scrollIntoView({ behavior: "smooth", block: "center" });
  $("vn_" + id).select();
  toast(`Голос «${p.name}» (${lang.toUpperCase()}) добавлен — выберите его в нужных репликах`);
}
function delVoice(pid) {
  const p = prof(pid);
  if (voicesOf(p.lang).length < 2) return toast(`Это единственный голос для ${p.lang.toUpperCase()} — его нельзя удалить`);
  const used = S.cues.filter((c) => c.vp?.[p.lang] === pid).length;
  if (!confirm(`Удалить голос «${p.name}»?${used ? ` Его ${used} реплик перейдут к голосу «${voicesOf(p.lang).find((v) => v.id !== pid).name}».` : ""}`)) return;
  S.cues.forEach((c) => { if (c.vp?.[p.lang] === pid) c.vp = { ...c.vp, [p.lang]: null }; });
  VOICES = VOICES.filter((v) => v.id !== pid);
  document.querySelector(`.vcard[data-pid="${pid}"]`).remove();
  saveVoices(); save(); renderAll(); restoreVoices();
}
async function testVoice(pid, btn) {
  const p = prof(pid); btn.disabled = true;
  try {
    const sample = p.lang === "en" ? "Hey! This is how your video will sound. Pretty cool, right?" : "Привет! Вот так будет звучать твоё видео. Как тебе такая подача?";
    const { buf, cost } = await tts(pid, sample);
    const f = fxOf(pid), tr = $("vTrim").checked ? trimSilence(buf) : buf;
    const a = document.querySelector(`audio[data-audio="${pid}"]`);
    a.src = URL.createObjectURL(bufToWav(await applyFxGraph(speedBuf(await pitchResample(tr, f.pitch), baseSpeed() / Math.pow(2, f.pitch / 12)), f))); a.hidden = false; a.play();
    logTo("vLog", `Пример голоса «${p.name}» (${vset(pid).voice}, ${p.lang.toUpperCase()})${cost ? ` — ${cost.toFixed(2)} ₽` : ""}`, "ok");
  } catch (e) { logTo("vLog", e.message, "err"); toast(e.message); }
  btn.disabled = false;
}
const voiceChanged = () => { saveVoices(); S.ver++; restoreVoices(); S.cues.forEach(updFit); vSummary(); drawTL(); };
$("vCards").addEventListener("input", (e) => {
  const card = e.target.closest(".vcard"); if (!card) return;
  const pid = card.dataset.pid, id = e.target.id || "";
  if (id.startsWith("fx_")) { fxLabels(pid); fxChanged(pid); }
  if (/^(tm|tv|chr|acc|ts)_/.test(id)) voCost();
  if (id.startsWith("els_") || id.startsWith("elm_")) elLabels(pid);
});
$("vCards").addEventListener("change", (e) => {
  const card = e.target.closest(".vcard"); if (!card) return;
  const pid = card.dataset.pid, id = e.target.id || "";
  if (e.target.classList.contains("libpick")) { const it = LIB()[+e.target.value]; e.target.value = ""; if (it) libApply(pid, it); return; }
  if (id.startsWith("fx_")) return;
  if (id.startsWith("vn_")) { prof(pid).name = e.target.value.trim() || prof(pid).name; e.target.value = prof(pid).name; saveVoices(); renderAll(); return; }
  if (id.startsWith("tm_") || id.startsWith("tv_")) fillVoices(pid, $("tv_" + pid).value);
  voiceChanged();
});
$("vCards").addEventListener("click", (e) => {
  const card = e.target.closest(".vcard"); if (!card) return;
  const pid = card.dataset.pid, chip = e.target.closest("[data-fxp]"), b = e.target.closest("[data-va]");
  if (chip) { setFx(pid, FX_PRESETS[chip.dataset.fxp][1]); fxChanged(pid); return; }
  if (!b) return;
  if (b.dataset.va === "test") testVoice(pid, b);
  else if (b.dataset.va === "save") libSave(pid);
  else if (b.dataset.va === "del") delVoice(pid);
  else if (b.dataset.va === "dup") addVoice(prof(pid).lang, prof(pid).name + " 2", pid);
});
// ---- «Мои голоса»: библиотека сохранённых настроек ----
const LIB = () => LS.get("vo-voicelib", []);
const setLib = (a) => { LS.set("vo-voicelib", a); fillLibPicks(); libRender(); };
function libDesc(it) {
  const m = ttsModel(it.vals.tm), v = (voicesFor(m, it.lang).find((x) => x[0] === it.vals.tv) || [it.vals.tv])[0];
  const ac = ACCENTS.find((x) => x[0] === it.vals.acc)?.[1], ch = CHARS.find((x) => x[0] === it.vals.chr)?.[1];
  const fx = Object.entries(FX_PRESETS).find(([, [, o]]) => JSON.stringify({ ...FX_DEF, ...o }) === JSON.stringify({ ...FX_DEF, ...(it.vals.fx || {}) }));
  return [it.lang.toUpperCase(), m.name.split(" — ")[0], v, it.vals.acc ? ac : "", it.vals.chr ? ch : "", fx ? (fx[0] === "normal" ? "" : fx[1][0]) : "свои эффекты"].filter(Boolean).join(" · ");
}
function libSave(pid) {
  const p = prof(pid), name = prompt("Название для сохранённого голоса:", p.name);
  if (!name || !name.trim()) return;
  const lib = LIB(), i = lib.findIndex((x) => x.name.toLowerCase() === name.trim().toLowerCase() && x.lang === p.lang);
  if (i >= 0 && !confirm(`Голос «${lib[i].name}» уже есть в «Моих голосах». Заменить?`)) return;
  const it = { name: name.trim(), lang: p.lang, vals: readVals(pid), saved: new Date().toISOString().slice(0, 10) };
  if (i >= 0) lib[i] = it; else lib.push(it);
  setLib(lib); toast(`Сохранено в «Мои голоса»: ${it.name}`);
}
function libApply(pid, it) {
  const p = prof(pid);
  applyVals(p, it.vals);
  if (it.lang !== p.lang) toast(`«${it.name}» был для ${it.lang.toUpperCase()} — голос подобран для ${p.lang.toUpperCase()}`);
  else toast(`Подставлены настройки «${it.name}»`);
  voiceChanged(); refit(pid);
}
function fillLibPicks() {
  const lib = LIB(), opt = (it, i) => `<option value="${i}">${esc(it.name)} — ${esc(libDesc(it))}</option>`;
  $("libCount").textContent = lib.length ? `(${lib.length})` : "";
  document.querySelectorAll(".libpick").forEach((sel) => {
    const l = prof(sel.dataset.lib)?.lang, same = lib.map((it, i) => [it, i]).filter(([it]) => it.lang === l), other = lib.map((it, i) => [it, i]).filter(([it]) => it.lang !== l);
    sel.innerHTML = `<option value="">📚 ${lib.length ? "Подставить из «Моих голосов»…" : "«Мои голоса» пока пусто — сохраните голос кнопкой 💾"}</option>` +
      (same.length ? `<optgroup label="${l === "ru" ? "Русские" : "Английские"}">${same.map(([it, i]) => opt(it, i)).join("")}</optgroup>` : "") +
      (other.length ? `<optgroup label="Другой язык (голос подберётся)">${other.map(([it, i]) => opt(it, i)).join("")}</optgroup>` : "");
    sel.disabled = !lib.length;
  });
  const vm = $("vmLib");
  if (vm) { $("vmLibWrap").hidden = !lib.length; vm.innerHTML = lib.map((it, i) => `<button class="chip" data-libnew="${i}" title="${esc(libDesc(it))}">${it.lang.toUpperCase()} · ${esc(it.name)}</button>`).join(""); }
}
function libRender() {
  $("libList").innerHTML = LIB().map((it, i) => `<div class="libitem"><span class="lbadge ${it.lang}">${it.lang.toUpperCase()}</span>
    <div class="nm"><b>${esc(it.name)}</b><small>${esc(libDesc(it))}${it.saved ? ` · ${it.saved}` : ""}</small></div>
    <button class="btn ghost sm" data-libadd="${i}" title="Добавить в проект новым голосом">＋ В проект</button>
    <button class="ib" data-libren="${i}" title="Переименовать">✎</button><button class="ib del" data-libdel="${i}" title="Удалить из «Моих голосов»">🗑</button></div>`).join("");
}
function addFromLib(it) {
  addVoice(it.lang, it.name);
  const p = VOICES[VOICES.length - 1];
  applyVals(p, it.vals); voiceChanged();
}
$("libOpen").onclick = () => { libRender(); $("libModal").hidden = false; };
$("libClose").onclick = () => { $("libModal").hidden = true; };
$("libModal").addEventListener("click", (e) => {
  if (e.target === $("libModal")) { $("libModal").hidden = true; return; }
  const lib = LIB(), b = e.target.closest("[data-libadd],[data-libdel],[data-libren]"); if (!b) return;
  if (b.dataset.libadd != null) { $("libModal").hidden = true; addFromLib(lib[+b.dataset.libadd]); }
  else if (b.dataset.libdel != null) { const it = lib[+b.dataset.libdel]; if (confirm(`Удалить «${it.name}» из «Моих голосов»?`)) { lib.splice(+b.dataset.libdel, 1); setLib(lib); } }
  else { const it = lib[+b.dataset.libren], nm = prompt("Новое название:", it.name); if (nm && nm.trim()) { it.name = nm.trim(); setLib(lib); } }
});
$("libExport").onclick = () => { const lib = LIB(); if (!lib.length) return toast("Сохранять пока нечего"); downloadBlob(new Blob([JSON.stringify({ app: "voiceover-voices", ver: 1, voices: lib }, null, 1)], { type: "application/json" }), "мои_голоса.json"); };
$("libImport").onclick = () => $("libFile").click();
$("libFile").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const d = JSON.parse(await f.text()), list = (Array.isArray(d) ? d : d.voices || []).filter((x) => x && x.name && LANGS.includes(x.lang) && x.vals);
    if (!list.length) throw new Error("В файле нет сохранённых голосов");
    const lib = LIB(); let add = 0, upd = 0;
    for (const it of list) { const i = lib.findIndex((x) => x.name.toLowerCase() === it.name.toLowerCase() && x.lang === it.lang); if (i >= 0) { lib[i] = it; upd++; } else { lib.push(it); add++; } }
    setLib(lib); toast(`Загружено: новых ${add}${upd ? `, обновлено ${upd}` : ""}`);
  } catch (er) { toast(er.message || "Не удалось прочитать файл"); }
};
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("libModal").hidden) $("libModal").hidden = true; });

// окно «Новый голос»: сначала язык
$("addVoice").onclick = () => { fillLibPicks(); $("vmName").value = ""; $("vModal").hidden = false; setTimeout(() => $("vmName").focus(), 30); };
$("vmCancel").onclick = () => { $("vModal").hidden = true; };
$("vModal").addEventListener("click", (e) => {
  if (e.target === $("vModal")) { $("vModal").hidden = true; return; }
  const lb = e.target.closest("[data-libnew]");
  if (lb) { $("vModal").hidden = true; const it = LIB()[+lb.dataset.libnew]; addFromLib({ ...it, name: $("vmName").value.trim() || it.name }); return; }
  const b = e.target.closest("[data-ml]"); if (!b) return;
  $("vModal").hidden = true; addVoice(b.dataset.ml, $("vmName").value.trim());
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("vModal").hidden) $("vModal").hidden = true; });
