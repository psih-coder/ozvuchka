"use strict";
// ================= Реплики: действия =================
function addCueAt(t, focusSide) {
  t = Math.round(clamp(t, 0, Math.max(0, totalDur() - 0.1)) * 10) / 10;
  snap();
  const c = newCue(t);
  const host = cueAt(t);
  if (host && host.end != null && host.end > t + 0.05) { c.end = host.end; host.end = t; }   // делим реплику пополам
  S.cues.push(c); sortCues(); S.sel = c.id;
  renderAll(); save();
  if (focusSide && S.file) { refreshNow(); $("nowRu").focus(); }
  else { $("fineBox").open = true; const ta = document.querySelector(`#listManual .cue[data-id="${c.id}"] textarea`); ta?.focus({ preventScroll: true }); scrollToRow(c.id); }
  return c;
}
function setStart(c, t) {
  t = Math.round(t * 100) / 100;
  if (c.end != null && t >= c.end - 0.1) c.end = null;
  snap(); c.start = Math.max(0, t); sortCues(); renderAll(); save();
}
function setEnd(c, t) {
  t = Math.round(t * 100) / 100;
  if (t <= c.start + 0.1) return toast("Конец должен быть позже начала реплики");
  snap(); c.end = t; renderAll(); save();
}
function delCue(c) { snap(); S.cues.splice(S.cues.indexOf(c), 1); if (S.sel === c.id) S.sel = null; renderAll(); save(); }
function select(id, scroll) {
  S.sel = id;
  document.querySelectorAll(".list .cue").forEach((x) => x.classList.toggle("sel", +x.dataset.id === id));
  if (scroll) scrollToRow(id);
  drawTL();
}
function scrollToRow(id) {
  for (const L of [$("listManual")]) {
    const row = L.querySelector(`.cue[data-id="${id}"]`); if (!row || L.offsetParent === null) continue;
    const top = row.offsetTop - L.offsetTop;
    if (top < L.scrollTop || top + row.offsetHeight > L.scrollTop + L.clientHeight) L.scrollTop = top - L.clientHeight / 3;
  }
}
const selCue = () => cueById(S.sel) || cueAt(V.currentTime || 0);

$("addCue").onclick = () => addCueAt(V.currentTime || 0);
$("undoBtn").onclick = undo;
$("clearBtn").onclick = () => { if (!S.cues.length || !confirm(`Удалить все ${S.cues.length} реплик? (можно вернуть «Отменить»)`)) return; snap(); S.cues = []; renderAll(); save(); };
$("splitBtn").onclick = () => {
  const n = +$("segLen").value, D = totalDur();
  if (S.cues.length && !confirm(`Заменить ${S.cues.length} реплик на равные отрезки по ${n} с? (можно вернуть «Отменить»)`)) return;
  snap(); S.cues = [];
  for (let t = 0; t < D - 0.3; t += n) S.cues.push(newCue(t, Math.min(D, t + n)));
  renderAll(); save(); toast(`Разметил ${S.cues.length} отрезков по ${n} с`);
};

