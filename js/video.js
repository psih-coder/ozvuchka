"use strict";
// ================= Видео =================
const drop = $("drop");
drop.onclick = () => $("vidInput").click();
$("vidInput").onchange = (e) => { loadVideo(e.target.files[0]); e.target.value = ""; };
$("changeVid").onclick = () => $("vidInput").click();
for (const el of [drop, document.body]) {
  el.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); drop.classList.add("over"); } });
  el.addEventListener("dragleave", () => drop.classList.remove("over"));
  el.addEventListener("drop", (e) => {
    const f = [...(e.dataTransfer?.files || [])][0]; if (!f) return;
    e.preventDefault(); e.stopPropagation(); drop.classList.remove("over");
    if (/\.json$/i.test(f.name)) f.text().then((t) => loadProj(JSON.parse(t))).catch((er) => toast(er.message));
    else if (/\.(srt|vtt|txt)$/i.test(f.name)) f.text().then((t) => { importToScript(t); $("scriptCard").scrollIntoView({ behavior: "smooth" }); });
    else loadVideo(f);
  });
}
let grab = null;
async function loadVideo(file) {
  if (!file) return;
  if (!/^video\//.test(file.type) && !/\.(mp4|mov|webm|mkv|m4v|avi)$/i.test(file.name)) return toast("Это не видео");
  stopVoices(); V.pause();
  if (S.url) URL.revokeObjectURL(S.url);
  S.file = file; S.url = URL.createObjectURL(file); S.name = file.name;
  V.src = S.url;
  try { await once(V, "loadedmetadata"); } catch (e) { toast(e.message); return; }
  if (!isFinite(V.duration) || V.duration < 0.05) {   // webm после записи экрана: длины в заголовке нет — узнаём, перемотав в конец
    await new Promise((res) => { const to = setTimeout(res, 8000); V.addEventListener("durationchange", function f() { if (isFinite(V.duration) && V.duration > 0.05) { V.removeEventListener("durationchange", f); clearTimeout(to); res(); } }); V.currentTime = 1e7; });
    V.currentTime = 0;
  }
  S.dur = V.duration; S.w = V.videoWidth; S.h = V.videoHeight;
  const r = S.w / S.h;
  S.arAuto = r > 1.15 ? "16:9" : r < 0.87 ? "9:16" : "1:1";
  drop.hidden = true; $("stage").hidden = false; $("transport").hidden = false; $("tlWrap").hidden = false;
  V.volume = +$("volOrig").value / 100; V.playbackRate = +$("rateSel").value;
  grab = document.createElement("video"); grab.muted = true; grab.preload = "auto"; grab.src = S.url;
  TH.map.clear(); TH.times = []; TH.queue = [];
  TL.z = 1; TL.view0 = 0; $("zoom").value = 0;
  applyAR();
  $("vidMeta").textContent = `${file.name} · ${S.w}×${S.h} · ${(file.size / 1048576).toFixed(file.size > 1e8 ? 0 : 1)} МБ`;
  renderAll(); save();
  const before = S.cues.filter((c) => c.start > S.dur);
  if (before.length) toast(`${before.length} реплик стоят дальше конца видео`);
}
const curAR = () => ($("arSel").value === "auto" ? S.arAuto : $("arSel").value);
function applyAR() {
  const sel = $("arSel").value, ar = curAR();
  const [a, b] = ar.split(":").map(Number);
  $("stage").dataset.ar = ar;
  $("screen").style.setProperty("--ar", `${a}/${b}`);
  $("screen").style.setProperty("--arn", a / b);
  $("screen").classList.toggle("cover", sel !== "auto" && ar !== S.arAuto);
  $("arBadge").textContent = sel === "auto" ? `${ar} · авто` : `${ar} · видео ${S.arAuto}${ar !== S.arAuto ? " (обрезка)" : ""}`;
  requestAnimationFrame(sizeTL);
  if (typeof subPosLoad === "function") subPosLoad();
  requestAnimationFrame(drawOverlay);
  if (typeof applyGradePreview === "function") requestAnimationFrame(applyGradePreview);
}
$("arSel").onchange = () => { applyAR(); saveSet(); };
const togglePlay = () => { if (!S.file) return; if (V.paused) { ensureAC(); V.play(); } else V.pause(); };
$("bigPlay").onclick = togglePlay; $("playBtn").onclick = togglePlay;
function seek(t) { if (!S.file) return; V.currentTime = clamp(t, 0, S.dur - 0.001); onTime(); }
document.querySelectorAll("[data-seek]").forEach((b) => b.onclick = () => seek(V.currentTime + +b.dataset.seek));
document.querySelectorAll("[data-frame]").forEach((b) => b.onclick = () => { V.pause(); seek(V.currentTime + +b.dataset.frame / 30); });
$("rateSel").onchange = () => { V.playbackRate = +$("rateSel").value; saveSet(); };
$("volOrig").oninput = () => { V.volume = +$("volOrig").value / 100; saveSet(); };
$("volVoice").oninput = () => { if (vGain) vGain.gain.value = +$("volVoice").value / 100; saveSet(); };
$("ovOn").onchange = () => { drawOverlay(); saveSet(); };
V.addEventListener("play", () => { $("bigPlay").classList.add("hide"); $("playBtn").textContent = "❚❚"; scheduleVoices(); loop(); });
V.addEventListener("pause", () => { $("bigPlay").classList.remove("hide"); $("playBtn").textContent = "▶"; stopVoices(); onTime(); });
V.addEventListener("seeked", () => { if (!V.paused) scheduleVoices(); onTime(); });
V.addEventListener("ratechange", () => { if (!V.paused) scheduleVoices(); });
V.addEventListener("timeupdate", () => { if (V.paused) onTime(); });
function loop() { if (V.paused) return; onTime(); checkDrift(); requestAnimationFrame(loop); }

// что происходит на текущем времени
let liveId = null;
const cueAt = (t) => { let r = null; for (const c of S.cues) if (c.start <= t + 1e-3 && t < effEnd(c)) r = c; return r; };
function onTime() {
  const t = V.currentTime || 0;
  $("tcBig").textContent = fmt(t); $("tcDur").textContent = "/ " + fmt(S.dur);
  $("addAt").textContent = fmt(t);
  const c = cueAt(t);
  if ((c?.id ?? null) !== liveId) {
    liveId = c?.id ?? null;
    document.querySelectorAll(".list .cue.live").forEach((x) => x.classList.remove("live"));
    if (c) document.querySelectorAll(`.list .cue[data-id="${c.id}"]`).forEach((x) => x.classList.add("live"));
  }
  renderNow();
  drawOverlay();
  if (typeof gradeTick === "function") gradeTick();
  if (!V.paused && TL.z > 1) { const vd = viewDur(); if (t > TL.view0 + vd * 0.92 || t < TL.view0) TL.view0 = clamp(t - vd * 0.08, 0, S.dur - vd); }
  drawTL();
}
// субтитры поверх превью — та же отрисовка, что и в рендере
let subBox = null, subSampleUntil = 0;
function drawOverlay() {
  const cv = $("subCan"), r = cv.getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  subBox = null;
  if ($("subSafe").checked && curAR() === "9:16") drawSafe(ctx, W, H);
  if (!$("ovOn").checked) return;
  const t = V.currentTime || 0, l = prevLang() === "en" ? "en" : "ru";
  let gs = groupsFor(l), tt = t;
  if (!gs.some((g) => t >= g.start && t < g.end) && performance.now() < subSampleUntil) { gs = sampleGroups(l); tt = gs[0].start + 0.3; }
  subBox = drawSubs(ctx, W, H, tt, gs, subOpts());
  paintPreviews();
}
// превью внутри блоков «Субтитры» и «Стиль видео» — чтобы не листать к видео
function drawFrameCover(ctx, W, H, filter) {
  ctx.fillStyle = "#0b0c11"; ctx.fillRect(0, 0, W, H);
  if (!S.file || V.readyState < 2 || !V.videoWidth) {
    ctx.fillStyle = "#5c6375"; ctx.font = `600 ${Math.round(Math.min(W, H) * 0.06)}px Manrope, sans-serif`; ctx.textAlign = "center";
    ctx.fillText("Загрузите видео", W / 2, H / 2); ctx.textAlign = "start"; return;
  }
  const sw0 = V.videoWidth, sh0 = V.videoHeight, k = W / H;
  let sx = 0, sy = 0, sw = sw0, sh = sh0;
  if (sw0 / sh0 > k) { sw = sh0 * k; sx = (sw0 - sw) / 2; } else if (sw0 / sh0 < k) { sh = sw0 / k; sy = (sh0 - sh) / 2; }
  ctx.imageSmoothingQuality = "high";
  if (filter && filter !== "none") ctx.filter = filter;
  ctx.drawImage(V, sx, sy, sw, sh, 0, 0, W, H);
  ctx.filter = "none";
}
function sizePv(cv) {
  const [a, b] = curAR().split(":").map(Number), ar = a / b, mob = innerWidth <= 700;
  let h = mob ? Math.round(innerHeight * (ar < 1 ? 0.34 : 0.24)) : ar < 1 ? 420 : ar > 1.2 ? 220 : 300;
  let w = Math.round(h * ar);
  const maxW = mob ? cv.closest(".pvlayout").clientWidth : 380;
  if (w > maxW) { w = maxW; h = Math.round(w / ar); }
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.style.width !== w + "px") { cv.style.width = w + "px"; cv.style.height = h + "px"; }
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
}
function paintPv(cv) {
  if (!cv.closest("details").open) return;
  sizePv(cv);
  const ctx = cv.getContext("2d"), W = cv.width, H = cv.height, g = gradeOf();
  const cmp = cv.id === "gradePv" && $("gradeCard").classList.contains("cmp");
  drawFrameCover(ctx, W, H, cmp ? "none" : gradeCss(g));
  if (!cmp && !gradeNeutral(g)) gradeFrame(ctx, W, H, V.currentTime || 0, S.dur || 1, g);
  if (cv.id === "subPv" && $("subSafe").checked && curAR() === "9:16") drawSafe(ctx, W, H);
  const t = V.currentTime || 0, l = prevLang() === "en" ? "en" : "ru";
  let gs = groupsFor(l), tt = t;
  if (!gs.some((x) => t >= x.start && t < x.end) && (cv.id === "subPv" || performance.now() < subSampleUntil)) { gs = sampleGroups(l); tt = gs[0].start + 0.3; }
  cv._box = $("ovOn").checked || cv.id === "subPv" ? drawSubs(ctx, W, H, tt, gs, subOpts()) : null;
  const box = cv.closest(".pvbox");
  box.querySelector("[data-pvtime]").textContent = `${fmt(t)} / ${fmt(S.dur)}`;
  box.querySelector("[data-pvplay]").textContent = V.paused ? "▶" : "❚❚";
}
function paintPreviews() { paintPv($("subPv")); paintPv($("gradePv")); }
document.querySelectorAll("[data-pvplay]").forEach((b) => b.onclick = togglePlay);
function drawSafe(ctx, W, H) {
  ctx.save(); ctx.fillStyle = "rgba(255,60,60,.16)"; ctx.strokeStyle = "rgba(255,90,90,.6)"; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
  for (const [x, y, w, h] of [[0, H * 0.79, W, H * 0.21], [W * 0.84, H * 0.42, W * 0.16, H * 0.37], [0, 0, W, H * 0.08]]) { ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); }
  ctx.restore();
}

