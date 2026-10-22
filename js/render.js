"use strict";
// ================= Рендер =================
// собирает звук: оригинал (тише) + фразы озвучки на своих местах; asrc — куда писать
async function mixAudio({ mb, at, asrc, clips, dur, sr, nch, origVol, vg, onProg, isStop, mus }) {
  let tDone = 0;
  const push = async (chs) => {
    const n = chs[0].length, s0 = Math.round(tDone * sr);
    for (const k of clips) {
      const a = Math.round(k.start * sr) - s0, from = Math.max(0, a), to = Math.min(n, a + k.d.length);
      for (const ch of chs) for (let i = from; i < to; i++) ch[i] += k.d[i - a] * vg;
    }
    // музыка: громкость по времени (100 точек в секунду, между ними — плавно)
    if (mus) for (let i = 0; i < n; i++) {
      const tg = (s0 + i) / sr, k = tg * 100, q = k | 0; if (q + 1 >= mus.env.length) break;
      const e = mus.env[q] + (mus.env[q + 1] - mus.env[q]) * (k - q); if (e <= 0) continue;
      const j = Math.round((tg - mus.at) * sr); if (j < 0 || j >= mus.n) continue;
      for (let c = 0; c < chs.length; c++) chs[c][i] += mus.chs[Math.min(c, mus.chs.length - 1)][j] * e;
    }
    const ab = new AudioBuffer({ length: n, numberOfChannels: nch, sampleRate: sr });
    chs.forEach((ch, i) => { for (let j = 0; j < n; j++) ch[j] = ch[j] > 1 ? 1 : ch[j] < -1 ? -1 : ch[j]; ab.copyToChannel(ch, i); });
    await asrc.add(ab);
    tDone += n / sr; onProg(tDone / dur);
  };
  const silence = async (sec) => { while (sec > 1e-4) { const n = Math.min(sr, Math.ceil(sec * sr)); await push(Array.from({ length: nch }, () => new Float32Array(n))); sec -= n / sr; } };
  if (at && origVol > 0) {
    const feed = async ({ buffer, timestamp }) => {
      if (timestamp > tDone + 0.005) await silence(Math.min(dur, timestamp) - tDone);
      if (tDone >= dur) return;
      const skip = Math.max(0, Math.round((tDone - timestamp) * sr));
      const len = Math.min(buffer.length - skip, Math.ceil((dur - tDone) * sr));
      if (len <= 0) return;
      await push(Array.from({ length: nch }, (_, i) => { const s = buffer.getChannelData(Math.min(i, buffer.numberOfChannels - 1)).subarray(skip, skip + len), d = new Float32Array(len); for (let j = 0; j < len; j++) d[j] = s[j] * origVol; return d; }));
    };
    try {
      if (!(await at.canDecode())) throw new Error("decoding not supported");
      for await (const b of new mb.AudioBufferSink(at).buffers()) { if (isStop()) throw STOP; if (tDone >= dur) break; await feed(b); }
    } catch (e) {
      if (!isDecodeErr(e)) throw e;
      // браузер (чаще на телефоне) не раскодировал звук по кусочкам — берём звук файла целиком и продолжаем с того же места
      const w = await wholeAudio(sr);
      for (let s = Math.floor(tDone * sr); s < w.length && tDone < dur; s += sr) {
        if (isStop()) throw STOP;
        const n = Math.min(sr, w.length - s), b = new AudioBuffer({ length: n, numberOfChannels: w.numberOfChannels, sampleRate: sr });
        for (let c = 0; c < w.numberOfChannels; c++) b.copyToChannel(w.getChannelData(c).subarray(s, s + n), c);
        await feed({ buffer: b, timestamp: s / sr });
      }
    }
  }
  if (tDone < dur) await silence(dur - tDone);
  asrc.close(); onProg(1);
}
// запасной декодер звука: встроенный в браузер, весь файл сразу (WebCodecs на телефонах иногда не справляется)
const isDecodeErr = (e) => e !== STOP && e !== CANCEL && /decod/i.test(e?.message || e?.name || "");
let wholeA = null;
async function wholeAudio(sr) {
  if (wholeA?.file === S.file && wholeA.sr === sr) return wholeA.buf;
  let buf;
  try { buf = await new OfflineAudioContext(2, 1, sr).decodeAudioData(await S.file.arrayBuffer()); }
  catch { throw new Error("Браузер не смог прочитать звук этого видео даже запасным способом. Попробуйте на компьютере в Chrome или пересохраните видео в mp4 (H.264 + AAC)."); }
  wholeA = { file: S.file, sr, buf }; return buf;
}
const evenUp = (x) => Math.max(2, Math.round(x / 2) * 2);
function outSize(srcW, srcH) {
  const [a, b] = curAR().split(":").map(Number), ar = a / b, res = $("rRes").value;
  if (res === "src") {
    // как у исходника: та же картинка, обрезанная под выбранный формат
    return srcW / srcH > ar ? [evenUp(srcH * ar), evenUp(srcH)] : [evenUp(srcW), evenUp(srcW / ar)];
  }
  const short = +res;
  return ar >= 1 ? [evenUp(short * ar), short] : [short, evenUp(short / ar)];
}
function rInfo() {
  if (!S.file) { $("rInfo").textContent = "Загрузите видео сверху."; return; }
  const [W, H] = outSize(S.w, S.h), langs = $("rVoice").value === "both" ? LANGS : [$("rVoice").value];
  const subs = $("rSubs").value, fast = subs === "none" && curAR() === S.arAuto && $("rRes").value === "src" && gradeNeutral();
  $("rInfo").innerHTML = `Получится: <b>${W}×${H}</b> (${curAR()}), ${fmt(S.dur)} · ${langs.map((l) => (l === "orig" ? "оригинальный звук без озвучки" : `голос ${l.toUpperCase()}`)).join(" и ")} · ` +
    (subs === "none" ? "без субтитров" : `субтитры ${subs === "same" ? "на языке голоса" : subs.toUpperCase()}`) +
    (M.buf ? ` · музыка «${esc(M.name)}»` : "") +
    (gradeNeutral() ? "" : ` · стиль: ${document.querySelector("#gChips .chip.on")?.textContent || "свой"}`) +
    ($("rRes").value !== "src" && +$("rRes").value > Math.min(S.w, S.h) * 1.05 ? ` · <span style="color:var(--warn)">исходник ${S.w}×${S.h} — увеличение не добавит чёткости (помогает «Резкость» в стиле)</span>` : "") +
    (fast ? " · <b>быстро, без перекодирования</b>" : ` · перекодирование видеокартой, ~${Math.max(1, Math.round(S.dur / 60 / 3))}–${Math.max(2, Math.round(S.dur / 60 / 1.5))} мин`);
}
["arSel"].forEach((id) => $(id).addEventListener("change", rInfo));

