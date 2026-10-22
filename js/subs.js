"use strict";
// ================= Субтитры (из video-tools, доработано) =================
const SUB_FONTS = {
  montserrat: { css: '"Montserrat", "Arial Black", sans-serif', weight: 900 },
  russo: { css: '"Russo One", "Arial Black", sans-serif', weight: 400 },
  rubik: { css: '"Rubik", "Arial Black", sans-serif', weight: 800 },
  oswald: { css: '"Oswald", "Arial Narrow", sans-serif', weight: 700 },
  unbounded: { css: '"Unbounded", "Arial Black", sans-serif', weight: 800 },
  comfortaa: { css: '"Comfortaa", "Arial Rounded MT Bold", sans-serif', weight: 700 },
  exo: { css: '"Exo 2", "Arial Black", sans-serif', weight: 900 },
  manrope: { css: 'Manrope, "Segoe UI", Arial, sans-serif', weight: 700 },
  ptserif: { css: '"PT Serif", Georgia, serif', weight: 700 },
  playfair: { css: '"Playfair Display", Georgia, serif', weight: 700 },
};
async function loadSubFonts() {
  try { await Promise.all(Object.values(SUB_FONTS).map((f) => document.fonts.load(`${f.weight} 64px ${f.css}`, "АБВ GTA 6"))); } catch {}
}
// готовые стили: [название, подпись, настройки]
const SUB_PRESETS = {
  yellow: ["Жёлтое слово", "классика шортсов", { fill: "#ffffff", hi: "#ffd400", stroke: "#000000", sw: 18, plate: "none", glow: false, shadow: true }],
  green: ["Зелёное слово", "", { fill: "#ffffff", hi: "#3dff5a", stroke: "#000000", sw: 18, plate: "none", glow: false, shadow: true }],
  red: ["Красное слово", "", { fill: "#ffffff", hi: "#ff3b3b", stroke: "#000000", sw: 18, plate: "none", glow: false, shadow: true }],
  vice: ["Вайс-Сити", "розовый неон", { fill: "#ffffff", hi: "#ff4fb8", stroke: "#2a0033", sw: 12, plate: "none", glow: true, glowColor: "#2de2ff", shadow: false, font: "exo" }],
  clean: ["Минимализм", "полупрозрачно", { fill: "#ffffff", hi: "#ffffff", stroke: "#000000", sw: 0, plate: "text", plateColor: "#000000", plateOp: 45, glow: false, shadow: false }],
  classic: ["Классика", "слово подчёркнуто", { fill: "#ffffff", hi: "#ffffff", stroke: "#000000", sw: 0, plate: "none", glow: false, shadow: true, words: "5", lines: "2", anim: "none", upper: false, font: "manrope", under: "grow", ulColor: "#ffd400" }],
  cinema: ["Кино", "засечки, тонкая линия", { fill: "#f6f1e7", hi: "#ffffff", stroke: "#000000", sw: 0, plate: "none", glow: false, shadow: true, words: "8", lines: "2", anim: "fade", upper: false, font: "playfair", under: "line", ulColor: "#f6f1e7" }],
  serif: ["Книга", "PT Serif, сказанное подчёркнуто", { fill: "#ffffff", hi: "#ffffff", stroke: "#000000", sw: 0, plate: "none", glow: false, shadow: true, words: "5", lines: "2", anim: "none", upper: false, font: "ptserif", under: "trail", ulColor: "#ff5fa2" }],
  youtube: ["YouTube", "фраза внизу, для 16:9", { fill: "#ffffff", hi: "#ffffff", stroke: "#000000", sw: 0, plate: "text", plateColor: "#000000", plateOp: 70, glow: false, shadow: false, words: "8", lines: "2", anim: "none", upper: false, font: "rubik" }],
};
$("subPresets").innerHTML = Object.entries(SUB_PRESETS).map(([k, [n, d, p]]) =>
  `<button class="preset" data-p="${k}" style="color:${p.fill};${p.glow ? `text-shadow:0 0 8px ${p.glowColor};` : ""}${p.sw ? `-webkit-text-stroke:${Math.max(1, p.sw / 9)}px ${p.stroke};paint-order:stroke fill;` : ""}${p.plate === "text" || p.plate === "both" ? `background:${hexA(p.plateColor, p.plateOp / 100)};` : ""}">` +
  (p.under ? `<span style="font-family:${(SUB_FONTS[p.font] || {}).css};font-weight:700;text-transform:none">${n} <span style="color:${p.hi};text-decoration:underline;text-decoration-color:${p.ulColor};text-decoration-thickness:3px;text-underline-offset:5px">текст</span></span>`
    : `${n.split(" ")[0].toUpperCase()} <span style="color:${p.hi}">${(n.split(" ")[1] || "ТЕКСТ").toUpperCase()}</span>`) + `<small>${d || "&nbsp;"}</small></button>`).join("");
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
const contrastText = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150 ? "#111111" : "#ffffff"; };