// панель «Сейчас»
let nowId = undefined;
function renderNow() {
  const card = $("nowCard");
  if (card.contains(document.activeElement) && document.activeElement.tagName === "TEXTAREA") return;   // не мешаем печатать
  const t = V.currentTime || 0, c = cueAt(t);
  $("addHere").textContent = `＋ Реплика с ${fmt(t)}`;
  const nx = S.cues.find((x) => x.start > t + 1e-3 && x !== c);
  $("nextLine").innerHTML = nx ? `Дальше · <span class="mono">${fmt(nx.start)}</span> · #${num(nx)} <b>${esc((nx.ru || nx.en || "без текста").slice(0, 90))}</b>` : "";
  if (!c) {
    if (nowId !== null) { nowId = null; card.classList.remove("has"); card.removeAttribute("data-id"); $("nowBody").hidden = true; $("nowEmpty").hidden = false;
      $("nowNum").className = "pill off"; $("nowNum").textContent = "—"; $("nowRange").textContent = "реплики под курсором нет"; }
    return;
  }
  $("nowRange").textContent = `${fmt(c.start)} – ${fmt(effEnd(c))}${c.end == null ? " (авто)" : ""} · ${n1(slotOf(c))} с`;
  if (nowId === c.id) { updFit(c); return; }
  nowId = c.id;
  card.dataset.id = c.id; card.classList.add("has");
  $("nowNum").className = "pill"; $("nowNum").textContent = "#" + num(c);
  $("nowRu").value = c.ru; $("nowEn").value = c.en;
  $("nowBody").hidden = false; $("nowEmpty").hidden = true;
  updFit(c);
}
const refreshNow = () => { nowId = undefined; renderNow(); };
$("addHere").onclick = () => addCueAt(V.currentTime || 0, true);
