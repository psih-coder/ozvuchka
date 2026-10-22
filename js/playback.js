"use strict";
// кэш озвучки: в памяти и в браузере (IndexedDB) — повторно за ту же фразу не платим
const mem = new Map();
let idbP = null;
function idb() {
  if (!idbP) idbP = new Promise((res, rej) => { const r = indexedDB.open("vo-voice", 1); r.onupgradeneeded = () => r.result.createObjectStore("clips"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return idbP;
}
async function idbGet(k) { try { const db = await idb(); return await new Promise((res) => { const q = db.transaction("clips").objectStore("clips").get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch { return null; } }
async function idbPut(k, buf) { try { const db = await idb(); db.transaction("clips", "readwrite").objectStore("clips").put({ sr: buf.sampleRate, data: buf.getChannelData(0).slice() }, k); } catch {} }
async function cached(key) {
  if (mem.has(key)) return mem.get(key);
  const r = await idbGet(key); if (!r) return null;
  const b = new AudioBuffer({ length: r.data.length, numberOfChannels: 1, sampleRate: r.sr }); b.copyToChannel(r.data, 0);
  mem.set(key, b); return b;
}
async function applyFit(c, l, raw, key) {
  const src = $("vTrim").checked ? trimSilence(raw) : raw, slot = slotOf(c), base = baseSpeed(), f = fxOf(pidFor(c, l));
  let sp = base;
  if ($("vFit").checked && slot > 0.2 && src.duration / base > slot) sp = Math.min(+$("vMax").value, src.duration / slot);
  // тон: пересэмплировали в p раз → растягиваем на sp/p, итог — длина src/sp с новым тоном
  const p = Math.pow(2, f.pitch / 12), dry = speedBuf(await pitchResample(src, f.pitch), sp / p);
  const buf = await applyFxGraph(dry, f);
  c.v[l] = { key, buf, len: dry.duration, speed: sp, on: speechSpan(dry), fx: JSON.stringify(f) };
  S.ver++;
}
// где в клипе начинается и кончается речь — субтитры по ней
function speechSpan(buf) {
  const d = buf.getChannelData(0), sr = buf.sampleRate, win = Math.round(sr * 0.02);
  let peak = 0; for (let i = 0; i < d.length; i += 4) peak = Math.max(peak, Math.abs(d[i]));
  const thr = Math.max(0.01, peak * 0.08), loud = (i) => { let m = 0; for (let j = i; j < Math.min(d.length, i + win); j += 2) m = Math.max(m, Math.abs(d[j])); return m > thr; };
  let a = 0, b = d.length - win;
  while (a < b && !loud(a)) a += win;
  while (b > a && !loud(b)) b -= win;
  return [a / sr, Math.min(buf.duration, (b + win) / sr)];
}
async function restoreVoices() {
  let n = 0;
  for (const c of S.cues) for (const l of LANGS) { if (!c[l].trim() || voiceFresh(c, l)) continue; const k = voiceKey(c, l), raw = await cached(k); if (raw) { await applyFit(c, l, raw, k); n++; } }
  if (n) { S.cues.forEach(updFit); drawTL(); vSummary(); }
}
async function pool(n, items, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }

let vBusy = false;
async function runV(fn) {
  if (vBusy) return toast("Озвучка уже идёт — подождите или нажмите «Стоп»");
  vBusy = true; S.vStop = false; $("vStop").hidden = false; $("vBar").hidden = false; $("vBar").value = 0;
  document.querySelectorAll("#voGo, [data-exp]").forEach((b) => b.disabled = true);
  try { await fn(); }
  catch (e) { if (e === STOP || e === CANCEL) logTo("vLog", e.message, "warn"); else { logTo("vLog", e.message, "err"); toast(e.message); console.error(e); } }
  vBusy = false; $("vStop").hidden = true; $("vBar").hidden = true;
  document.querySelectorAll("#voGo, [data-exp]").forEach((b) => b.disabled = false);
}
$("vStop").onclick = () => { S.vStop = true; };
async function synth(langs) {
  const jobs = [];
  for (const l of langs) for (const c of S.cues) if (c[l].trim()) jobs.push({ c, l });
  if (!jobs.length) throw new Error("Нет текста для озвучки — напишите реплики выше.");
  for (const { c, l } of jobs) { const o = vset(pidFor(c, l)); if (o.none) throw new Error(`Нет голоса для ${l.toUpperCase()} — нажмите «＋ Добавить голос».`); if (!o.voice) throw new Error(`Голос «${o.name}»: модель не говорит на этом языке — выберите другую.`); }
  const li = logTo("vLog", `Озвучиваю ${jobs.length} фраз (${langs.map((l) => l.toUpperCase()).join(" + ")})…`);
  let cost = 0, paid = 0, free = 0, k = 0;
  await pool(3, jobs, async ({ c, l }) => {
    if (S.vStop) throw STOP;
    const key = voiceKey(c, l);
    let raw = await cached(key);
    if (raw) free++;
    else {
      const r = await tts(pidFor(c, l), c[l].trim());
      raw = r.buf; cost += r.cost; paid++;
      mem.set(key, raw); idbPut(key, raw);
    }
    await applyFit(c, l, raw, key);
    updFit(c); drawTL();
    $("vBar").value = ++k / jobs.length * 100;
    li.textContent = `⏳ Озвучиваю… ${k} из ${jobs.length}`;
  });
  done(li, `Озвучено ${jobs.length} фраз: новых ${paid}${free ? `, из памяти ${free}` : ""}${cost ? ` · ${cost.toFixed(2)} ₽` : ""}`);
  const bad = jobs.filter(({ c, l }) => c.v[l].len > slotOf(c) + 0.05);
  if (bad.length) logTo("vLog", `Не помещаются: ${bad.map(({ c, l }) => `#${num(c)} ${l.toUpperCase()} (+${n1(c.v[l].len - slotOf(c))} с)`).join(", ")}. Сократите текст, раздвиньте отрезок или увеличьте «ускорять до».`, "warn");
  vSummary(); scheduleVoices();
}
function vSummary() {
  for (const l of LANGS) {
    const withText = S.cues.filter((c) => c[l].trim()), ok = withText.filter((c) => voiceFresh(c, l));
    const over = ok.filter((c) => c.v[l].len > slotOf(c) + 0.05), stale = withText.filter((c) => c.v[l] && !voiceFresh(c, l));
    const total = ok.reduce((s, c) => s + c.v[l].len, 0);
    $("vsum_" + l).innerHTML = !withText.length ? "Нет текста на этом языке." :
      `Озвучено <b>${ok.length} из ${withText.length}</b>${ok.length ? ` · голос ${n1(total)} с` : ""}` +
      (over.length ? ` · <span style="color:var(--err)">не помещаются: ${over.map((c) => "#" + num(c)).join(", ")}</span>` : "") +
      (stale.length ? ` · <span style="color:var(--warn)">изменились: ${stale.length}</span>` : "");
  }
  subInfo(); rInfo();
  if (typeof stepSums === "function") stepSums();
}
let refitN = 0;
async function refit(onlyPid) {
  const my = ++refitN;
  for (const c of S.cues) for (const l of LANGS) {
    if (my !== refitN) return;
    if (onlyPid && pidFor(c, l) !== onlyPid) continue;   // настройки опять поменяли — начнём заново
    if (voiceFresh(c, l) && mem.get(c.v[l].key)) await applyFit(c, l, mem.get(c.v[l].key), c.v[l].key);
  }
  S.cues.forEach(updFit); vSummary(); drawTL(); if (!V.paused) scheduleVoices();
}
const vLabels = () => { $("vSpeedVal").textContent = (+$("vSpeed").value).toFixed(2) + "×"; $("vMaxVal").textContent = (+$("vMax").value).toFixed(2) + "×"; $("mixOrigVal").textContent = $("mixOrig").value + "%"; $("fsGapV").textContent = n1($("fsGap").value) + " с"; };
let refitT;
["vSpeed", "vMax", "vFit", "vTrim"].forEach((id) => $(id).addEventListener("input", () => { vLabels(); saveSet(); clearTimeout(refitT); refitT = setTimeout(refit, 250); }));
$("mixOrig").addEventListener("input", () => { vLabels(); saveSet(); });
["aiLangs", "aiTone", "aiCtx", "aiWish", "aiFrames", "aiModel", "aiCustom", "segLen"].forEach((id) => $(id).addEventListener("change", saveSet));

// ---- проигрывание голоса вместе с видео ----
let AC = null, vGain = null, live = [], one = null, anchor = null;
function ensureAC() {
  if (!AC) { AC = new AudioContext(); vGain = AC.createGain(); vGain.gain.value = +$("volVoice").value / 100; vGain.connect(AC.destination); }
  if (AC.state === "suspended") AC.resume();
  return AC;
}
function stopVoices() { live.forEach((s) => { try { s.stop(); } catch {} }); live = []; anchor = null; }
function scheduleVoices() {
  stopVoices();
  const l = prevLang();
  if (V.paused || !S.file || (l === "off" && !M.buf)) return;
  ensureAC();
  const t = V.currentTime, rate = V.playbackRate, now = AC.currentTime + 0.04;
  anchor = { ac: now, v: t, rate };
  scheduleMusic(t, rate, now);
  if (l !== "off") for (const c of S.cues) {
    const v = c.v[l]; if (!v) continue;
    const d = v.buf.duration; if (c.start + d <= t) continue;
    const s = AC.createBufferSource(); s.buffer = v.buf; s.playbackRate.value = rate; s.connect(vGain);
    if (c.start >= t) s.start(now + (c.start - t) / rate); else s.start(now, t - c.start);
    live.push(s);
  }
}
let driftT = 0;
function checkDrift() {
  if (!anchor || !AC || performance.now() - driftT < 1500) return;
  driftT = performance.now();
  const exp = anchor.v + (AC.currentTime - anchor.ac) * anchor.rate;
  if (Math.abs(exp - V.currentTime) > 0.12) scheduleVoices();
}
async function playCue(c, l, btn) {
  ensureAC();
  if (one) { try { one.stop(); } catch {} one = null; }
  if (!c[l].trim()) return toast("Нет текста");
  if (!voiceFresh(c, l)) {
    const key = voiceKey(c, l);
    let raw = await cached(key);
    if (!raw) {
      if (btn) btn.textContent = "…";
      try { const r = await tts(pidFor(c, l), c[l].trim()); raw = r.buf; mem.set(key, raw); idbPut(key, raw); logTo("vLog", `Фраза #${num(c)} ${l.toUpperCase()} озвучена${r.cost ? ` — ${r.cost.toFixed(2)} ₽` : ""}`, "ok"); }
      catch (e) { toast(e.message); if (btn) btn.textContent = "▶"; return; }
      if (btn) btn.textContent = "▶";
    }
    await applyFit(c, l, raw, key); updFit(c); drawTL(); vSummary();
  }
  const s = AC.createBufferSource(); s.buffer = c.v[l].buf; s.connect(vGain); s.start(); one = s;
}
