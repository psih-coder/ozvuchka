"use strict";
// ---- экспорт ----
const baseName = () => (S.name || "voiceover").replace(/\.[^.]+$/, "");
document.querySelectorAll("[data-exp]").forEach((b) => b.onclick = () => {
  const l = b.dataset.lang, k = b.dataset.exp;
  if (k === "srt") return exportSrt(l);
  runV(() => exportWav(l));
});
function voiced(l) {
  const list = S.cues.filter((c) => c.v[l]);
  if (!list.length) throw new Error(`Нет озвучки ${l.toUpperCase()} — сначала нажмите «Озвучить ${l.toUpperCase()}».`);
  const stale = S.cues.filter((c) => c[l].trim() && !voiceFresh(c, l));
  if (stale.length && !confirm(`${stale.length} фраз ${l.toUpperCase()} изменились или не озвучены (${stale.map((c) => "#" + num(c)).join(", ")}). Сохранить как есть?`)) throw CANCEL;
  return list;
}
async function exportWav(l) {
  const list = voiced(l), sr = 48000;
  const len = Math.ceil(Math.max(totalDur(), ...list.map((c) => c.start + c.v[l].buf.duration)) * sr);
  const li = logTo("vLog", `Собираю дорожку ${l.toUpperCase()} (${fmt(len / sr)})…`);
  const out = new Float32Array(len);
  for (const c of list) {
    const d = (await resampleTo(c.v[l].buf, sr)).getChannelData(0), s0 = Math.round(c.start * sr);
    for (let i = 0; i < d.length && s0 + i < len; i++) out[s0 + i] += d[i];
  }
  downloadBlob(new Blob([encodeWav([out], sr)], { type: "audio/wav" }), `${baseName()}_voice_${l}.wav`);
  done(li, `Дорожка ${l.toUpperCase()} скачана: ставьте в монтажке на 0:00 — фразы встанут на свои таймкоды.`);
}
function exportSrt(l) {
  const list = S.cues.filter((c) => c[l].trim());
  if (!list.length) return toast(`Нет текста ${l.toUpperCase()}`);
  const srt = list.map((c, i) => {
    const e = voiceFresh(c, l) ? c.start + c.v[l].len : Math.min(effEnd(c), c.start + estDur(c, l) + 0.4);
    return `${i + 1}\n${srtTime(c.start)} --> ${srtTime(Math.max(e, c.start + 0.3))}\n${c[l].replace(/\[[^\]\n]{1,30}\]/g, "").replace(/\s+/g, " ").trim()}\n`;
  }).join("\n");
  downloadBlob(new Blob([srt], { type: "text/plain;charset=utf-8" }), `${baseName()}_${l}.srt`);
  logTo("vLog", `Субтитры ${l.toUpperCase()} скачаны (${list.length} шт.)`, "ok");
}
const MB_URLS = ["https://cdn.jsdelivr.net/npm/mediabunny@1.60.0/dist/bundles/mediabunny.min.mjs", "https://unpkg.com/mediabunny@1.60.0/dist/bundles/mediabunny.min.mjs"];
let mbLib = null;
async function loadMB() {
  if (mbLib) return mbLib;
  for (const u of MB_URLS) { try { mbLib = await import(u); return mbLib; } catch (e) { console.warn("mediabunny:", u, e); } }
  throw new Error("Не загрузилась библиотека для видео (mediabunny). Проверьте интернет или VPN.");
}
// видео копируется как есть (без перекодирования — быстро и без потерь), звук: оригинал тише + озвучка
async function exportVideo(l, onBlob, bar) {
  if (!S.file) throw new Error("Сначала загрузите видео.");
  if (!window.AudioEncoder) throw new Error("Браузер не умеет кодировать звук — нужен свежий Chrome или Edge.");
  const list = voiced(l);
  const li = logTo("rLog", `Собираю видео с озвучкой ${l.toUpperCase()}…`);
  const mb = await loadMB();
  const input = new mb.Input({ source: new mb.BlobSource(S.file), formats: mb.ALL_FORMATS });
  let output = null, writable = null;
  try {
    const vt = await input.getPrimaryVideoTrack();
    if (!vt) throw new Error("В файле нет видеодорожки.");
    const at = await input.getPrimaryAudioTrack();
    const toMp4 = ["avc", "hevc", "vp9", "av1"].includes(vt.codec), ext = toMp4 ? "mp4" : "webm";
    const origVol = +$("mixOrig").value / 100;
    const useOrig = !!(at && origVol > 0 && (await at.canDecode()));
    const sr = useOrig ? at.sampleRate : 48000, nch = useOrig ? Math.min(2, at.numberOfChannels) : 2;
    const acodec = toMp4 ? "aac" : "opus";
    if (!(await mb.canEncodeAudio(acodec, { numberOfChannels: nch, sampleRate: sr, bitrate: 192e3 }))) throw new Error(`Браузер не умеет кодировать звук ${acodec}.`);
    const name = `${baseName()}_${l}.${ext}`;
    if (window.showSaveFilePicker && S.file.size > 400e6) {   // большой файл — пишем сразу на диск
      try { writable = await (await showSaveFilePicker({ suggestedName: name, types: [{ description: "Видео", accept: { [toMp4 ? "video/mp4" : "video/webm"]: ["." + ext] } }] })).createWritable(); }
      catch (e) { if (e.name === "AbortError") throw CANCEL; writable = null; }
    }
    output = new mb.Output({
      format: toMp4 ? new mb.Mp4OutputFormat({ fastStart: writable ? false : "in-memory" }) : new mb.WebMOutputFormat(),
      target: writable ? new mb.StreamTarget(writable, { chunked: true }) : new mb.BufferTarget(),
    });
    const vsrc = new mb.EncodedVideoPacketSource(vt.codec);
    output.addVideoTrack(vsrc, { rotation: vt.rotation || 0 });
    const asrc = new mb.AudioBufferSource({ codec: acodec, bitrate: 192e3 });
    output.addAudioTrack(asrc);
    await output.start();
    const clips = [];
    for (const c of list) clips.push({ start: c.start, d: (await resampleTo(c.v[l].buf, sr)).getChannelData(0) });
    const dur = (await input.computeDuration()) || S.dur;
    let vp = 0, ap = 0;
    const prog = () => { if (bar) $(bar).value = Math.min(vp, ap) * 100; li.textContent = `⏳ Собираю видео ${l.toUpperCase()}… ${Math.round(Math.min(vp, ap) * 100)}%`; };
    const isStop = () => S.vStop || S.rStop;
    const videoLoop = async () => {
      const sink = new mb.EncodedPacketSink(vt), cfg = await vt.getDecoderConfig();
      let first = true;
      for await (const p of sink.packets()) {
        if (isStop()) throw STOP;
        await vsrc.add(p, first ? { decoderConfig: cfg } : undefined);
        first = false; vp = p.timestamp / dur; prog();
      }
      vsrc.close(); vp = 1;
    };
    const mus = await musicFor(l, sr, nch, dur);
    const audioLoop = () => mixAudio({ mb, at: useOrig ? at : null, asrc, clips, dur, sr, nch, origVol, vg: +$("volVoice").value / 100, mus, onProg: (p) => { ap = p; prog(); }, isStop });
    await Promise.all([videoLoop(), audioLoop()].map((p) => p.catch((e) => { S.vStop = true; throw e; })));
    await output.finalize();
    li.remove();
    if (writable) { try { await writable.close(); } catch {} onBlob(null, name); }
    else onBlob(new Blob([output.target.buffer], { type: toMp4 ? "video/mp4" : "video/webm" }), name);
  } catch (e) {
    try { await output?.cancel(); } catch {}
    try { await writable?.abort(); } catch {}
    li.remove(); throw e;
  } finally { input.dispose?.(); }
}