// ================= Списки реплик =================
function fitInfo(c, l) {
  const txt = c[l].trim(), slot = slotOf(c);
  if (!txt) return { cls: "", text: "" };
  const v = c.v[l];
  if (v && voiceFresh(c, l)) {
    const d = v.len ?? v.buf.duration, sp = v.speed !== baseSpeed() ? ` ×${v.speed.toFixed(2)}` : "";
    return { cls: d <= slot + 0.05 ? "ok" : "err", text: `🎙 ${n1(d)}/${n1(slot)} с${sp}`, title: d <= slot + 0.05 ? "Озвучено, помещается" : `Не помещается на ${n1(d - slot)} с — сократите текст или раздвиньте отрезок` };
  }
  const e = estDur(c, l), can = $("vFit").checked ? +$("vMax").value / baseSpeed() : 1;
  const cls = v ? "stale" : e <= slot ? "est" : e <= slot * can ? "warn" : "err";
  return { cls, text: `≈${n1(e)}/${n1(slot)} с`, title: v ? "Текст или голос изменились — озвучьте заново" : e <= slot ? "Примерная длина голоса / длина отрезка" : e <= slot * can ? "Длинновато — голос немного ускорится" : "Скорее всего не поместится — сократите текст" };
}
function updFit(c) {
  for (const l of LANGS) {
    const f = fitInfo(c, l);
    document.querySelectorAll(`.cue[data-id="${c.id}"] [data-fit="${l}"]`).forEach((el) => { el.className = "fit " + f.cls; el.textContent = f.text; el.title = f.title || ""; });
  }
}
function timeFields(c) {
  return `<div class="ctime">
    <div class="tf"><span>начало</span><input class="inp tin" data-f="start" value="${fmt(c.start, 2)}"><button class="ib" data-a="setStart" title="Взять текущее время видео">⏱</button></div>
    <div class="tf"><span>конец</span><input class="inp tin" data-f="end" value="${c.end == null ? "" : fmt(c.end, 2)}" placeholder="авто ${fmt(effEnd(c))}"><button class="ib" data-a="setEnd" title="Взять текущее время видео">⏱</button></div>
    <div class="slot">${n1(slotOf(c))} с${c.end == null ? " · до следующей" : ""}${overlaps(c) ? ' · <span style="color:var(--err)">наложение</span>' : ""}</div>
  </div>`;
}
function vpick(c, l) {
  const vs = voicesOf(l); if (vs.length < 2) return "";
  const cur = pidFor(c, l);
  return `<select class="vpick" data-vp="${l}" title="Кто говорит эту реплику" style="color:${prof(cur)?.color}">${vs.map((v) => `<option value="${v.id}"${v.id === cur ? " selected" : ""}>${esc(v.name)}</option>`).join("")}</select>`;
}
const txtBox = (c, l, rows = 2) => `<div class="ctx"><label class="lt ${l}">${l.toUpperCase()}${vpick(c, l)}<button class="ib" data-a="play" data-lang="${l}" title="Прослушать (если ещё не озвучено — озвучит эту фразу)">▶</button><span class="fit" data-fit="${l}"></span></label>
  <textarea data-f="${l}" rows="${rows}" placeholder="${l === "ru" ? "Текст на русском" : "Text in English"}">${esc(c[l])}</textarea></div>`;
