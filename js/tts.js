"use strict";
// ================= Озвучка =================
function b64bytes(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
async function decodeAudio(u8, ct = "") {
  const h = String.fromCharCode(...u8.slice(0, 12));
  const known = h.startsWith("RIFF") || h.startsWith("ID3") || h.startsWith("OggS") || h.startsWith("fLaC") || h.slice(4, 8) === "ftyp" || (u8[0] === 0xff && (u8[1] & 0xe0) === 0xe0);
  if (!known || /pcm|l16|raw/i.test(ct)) {
    const sr = +(ct.match(/rate=(\d+)/)?.[1] || 24000), n = u8.length >> 1, dv = new DataView(u8.buffer, u8.byteOffset, n * 2);
    const buf = new AudioBuffer({ length: Math.max(1, n), numberOfChannels: 1, sampleRate: sr }), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = dv.getInt16(i * 2, true) / 32768;
    return buf;
  }
  return new OfflineAudioContext(1, 1, 48000).decodeAudioData(u8.slice().buffer);
}
const toMono = (buf) => {
  if (buf.numberOfChannels === 1) return buf;
  const out = new AudioBuffer({ length: buf.length, numberOfChannels: 1, sampleRate: buf.sampleRate }), o = out.getChannelData(0);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) o[i] += d[i] / buf.numberOfChannels; }
  return out;
};
// длинный текст (сплошная озвучка) озвучиваем большими кусками по абзацам и склеиваем в одну дорожку
const TTS_CHUNK = 1800;
function ttsChunks(text) {
  const paras = text.split(/\n\s*\n/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean), out = [];
  for (const p of paras) {
    let cur = "";
    for (const s of sentences(p, Infinity)) {
      if (cur && (cur + " " + s).length > TTS_CHUNK) { out.push({ t: cur, para: false }); cur = s; } else cur = cur ? cur + " " + s : s;
    }
    if (cur) out.push({ t: cur, para: true });
  }
  return out;
}
async function tts(pid, text) {
  if (text.length <= TTS_CHUNK + 200) return ttsOne(pid, text);
  const parts = ttsChunks(text), bufs = [];
  let cost = 0;
  for (const [i, ch] of parts.entries()) {
    if (S.vStop) throw STOP;
    const r = await ttsOne(pid, ch.t); cost += r.cost;
    bufs.push({ b: trimSilence(r.buf), gap: i < parts.length - 1 ? (ch.para ? 0.55 : 0.3) : 0 });
  }
  const sr = bufs[0].b.sampleRate, rs = [];
  for (const x of bufs) rs.push({ d: (await resampleTo(x.b, sr)).getChannelData(0), gap: Math.round(x.gap * sr) });
  const out = new AudioBuffer({ length: rs.reduce((a, x) => a + x.d.length + x.gap, 0), numberOfChannels: 1, sampleRate: sr }), o = out.getChannelData(0);
  let k = 0; for (const x of rs) { o.set(x.d, k); k += x.d.length + x.gap; }
  return { buf: out, cost };
}
async function ttsOne(pid, text) {
  const o = vset(pid), m = ttsModel(o.model), lang = o.lang;
  if (o.none) throw new Error("Нет голоса для этого языка — нажмите «＋ Добавить голос».");
  if (!o.voice) throw new Error(`Голос «${o.name}»: модель ${m.name} не говорит на этом языке — выберите другую.`);
  if (o.el && o.tag && !/^\s*\[/.test(text)) text = `${o.tag} ${text}`;
  const body = { model: m.id, input: text, voice: o.voice };
  if (m.fmt) body.response_format = m.fmt;
  // характер и акцент понимает только OpenAI (instructions). Gemini через Polza их не получает, а подсказку перед текстом зачитывает вслух — ему только текст
  if (m.instr && o.style) body.instructions = o.style;
  if (m.langCode) body.language_code = lang;
  if (o.el) { body.stability = o.stability; body.similarity_boost = o.similarity; }
  let r;
  try { r = await polzaFetch("/audio/speech", body); }
  catch (e) {
    // как в polza-eleven-tts: если /audio/speech не принял модель — через Media API с ожиданием
    if (!o.el || ![400, 404, 422].includes(e.status)) throw e;
    return ttsViaMedia(o, text);
  }
  const ct = r.headers.get("content-type") || "";
  if (!/json/.test(ct)) return { buf: toMono(await decodeAudio(new Uint8Array(await r.arrayBuffer()), ct)), cost: 0 };
  let d = await r.json(), cost = costOf(d);
  for (let k = 0; (d.status === "pending" || d.status === "processing" || d.status === "queued") && d.id && k < 90; k++) {   // долгие модели отдают задачу
    await new Promise((res) => setTimeout(res, 2000));
    if (S.vStop) throw STOP;
    d = await polza(`/media/${d.id}`); cost = cost || costOf(d);
  }
  const b64 = d.audio || d.data?.audio || d.b64_json || d.data?.[0]?.b64_json;
  if (b64) return { buf: toMono(await decodeAudio(b64bytes(b64), d.contentType || d.content_type || "")), cost };
  const url = d.url || d.audio_url || d.data?.url || d.data?.[0]?.url || d.output?.url || d.output?.[0]?.url || d.result?.url;
  if (url) { const a = await fetch(url); if (!a.ok) throw new Error("Не удалось скачать звук у Polza"); return { buf: toMono(await decodeAudio(new Uint8Array(await a.arrayBuffer()), a.headers.get("content-type") || "")), cost }; }
  throw new Error("Polza вернула ответ без звука: " + JSON.stringify(d).slice(0, 160));
}
// Media API: задача → ждём готовности → ссылка на звук где-то в ответе
function findAudioUrl(x) {
  if (!x) return null;
  if (typeof x === "string") return /^https?:\/\//.test(x) ? x : null;
  if (Array.isArray(x)) { for (const y of x) { const u = findAudioUrl(y); if (u) return u; } return null; }
  if (typeof x === "object") {
    for (const k of ["url", "audio_url", "audio", "file"]) { const u = findAudioUrl(x[k]); if (u) return u; }
    for (const k in x) { const u = findAudioUrl(x[k]); if (u) return u; }
  }
  return null;
}
async function ttsViaMedia(o, text) {
  let job = await polza("/media", { model: o.model, input: { text, voice: o.voice, stability: o.stability, similarity_boost: o.similarity } });
  for (let i = 0; i < 90 && job && !["completed", "failed", "cancelled"].includes(job.status); i++) {
    if (S.vStop) throw STOP;
    await new Promise((res) => setTimeout(res, 2000));
    job = await polza(`/media/${job.id}`);
  }
  if (!job || job.status !== "completed") throw new Error("ElevenLabs: " + (job?.error?.message || "озвучка не завершилась"));
  const url = findAudioUrl(job.data);
  if (!url) throw new Error("ElevenLabs: в ответе нет ссылки на звук");
  const a = await fetch(url);
  if (!a.ok) throw new Error("Не удалось скачать звук у Polza");
  return { buf: toMono(await decodeAudio(new Uint8Array(await a.arrayBuffer()), a.headers.get("content-type") || "")), cost: costOf(job) };
}
function trimSilence(buf, thr = 0.012) {
  const d = buf.getChannelData(0), sr = buf.sampleRate, pad = Math.round(sr * 0.04);
  let a = 0, b = d.length - 1;
  while (a < b && Math.abs(d[a]) < thr) a++;
  while (b > a && Math.abs(d[b]) < thr) b--;
  a = Math.max(0, a - pad); b = Math.min(d.length - 1, b + pad);
  if (b - a < sr * 0.1 || (a < sr * 0.03 && d.length - b < sr * 0.03)) return buf;
  const out = new AudioBuffer({ length: b - a + 1, numberOfChannels: 1, sampleRate: sr });
  out.copyToChannel(d.subarray(a, b + 1), 0); return out;
}
// с сохранением тона: WSOLA (из video-tools)
function stretchKeepPitch(buf, speed) {
  const sr = buf.sampleRate, chs = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
  const len = chs[0].length, mono = new Float32Array(len);
  for (const ch of chs) for (let i = 0; i < len; i++) mono[i] += ch[i] / chs.length;
  const N = Math.round(sr * 0.04) & ~1, Hs = N / 2, Ha = Hs * speed, tol = Math.round(sr * 0.008);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const outLen = Math.ceil(len / speed) + N, outs = chs.map(() => new Float32Array(outLen)), L = Hs, STEP = 4;
  let prev = 0;
  for (let k = 0; ; k++) {
    const target = Math.round(k * Ha);
    if (target + N >= len) break;
    let best = target;
    if (k > 0) {
      const nat = prev + Hs; let bestC = -Infinity;
      const lo = Math.max(0, target - tol), hi = Math.min(len - N - 1, target + tol);
      for (let p = lo; p <= hi; p += 2) { let c = 0; for (let i = 0; i < L; i += STEP) c += mono[p + i] * mono[nat + i]; if (c > bestC) { bestC = c; best = p; } }
    }
    const o = k * Hs; if (o + N > outLen) break;
    for (let c = 0; c < chs.length; c++) { const x = chs[c], y = outs[c]; for (let i = 0; i < N; i++) y[o + i] += x[best + i] * win[i]; }
    prev = best;
  }
  const finalLen = Math.round(len / speed);
  return outs.map((y) => y.subarray(0, finalLen));
}
function speedBuf(buf, speed) {
  if (Math.abs(speed - 1) < 0.01) return buf;
  const chs = stretchKeepPitch(buf, speed);
  const out = new AudioBuffer({ length: Math.max(1, chs[0].length), numberOfChannels: chs.length, sampleRate: buf.sampleRate });
  chs.forEach((c, i) => out.copyToChannel(c, i)); return out;
}
function encodeWav(chs, sr) {
  const n = chs[0].length, nc = chs.length, bytes = n * nc * 2, dv = new DataView(new ArrayBuffer(44 + bytes));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); dv.setUint32(4, 36 + bytes, true); w(8, "WAVE"); w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, nc, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * nc * 2, true); dv.setUint16(32, nc * 2, true); dv.setUint16(34, 16, true);
  w(36, "data"); dv.setUint32(40, bytes, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const v = Math.max(-1, Math.min(1, chs[c][i])); dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return dv.buffer;
}
const bufToWav = (buf) => new Blob([encodeWav(Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i)), buf.sampleRate)], { type: "audio/wav" });
async function resampleTo(buf, sr) {
  if (buf.sampleRate === sr) return buf;
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * sr)), sr), s = ctx.createBufferSource();
  s.buffer = buf; s.connect(ctx.destination); s.start(); return ctx.startRendering();
}