// частицы и предлоги не стоят на экране одни
const GLUE_NEXT = new Set(["не", "ни", "в", "во", "на", "с", "со", "к", "ко", "у", "о", "об", "от", "до", "по", "за", "из", "без", "под", "над", "при", "про", "для", "и", "а",
  "a", "an", "the", "to", "of", "in", "on", "at", "no", "not"]);
const GLUE_PREV = new Set(["же", "ж", "ли", "ль", "бы", "б", "ка"]);
const bare = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, "");
// слова фразы; «GTA 6» держим вместе, «mirrors—Rockstar» — два слова
const tokens = (text) => text.replace(/\[[^\]\n]{1,30}\]/g, " ").trim().replace(/(\S)([—–])(\S)/g, "$1$2 $3").replace(/(^|\s)([A-ZА-ЯЁ]{2,})\s+(\d+)/g, "$1$2 $3").split(/[ \t\r\n]+/).filter(Boolean);

// время слов одной реплики: Whisper (если уточняли) или по длине слов внутри речи голоса
function cueWords(c, l) {
  const toks = tokens(c[l]);
  if (!toks.length) return [];
  const v = voiceFresh(c, l) ? c.v[l] : null;
  if (v?.words && v.words.length === toks.length) return v.words.map((w) => ({ w: w.w, start: c.start + w.start, end: c.start + w.end }));
  if (!v) { const ow = origWords(c, l, toks); if (ow) return ow; }
  let a, b;
  if (v) { a = c.start + v.on[0]; b = c.start + v.on[1]; }
  else { a = c.start; b = c.start + Math.max(0.5, Math.min(slotOf(c), estDur(c, l))); }
  if (v && toks.length > 20) { const ws = alignByPauses(toks, v, c.start, a, b, l); if (ws) return ws; }
  // вес слова — его буквы на слух (числа — как произносятся); после запятой и точки голос делает паузу
  const pause = (w) => (/[.!?…]$/.test(w) ? 3.5 : /[,;:—–]$/.test(w) ? 2 : 0);
  const total = toks.reduce((s, w, i) => s + spoken(w, l) + 1 + (i < toks.length - 1 ? pause(w) : 0), 0) || 1, k = (b - a) / total;
  let acc = 0;
  return toks.map((w, i) => { const st = a + acc * k; acc += spoken(w, l) + 1; const en = a + acc * k; if (i < toks.length - 1) acc += pause(w); return { w, start: st, end: en }; });
}
// паузы в голосе (тише порога дольше 0,16 с) — по ним сверяем, где кончается предложение
function pausesOf(v) {
  if (v.pauses) return v.pauses;
  const d = v.buf.getChannelData(0), sr = v.buf.sampleRate, fr = Math.round(sr * 0.02), n = Math.floor(Math.min(d.length, v.len * sr) / fr), rms = new Float32Array(n);
  let mx = 0;
  for (let f = 0; f < n; f++) { let q = 0; for (let i = f * fr; i < (f + 1) * fr; i += 2) q += d[i] * d[i]; rms[f] = Math.sqrt(q / (fr / 2)); mx = Math.max(mx, rms[f]); }
  const thr = mx * 0.06, out = [];
  for (let f = 0; f < n; ) {
    if (rms[f] < thr) { let g = f; while (g < n && rms[g] < thr) g++; if ((g - f) * 0.02 >= 0.16 && f > 0 && g < n) out.push({ a: f * 0.02, b: g * 0.02 }); f = g; } else f++;
  }
  return (v.pauses = out);
}
function alignByPauses(toks, v, c0, a, b, l) {
  const ps = pausesOf(v); if (!ps.length) return null;
  // предложения
  const sent = []; let cur = [];
  toks.forEach((w, i) => { cur.push(w); if (/[.!?…]["»”)]*$/.test(w) || i === toks.length - 1) { sent.push(cur); cur = []; } });
  if (sent.length < 2) return null;
  const L = sent.map((s) => s.reduce((x, w) => x + spoken(w, l) + 1, 0)), tot = L.reduce((x, y) => x + y, 0), dur = b - a;
  // ожидаемая граница по длине текста → ближайшая пауза рядом
  let acc = 0, prev = 0; const bounds = [];
  for (let i = 0; i < sent.length - 1; i++) {
    acc += L[i];
    const exp = (a - c0) + dur * acc / tot, win = Math.max(1.2, dur * 0.06);
    let best = null;
    for (const p of ps) { const mid = (p.a + p.b) / 2; if (p.a <= prev + 0.2) continue; if (Math.abs(mid - exp) <= win && (!best || Math.abs(mid - exp) < Math.abs((best.a + best.b) / 2 - exp))) best = p; }
    bounds.push(best ? [best.a, best.b] : [exp, exp]); prev = best ? best.b : exp;
  }
  const out = []; let st = a - c0;
  sent.forEach((s, i) => {
    const en = i < bounds.length ? bounds[i][0] : b - c0, w8 = s.map((w) => spoken(w, l) + 1), t = w8.reduce((x, y) => x + y, 0), k = Math.max(0.05, en - st) / t;
    let q = st; s.forEach((w, j) => { out.push({ w, start: c0 + q, end: c0 + q + w8[j] * k }); q += w8[j] * k; });
    st = i < bounds.length ? bounds[i][1] : st;
  });
  return out;
}
// слова → группы по n слов; рвём на знаках препинания
function subGroups(words, n) {
  const groups = [], limit = n >= 8 ? 46 : n >= 4 ? 30 : 16;
  let cur = [];
  const push = () => { if (cur.length) groups.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = []; };
  words.forEach((w, i) => {
    cur.push({ ...w });
    const next = words[i + 1], text = cur.map((x) => x.w).join(" ");
    const glue = next && (GLUE_NEXT.has(bare(w.w)) || GLUE_PREV.has(bare(next.w))) && cur.length <= n;
    if ((n >= 8 ? /[.!?…]$/ : /[.!?…,;:—]$/).test(w.w) || (!glue && (cur.length >= n || text.length > limit))) push();
  });
  push();
  return groups;
}
let gCache = { key: "", gs: [] };
function groupsFor(l) {
  const n = +$("subWords").value, sh = +$("subShift").value, key = [S.ver, l, n, sh].join("|");
  if (gCache.key === key) return gCache.gs;
  const all = [];
  S.cues.forEach((c, ci) => {
    const gs = subGroups(cueWords(c, l), n);
    if (!gs.length) return;
    const next = S.cues[ci + 1]?.start ?? Infinity;
    // внутри фразы надпись держится до следующей (не мигает), последняя — чуть после голоса
    gs.forEach((g, i) => { g.end = i + 1 < gs.length ? gs[i + 1].start : Math.min(next, g.end + 0.35); });
    all.push(...gs);
  });
  if (sh) all.forEach((g) => { g.start += sh; g.end += sh; g.words.forEach((w) => { w.start += sh; w.end += sh; }); });
  gCache = { key, gs: all };
  return all;
}
const sampleGroups = (l) => subGroups(tokens(l === "en" ? "You won't believe this!" : "Вы не поверите в это!").map((w, i) => ({ w, start: i * 0.4, end: i * 0.4 + 0.4 })), +$("subWords").value);
const subOpts = () => ({
  font: $("subFont").value, size: +$("subSize").value / 100, lines: +$("subLines").value, anim: $("subAnim").value,
  plate: $("subPlate").value, plateColor: $("subPlateColor").value, plateOp: +$("subPlateOp").value / 100,
  fill: $("subFill").value, hi: $("subHi").value, stroke: $("subStroke").value, sw: +$("subSw").value / 100,
  glow: $("subGlow").checked, glowColor: $("subGlowColor").value, shadow: $("subShadow").checked, upper: $("subUpper").checked,
  under: $("subUnder").value, ul: $("subUlColor").value,
  x: +$("subX").value / 100, y: +$("subY").value / 100,
});
// размер шрифта считается от короткой стороны кадра — одинаково смотрится и в 16:9, и в 9:16; возвращает рамку надписи
function drawSubs(ctx, W, H, t, groups, o) {
  const g = groups && groups.find((x) => t >= x.start && t < x.end);
  if (!g || !g.words.length) return null;
  const f = SUB_FONTS[o.font] || SUB_FONTS.montserrat;
  const words = g.words.map((x) => (o.upper ? x.w.toUpperCase() : x.w));
  const maxW = W * 0.88;
  let fs = Math.min(W, H) * o.size;
  ctx.save();
  const layout = () => {
    ctx.font = `${f.weight} ${fs}px ${f.css}`;
    const ws = words.map((w) => ctx.measureText(w).width), gap = fs * 0.28;
    const width = (a, b) => ws.slice(a, b).reduce((s, x) => s + x, 0) + gap * (b - a - 1);
    let rows = [[0, words.length]];
    if (o.lines > 1 && words.length > 1 && width(0, words.length) > maxW * 0.8) {
      let best = 1, bd = Infinity;
      for (let k = 1; k < words.length; k++) { const d = Math.max(width(0, k), width(k, words.length)); if (d < bd) { bd = d; best = k; } }
      rows = [[0, best], [best, words.length]];
    }
    return { ws, gap, rows, width, widest: Math.max(...rows.map(([a, b]) => width(a, b))) };
  };
  let L = layout();
  if (L.widest > maxW) { fs *= maxW / L.widest; L = layout(); }
  ctx.textBaseline = "middle"; ctx.textAlign = "center"; ctx.lineJoin = "round"; ctx.miterLimit = 2;
  let cur = -1;
  g.words.forEach((x, i) => { if (t >= x.start) cur = i; });
  const lh = fs * 1.3, cx = W * (0.5 + o.x), cy0 = H * o.y - (L.rows.length - 1) * lh / 2;
  const gAge = t - g.start;
  if (o.anim === "fade") ctx.globalAlpha = Math.min(1, Math.max(0, gAge / 0.15));
  L.rows.forEach(([a, b], r) => {
    const rowW = L.width(a, b), y = cy0 + r * lh;
    let x = cx - rowW / 2;
    if (o.plate === "text" || o.plate === "both") {
      const p = fs * 0.35; ctx.fillStyle = hexA(o.plateColor, o.plateOp);
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - p, y - fs * 0.78, rowW + 2 * p, fs * 1.56, fs * 0.3) : ctx.rect(x - p, y - fs * 0.78, rowW + 2 * p, fs * 1.56); ctx.fill();
    }
    for (let i = a; i < b; i++) {
      const w = words[i], wi = L.ws[i], active = i === cur, age = t - g.words[i].start;
      ctx.save(); ctx.translate(x + wi / 2, y);
      if (active && o.anim === "pop") { const k = 1 + 0.16 * Math.max(0, 1 - age / 0.18); ctx.scale(k, k); }
      if (active && o.anim === "bounce") ctx.translate(0, -fs * 0.2 * Math.sin(Math.min(1, age / 0.24) * Math.PI));
      if (o.anim === "rise" && i <= cur) { const k = Math.min(1, age / 0.16); ctx.translate(0, fs * 0.35 * (1 - k)); ctx.globalAlpha = 0.25 + 0.75 * k; }
      if (o.anim === "rise" && i > cur) ctx.globalAlpha = 0;
      const wordPlate = active && (o.plate === "word" || o.plate === "both");
      if (wordPlate) { const p = fs * 0.14; ctx.fillStyle = o.hi; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-wi / 2 - p, -fs * 0.64, wi + 2 * p, fs * 1.28, fs * 0.2) : ctx.rect(-wi / 2 - p, -fs * 0.64, wi + 2 * p, fs * 1.28); ctx.fill(); }
      if (o.shadow && !o.glow) { ctx.shadowColor = "rgba(0,0,0,.75)"; ctx.shadowBlur = fs * 0.14; ctx.shadowOffsetY = fs * 0.06; }
      if (o.sw > 0) { ctx.lineWidth = fs * o.sw; ctx.strokeStyle = o.stroke; ctx.strokeText(w, 0, 0); if (o.shadow && !o.glow) { ctx.shadowColor = "transparent"; } }
      if (o.glow) { ctx.shadowColor = o.glowColor; ctx.shadowBlur = fs * 0.45; ctx.shadowOffsetY = 0; }
      ctx.fillStyle = wordPlate ? contrastText(o.hi) : active ? o.hi : o.fill;
      ctx.fillText(w, 0, 0);
      // подчёркивание: текущее слово / растёт по ходу слова / все сказанные
      if (o.under && o.under !== "none" && (active || (o.under === "trail" && i < cur))) {
        const wd = Math.max(0.12, (g.words[i].end ?? g.words[i].start + 0.3) - g.words[i].start);
        const k = !active ? 1 : o.under === "grow" ? Math.min(1, age / wd) : Math.min(1, age / 0.12);
        const th = Math.max(2, fs * 0.075), uy = fs * 0.5;
        if (o.glow) ctx.shadowBlur = fs * 0.25;
        ctx.globalAlpha *= active || o.under !== "trail" ? 1 : 0.75;
        ctx.fillStyle = o.ul;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-wi / 2, uy, Math.max(th, wi * k), th, th / 2) : ctx.rect(-wi / 2, uy, wi * k, th); ctx.fill();
      }
      ctx.restore();
      x += wi + L.gap;
    }
  });
  ctx.restore();
  return { x: cx - L.widest / 2 - fs * 0.4, y: cy0 - fs, w: L.widest + fs * 0.8, h: (L.rows.length - 1) * lh + fs * 2 };
}

// --- настройки субтитров ---
const SUB_IDS = ["subFont", "subWords", "subLines", "subAnim", "subUnder", "subUlColor", "subPlate", "subSize", "subSw", "subPlateOp", "subShift",
  "subFill", "subHi", "subStroke", "subPlateColor", "subGlow", "subGlowColor", "subShadow", "subUpper", "subSafe", "rVoice", "rSubs", "rRes", "rQ"];
SET_IDS.push(...SUB_IDS);
// положение надписи своё для каждого формата: в 9:16 выше (там интерфейс Shorts), в 16:9 — внизу
const SUB_POS_DEF = { "9:16": { x: 0, y: 70 }, "16:9": { x: 0, y: 86 }, "1:1": { x: 0, y: 80 } };
let subPos = Object.assign({}, SUB_POS_DEF, LS.get("vo-subpos", {}));
function subPosLoad() { const p = subPos[curAR()] || SUB_POS_DEF["16:9"]; $("subX").value = p.x; $("subY").value = p.y; subLabels(); }
function subPosSave() { subPos[curAR()] = { x: +$("subX").value, y: +$("subY").value }; LS.set("vo-subpos", subPos); }
function subLabels() {
  $("subSizeVal").textContent = String($("subSize").value).replace(".", ",") + "%";
  $("subSwVal").textContent = $("subSw").value + "%";
  $("subPlateOpVal").textContent = $("subPlateOp").value + "%";
  $("subYVal").textContent = $("subY").value + "%";
  const x = +$("subX").value; $("subXVal").textContent = x === 0 ? "центр" : (x < 0 ? "левее " : "правее ") + Math.abs(x) + "%";
  const sh = +$("subShift").value; $("subShiftVal").textContent = (sh > 0 ? "+" : "") + sh.toFixed(2).replace(".", ",") + " с" + (sh ? (sh > 0 ? " (позже)" : " (раньше)") : "");
}
let subT;
const subChanged = (e) => {
  subLabels(); saveSet(); gCache.key = "";
  if (e && ["subX", "subY"].includes(e.target.id)) subPosSave();
  if (e && !["rVoice", "rSubs", "rRes", "rQ", "subSafe", "subShift"].includes(e.target.id)) { subSampleUntil = performance.now() + 2500; clearTimeout(subT); subT = setTimeout(drawOverlay, 2600); }
  if (e && ["subFill", "subHi", "subStroke", "subSw", "subPlate", "subPlateColor", "subPlateOp", "subGlow", "subGlowColor", "subShadow"].includes(e.target.id)) document.querySelectorAll(".preset").forEach((b) => b.classList.remove("on"));
  drawOverlay(); rInfo();
};
[...SUB_IDS, "subX", "subY"].forEach((id) => { $(id).addEventListener("input", subChanged); $(id).addEventListener("change", subChanged); });
$("subPresets").onclick = (e) => {
  const b = e.target.closest(".preset"); if (!b) return;
  const p = SUB_PRESETS[b.dataset.p][2];
  const map = { fill: "subFill", hi: "subHi", stroke: "subStroke", sw: "subSw", plate: "subPlate", plateColor: "subPlateColor", plateOp: "subPlateOp",
    glow: "subGlow", glowColor: "subGlowColor", shadow: "subShadow", font: "subFont", words: "subWords", lines: "subLines", anim: "subAnim", upper: "subUpper", ulColor: "subUlColor" };
  for (const [k, id] of Object.entries(map)) if (p[k] != null) { const el = $(id); if (el.type === "checkbox") el.checked = p[k]; else el.value = p[k]; }
  $("subUnder").value = p.under || "none";
  document.querySelectorAll(".preset").forEach((x) => x.classList.toggle("on", x === b));
  LS.set("vo-subpreset", b.dataset.p); accSums();
  subChanged(); subSampleUntil = performance.now() + 2500; drawOverlay();
};
// перетаскивание надписи мышью/пальцем; клик мимо надписи — пуск/пауза
function attachSubDrag(cv, getBox) {
  let drag = null;
  const pos = (e) => { const r = cv.getBoundingClientRect(), k = cv.width / r.width; return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, r }; };
  const inBox = (p) => { const b = getBox(); return b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; };
  cv.addEventListener("pointerdown", (e) => {
    const p = pos(e);
    if (!inBox(p)) { drag = { tap: true }; return; }
    drag = { x0: e.clientX, y0: e.clientY, sx: +$("subX").value, sy: +$("subY").value, moved: false };
    cv.setPointerCapture(e.pointerId); cv.classList.add("grabbing");
  });
  cv.addEventListener("pointermove", (e) => {
    if (!drag) { cv.classList.toggle("grab", inBox(pos(e))); return; }
    if (drag.tap) return;
    const r = cv.getBoundingClientRect();
    if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) > 3) drag.moved = true;
    $("subY").value = Math.round(clamp(drag.sy + (e.clientY - drag.y0) / r.height * 100, 8, 94));
    $("subX").value = Math.round(clamp(drag.sx + (e.clientX - drag.x0) / r.width * 100, -30, 30));
    subLabels(); subPosSave(); drawOverlay();
  });
  const up = () => { if (drag?.tap || (drag && !drag.moved)) togglePlay(); else if (drag) saveSet(); drag = null; cv.classList.remove("grabbing"); };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", () => { drag = null; cv.classList.remove("grabbing"); });
}
attachSubDrag($("subCan"), () => subBox);
attachSubDrag($("subPv"), () => $("subPv")._box);
attachSubDrag($("gradePv"), () => $("gradePv")._box);
function subsSrt(l) {
  const gs = groupsFor(l);
  if (!gs.length) return toast(`Нет текста ${l.toUpperCase()}`);
  const up = $("subUpper").checked;
  downloadBlob(new Blob([gs.map((g, i) => { const tx = g.words.map((x) => x.w).join(" ").replace(/ /g, " "); return `${i + 1}\n${srtTime(g.start)} --> ${srtTime(g.end)}\n${up ? tx.toUpperCase() : tx}\n`; }).join("\n")], { type: "text/plain;charset=utf-8" }), `${baseName()}_${l}_субтитры.srt`);
}
document.querySelectorAll("[data-subsrt]").forEach((b) => b.onclick = () => subsSrt(b.dataset.subsrt));
function subInfo() {
  const parts = LANGS.map((l) => {
    const vc = S.cues.filter((c) => c[l].trim() && voiceFresh(c, l)), ex = vc.filter((c) => c.v[l].words).length;
    return vc.length ? `${l.toUpperCase()}: ${ex ? `точно ${ex} из ${vc.length}` : "по голосу, примерно"}` : null;
  }).filter(Boolean);
  $("subInfo").textContent = parts.length ? "Время слов — " + parts.join(" · ") : "Пока нет озвучки — субтитры идут по примерной длине фраз.";
}
