"use strict";
// ================= Шаг 2. Сценарий: одно окно с текстом (RU / EN) =================
S.script = { ru: "", en: "" };
let edCur = "ru";
const otherL = (l) => (l === "ru" ? "en" : "ru");
function edShow(l) {
  edCur = l; setSeg("edLang", l);
  $("edText").value = S.script[l];
  $("edTr").textContent = `🌐 Перевести на ${otherL(l).toUpperCase()}`;
  edInfo();
}
$("edLang").onclick = (e) => { const b = e.target.closest("button"); if (b) { edShow(b.dataset.v); saveSet(); } };
let edT;
$("edText").addEventListener("input", () => { S.script[edCur] = $("edText").value; clearTimeout(edT); edT = setTimeout(() => { syncFromScript(edCur); edInfo(); save(); }, 250); });
function setScript(l, text) { S.script[l] = text; if (edCur === l) $("edText").value = text; edInfo(); save(); }
// кусок видео, который озвучиваем (и для ИИ, и для озвучки)
function rangeOf() {
  const D = totalDur(), a = parseTime($("scFrom").value.trim() || "0"), b = parseTime($("scTo").value.trim());
  const A = isFinite(a) ? clamp(a, 0, D) : 0, B = isFinite(b) && b > A + 0.5 ? Math.min(b, D) : D;
  return [A, B];
}
$("scFromNow").onclick = () => { $("scFrom").value = fmt(V.currentTime || 0); edInfo(); saveSet(); };
$("scToNow").onclick = () => { $("scTo").value = fmt(V.currentTime || 0); edInfo(); saveSet(); };
["scFrom", "scTo"].forEach((id) => $(id).addEventListener("change", () => { edInfo(); saveSet(); }));

