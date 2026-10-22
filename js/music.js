"use strict";
// ================= Музыка =================
// трек лежит в браузере (IndexedDB), его настройки — в проекте; на таймлайне — своя дорожка ♪
const mlen = () => Math.max(0, M.to - M.from);
// сколько музыка звучит в видео: кусок трека один раз — или по кругу до конца видео
const mspan = () => (M.loop && mlen() > 0.5 ? Math.max(0, totalDur() - M.at) : mlen());
// какое место трека звучит в момент t видео
const mpos = (t) => M.from + (M.loop && mlen() > 0.5 ? (t - M.at) % mlen() : t - M.at);
function mdb() { return new Promise((res, rej) => { const r = indexedDB.open("vo-music", 1); r.onupgradeneeded = () => r.result.createObjectStore("f"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function mdbPut(file) {
  try { const db = await mdb(); await new Promise((res) => { const t = db.transaction("f", "readwrite"); if (file) t.objectStore("f").put(file, "track"); else t.objectStore("f").delete("track"); t.oncomplete = t.onerror = t.onabort = res; }); } catch {}
}
async function mdbGet() {
  try { const db = await mdb(); return await new Promise((res) => { const q = db.transaction("f").objectStore("f").get("track"); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch { return null; }
}
async function setMusic(file, keep) {
  const buf = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await file.arrayBuffer());
  M.file = file; M.name = file.name || M.name || "музыка"; M.buf = buf;
  if (!keep || !(M.to > 0)) { M.at = 0; M.from = 0; M.to = buf.duration; }
  M.to = Math.min(M.to, buf.duration); M.from = clamp(M.from, 0, Math.max(0, M.to - 0.5));
  // пики для рисунка волны на дорожке
  const n = 1500, d0 = buf.getChannelData(0), d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : d0, per = Math.max(1, Math.floor(d0.length / n)), pk = new Float32Array(n);
  for (let i = 0; i < n; i++) { let m = 0; for (let j = i * per, e = Math.min(d0.length, j + per); j < e; j += 16) m = Math.max(m, Math.abs(d0[j]), Math.abs(d1[j])); pk[i] = m; }
  M.peaks = pk;
}
// когда звучит голос — под ним музыка тише (для «оригинального звука» — под распознанными фразами)
function voiceIv(l) {
  if (l === "orig") return S.cues.filter((c) => c.ru.trim() || c.en.trim()).map((c) => [c.start, effEnd(c)]);
  return S.cues.filter((c) => c.v[l]).map((c) => [c.start + (c.v[l].on?.[0] || 0), c.start + (c.v[l].on?.[1] ?? c.v[l].len)]).sort((a, b) => a[0] - b[0]);
}
// громкость музыки в момент t видео: громкость × плавные края × приглушение под голосом
function musicEnv(t, iv) {
  const a = M.at, b = M.at + mspan();
  if (!M.buf || t < a || t > b) return 0;
  let g = M.vol;
  if (M.fi > 0) g *= Math.min(1, (t - a) / M.fi);
  if (M.fo > 0) g *= Math.min(1, (b - t) / M.fo);
  if (M.duck && iv.length) {
    const R = 0.35; let w = 0;
    for (const [x, y] of iv) { if (x - R > t) break; w = Math.max(w, t >= x && t <= y ? 1 : t < x ? 1 - (x - t) / R : 1 - (t - y) / R); if (w >= 1) break; }
    g *= 1 - Math.max(0, w) * (1 - M.duckLvl);
  }
  return Math.max(0, g);
}
// прослушивание вместе с видео (вызывается из scheduleVoices)
function scheduleMusic(t, rate, now) {
  if (!M.buf || !AC) return;
  const a = M.at, b = a + mspan(); if (t >= b) return;
  const l = prevLang(), iv = l === "off" ? [] : voiceIv(l);
  const st = Math.max(t, a), when = now + (st - t) / rate, dur = b - st, step = 0.05;
  const cv = new Float32Array(Math.max(2, Math.ceil(dur / step) + 1));
  for (let i = 0; i < cv.length; i++) cv[i] = musicEnv(st + Math.min(dur, i * step), iv);
  const s = AC.createBufferSource(), g = AC.createGain();
  s.buffer = M.buf; s.playbackRate.value = rate;
  if (M.loop) { s.loop = true; s.loopStart = M.from; s.loopEnd = M.to; }
  g.gain.value = cv[0]; g.gain.setValueCurveAtTime(cv, when, dur / rate);
  s.connect(g); g.connect(AC.destination); s.start(when, mpos(st), dur);
  live.push(s);
}
// для рендера: нужный кусок трека в частоте и каналах видео + громкость по времени (100 точек в секунду)
async function musicFor(l, sr, nch, dur) {
  if (!M.buf || mlen() < 0.1 || M.at >= dur) return null;
  const len = Math.min(mspan(), dur - M.at), ctx = new OfflineAudioContext(nch, Math.ceil(len * sr), sr), s = ctx.createBufferSource();
  s.buffer = M.buf; s.connect(ctx.destination);
  if (M.loop) { s.loop = true; s.loopStart = M.from; s.loopEnd = M.to; }
  s.start(0, M.from, len);
  const r = await ctx.startRendering(), iv = voiceIv(l), env = new Float32Array(Math.ceil(dur * 100) + 2);
  for (let i = 0; i < env.length; i++) env[i] = musicEnv(i / 100, iv);
  return { chs: Array.from({ length: nch }, (_, i) => r.getChannelData(i)), env, at: M.at, n: r.length };
}

// ---- плашка «Музыка» ----
const MU_R = { muVol: ["vol", 100], muDuckLvl: ["duckLvl", 100], muFi: ["fi", 1], muFo: ["fo", 1] };
function muLabels() {
  $("muVolV").textContent = Math.round(M.vol * 100) + "%"; $("muDuckLvlV").textContent = Math.round(M.duckLvl * 100) + "%";
  $("muFiV").textContent = n1(M.fi) + " с"; $("muFoV").textContent = n1(M.fo) + " с";
}
function muUI() {
  const on = !!M.buf;
  $("muBox").hidden = !on; $("muDel").hidden = !on;
  $("muAdd").textContent = on ? "🔄 Другой трек" : "🎵 Добавить музыку";
  $("muName").textContent = on ? `${M.name} · ${fmt(M.buf.duration, 0)}` : M.name ? `Трек «${M.name}» был в проекте — добавьте его заново` : "";
  for (const [id, [k, f]] of Object.entries(MU_R)) $(id).value = M[k] * f;
  $("muDuck").checked = M.duck; $("muDuckLvl").closest("div").style.opacity = M.duck ? "" : ".5";
  $("muAt").value = fmt(M.at); $("muFrom").value = fmt(M.from); $("muTo").value = fmt(M.to);
  $("muLoop").checked = M.loop;
  $("musicSum").textContent = on ? `· ${M.name.replace(/\.[^.]+$/, "")}, ${Math.round(M.vol * 100)}%${M.duck ? ", тише под голосом" : ""}${M.loop ? ", по кругу" : ""}` : "· нет";
  muLabels(); rInfo();
}
let muT;
function muChanged() { muLabels(); drawTL(); clearTimeout(muT); muT = setTimeout(() => { save(); muUI(); if (!V.paused) scheduleVoices(); }, 200); }
for (const [id, [k, f]] of Object.entries(MU_R)) $(id).addEventListener("input", () => { M[k] = +$(id).value / f; muChanged(); });
$("muDuck").addEventListener("change", () => { M.duck = $("muDuck").checked; muChanged(); });
$("muLoop").addEventListener("change", () => { M.loop = $("muLoop").checked; muChanged(); });
for (const [id, k] of [["muAt", "at"], ["muFrom", "from"], ["muTo", "to"]]) $(id).addEventListener("change", () => {
  const t = parseTime($(id).value);
  if (isFinite(t) && M.buf) {
    if (k === "at") M.at = clamp(t, 0, Math.max(0, totalDur() - 0.5));
    else if (k === "from") M.from = clamp(t, 0, M.to - 0.5);
    else M.to = clamp(t, M.from + 0.5, M.buf.duration);
  }
  muChanged(); muUI();
});
$("muAdd").onclick = () => $("muFile").click();
$("muFile").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try { await setMusic(f); } catch { return toast("Не получилось прочитать этот файл — нужен mp3, m4a, wav или ogg"); }
  mdbPut(f); muUI(); sizeTL(); save(); if (!V.paused) scheduleVoices();
  toast(`Музыка: ${f.name}`);
};
$("muDel").onclick = () => {
  Object.assign(M, { file: null, name: "", buf: null, peaks: null, at: 0, from: 0, to: 0 });
  mdbPut(null); muUI(); sizeTL(); save(); if (!V.paused) scheduleVoices();
};
$("musicAcc").querySelectorAll("input[type=range]").forEach(lockRange);
// трек из прошлого раза
async function restoreMusic() {
  const f = await mdbGet();
  if (f) { try { await setMusic(f, true); } catch {} }
  muUI(); sizeTL();
}
