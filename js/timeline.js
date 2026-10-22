"use strict";
// ================= Таймлайн =================
const TL = { cv: $("tl"), z: 1, view0: 0, drag: null, W: 0, H: 138, dpr: 1 };
const Y = { rulerH: 20, thumbY: 20, thumbH: 40, cueY: 66, cueH: 38, ruY: 110, enY: 120, barH: 6 };
const viewDur = () => totalDur() / TL.z;
const xOf = (t) => (t - TL.view0) / viewDur() * TL.W;
const tOf = (x) => TL.view0 + x / TL.W * viewDur();
function sizeTL() {
  const cv = TL.cv, r = cv.getBoundingClientRect(); if (!r.width) return;
  TL.dpr = window.devicePixelRatio || 1; TL.W = r.width;
  cv.width = Math.round(r.width * TL.dpr); cv.height = Math.round(TL.H * TL.dpr);
  drawTL();
}
new ResizeObserver(sizeTL).observe(TL.cv);
new ResizeObserver(() => document.documentElement.style.setProperty("--scrH", $("screen").offsetHeight + "px")).observe($("screen"));
function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
let tlRaf = 0;
function drawTL() { if (!tlRaf) tlRaf = requestAnimationFrame(() => { tlRaf = 0; paintTL(); }); }
function paintTL() {
  const cv = TL.cv, ctx = cv.getContext("2d"), W = TL.W, H = TL.H;
  if (!W) return;
  ctx.setTransform(TL.dpr, 0, 0, TL.dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const D = totalDur(), vd = viewDur();
  TL.view0 = clamp(TL.view0, 0, Math.max(0, D - vd));
  // кадры
  if (S.file && grab) {
    const ar = S.w / S.h || 16 / 9, tw = Math.max(16, Y.thumbH * ar), n = Math.ceil(W / tw);
    for (let k = 0; k < n; k++) {
      const tc = tOf(k * tw + tw / 2); if (tc > D) break;
      const th = thumbNear(tc);
      if (th) ctx.drawImage(th.c, k * tw, Y.thumbY, tw, Y.thumbH);
      if (!th || Math.abs(th.t - tc) > (vd / n) * 0.75) thumbWant(Math.round(tc * 10) / 10);
    }
    ctx.fillStyle = "rgba(7,8,12,.35)"; ctx.fillRect(0, Y.thumbY, W, Y.thumbH);
  }
  // шкала
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800];
  const minPx = W < 520 ? 23 : 46;
  const step = steps.find((s) => s / vd * W >= minPx) || 3600;
  const sub = step <= 0.5 ? 0.1 : step <= 2 ? 0.5 : step <= 5 ? 1 : step <= 15 ? 5 : step / 6;
  ctx.font = `600 ${W < 520 ? 8.5 : 10.5}px 'JetBrains Mono', monospace`; ctx.textBaseline = "middle";
  // мелкие деления
  if (sub / vd * W >= 5) for (let t = Math.floor(TL.view0 / sub) * sub; t <= TL.view0 + vd; t += sub) {
    const xs = xOf(t); ctx.fillStyle = "rgba(255,255,255,.1)"; ctx.fillRect(Math.round(xs), 14, 1, 6);
  }
  for (let t = Math.floor(TL.view0 / step) * step; t <= TL.view0 + vd + 1e-6; t += step) {
    const x = xOf(t); if (x < -40) continue;
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(Math.round(x), 12, 1, H - 12);
    const lab = fmt(t, step < 1 ? 1 : 0), lw = ctx.measureText(lab).width;
    if (x + 2 + lw <= W) { ctx.fillStyle = "#9aa1b3"; ctx.fillText(lab, x + 2, 7); }
  }
  // реплики
  const lang = prevLang() === "en" ? "en" : "ru";
  ctx.font = "600 12px Manrope, system-ui, sans-serif";
  S.cues.forEach((c, i) => {
    const e = effEnd(c), x0 = xOf(c.start), x1 = xOf(e);
    if (x1 < 0 || x0 > W) return;
    const w = Math.max(3, x1 - x0), sel = c.id === S.sel, live = c.id === liveId;
    rr(ctx, x0 + 1, Y.cueY, w - 2, Y.cueH, 8);
    if (sel) { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, "rgba(255,79,154,.75)"); g.addColorStop(1, "rgba(255,159,67,.75)"); ctx.fillStyle = g; }
    else ctx.fillStyle = c.end == null ? "rgba(255,79,154,.13)" : "rgba(255,79,154,.22)";
    ctx.fill();
    ctx.lineWidth = overlaps(c) ? 2 : 1;
    ctx.strokeStyle = overlaps(c) ? "#ff5d6c" : sel ? "rgba(255,255,255,.7)" : live ? "rgba(62,230,255,.8)" : "rgba(255,79,154,.55)";
    if (c.end == null) ctx.setLineDash([4, 3]);
    ctx.stroke(); ctx.setLineDash([]);
    // ручки по краям
    ctx.fillStyle = sel ? "#fff" : "rgba(255,255,255,.35)";
    if (w > 14) { ctx.fillRect(x0 + 3, Y.cueY + 12, 2, Y.cueH - 24); if (c.end != null) ctx.fillRect(x1 - 5, Y.cueY + 12, 2, Y.cueH - 24); }
    if (w > 22) {
      ctx.save(); rr(ctx, x0 + 1, Y.cueY, w - 2, Y.cueH, 8); ctx.clip();
      ctx.fillStyle = sel ? "#16070e" : "#eef0f6";
      ctx.font = "700 11px 'JetBrains Mono', monospace"; ctx.fillText(String(i + 1), x0 + 9, Y.cueY + 12);
      ctx.font = "600 12px Manrope, system-ui, sans-serif"; ctx.globalAlpha = sel ? 1 : 0.85;
      ctx.fillText((c[lang] || c[lang === "ru" ? "en" : "ru"] || (c.prompt ? "✨ " + c.prompt : "—")).replace(/\s+/g, " "), x0 + 9, Y.cueY + 27);
      ctx.restore();
    }
    // голос
    for (const [l, y, col0] of [["ru", Y.ruY, "#ff5fa2"], ["en", Y.enY, "#3ee6ff"]]) {
      const v = c.v[l], col = voicesOf(l).length > 1 ? prof(pidFor(c, l))?.color || col0 : col0;
      if (v) {
        const d = v.len ?? v.buf.duration, xe = xOf(c.start + d), xs = xOf(e);
        ctx.globalAlpha = voiceFresh(c, l) ? 1 : 0.4;
        ctx.fillStyle = col; rr(ctx, x0, y, Math.max(2, Math.min(xe, xs) - x0), Y.barH, 3); ctx.fill();
        if (xe > xs + 1) { ctx.fillStyle = "#ff5d6c"; rr(ctx, xs, y, xe - xs, Y.barH, 3); ctx.fill(); }
        ctx.globalAlpha = 1;
      } else if (c[l].trim()) {
        const xe = xOf(c.start + estDur(c, l));
        ctx.strokeStyle = col; ctx.globalAlpha = 0.45; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y + 0.5, Math.max(2, xe - x0), Y.barH - 1); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
    }
  });
  ctx.font = "700 9px 'JetBrains Mono', monospace"; ctx.fillStyle = "rgba(255,95,162,.7)"; ctx.fillText("RU", W - 18, Y.ruY + 3);
  ctx.fillStyle = "rgba(62,230,255,.7)"; ctx.fillText("EN", W - 18, Y.enY + 3);
  // курсор
  const px = xOf(V.currentTime || 0);
  if (px >= -2 && px <= W + 2) {
    ctx.fillStyle = "#fff"; ctx.fillRect(Math.round(px) - 1, 12, 2, H - 12);
    ctx.beginPath(); ctx.moveTo(px - 6, 10); ctx.lineTo(px + 6, 10); ctx.lineTo(px, 18); ctx.closePath(); ctx.fill();
  }
  // «мини-карта» при увеличении
  if (TL.z > 1) {
    ctx.fillStyle = "rgba(255,255,255,.1)"; ctx.fillRect(0, H - 3, W, 3);
    ctx.fillStyle = "rgba(255,79,154,.8)"; ctx.fillRect(TL.view0 / D * W, H - 3, Math.max(6, vd / D * W), 3);
  }
}
function tlPos(e) { const r = TL.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function hitCue(x, y) {
  if (y < Y.cueY - 2 || y > Y.cueY + Y.cueH + 2) return null;
  for (let i = S.cues.length - 1; i >= 0; i--) {
    const c = S.cues[i], x0 = xOf(c.start), x1 = xOf(effEnd(c));
    if (x < x0 - 4 || x > x1 + 4) continue;
    const w = x1 - x0;
    if (Math.abs(x - x0) <= 6 && w > 10) return { c, part: "l" };
    if (Math.abs(x - x1) <= 6 && w > 10) return { c, part: "r" };
    if (x >= x0 && x <= x1) return { c, part: "body" };
  }
  return null;
}
function snapT(t, c) {
  const cands = [V.currentTime || 0];
  for (const o of S.cues) if (o !== c) cands.push(o.start, effEnd(o));
  for (const k of cands) if (Math.abs(xOf(k) - xOf(t)) < 7) return k;
  return Math.round(t * 20) / 20;
}
TL.cv.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const { x, y } = tlPos(e), t = tOf(x), h = hitCue(x, y);
  TL.cv.setPointerCapture(e.pointerId);
  if (h) { select(h.c.id, true); TL.drag = { mode: h.part, c: h.c, t0: t, s0: h.c.start, e0: h.c.end, ee0: effEnd(h.c), moved: false }; }
  else { TL.drag = { mode: "seek" }; seek(t); }
});
TL.cv.addEventListener("pointermove", (e) => {
  const { x, y } = tlPos(e), t = tOf(x), d = TL.drag;
  if (!d) { const h = hitCue(x, y); TL.cv.style.cursor = h ? (h.part === "body" ? "grab" : "ew-resize") : "text"; return; }
  if (d.mode === "seek") { seek(t); return; }
  if (!d.moved) { if (Math.abs(t - d.t0) / viewDur() * TL.W < 3) return; snap(); d.moved = true; }
  const c = d.c, D = totalDur();
  if (d.mode === "body") {
    const len = d.e0 != null ? d.e0 - d.s0 : 0;
    c.start = clamp(snapT(d.s0 + (t - d.t0), c), 0, D - Math.max(0.1, len));
    if (d.e0 != null) c.end = c.start + len;
  } else if (d.mode === "l") c.start = clamp(snapT(t, c), 0, d.ee0 - 0.2);
  else if (d.mode === "r") c.end = clamp(snapT(t, c), c.start + 0.2, D);
  TL.cv.style.cursor = d.mode === "body" ? "grabbing" : "ew-resize";
  drawTL(); renderNow();
});
const tlUp = () => {
  const d = TL.drag; TL.drag = null;
  if (d && d.moved) { renderAll(); save(); }
  else if (d && d.c) seek(d.t0);   // простой клик по блоку — перемотка туда
};
TL.cv.addEventListener("pointerup", tlUp);
TL.cv.addEventListener("pointercancel", tlUp);
TL.cv.addEventListener("dblclick", (e) => {
  const { x, y } = tlPos(e), h = hitCue(x, y);
  if (h) { const ta = document.querySelector(`#nowCard textarea`); seek(h.c.start); setTimeout(() => { refreshNow(); ta?.focus(); }, 60); }
  else addCueAt(tOf(x), true);
});
TL.cv.addEventListener("wheel", (e) => {
  const { x } = tlPos(e);
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const tc = tOf(x), maxZ = Math.max(1, totalDur() / 3);
    TL.z = clamp(TL.z * Math.exp(-e.deltaY * 0.0025), 1, maxZ);
    TL.view0 = tc - (x / TL.W) * viewDur();
    $("zoom").value = Math.round(Math.log(TL.z) / Math.log(maxZ) * 1000) || 0;
    drawTL();
  } else if (TL.z > 1) {
    e.preventDefault();
    TL.view0 += (e.deltaY + e.deltaX) / TL.W * viewDur();
    drawTL();
  }
}, { passive: false });
$("zoom").oninput = () => {
  const maxZ = Math.max(1, totalDur() / 3), tc = V.currentTime || 0;
  TL.z = Math.exp(+$("zoom").value / 1000 * Math.log(maxZ));
  TL.view0 = tc - viewDur() / 2; drawTL();
};