const TIME_RE = new RegExp(String.raw`^\[?(\d{1,2}(?::\d{1,2}){0,2}(?:[.,]\d+)?)\]?\s*(?:(?:-->|-|–|—)\s*\[?(\d{1,2}(?::\d{1,2}){0,2}(?:[.,]\d+)?)\]?)?\s*[|]?\s*(.*)$`);
// строки сценария: [время] [Имя:] текст; пустая строка — пауза подлиннее
function parseScript(text, l) {
  const out = [], unknown = new Set();
  let pause = 0;
  for (const raw of (text || "").split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) { pause++; continue; }
    let t0 = null, t1 = null, vp = null;
    const tm = line.match(TIME_RE);
    if (tm && /^\[?\d{1,2}:/.test(line)) { t0 = parseTime(tm[1]); t1 = tm[2] ? parseTime(tm[2]) : null; line = tm[3].trim(); if (!isFinite(t0)) t0 = null; if (!isFinite(t1) || t1 <= t0) t1 = null; }
    const nm = line.match(/^([^:：]{1,32})[:：]\s*(.+)$/);
    if (nm) {
      const v = voicesOf(l).find((x) => x.name.toLowerCase() === nm[1].trim().toLowerCase());
      if (v) { vp = v.id; line = nm[2].trim(); }
      else if (nm[1].trim().split(/\s+/).length <= 3 && !/\d/.test(nm[1])) { unknown.add(nm[1].trim()); line = nm[2].trim(); }
    }
    if (!line) continue;
    // строка без времени и без имени продолжает предыдущую фразу того же говорящего? — нет: каждая строка — своя фраза
    out.push({ t0, t1, vp, text: line, pause });
    pause = 0;
  }
  return { lines: out, unknown: [...unknown] };
}
// текст для озвучки целиком: без таймкодов и имён, абзацы сохраняем
function plainText(text, l) {
  const paras = [], { lines } = parseScript(text, l);
  let cur = [];
  lines.forEach((x) => { if (x.pause && cur.length) { paras.push(cur.join(" ")); cur = []; } cur.push(x.text); });
  if (cur.length) paras.push(cur.join(" "));
  return paras.join("\n\n");
}
function edInfo() {
  const [A, B] = rangeOf(), win = B - A, can = $("vFit").checked ? +$("vMax").value / baseSpeed() : 1;
  const parts = LANGS.map((l) => {
    const t = plainText(S.script[l], l).replace(/\s+/g, " ").trim();
    if (!t) return `<span class="tag-${l}">${l.toUpperCase()}</span>: пусто`;
    const e = estText(t, l), warn = e > win * can ? ` <span style="color:var(--err)">— не влезет, сократите на ~${Math.round((1 - win * can / e) * 100)}%</span>` : e > win ? ` <span style="color:var(--warn)">— голос чуть ускорится</span>` : "";
    return `<span class="tag-${l}">${l.toUpperCase()}</span>: ${t.length} симв. ≈ ${fmt(e, 0)} голоса${warn}`;
  });
  const unk = new Set(LANGS.flatMap((l) => parseScript(S.script[l], l).unknown));
  $("edInfo").innerHTML = parts.join(" · ") + ` · кусок видео ${fmt(A, 0)}–${fmt(B, 0)} (${fmt(win, 0)})` +
    (unk.size ? ` · <span style="color:var(--warn)">нет голоса для: ${[...unk].map(esc).join(", ")} — добавьте в шаге 3</span>` : "");
  if (typeof stepSums === "function") stepSums();
}
$("edClear").onclick = () => { if (S.script[edCur].trim() && !confirm(`Очистить текст ${edCur.toUpperCase()}?`)) return; setScript(edCur, ""); };
$("edImport").onclick = () => $("edFile").click();
$("edFile").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  importToScript(await f.text());
};
function importToScript(t) {
  // .srt → строки «0:01 - 0:03 текст»
  if (/-->/.test(t)) t = parseImport(t, edCur).map((c) => `${fmt(c.start)}${c.end != null ? " - " + fmt(c.end) : ""} ${c[edCur]}`).join("\n");
  if (S.script[edCur].trim() && !confirm(`Заменить текст ${edCur.toUpperCase()} содержимым файла?`)) return;
  setScript(edCur, t.trim()); toast("Текст загружен в сценарий");
}
// перевод всего текста с сохранением строк, таймкодов и имён
const TXT_SCHEMA = { name: "script_text", strict: true, schema: { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } } };
$("edTr").onclick = () => runAi(() => edTranslate(edCur, otherL(edCur)));
async function edTranslate(from, to) {
  const src = S.script[from].trim();
  if (!src) throw new Error(`Текст ${from.toUpperCase()} пустой — нечего переводить.`);
  if (S.script[to].trim() && !confirm(`Текст ${to.toUpperCase()} будет заменён переводом. Продолжить?`)) throw CANCEL;
  const m = aiModel();
  const pairs = voicesOf(from).map((v, i) => [v.name, voicesOf(to)[i]?.name]).filter((p) => p[1] && p[0] !== p[1]);
  const li = logTo("aiLog", `Перевожу сценарий ${from.toUpperCase()} → ${to.toUpperCase()} (${m.id.split("/")[1]})…`);
  const { json, cost } = await chat({ ...m, vision: false }, [
    { role: "system", content: "Ты профессиональный переводчик и адаптатор закадровых текстов для YouTube." },
    { role: "user", content: `Переведи сценарий озвучки с языка «${LN[from]}» на «${LN[to]}». Перевод живой и разговорный, для озвучки — не дословный, примерно той же длины.\n` +
      "Сохрани строки и пустые строки как есть. Таймкоды в начале строк (например «0:05 - 0:09») не меняй. Имена говорящих перед двоеточием оставь" +
      (pairs.length ? `, но замени: ${pairs.map(([a, b]) => `«${a}» → «${b}»`).join(", ")}` : "") + ". " +
      "Имена и названия — как принято в языке перевода (GTA 6, Лусия ⇄ Lucia, Вайс-Сити ⇄ Vice City). Числа — словами.\n\n" + src +
      (m.rf ? "" : '\n\nОтветь ТОЛЬКО JSON: {"text":"..."}') },
  ], TXT_SCHEMA);
  const t = String(json.text || "").replace(/\r/g, "").trim();
  if (!t) throw new Error("ИИ вернул пустой перевод — попробуйте ещё раз.");
  setScript(to, t); edShow(to);
  done(li, `Переведено на ${to.toUpperCase()} (${cost.toFixed(2)} ₽) — открыта вкладка ${to.toUpperCase()}`);
}

