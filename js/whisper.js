"use strict";
// --- точное время слов: Whisper слушает каждую озвученную фразу (в браузере) ---
const TF_URLS = ["https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1", "https://unpkg.com/@huggingface/transformers@3.5.1/dist/transformers.min.js"];
let tfLib = null, gpuInfo = null;
const asrPipes = {};
async function loadTF() {
  if (tfLib) return tfLib;
  for (const u of TF_URLS) { try { tfLib = await import(u); tfLib.env.allowLocalModels = false; return tfLib; } catch (e) { console.warn("Не загрузилось:", u, e); } }
  throw new Error("Не загрузилась библиотека распознавания. Проверьте интернет или включите VPN.");
}
async function gpu() {
  if (gpuInfo) return gpuInfo;
  gpuInfo = { ok: false, f16: false };
  try { const ad = navigator.gpu && (await navigator.gpu.requestAdapter()); if (ad) gpuInfo = { ok: true, f16: ad.features.has("shader-f16") }; } catch {}
  return gpuInfo;
}
async function getAsr(where, say) {
  if (asrPipes[where]) return asrPipes[where];
  const MODEL = "onnx-community/whisper-small_timestamped", { pipeline } = await loadTF(), g = await gpu(), files = {}, net = new Set();
  // модель лежит в кэше браузера — просим не удалять его, когда мало места
  try { await navigator.storage?.persist?.(); } catch {}
  // какие файлы модели уже в кэше: библиотека шлёт «download» и «progress» и при чтении из кэша — сама не различает
  const have = [];
  try { for (const r of await (await caches.open("transformers-cache")).keys()) if (r.url.includes(MODEL)) have.push(r.url); } catch {}
  asrPipes[where] = await pipeline("automatic-speech-recognition", MODEL, {
    device: where === "gpu" ? "webgpu" : "wasm",
    dtype: where === "gpu" ? { encoder_model: g.f16 ? "fp16" : "fp32", decoder_model_merged: g.f16 ? "fp16" : "fp32" } : "q8",
    progress_callback: (p) => {
      if (p.status !== "progress" || !p.total) return;
      if (!have.some((u) => u.endsWith("/" + p.file))) net.add(p.file);
      files[p.file] = [p.loaded, p.total];
      let a = 0, b = 0; for (const [x, y] of Object.values(files)) { a += x; b += y; }
      const mb = `${(a / 1e6).toFixed(0)} из ${(b / 1e6).toFixed(0)} МБ`;
      say(net.size ? `Скачиваю Whisper (только первый раз): ${mb}` : `Загружаю Whisper из памяти браузера: ${mb}`);
    },
  });
  return asrPipes[where];
}
// облако: Whisper в Polza — быстро и на телефоне; время слов (verbose_json) отдаёт только Whisper 1, turbo — один текст
const ASR_CLOUD = { w1: "openai/whisper-1" };
const isPhone = matchMedia("(pointer: coarse) and (hover: none)").matches;
if (isPhone) $("asrWhere").value = "cloud";   // сохранённый выбор (restoreSet) всё равно главнее
$("asrWhere").addEventListener("change", saveSet);
async function recognizeCloud(model, buf, l) {
  const fd = new FormData(), dur = buf.duration;
  fd.append("file", bufToWav(await resampleTo(buf, 16000)), "voice.wav");
  fd.append("model", model);
  fd.append("language", l);
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "word");
  fd.append("timestamp_granularities[]", "segment");
  const d = await polza("/audio/transcriptions", fd), clip = (x) => Math.min(dur, Math.max(0, +x || 0));
  let rec = (d.words || []).map((x) => ({ w: String(x.word ?? x.text ?? "").trim(), start: clip(x.start), end: clip(x.end) }));
  // слов нет — делим каждый отрезок между его словами по числу букв
  if (!rec.length) for (const s of d.segments || []) {
    const ws = String(s.text || "").trim().split(/\s+/).filter(Boolean), st = clip(s.start), en = Math.max(st, clip(s.end));
    const tot = ws.reduce((a, w) => a + (spoken(w, l) || 1), 0); let acc = 0;
    for (const w of ws) { const a = st + (en - st) * acc / tot; acc += spoken(w, l) || 1; rec.push({ w, start: a, end: st + (en - st) * acc / tot }); }
  }
  const segs = (d.segments || []).map((s) => ({ start: clip(s.start), end: Math.max(clip(s.start), clip(s.end)), text: String(s.text || "").trim() })).filter((s) => s.text);
  return { rec: rec.filter((r) => /[\p{L}\p{N}]/u.test(r.w)).map((r) => ({ ...r, end: Math.max(r.start, r.end) })), segs, cost: costOf(d) };
}
async function recognizeClip(pipe, buf, l) {
  const a16 = (await resampleTo(buf, 16000)).getChannelData(0);
  let pk = 0; for (const x of a16) pk = Math.max(pk, Math.abs(x));
  const audio = pk > 1e-4 && pk < 0.9 ? a16.map((x) => x * 0.9 / pk) : a16, dur = buf.duration;
  const out = await pipe(audio, { task: "transcribe", language: l === "en" ? "english" : "russian", return_timestamps: "word", ...(dur > 28 ? { chunk_length_s: 30 } : {}) });
  const clip = (x) => Math.min(dur, Math.max(0, x));
  return (out.chunks || []).map((c) => { const st = clip(c.timestamp[0] ?? 0); return { w: c.text.trim(), start: st, end: Math.max(st, clip(c.timestamp[1] ?? st + 0.3)) }; })
    .filter((r) => /[\p{L}\p{N}]/u.test(r.w));
}
// распознанное похоже на текст фразы: букв примерно столько же, без зацикливания
function looksRight(rec, want, l) {
  if (!rec.length) return false;
  const got = rec.reduce((a, r) => a + spoken(r.w, l), 0);
  const cnt = {}; rec.forEach((r) => { const k = r.w.toLowerCase(); cnt[k] = (cnt[k] || 0) + 1; });
  return got > want * 0.55 && got < want * 1.7 && (rec.length < 6 || Math.max(...Object.values(cnt)) / rec.length < 0.3);
}
// позиция буквы в тексте → та же доля в распознанном → время (как в «Заводе»)
function mapWords(toks, rec, dur, l) {
  const rl = rec.map((r) => spoken(r.w, l) || 1), rt = rl.reduce((a, b) => a + b, 0), total = toks.reduce((a, w) => a + spoken(w, l), 0) || 1;
  const timeAt = (f) => { let pos = f * rt, acc = 0; for (let i = 0; i < rec.length; i++) { if (pos <= acc + rl[i] || i === rec.length - 1) return rec[i].start + clamp((pos - acc) / rl[i], 0, 1) * (rec[i].end - rec[i].start); acc += rl[i]; } return 0; };
  let pos = 0, prev = 0;
  const out = toks.map((w) => { const st = Math.min(dur - 0.05, Math.max(prev, timeAt(pos / total))); prev = st; pos += spoken(w, l); return { w, start: st }; });
  out.forEach((w, i) => { w.end = i + 1 < out.length ? Math.max(w.start + 0.05, out[i + 1].start) : Math.min(dur, Math.max(w.start + 0.2, rec[rec.length - 1].end)); });
  return out;
}
async function alignAll(langs = LANGS) {
  const jobs = [];
  for (const l of langs) for (const c of S.cues) if (c[l].trim() && voiceFresh(c, l) && !c.v[l].words) jobs.push({ c, l });
  if (!jobs.length) { logTo("sLog", S.cues.some((c) => LANGS.some((l) => voiceFresh(c, l))) ? "Время слов уже точное для всех озвученных фраз." : "Сначала озвучьте фразы — Whisper слушает готовый голос.", "warn"); return; }
  const cloud = $("asrWhere").value === "cloud";
  const li = logTo("sLog", cloud ? "Отправляю голос в Polza…" : "Загружаю Whisper…"), say = (m) => { li.textContent = "⏳ " + m; };
  const order = cloud ? ["w1"] : (await gpu()).ok ? ["gpu", "cpu"] : ["cpu"];
  let ok = 0, k = 0, cost = 0;
  for (const { c, l } of jobs) {
    if (S.sStop) throw STOP;
    say(`Слушаю голос: фраза ${++k} из ${jobs.length} (#${num(c)} ${l.toUpperCase()})${cloud ? " — Polza" : ""}`);
    const v = c.v[l], toks = tokens(c[l]), want = toks.reduce((a, w) => a + spoken(w, l), 0);
    for (const where of order) {
      try {
        let rec;
        if (cloud) { const r = await recognizeCloud(ASR_CLOUD[where], v.buf, l); rec = r.rec; cost += r.cost; }
        else rec = await recognizeClip(await getAsr(where, say), v.buf, l);
        if (looksRight(rec, want, l)) { v.words = mapWords(toks, rec, v.len, l); ok++; break; }
        console.warn(`Whisper (${where}) не похож на текст #${num(c)}`, rec);
      } catch (e) {
        if (e.fatal) throw e;   // нет ключа / ключ не подошёл / нет денег — дальше пробовать бессмысленно
        console.warn("Whisper:", where, e); if (where === order[order.length - 1] && !ok && k === 1) throw new Error("Whisper не запустился: " + (e.message || e));
      }
    }
    S.ver++;
  }
  done(li, `Точное время слов: ${ok} из ${jobs.length} фраз${ok < jobs.length ? " (остальные — по длине слов)" : ""}${cost ? ` · ${cost < 0.01 ? "меньше 0,01" : cost.toFixed(2).replace(".", ",")} ₽` : ""}`, ok ? "ok" : "warn");
  subInfo(); drawOverlay();
}
let sBusy = false;
$("alignBtn").onclick = async () => {
  if (sBusy) return; sBusy = true; S.sStop = false; $("alignBtn").disabled = true;
  try { await alignAll(); } catch (e) { logTo("sLog", e.message, e === STOP ? "warn" : "err"); }
  sBusy = false; $("alignBtn").disabled = false;
};

