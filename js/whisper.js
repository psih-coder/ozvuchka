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
  const { pipeline } = await loadTF(), g = await gpu(), files = {}, net = new Set();
  // модель лежит в кэше браузера — просим не удалять его, когда мало места
  try { await navigator.storage?.persist?.(); } catch {}
  asrPipes[where] = await pipeline("automatic-speech-recognition", "onnx-community/whisper-small_timestamped", {
    device: where === "gpu" ? "webgpu" : "wasm",
    dtype: where === "gpu" ? { encoder_model: g.f16 ? "fp16" : "fp32", decoder_model_merged: g.f16 ? "fp16" : "fp32" } : "q8",
    progress_callback: (p) => {
      // «download» приходит только когда файла нет в кэше; «progress» — и при скачивании, и при чтении из кэша
      if (p.status === "download") { net.add(p.file); return; }
      if (p.status !== "progress" || !p.total) return;
      files[p.file] = [p.loaded, p.total];
      let a = 0, b = 0; for (const [x, y] of Object.values(files)) { a += x; b += y; }
      const mb = `${(a / 1e6).toFixed(0)} из ${(b / 1e6).toFixed(0)} МБ`;
      say(net.size ? `Скачиваю Whisper (только первый раз): ${mb}` : `Загружаю Whisper из памяти браузера: ${mb}`);
    },
  });
  return asrPipes[where];
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
function looksRight(rec, want) {
  if (!rec.length) return false;
  const got = rec.reduce((a, r) => a + letters(r.w), 0);
  const cnt = {}; rec.forEach((r) => { const k = r.w.toLowerCase(); cnt[k] = (cnt[k] || 0) + 1; });
  return got > want * 0.55 && got < want * 1.7 && (rec.length < 6 || Math.max(...Object.values(cnt)) / rec.length < 0.3);
}
// позиция буквы в тексте → та же доля в распознанном → время (как в «Заводе»)
function mapWords(toks, rec, dur) {
  const rl = rec.map((r) => letters(r.w) || 1), rt = rl.reduce((a, b) => a + b, 0), total = toks.reduce((a, w) => a + letters(w), 0) || 1;
  const timeAt = (f) => { let pos = f * rt, acc = 0; for (let i = 0; i < rec.length; i++) { if (pos <= acc + rl[i] || i === rec.length - 1) return rec[i].start + clamp((pos - acc) / rl[i], 0, 1) * (rec[i].end - rec[i].start); acc += rl[i]; } return 0; };
  let pos = 0, prev = 0;
  const out = toks.map((w) => { const st = Math.min(dur - 0.05, Math.max(prev, timeAt(pos / total))); prev = st; pos += letters(w); return { w, start: st }; });
  out.forEach((w, i) => { w.end = i + 1 < out.length ? Math.max(w.start + 0.05, out[i + 1].start) : Math.min(dur, Math.max(w.start + 0.2, rec[rec.length - 1].end)); });
  return out;
}
async function alignAll(langs = LANGS) {
  const jobs = [];
  for (const l of langs) for (const c of S.cues) if (c[l].trim() && voiceFresh(c, l) && !c.v[l].words) jobs.push({ c, l });
  if (!jobs.length) { logTo("sLog", S.cues.some((c) => LANGS.some((l) => voiceFresh(c, l))) ? "Время слов уже точное для всех озвученных фраз." : "Сначала озвучьте фразы — Whisper слушает готовый голос.", "warn"); return; }
  const li = logTo("sLog", "Загружаю Whisper…"), say = (m) => { li.textContent = "⏳ " + m; };
  const order = (await gpu()).ok ? ["gpu", "cpu"] : ["cpu"];
  let ok = 0, k = 0;
  for (const { c, l } of jobs) {
    if (S.sStop) throw STOP;
    say(`Слушаю голос: фраза ${++k} из ${jobs.length} (#${num(c)} ${l.toUpperCase()})`);
    const v = c.v[l], toks = tokens(c[l]), want = toks.reduce((a, w) => a + letters(w), 0);
    for (const where of order) {
      try {
        const rec = await recognizeClip(await getAsr(where, say), v.buf, l);
        if (looksRight(rec, want)) { v.words = mapWords(toks, rec, v.len); ok++; break; }
        console.warn(`Whisper (${where}) не похож на текст #${num(c)}`, rec);
      } catch (e) { console.warn("Whisper:", where, e); if (where === order[order.length - 1] && !ok && k === 1) throw new Error("Whisper не запустился: " + (e.message || e)); }
    }
    S.ver++;
  }
  done(li, `Точное время слов: ${ok} из ${jobs.length} фраз${ok < jobs.length ? " (остальные — по длине слов)" : ""}`, ok ? "ok" : "warn");
  subInfo(); drawOverlay();
}
let sBusy = false;
$("alignBtn").onclick = async () => {
  if (sBusy) return; sBusy = true; S.sStop = false; $("alignBtn").disabled = true;
  try { await alignAll(); } catch (e) { logTo("sLog", e.message, e === STOP ? "warn" : "err"); }
  sBusy = false; $("alignBtn").disabled = false;
};