// ---- ИИ пишет сценарий прямо в окно ----
$("aiOpen").onclick = () => { $("aiPanel").hidden = !$("aiPanel").hidden; $("aiOpen").setAttribute("aria-expanded", !$("aiPanel").hidden); if (!$("aiPanel").hidden) $("aiCtx").focus(); };
$("aiClose").onclick = () => { $("aiPanel").hidden = true; $("aiOpen").setAttribute("aria-expanded", "false"); };
$("aiGo").onclick = () => runAi(aiScript);
const FULL_SCHEMA = { name: "full_script", strict: true, schema: { type: "object", additionalProperties: false, required: ["lines"],
  properties: { lines: { type: "array", items: { type: "object", additionalProperties: false, required: ["start", "end", "ru", "en", "speaker_ru", "speaker_en"],
    properties: { start: { type: "number" }, end: { type: "number" }, ru: { type: "string" }, en: { type: "string" }, speaker_ru: { type: "string" }, speaker_en: { type: "string" } } } } } } };
const SOLID_SCHEMA = { name: "solid_voiceover", strict: true, schema: { type: "object", additionalProperties: false, required: ["ru", "en"],
  properties: { ru: { type: "string" }, en: { type: "string" } } } };
function afLabels() {
  $("afDensV").textContent = $("afDens").value + "%"; $("afNV").textContent = $("afN").value;
  const multi = LANGS.filter((l) => voicesOf(l).length > 1);
  $("afSpkWrap").hidden = !multi.length;
  $("afSpkN").textContent = LANGS.map((l) => `${l.toUpperCase()}: ${voicesOf(l).map((v) => v.name).join(", ")}`).join(" · ");
}
["afDens", "afN"].forEach((id) => $(id).addEventListener("input", () => { afLabels(); saveSet(); }));
async function aiScript() {
  const m = aiModel(), langs = aiLangs(), timed = $("aiTimed").checked;
  if (!S.file) throw new Error("Сначала загрузите видео (шаг 1).");
  const [A, B] = rangeOf(), len = B - A, dens = +$("afDens").value / 100, sp = baseSpeed();
  const ctx = $("aiCtx").value.trim(), wish = $("aiWish").value.trim(), useFrames = $("aiFrames").checked && m.vision;
  if (!ctx && !useFrames) throw new Error("Напишите, о чём ролик, — или включите «ИИ смотрит кадры видео».");
  if (langs.some((l) => S.script[l].trim()) && !confirm(`ИИ напишет новый текст и заменит текущий (${langs.filter((l) => S.script[l].trim()).map((l) => l.toUpperCase()).join(", ")}). Продолжить?`)) throw CANCEL;
  const spk = {};
  for (const l of LANGS) spk[l] = $("afSpk").checked && voicesOf(l).length > 1 ? voicesOf(l).map((v) => v.name) : null;
  const chars = (l) => Math.round(len * dens * CPS[l] * sp);
  const head = `Видео: «${S.name}», формат ${curAR()}. Озвучиваем отрезок ${fmt(A)}–${fmt(B)} (${n1(len)} с).\n` +
    `О чём ролик (промпт автора): ${ctx || "— (ориентируйся на кадры)"}\nПодача: ${TONES[$("aiTone").value]}.${wish ? `\nПожелания автора: ${wish}.` : ""}\n\n`;
  const common = "- Разговорно, без эмодзи, хэштегов, ремарок в скобках. Числа — словами. Не выдумывай фактов.\n" +
    "- Рассказ идёт по порядку того, что происходит в видео" + (useFrames ? " (кадры с временем приложены ниже)" : "") + ". Первая фраза цепляет внимание, в конце — итог или призыв подписаться.\n";
  let text, schema;
  if (timed) {
    const n0 = Math.max(1, Math.round(len * dens / 4.5)), n1x = Math.max(n0 + 1, Math.round(len * dens / 2.5));
    const langRule = langs.length === 2 ? "Для каждой фразы верни ru и en (тот же смысл, естественная адаптация). Обе должны уложиться в длительность фразы."
      : langs[0] === "ru" ? "Пиши только ru, en — пустая строка." : "Write only en; ru must be an empty string.";
    const spkRule = LANGS.map((l) => (spk[l] ? `speaker_${l} — имя строго из списка: ${spk[l].map((x) => `«${x}»`).join(", ")} (персонажи говорят свои реплики, рассказчик — остальное).` : `speaker_${l} — пустая строка.`)).join(" ");
    text = head + "Напиши закадровую озвучку и расставь таймкоды.\nПравила:\n" +
      `- Голос звучит примерно ${Math.round(len * dens)} с из ${Math.round(len)}. Около ${n0}–${n1x} фраз по 1,5–7 с.\n` +
      `- start и end — секунды видео внутри ${A.toFixed(1)}–${B.toFixed(1)}, по возрастанию, без наложений, паузы ≥ 0,3 с. Текст фразы ≤ (end − start) × ${Math.round(CPS.ru * sp)} символов по-русски и × ${Math.round(CPS.en * sp)} по-английски.\n` +
      "- Ставь фразу на момент, где в кадре происходит то, о чём она.\n" + common + `- ${langRule}\n- ${spkRule}` +
      (m.rf ? "" : '\n\nОтветь ТОЛЬКО JSON: {"lines":[{"start":0,"end":3,"ru":"...","en":"...","speaker_ru":"","speaker_en":""}]}');
    schema = FULL_SCHEMA;
  } else {
    const langRule = langs.length === 2 ? `ru — текст на русском (около ${chars("ru")} символов), en — тот же рассказ на английском (около ${chars("en")} символов).`
      : langs[0] === "ru" ? `Пиши только ru — около ${chars("ru")} символов. en — пустая строка.` : `Write only en — about ${chars("en")} characters. ru must be an empty string.`;
    const spkRule = langs.filter((l) => spk[l]).map((l) => `В ${l} реплики персонажей начинай с новой строки с имени: ${spk[l].map((x) => `«${x}: »`).join(", ")}. Текст рассказчика пиши без имени.`).join(" ");
    text = head + "Напиши связный текст закадровой озвучки, который читается подряд от начала до конца отрезка.\nПравила:\n" +
      `- ${langRule} Длина важна: голос должен звучать примерно ${Math.round(len * dens)} с.\n` + common +
      "- Абзацы разделяй пустой строкой. Без таймкодов." + (spkRule ? `\n- ${spkRule}` : " Без имён говорящих.") +
      (m.rf ? "" : '\n\nОтветь ТОЛЬКО JSON: {"ru":"...","en":"..."}');
    schema = SOLID_SCHEMA;
  }
  const content = [{ type: "text", text }];
  if (useFrames) {
    const nF = Math.min(+$("afN").value, Math.max(4, Math.ceil(len / 1.5)));
    const li = logTo("aiLog", `Вырезаю ${nF} кадров из видео…`);
    for (let i = 0; i < nF; i++) {
      if (S.aiStop) throw STOP;
      const t = A + len * (i + 0.5) / nF;
      content.push({ type: "text", text: `Кадр на ${fmt(t)} (${t.toFixed(1)} с):` });
      content.push({ type: "image_url", image_url: { url: await frameJpeg(t, 384), detail: "low" } });
      li.textContent = `⏳ Вырезаю кадры: ${i + 1} из ${nF}`;
    }
    done(li, `Кадры готовы: ${nF} шт.`);
  } else if ($("aiFrames").checked && !m.vision) logTo("aiLog", "Эта модель не видит картинки — пишет только по промпту.", "warn");
  if (S.aiStop) throw STOP;
  const li = logTo("aiLog", `${m.id.split("/")[1]} пишет сценарий на ${fmt(len)}${timed ? " с таймкодами" : ""}…`);
  const { json, cost } = await chat(m, [
    { role: "system", content: "Ты профессиональный сценарист закадровой озвучки для YouTube-видео и шортсов. Пишешь живо и точно в хронометраж." },
    { role: "user", content: useFrames ? content : text },
  ], schema);
  if (S.aiStop) throw STOP;
  const res = {};
  if (timed) {
    const lines = (json.lines || []).filter((x) => isFinite(+x.start)).sort((a, b) => a.start - b.start);
    for (const l of langs) res[l] = lines.filter((x) => cleanLine(x[l])).map((x) => {
      const s0 = clamp(+x.start, A, B), e0 = clamp(+x.end || s0 + 3, s0, B), nm = String(x["speaker_" + l] || "").replace(/[«»"]/g, "").trim();
      return `${fmt(s0)} - ${fmt(e0)} ${spk[l] && nm ? nm + ": " : ""}${cleanLine(x[l])}`;
    }).join("\n");
  } else for (const l of langs) res[l] = String(json[l] || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  if (!langs.some((l) => res[l])) throw new Error("ИИ вернул пустой текст — попробуйте ещё раз или другую модель.");
  for (const l of langs) if (res[l]) S.script[l] = res[l];
  edShow(langs.find((l) => res[l])); save();
  if (timed) { const r = document.querySelector('input[name=vmode][value=phrases]'); r.checked = true; setVmode("phrases"); }
  done(li, `Готово (${cost.toFixed(2)} ₽) — текст в окне сценария. Прочитайте, поправьте и переходите к озвучке.`);
}