// ---- субтитры по голосу из самого видео: звук видео → Whisper → сценарий и фразы с точным временем слов ----
// звук видео: моно 16 кГц (для Whisper этого достаточно)
async function videoAudio16k(say) {
  const mb = await loadMB(), input = new mb.Input({ source: new mb.BlobSource(S.file), formats: mb.ALL_FORMATS });
  try {
    const at = await input.getPrimaryAudioTrack();
    if (!at) throw new Error("В видео нет звуковой дорожки.");
    if (!(await at.canDecode())) throw new Error("Браузер не может прочитать звук этого видео. Попробуйте mp4 со звуком AAC.");
    const dur = (await input.computeDuration()) || S.dur, out = [];
    let blk = [], blkN = 0, sr = at.sampleRate, done16 = 0;
    // копим ~30 с исходного звука и пересэмплируем кусками — так быстро и без лишней памяти
    const flush = async () => {
      if (!blkN) return;
      const ab = new AudioBuffer({ length: blkN, numberOfChannels: 1, sampleRate: sr }), d = ab.getChannelData(0);
      let o = 0; for (const p of blk) { d.set(p, o); o += p.length; }
      const r = (await resampleTo(ab, 16000)).getChannelData(0); out.push(r.slice()); done16 += r.length;
      blk = []; blkN = 0;
      say(`Достаю звук из видео: ${Math.min(100, Math.round(done16 / 16000 / Math.max(1, dur) * 100))}%`);
    };
    for await (const { buffer } of new mb.AudioBufferSink(at).buffers()) {
      if (S.sStop) throw STOP;
      sr = buffer.sampleRate;
      const n = buffer.length, m = new Float32Array(n), ch = buffer.numberOfChannels;
      for (let c = 0; c < ch; c++) { const s = buffer.getChannelData(c); for (let i = 0; i < n; i++) m[i] += s[i] / ch; }
      blk.push(m); blkN += n;
      if (blkN >= sr * 30) await flush();
    }
    await flush();
    const all = new Float32Array(done16); let o = 0; for (const p of out) { all.set(p, o); o += p.length; }
    return all;
  } finally { input.dispose?.(); }
}
// режем на куски до maxSec по самым тихим местам, чтобы не разрезать слово
function splitQuiet(a, maxSec, sr = 16000) {
  const parts = []; let from = 0;
  while (a.length - from > maxSec * sr) {
    // тишину ищем в последней трети куска (но не дальше 20 с от конца) — кусок всегда сдвигается вперёд
    const hi = from + maxSec * sr, lo = Math.max(from + Math.round(maxSec * sr * 2 / 3), hi - 20 * sr), win = Math.round(0.3 * sr);
    let best = hi, bestE = Infinity;
    for (let i = lo; i + win < hi; i += Math.round(0.05 * sr)) { let e = 0; for (let j = i; j < i + win; j += 8) e += a[j] * a[j]; if (e < bestE) { bestE = e; best = i + (win >> 1); } }
    parts.push([from, best]); from = best;
  }
  parts.push([from, a.length]);
  return parts;
}
// слова → фразы: по отрезкам Whisper, а без них — по точкам и паузам
function phrasesOf(words, segs) {
  if (segs.length) return segs.map((s) => ({ start: s.start, end: s.end, text: s.text.replace(/\s+/g, " ") }));
  const out = []; let cur = [];
  const push = () => { if (cur.length) out.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.w).join(" ") }); cur = []; };
  words.forEach((w, i) => {
    cur.push(w);
    const nx = words[i + 1], len = w.end - cur[0].start;
    if (!nx || /[.!?…]["»”)]*$/.test(w.w) || nx.start - w.end > 0.8 || (len > 9 && /[,;:—]$/.test(w.w)) || len > 14) push();
  });
  push();
  return out;
}
// сколько секунд в куске звучит голос (громче 6% от пика) — чтобы понять, не мало ли распознано
function speechSecs(a, sr = 16000) {
  const fr = Math.round(sr * 0.02), n = Math.floor(a.length / fr), rms = new Float32Array(n);
  let mx = 0;
  for (let f = 0; f < n; f++) { let q = 0; for (let i = f * fr; i < (f + 1) * fr; i += 2) q += a[i] * a[i]; rms[f] = Math.sqrt(q / (fr / 2)); mx = Math.max(mx, rms[f]); }
  let on = 0; for (const r of rms) if (r > mx * 0.06) on++;
  return on * 0.02;
}
// распознанное похоже на речь: букв примерно сколько успели бы сказать, без зацикливания
function asrPlausible(rec, sec, l) {
  if (sec < 1) return true;
  const got = rec.reduce((a, r) => a + spoken(r.w, l), 0), want = sec * CPS[l];
  const cnt = {}; rec.forEach((r) => { const k = r.w.toLowerCase(); cnt[k] = (cnt[k] || 0) + 1; });
  return got > want * 0.3 && got < want * 3 && (rec.length < 6 || Math.max(...Object.values(cnt)) / rec.length < 0.3);
}
let gpuBad = false;   // видеокарта уже выдала мусор — дальше в этой сессии только процессор
async function transcribeVideo() {
  if (!S.file) throw new Error("Сначала загрузите видео в шаге 1.");
  const l = $("audLang").value, cloud = $("asrWhere").value === "cloud";
  if ((S.cues.length || S.script[l].trim()) && !confirm(`Сценарий ${l.toUpperCase()} и фразы будут заменены текстом, распознанным из звука видео. Продолжить?`)) throw CANCEL;
  const li = logTo("sLog", "Достаю звук из видео…"), say = (m) => { li.textContent = "⏳ " + m; };
  try {
    const a = await videoAudio16k(say);
    if (a.length < 16000 * 0.5) throw new Error("Звук в видео слишком короткий.");
    // облако: кусок до 10 мин (WAV ~19 МБ — под лимит загрузки); в браузере — так же, чтобы видеть прогресс
    const parts = splitQuiet(a, 600), words = [], segs = [];
    let cost = 0;
    for (let i = 0; i < parts.length; i++) {
      if (S.sStop) throw STOP;
      const [f, t] = parts[i], off = f / 16000, buf = new AudioBuffer({ length: t - f, numberOfChannels: 1, sampleRate: 16000 });
      buf.copyToChannel(a.subarray(f, t), 0);
      say(`Слушаю голос${parts.length > 1 ? `: часть ${i + 1} из ${parts.length}` : ""} (${fmt(off, 0)}–${fmt(t / 16000, 0)})${cloud ? " — Polza" : ""}`);
      let rec = [], sg = [];
      const sec = speechSecs(a.subarray(f, t));
      if (cloud) {
        let r = null;
        for (const m of [ASR_CLOUD.w1]) {
          try { const x = await recognizeCloud(m, buf, l); cost += x.cost; if (!r || x.rec.length > r.rec.length) r = x; if (asrPlausible(x.rec, sec, l)) break; console.warn(`Whisper (${m}) распознал мало для ${sec.toFixed(0)} с речи`, x.rec); }
          catch (e) { if (e.fatal) throw e; console.warn("Whisper:", m, e); if (m === ASR_CLOUD.w1 && !r) throw new Error("Polza не распознала звук: " + (e.message || e)); }
        }
        rec = r.rec; sg = r.segs;
      } else {
        const order = (await gpu()).ok && !gpuBad ? ["gpu", "cpu"] : ["cpu"];
        for (const where of order) {
          try {
            rec = await recognizeClip(await getAsr(where, say), buf, l);
            if (asrPlausible(rec, sec, l)) break;
            console.warn(`Whisper (${where}) распознал мало для ${sec.toFixed(0)} с речи`, rec);
          } catch (e) { console.warn("Whisper:", where, e); if (where === "cpu") throw new Error("Whisper не запустился: " + (e.message || e)); }
          if (where === "gpu") { gpuBad = true; say("Видеокарта ошиблась — повторяю на процессоре…"); }
        }
      }
      words.push(...rec.map((w) => ({ w: w.w, start: +(w.start + off).toFixed(2), end: +(w.end + off).toFixed(2) })));
      segs.push(...sg.map((s) => ({ ...s, start: s.start + off, end: s.end + off })));
    }
    if (!words.length) throw new Error("Речь не распознана — в видео нет голоса или он неразборчив.");
    const ph = phrasesOf(words, segs).filter((p) => p.text.trim());
    snap();
    S.cues = ph.map((p) => { const c = newCue(+p.start.toFixed(2), +Math.max(p.end, p.start + 0.3).toFixed(2)); c[l] = p.text.trim(); return c; });
    S.arec = { l, words };
    S.script[l] = S.cues.map((c) => `${fmt(c.start)} - ${fmt(c.end)} ${c[l]}`).join("\n");
    S.builtSig = null; S.handEdited = false; S.sel = null; S.ver++;
    edShow(l); setVmode("phrases"); renderAll(); save();
    $("rVoice").value = "orig"; $("rVoice").dispatchEvent(new Event("change"));
    done(li, `Распознано: ${S.cues.length} фраз, ${words.length} слов${cost ? ` · ${cost < 0.01 ? "меньше 0,01" : cost.toFixed(2).replace(".", ",")} ₽` : ""}. Текст — в сценарии ${l.toUpperCase()}, рендер — «Оригинальный звук».`);
  } catch (e) { li.remove(); throw e; }
}
$("audBtn").onclick = async () => {
  if (sBusy) return; sBusy = true; S.sStop = false; $("audBtn").disabled = true;
  try { await transcribeVideo(); } catch (e) { if (e !== CANCEL) logTo("sLog", e.message, e === STOP ? "warn" : "err"); }
  sBusy = false; $("audBtn").disabled = false;
};
$("audLang").addEventListener("change", saveSet);
$("rVoice").addEventListener("change", rInfo);
// время слов фразы без озвучки — из распознанного звука видео
function origWords(c, l, toks) {
  if (S.arec?.l !== l) return null;
  const a = c.start, b = effEnd(c);
  const rec = S.arec.words.filter((w) => { const m = (w.start + w.end) / 2; return m >= a - 0.05 && m < b + 0.05; }).map((w) => ({ w: w.w, start: Math.max(0, w.start - a), end: Math.max(0, w.end - a) }));
  if (!rec.length) return null;
  return mapWords(toks, rec, Math.max(0.1, b - a), l).map((w) => ({ w: w.w, start: a + w.start, end: a + w.end }));
}
// правки сценария сразу меняют фразы (пока проект не озвучен — после озвучки фразы собирает «Озвучить»)
function syncFromScript(l) {
  if (S.arec?.l !== l || S.cues.some((c) => LANGS.some((x) => c.v[x]))) return;
  let prev = 0;
  S.cues = parseScript(S.script[l], l).lines.map((x) => { const st = x.t0 ?? prev, c = newCue(st, x.t1); c[l] = x.text; prev = x.t1 ?? st + 1; return c; });
  sortCues(); S.ver++; renderAll(); drawOverlay();
}