function rowManual(c, i) {
  return `<div class="cue${c.id === S.sel ? " sel" : ""}${c.id === liveId ? " live" : ""}${overlaps(c) ? " bad" : ""}" data-id="${c.id}">
    <button class="num" data-a="go" title="Перейти к началу (двойной клик — играть)">${i + 1}</button>
    ${timeFields(c)}${txtBox(c, "ru")}${txtBox(c, "en")}
    <div class="cact"><button class="ib" data-a="tr" title="Перевести: заполнить пустой язык из другого (или RU → EN)">🌐</button><button class="ib" data-a="dup" title="Копия после этой">⧉</button><button class="ib del" data-a="del" title="Удалить">🗑</button></div>
  </div>`;
}
function renderAll() {
  sortCues(); S.ver++;
  $("listManual").innerHTML = S.cues.map(rowManual).join("");
  S.cues.forEach(updFit);
  const ru = S.cues.filter((c) => c.ru.trim()).length, en = S.cues.filter((c) => c.en.trim()).length;
  $("cueCount").innerHTML = S.cues.length ? `(${S.cues.length} фраз · <span class="tag-ru">RU ${ru}</span> · <span class="tag-en">EN ${en}</span>)` : "(пока пусто)";
  refreshNow(); drawTL(); vSummary(); aiCostHint(); if (typeof voiceCounts === "function" && VOICES.length) voiceCounts();
}
let drawT;
function onCueText(c, src) {
  S.ver++; S.handEdited = true;
  document.querySelectorAll(`.cue[data-id="${c.id}"] textarea[data-f="${src.dataset.f}"]`).forEach((el) => { if (el !== src) el.value = c[src.dataset.f]; });
  updFit(c); save();
  clearTimeout(drawT); drawT = setTimeout(() => { drawTL(); drawOverlay(); vSummary(); }, 150);
}
function bindList(el) {
  el.addEventListener("input", (e) => {
    const f = e.target.dataset.f, row = e.target.closest(".cue[data-id]");
    if (!row || !["ru", "en", "prompt"].includes(f)) return;
    const c = cueById(row.dataset.id); if (!c) return;
    c[f] = e.target.value; onCueText(c, e.target);
  });
  el.addEventListener("change", (e) => {
    if (e.target.classList.contains("vpick")) {
      const c = cueById(e.target.closest(".cue[data-id]").dataset.id), l = e.target.dataset.vp;
      snap(); c.vp = { ...(c.vp || {}), [l]: e.target.value }; S.ver++;
      save(); renderAll(); restoreVoices(); return;
    }
    const f = e.target.dataset.f, row = e.target.closest(".cue[data-id]");
    if (!row || !["start", "end"].includes(f)) return;
    const c = cueById(row.dataset.id), raw = e.target.value.trim();
    if (f === "end" && !raw) { snap(); c.end = null; renderAll(); save(); return; }
    const t = parseTime(raw);
    if (!isFinite(t)) { toast("Время пишется так: 1:05.3 или 65.3"); renderAll(); return; }
    if (f === "start") setStart(c, t); else setEnd(c, t);
  });
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.classList.contains("tin")) e.target.blur(); });
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]"), row = e.target.closest(".cue[data-id]");
    if (!b || !row) return;
    const c = cueById(row.dataset.id); if (!c) return;
    const a = b.dataset.a;
    if (a === "go") { select(c.id); seek(c.start); }
    else if (a === "setStart") setStart(c, V.currentTime || 0);
    else if (a === "setEnd") setEnd(c, V.currentTime || 0);
    else if (a === "del") delCue(c);
    else if (a === "dup") { snap(); const d = Object.assign(newCue(Math.min(totalDur() - 0.1, effEnd(c))), { ru: c.ru, en: c.en, prompt: c.prompt }); S.cues.push(d); renderAll(); save(); }
    else if (a === "play") playCue(c, b.dataset.lang, b);
    else if (a === "tr") { const from = c.ru.trim() ? "ru" : "en"; runAi(() => aiTranslate(from, from === "ru" ? "en" : "ru", c.id)); }
  });
  el.addEventListener("dblclick", (e) => { const b = e.target.closest('[data-a="go"]'), row = e.target.closest(".cue[data-id]"); if (b && row) { seek(cueById(row.dataset.id).start); ensureAC(); V.play(); } });
  el.addEventListener("focusin", (e) => { const row = e.target.closest(".list .cue[data-id]"); if (row && +row.dataset.id !== S.sel) select(+row.dataset.id); });
}
bindList($("listManual")); bindList($("nowCard"));

// ================= Импорт / экспорт текстом =================
const TC = String.raw`\d{1,2}(?::\d{1,2}){0,2}(?:[.,]\d+)?`;
function parseImport(text, mode) {
  const out = [];
  const put = (start, end, body) => {
    const parts = mode === "both" ? body.split("|").map((x) => x.trim()) : [body.trim()];
    const c = newCue(start, end);
    if (mode === "en") c.en = parts[0]; else { c.ru = parts[0] || ""; c.en = parts[1] || ""; }
    out.push(c);
  };
  if (/-->/.test(text)) {   // .srt / .vtt
    for (const block of text.replace(/\r/g, "").split(/\n\s*\n/)) {
      const m = block.match(/(\d[\d:.,]*)\s*-->\s*(\d[\d:.,]*)/); if (!m) continue;
      const body = block.slice(block.indexOf(m[0]) + m[0].length).replace(/^[^\n]*\n?/, "").replace(/<[^>]+>/g, "").split("\n").map((x) => x.trim()).filter(Boolean).join(" ");
      const a = parseTime(m[1]), b = parseTime(m[2]);
      if (isFinite(a)) put(a, isFinite(b) && b > a ? b : null, body);
    }
    return out;
  }
  const re = new RegExp(String.raw`^\s*\[?(${TC})\]?\s*(?:(?:-->|-|–|—)\s*\[?(${TC})\]?)?\s*[|:–—-]?\s*(.*)$`);
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = line.match(re);
    const a = m ? parseTime(m[1]) : NaN;
    if (m && isFinite(a)) { const b = m[2] ? parseTime(m[2]) : NaN; put(a, isFinite(b) && b > a ? b : null, m[3] || ""); }
    else if (out.length) { const c = out[out.length - 1], k = mode === "en" ? "en" : "ru"; c[k] = (c[k] + " " + line.trim()).trim(); }
  }
  return out;
}