// кадры: отдельное скрытое видео, чтобы не дёргать основной плеер
const TH = { map: new Map(), times: [], queue: [], busy: false };
let grabLock = Promise.resolve();
function withGrab(fn) { const p = grabLock.then(fn, fn); grabLock = p.catch(() => {}); return p; }
async function grabSeek(t) {
  if (grab.readyState < 1) await once(grab, "loadedmetadata").catch(() => {});
  await new Promise((res) => {
    const fin = () => { grab.removeEventListener("seeked", fin); clearTimeout(to); res(); };
    const to = setTimeout(fin, 4000);
    grab.addEventListener("seeked", fin); grab.currentTime = clamp(t, 0, (grab.duration || S.dur) - 0.05);
  });
}
function grabCanvas(w, h) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d").drawImage(grab, 0, 0, w, h); return c;
}
function thumbNear(t) {
  const a = TH.times; if (!a.length) return null;
  let lo = 0, hi = a.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < t) lo = m + 1; else hi = m; }
  const i = lo > 0 && Math.abs(a[lo - 1] - t) < Math.abs(a[lo] - t) ? lo - 1 : lo;
  return { t: a[i], c: TH.map.get(a[i]) };
}
function thumbWant(t) {
  if (TH.map.has(t) || TH.queue.includes(t)) return;
  TH.queue.push(t); if (TH.queue.length > 80) TH.queue.shift();
  pumpThumbs();
}
async function pumpThumbs() {
  if (TH.busy || !grab) return;
  TH.busy = true;
  const g = grab;
  while (TH.queue.length && g === grab) {
    const t = TH.queue.pop();
    const c = await withGrab(async () => { await grabSeek(t); const h = 80; return grabCanvas(Math.round(h * (S.w / S.h || 1.78)), h); }).catch(() => null);
    if (!c || g !== grab) continue;
    TH.map.set(t, c); TH.times.push(t); TH.times.sort((a, b) => a - b);
    if (TH.times.length > 600) { const far = TH.times.reduce((b, x) => Math.abs(x - V.currentTime) > Math.abs(b - V.currentTime) ? x : b); TH.map.delete(far); TH.times.splice(TH.times.indexOf(far), 1); }
    drawTL();
  }
  TH.busy = false;
}
async function frameJpeg(t, maxW = 448) {
  return withGrab(async () => {
    await grabSeek(t);
    const ar = (grab.videoWidth / grab.videoHeight) || 1.78, w = Math.min(maxW, grab.videoWidth || maxW);
    return grabCanvas(Math.round(w), Math.round(w / ar)).toDataURL("image/jpeg", 0.72);
  });
}

