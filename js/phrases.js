"use strict";
// ================= Шаг 3. Озвучка: из сценария — в фразы — в голос =================
const vmode = () => document.querySelector("input[name=vmode]:checked")?.value || "solid";
function setVmode(v) { $("voiceCard").dataset.vmode = v; const r = document.querySelector(`input[name=vmode][value="${v}"]`); if (r) r.checked = true; }
document.querySelectorAll("input[name=vmode]").forEach((r) => r.addEventListener("change", () => { setVmode(vmode()); saveSet(); }));
["fsSplit", "fsPlace", "fsGap"].forEach((id) => $(id).addEventListener("input", () => { $("fsGapV").textContent = n1($("fsGap").value) + " с"; saveSet(); }));
function fillSolSel() {
  document.querySelectorAll(".solvsel").forEach((sel) => {
    const l = sel.dataset.l, keep = sel.value, vs = voicesOf(l);
    sel.innerHTML = vs.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join("");
    if (vs.some((v) => v.id === keep)) sel.value = keep;
  });
  $("voicesSum").textContent = `(${VOICES.length}: ${VOICES.map((v) => v.name).join(", ")})`;
}
document.querySelectorAll(".solvsel").forEach((s) => s.addEventListener("change", saveSet));
// предложения; «короткие куски» ещё режутся по запятым
function sentences(text, maxChars) {
  const parts = (text.match(/[^.!?…]+(?:[.!?…]+["»”)]*|$)/g) || [text]).map((x) => x.trim()).filter(Boolean);
  if (!isFinite(maxChars)) return parts;
  const res = [];
  for (const p of parts) {
    if (p.length <= maxChars) { res.push(p); continue; }
    let cur = "";
    for (const w of p.split(/(?<=[,;:—–])\s+/)) { if (cur && (cur + " " + w).length > maxChars) { res.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; }
    if (cur) res.push(cur);
  }
  return res;
}
const estText = (t, l) => Math.max(0.6, t.replace(/\s+/g, " ").trim().length / CPS[l] / baseSpeed());
const round2 = (x) => Math.round(x * 100) / 100;
const twinVoice = (pid, to) => { const p = prof(pid); if (!p) return null; const i = voicesOf(p.lang).indexOf(p); return voicesOf(to)[i]?.id || null; };
// фразы с таймкодом стоят на своём месте, остальные раскладываются между ними
function layout(items, A, B, mode, gap) {
  let i = 0, cursor = A;
  while (i < items.length) {
    const it = items[i];
    if (it.t0 != null) { it.start = Math.max(it.t0, cursor); it.end = it.t1 != null && it.t1 > it.start + 0.2 ? it.t1 : null; cursor = it.start + it.dur; i++; continue; }
    let j = i; while (j < items.length && items[j].t0 == null) j++;
    const run = items.slice(i, j), winEnd = j < items.length ? items[j].t0 : B;
    const gaps = run.map((x, k) => (k === 0 && i === 0 ? 0 : gap + x.pause * Math.max(0.6, gap)));
    const speech = run.reduce((a, x) => a + x.dur, 0) + gaps.reduce((a, b) => a + b, 0);
    const extra = mode === "spread" ? Math.max(0, (winEnd - cursor - speech) / run.length) : 0;
    let t = cursor;
    run.forEach((x, k) => { t += gaps[k]; x.start = t; t += x.dur + extra; });
    cursor = t; i = j;
  }
  items.forEach((x, k) => {
    if (x.end != null) return;
    const nx = items[k + 1];
    x.end = nx ? Math.max(x.start + Math.min(x.dur, 0.6), nx.start - 0.02) : Math.max(x.start + x.dur, Math.min(B, x.start + x.dur + 0.5));
  });
  return items.length ? items[items.length - 1].end - B : 0;
}
function buildCues(mode, langs) {
  const [A, B] = rangeOf(), warns = [];
  if (mode === "solid") {
    const c = newCue(round2(A), round2(B));
    for (const l of langs) { c[l] = plainText(S.script[l], l); c.vp[l] = $("solV_" + l).value || null; }
    return { cues: [c], warns };
  }
  const P = langs.includes("ru") ? "ru" : langs[0], Q = langs.find((l) => l !== P) || null;
  const LP = parseScript(S.script[P], P).lines, LQ = Q ? parseScript(S.script[Q], Q).lines : [];
  if (Q && LQ.length !== LP.length) warns.push(`В ${P.toUpperCase()} ${LP.length} строк, в ${Q.toUpperCase()} — ${LQ.length}: фразы сопоставлены по порядку строк, лишние добавлены к последней. Удобнее: «🌐 Перевести» — строки совпадут.`);
  const split = $("fsSplit").value, cut = (t, l) => (split === "line" ? [t] : sentences(t, split === "short" ? CPS[l] * 4 : Infinity));
  const items = [];
  LP.forEach((lp, i) => {
    const lq = LQ[i], sp = cut(lp.text, P), sq = lq ? cut(lq.text, Q) : null;
    const base = { vpP: lp.vp, vpQ: lq?.vp || null, pause: lp.pause };
    if (!lq || sq.length === sp.length) sp.forEach((t, k) => items.push({ ...base, p: t, q: sq ? sq[k] : "", t0: k === 0 ? lp.t0 : null, t1: k === sp.length - 1 ? lp.t1 : null, pause: k === 0 ? lp.pause : 0 }));
    else items.push({ ...base, p: lp.text, q: lq.text, t0: lp.t0, t1: lp.t1 });
  });
  if (Q && LQ.length > LP.length && items.length) items[items.length - 1].q += " " + LQ.slice(LP.length).map((x) => x.text).join(" ");
  items.forEach((x) => { x.dur = Math.max(estText(x.p, P), Q && x.q ? estText(x.q, Q) : 0); });
  const over = layout(items, A, B, $("fsPlace").value, +$("fsGap").value);
  if (over > 0.3) warns.push(`Фразы не помещаются в кусок видео — выходят за край на ${n1(over)} с. Сократите текст или увеличьте кусок.`);
  const cues = items.map((x) => {
    const c = newCue(round2(x.start), round2(x.end));
    c[P] = x.p; c.vp[P] = x.vpP;
    if (Q) { c[Q] = x.q; c.vp[Q] = x.vpQ || twinVoice(x.vpP, Q); }
    return c;
  });
  return { cues, warns };
}
const voLangs = () => LANGS.filter((l) => $(l === "ru" ? "voRu" : "voEn").checked);
$("voGo").onclick = async () => {
  const langs = voLangs().filter((l) => S.script[l].trim());
  if (!langs.length) {
    toast(voLangs().length ? "Сценарий пустой — сначала напишите текст в шаге 2" : "Отметьте, какой язык озвучить: RU или EN");
    $("scriptCard").scrollIntoView({ behavior: "smooth", block: "start" }); return;
  }
  const mode = vmode(), sig = JSON.stringify([mode, langs, langs.map((l) => S.script[l]), rangeOf(), $("fsSplit").value, $("fsPlace").value, $("fsGap").value, mode === "solid" ? langs.map((l) => $("solV_" + l).value) : 0]);
  if (sig !== S.builtSig || !S.cues.length) {
    const keep = S.cues.length && S.handEdited && !confirm("Фразы правились вручную в «Тонкой настройке». Собрать их заново из сценария?\n\nОК — заново из сценария, Отмена — озвучить фразы как есть.");
    if (!keep) {
      const r = buildCues(mode, langs);
      if (!r.cues.length) return toast("В сценарии нет текста");
      snap(); S.cues = r.cues; S.sel = null; S.builtSig = sig; S.handEdited = false;
      renderAll(); save();
      r.warns.forEach((w) => logTo("vLog", w, "warn"));
    }
  }
  await runV(() => synth(langs.filter((l) => S.cues.some((c) => c[l].trim()))));
};
// фразы с таймкодами — обратно в сценарий (после правок в «Тонкой настройке»)
$("toScript").onclick = () => {
  if (!S.cues.length) return toast("Фраз пока нет");
  if (LANGS.some((l) => S.script[l].trim()) && !confirm("Записать фразы с таймкодами в сценарий? Текущий текст сценария будет заменён.")) return;
  for (const l of LANGS) {
    const multi = voicesOf(l).length > 1;
    S.script[l] = S.cues.filter((c) => c[l].trim()).map((c) => `${fmt(c.start)} - ${fmt(effEnd(c))} ${multi ? prof(pidFor(c, l))?.name + ": " : ""}${c[l].replace(/\s*\n\s*/g, " ").trim()}`).join("\n");
  }
  edShow(edCur); setVmode("phrases"); S.builtSig = null; save();
  toast("Фразы записаны в сценарий; режим озвучки — «По фразам»");
};