let rBusy = false;
$("rStop").onclick = () => { S.rStop = true; S.vStop = true; };
$("renderBtn").onclick = async () => {
  if (rBusy) return;
  rBusy = true; S.rStop = false; S.vStop = false; $("rStop").hidden = false; $("rBar").hidden = false; $("rBar").value = 0; $("renderBtn").disabled = true;
  try {
    if (!S.file) throw new Error("Сначала загрузите видео.");
    const langs = $("rVoice").value === "both" ? LANGS : [$("rVoice").value];
    for (const l of langs) {
      const sl = $("rSubs").value === "same" ? (l === "orig" ? S.arec?.l || (S.cues.some((c) => c.ru.trim()) ? "ru" : "en") : l) : $("rSubs").value;
      const fast = l !== "orig" && sl === "none" && curAR() === S.arAuto && $("rRes").value === "src" && gradeNeutral();
      if (fast) { await exportVideo(l, (blob, name) => { logTo("rLog", `Видео ${l.toUpperCase()} готово (без перекодирования): ${name}`, "ok"); showResult(blob, name, l); }, "rBar"); }
      else await renderOne(l, sl);
    }
  } catch (e) { if (e === STOP || e === CANCEL) logTo("rLog", e.message, "warn"); else { logTo("rLog", e.message, "err"); console.error(e); toast(e.message); } }
  rBusy = false; $("rStop").hidden = true; $("rBar").hidden = true; $("renderBtn").disabled = false;
};
function showResult(blob, name, l, toDisk) {
  const box = document.createElement("div"); box.className = "rres";
  const url = blob ? URL.createObjectURL(blob) : "";
  box.innerHTML = `${blob ? `<video src="${url}" controls playsinline></video>` : `<div class="big" style="font-size:40px;text-align:center">💾</div>`}
    <div class="meta"><div style="font-size:17px;font-weight:800;color:var(--ok)">✔ Готово: ${esc(name)}</div>
    <div class="hint">${blob ? `${(blob.size / 1048576).toFixed(1)} МБ` : "Файл записан на диск туда, куда вы выбрали"} · ${l === "orig" ? "оригинальный звук" : "голос " + l.toUpperCase()}</div>
    ${blob ? `<div class="row"><a class="btn" href="${url}" download="${esc(name)}">⬇ Скачать ещё раз</a></div>` : ""}</div>`;
  $("rOut").prepend(box);
  if (blob) { const a = document.createElement("a"); a.href = url; a.download = name; a.click(); }
}
async function renderOne(l, sl) {
  if (!window.VideoEncoder || !window.AudioEncoder) throw new Error("Браузер не умеет кодировать видео — нужен свежий Chrome или Edge.");
  const list = l === "orig" ? [] : voiced(l), lab = l === "orig" ? "оригинал" : l.toUpperCase();
  const groups = sl === "none" ? [] : groupsFor(sl), so = subOpts();
  if (sl !== "none" && !groups.length) throw new Error(`Нет текста ${sl.toUpperCase()} для субтитров.`);
  await loadSubFonts();
  const li = logTo("rLog", `Рендер ${lab}${sl !== "none" ? ` + субтитры ${sl.toUpperCase()}` : ""}: готовлю…`);
  const mb = await loadMB();
  const input = new mb.Input({ source: new mb.BlobSource(S.file), formats: mb.ALL_FORMATS });
  let output = null, writable = null;
  try {
    const vt = await input.getPrimaryVideoTrack();
    if (!vt) throw new Error("В файле нет видеодорожки.");
    if (!(await vt.canDecode())) throw new Error("Браузер не может прочитать это видео напрямую. Попробуйте mp4 (H.264).");
    const at = await input.getPrimaryAudioTrack();
    const srcW = vt.displayWidth, srcH = vt.displayHeight, [W, H] = outSize(srcW, srcH);
    let fps = 30; try { fps = clamp((await vt.computePacketStats(120)).averagePacketRate || 30, 10, 120); } catch {}
    // битрейт: от размера кадра и не ниже исходника (с запасом на перекодирование)
    const srcRate = S.file.size * 8 / Math.max(1, S.dur) * (W * H) / (srcW * srcH);
    const bitrate = Math.round(clamp(Math.max(W * H * Math.min(fps, 60) * +$("rQ").value, srcRate * 1.3), 2.5e6, 80e6));
    if (!(await mb.canEncodeVideo("avc", { width: W, height: H, bitrate }))) throw new Error(`Видеокарта не кодирует H.264 в ${W}×${H}. Выберите размер меньше.`);
    const origVol = l === "orig" ? 1 : +$("mixOrig").value / 100, useOrig = !!(at && origVol > 0);
    if (l === "orig" && !useOrig) throw new Error("В видео нет звука, который браузер может прочитать.");
    const sr = useOrig ? at.sampleRate : 48000, nch = useOrig ? Math.min(2, at.numberOfChannels) : 2;
    if (!(await mb.canEncodeAudio("aac", { numberOfChannels: nch, sampleRate: sr, bitrate: 192e3 }))) throw new Error("Браузер не умеет кодировать звук AAC.");
    const name = `${baseName()}_${l}${sl !== "none" ? "_subs" : ""}_${W}x${H}.mp4`;
    const dur = (await input.computeDuration()) || S.dur;
    if (window.showSaveFilePicker && W * H * dur * 0.13 * 30 / 8 > 400e6) {   // файл больше ~400 МБ — сразу на диск
      try { writable = await (await showSaveFilePicker({ suggestedName: name, types: [{ description: "Видео", accept: { "video/mp4": [".mp4"] } }] })).createWritable(); }
      catch (e) { if (e.name === "AbortError") throw CANCEL; writable = null; }
    }
    output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: writable ? false : "in-memory" }), target: writable ? new mb.StreamTarget(writable, { chunked: true }) : new mb.BufferTarget() });
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const cx = cv.getContext("2d", { alpha: false });
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
    const base = document.createElement("canvas"); base.width = W; base.height = H; const bx = base.getContext("2d", { alpha: false });
    const vsrc = new mb.CanvasSource(cv, { codec: "avc", bitrate, keyFrameInterval: 2 });
    output.addVideoTrack(vsrc, { frameRate: Math.round(fps) });
    const asrc = new mb.AudioBufferSource({ codec: "aac", bitrate: 192e3 });
    output.addAudioTrack(asrc);
    await output.start();
    const clips = [];
    for (const c of list) clips.push({ start: c.start, d: (await resampleTo(c.v[l].buf, sr)).getChannelData(0) });
    const vg = +$("volVoice").value / 100, t0 = performance.now();
    let vp = 0, ap = 0, lastUi = 0;
    const prog = () => {
      const p = Math.min(vp, ap), now = performance.now(); if (now - lastUi < 250 && p < 1) return; lastUi = now;
      $("rBar").value = p * 100;
      const el = (now - t0) / 1000, eta = p > 0.02 ? el / p - el : 0;
      li.textContent = `⏳ Рендер ${lab} ${W}×${H}: ${Math.round(p * 100)}%${eta ? ` · осталось ~${eta > 90 ? Math.round(eta / 60) + " мин" : Math.round(eta) + " с"}` : ""}`;
    };
    // кадр исходника → под формат (обрезка по центру) → субтитры поверх
    const sk = srcW / srcH, k = W / H;
    let sx = 0, sy = 0, sw = srcW, sh = srcH;
    if (sk > k) { sw = srcH * k; sx = (srcW - sw) / 2; } else if (sk < k) { sh = srcW / k; sy = (srcH - sh) / 2; }
    const g = gradeOf(), gNeutral = gradeNeutral(g), gcss = gradeCss(g);
    setSharp(g);
    const videoLoop = async () => {
      const sink = new mb.CanvasSink(vt, { poolSize: 2 });
      for await (const fr of sink.canvases(0, dur)) {
        if (S.rStop) throw STOP;
        const ts = Math.max(0, fr.timestamp), fd = Math.min(fr.duration || 1 / fps, dur - ts);
        if (fd <= 1e-4) continue;
        const scx = fr.canvas.width / srcW, scy = fr.canvas.height / srcH;
        if (gcss !== "none") cx.filter = gcss;
        cx.drawImage(fr.canvas, sx * scx, sy * scy, sw * scx, sh * scy, 0, 0, W, H);
        if (gcss !== "none") cx.filter = "none";
        if (!gNeutral) gradeFrame(cx, W, H, ts, dur, g);
        // кадр исходника может длиться дольше, чем меняются субтитры, — режем его на шаги по 1/30 с
        const n = groups.length ? Math.max(1, Math.round(fd * 30)) : 1, step = fd / n;
        if (n > 1) bx.drawImage(cv, 0, 0);
        for (let j = 0; j < n; j++) {
          if (j > 0) cx.drawImage(base, 0, 0);
          if (groups.length) drawSubs(cx, W, H, ts + j * step, groups, so);
          await vsrc.add(ts + j * step, step);
        }
        vp = (ts + fd) / dur; prog();
      }
      vsrc.close(); vp = 1; prog();
    };
    const mus = await musicFor(l, sr, nch, dur);
    const audioLoop = () => mixAudio({ mb, at: useOrig ? at : null, asrc, clips, dur, sr, nch, origVol, vg, mus, onProg: (p) => { ap = p; prog(); }, isStop: () => S.rStop });
    const what = (e, part) => (e === STOP || e === CANCEL || !/decod/i.test(e?.message || e?.name || "") ? e
      : new Error(`Браузер не смог прочитать ${part} этого видео (${e.message}). Обычно так бывает с видео в HEVC/H.265 или после пересжатия мессенджером — попробуйте на компьютере в Chrome или пересохраните видео в mp4 (H.264).`));
    await Promise.all([videoLoop().catch((e) => { throw what(e, "кадры"); }), audioLoop().catch((e) => { throw what(e, "звук"); })].map((p) => p.catch((e) => { S.rStop = true; throw e; })));
    await output.finalize();
    const secs = Math.round((performance.now() - t0) / 1000);
    if (writable) { try { await writable.close(); } catch {} done(li, `Рендер ${lab} готов за ${secs} с — записан на диск (${name})`); showResult(null, name, l, true); }
    else { done(li, `Рендер ${lab} готов за ${secs} с`); showResult(new Blob([output.target.buffer], { type: "video/mp4" }), name, l); }
  } catch (e) {
    try { await output?.cancel(); } catch {}
    try { await writable?.abort(); } catch {}
    li.remove(); throw e;
  } finally { input.dispose?.(); }
}