// ================= Горячие клавиши =================
document.addEventListener("keydown", (e) => {
  const el = e.target, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
  if (typing) {
    if (e.key === "Escape") el.blur();
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && el.tagName === "TEXTAREA") { e.preventDefault(); togglePlay(); }
    else if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); seek(V.currentTime + (e.key === "ArrowLeft" ? -1 : 1)); }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") { e.preventDefault(); undo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const c = selCue();
  switch (e.code) {
    case "Space": case "KeyK": e.preventDefault(); togglePlay(); break;
    case "ArrowLeft": e.preventDefault(); seek(V.currentTime - (e.shiftKey ? 5 : 1)); break;
    case "ArrowRight": e.preventDefault(); seek(V.currentTime + (e.shiftKey ? 5 : 1)); break;
    case "Comma": V.pause(); seek(V.currentTime - 1 / 30); break;
    case "Period": V.pause(); seek(V.currentTime + 1 / 30); break;
    case "Home": seek(0); break;
    case "End": seek(S.dur); break;
    case "KeyI": case "Insert": e.preventDefault(); addCueAt(V.currentTime || 0, true); break;
    case "BracketLeft": if (c) setStart(c, V.currentTime || 0); break;
    case "BracketRight": if (c) setEnd(c, V.currentTime || 0); break;
    case "Delete": if (cueById(S.sel)) delCue(cueById(S.sel)); break;
  }
});
