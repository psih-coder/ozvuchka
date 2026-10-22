"use strict";
// ================= Polza AI =================
const POLZA = "https://polza.ai/api/v1";
$("key").addEventListener("input", () => { try { localStorage.setItem("vt-polza-key", $("key").value.trim()); } catch {} });
async function polzaFetch(path, body, tries = 3) {
  const key = $("key").value.trim();
  if (!key) throw Object.assign(new Error("Вставьте ключ Polza AI в поле вверху страницы."), { fatal: true });
  const form = body instanceof FormData;   // файл (распознавание речи) — без JSON, заголовок ставит браузер
  for (let k = 1; ; k++) {
    let r;
    try {
      r = await fetch(POLZA + path, { method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + key, ...(body && !form ? { "Content-Type": "application/json" } : {}) }, body: body ? (form ? body : JSON.stringify(body)) : undefined });
    } catch { if (k < tries) { await new Promise((res) => setTimeout(res, 1500 * k)); continue; } throw new Error("Нет связи с Polza AI. Проверьте интернет."); }
    if (r.ok) return r;
    let d = null; try { d = await r.json(); } catch {}
    const msg = d?.error?.message || d?.message || r.statusText;
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error("Ключ Polza AI не подошёл. Проверьте его вверху страницы."), { fatal: true });
    if (r.status === 402) throw Object.assign(new Error("Polza AI: не хватает денег на балансе или исчерпан лимит ключа."), { fatal: true });
    if ((r.status === 429 || r.status >= 500) && k < tries) { await new Promise((res) => setTimeout(res, 2000 * k)); continue; }
    throw Object.assign(new Error(`Polza AI ответила ошибкой ${r.status}: ${msg}`), { status: r.status });
  }
}
const polza = async (path, body, tries) => (await polzaFetch(path, body, tries)).json();
const costOf = (d) => +(d?.usage?.cost_rub ?? d?.usage?.cost ?? d?.cost_rub ?? d?.cost ?? 0) || 0;
$("keyCheck").onclick = async () => {
  say("keyStatus", "Проверяю…");
  try { const b = await polza("/balance", null, 1); say("keyStatus", `✔ ${(+b.amount).toFixed(2)} ₽`, "ok"); }
  catch (e) { say("keyStatus", e.message, "err"); }
};
async function balance() { try { return +(await polza("/balance", null, 1)).amount; } catch { return null; } }

function parseJsonLoose(s) {
  if (Array.isArray(s)) s = s.map((p) => p.text || "").join("");
  s = String(s || "").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) try { return JSON.parse(s.slice(a, b + 1)); } catch {}
  throw new Error("ИИ ответил не по формату — попробуйте ещё раз или другую модель.");
}
async function chat(m, messages, schema) {
  const body = { model: m.id, messages };
  if (m.reason) body.reasoning = { effort: m.reason };
  if (m.rf) body.response_format = { type: "json_schema", json_schema: schema };
  let d;
  try { d = await polza("/chat/completions", body); }
  catch (e) {
    if (e.status !== 400 || !(m.rf || m.reason)) throw e;
    delete body.response_format; delete body.reasoning;   // модель не поняла параметры — пробуем попроще
    d = await polza("/chat/completions", body);
  }
  return { json: parseJsonLoose(d.choices?.[0]?.message?.content), cost: costOf(d) };
}

// ================= ИИ: сценарий по отрезкам =================
const TONES = {
  voiceover: "закадровый голос живого обзора: по делу, с эмоцией, без воды",
  hype: "хайп и эмоции, как новостной ролик «вы не поверите»",
  facts: "интересные факты и малоизвестные детали",
  fun: "с юмором, легко и смешно",
  trailer: "голос трейлера: коротко, пафосно, с паузами",
  docu: "спокойный документальный рассказчик",
  story: "от первого лица персонажа, которого видно в кадре",
  stream: "как стример или летсплейщик: живые реакции, разговорно",
  free: "строго так, как описано в промпте автора",
};
const aiLangs = () => ($("aiLangs").value === "both" ? ["ru", "en"] : [$("aiLangs").value]);
// у реплики без конца отрезок тянется до следующей (или до конца видео) — текст на всю длину не просим
const limit = (c, l) => Math.max(6, Math.floor((c.end == null ? Math.min(slotOf(c), 12) : slotOf(c)) * CPS[l] * baseSpeed() * 0.9));
const LINES_SCHEMA = { name: "voiceover", strict: true, schema: { type: "object", additionalProperties: false, required: ["lines"],
  properties: { lines: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "ru", "en"],
    properties: { n: { type: "integer" }, ru: { type: "string" }, en: { type: "string" } } } } } } };
const TR_SCHEMA = { name: "translation", strict: true, schema: { type: "object", additionalProperties: false, required: ["lines"],
  properties: { lines: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "text"],
    properties: { n: { type: "integer" }, text: { type: "string" } } } } } } };
const cleanLine = (s) => String(s || "").replace(/^\s*#?\d+[.):]\s*/, "").replace(/^["«„“]+|["»“”]+$/g, "").replace(/\s+/g, " ").trim();
const segHead = (c) => `#${num(c)} [${fmt(c.start)}–${fmt(effEnd(c))}, ${n1(slotOf(c))} с]`;

let aiBusy = false;
async function runAi(fn) {
  if (aiBusy) return toast("ИИ ещё работает — подождите или нажмите «Стоп»");
  aiBusy = true; S.aiStop = false; $("aiStop").hidden = false;
  document.querySelectorAll("#aiGo, #edTr").forEach((b) => b.disabled = true);
  const b0 = await balance();
  try { await fn(); }
  catch (e) { if (e !== STOP && e !== CANCEL) { logTo("aiLog", e.message, "err"); toast(e.message); } else logTo("aiLog", e.message, "warn"); }
  aiBusy = false; $("aiStop").hidden = true;
  document.querySelectorAll("#aiGo, #edTr").forEach((b) => b.disabled = false);
  const b1 = b0 != null ? await balance() : null;
  if (b0 != null && b1 != null) $("aiCost").textContent = `Списано за запуск: ${Math.max(0, b0 - b1).toFixed(2)} ₽ · баланс ${b1.toFixed(2)} ₽`;
}
$("aiStop").onclick = () => { S.aiStop = true; };

async function aiTranslate(from, to, onlyId) {
  const m = aiModel();
  const list = onlyId ? [cueById(onlyId)].filter((c) => c[from].trim()) : S.cues.filter((c) => c[from].trim());
  if (!list.length) throw new Error(`Нет текста на языке «${from.toUpperCase()}» для перевода.`);
  if (!onlyId && list.some((c) => c[to].trim()) && !confirm(`Перевести ${list.length} реплик ${from.toUpperCase()} → ${to.toUpperCase()}? Текущий текст ${to.toUpperCase()} будет заменён (можно вернуть «Отменить»).`)) throw CANCEL;
  const li = logTo("aiLog", `Перевожу ${list.length} реплик ${from.toUpperCase()} → ${to.toUpperCase()} (${m.id.split("/")[1]})…`);
  const text = `Переведи реплики закадровой озвучки видео с языка «${LN[from]}» на «${LN[to]}». ` +
    "Перевод живой и разговорный, для озвучки — не дословный. Каждая реплика должна уложиться в свой лимит символов, иначе голос не поместится в отрезок. " +
    "Имена и названия — как принято в языке перевода (GTA 6, Лусия ⇄ Lucia, Вайс-Сити ⇄ Vice City). Числа — словами, как произносят. Верни все номера n.\n\n" +
    list.map((c) => `#${num(c)} (лимит ${limit(c, to)} симв.): ${c[from].trim()}`).join("\n") +
    (m.rf ? "" : '\n\nОтветь ТОЛЬКО JSON без пояснений: {"lines":[{"n":1,"text":"..."}]}');
  const { json, cost } = await chat({ ...m, vision: false }, [
    { role: "system", content: "Ты профессиональный переводчик и адаптатор сценариев YouTube-видео." },
    { role: "user", content: text },
  ], TR_SCHEMA);
  snap();
  let n = 0;
  for (const x of json.lines || []) { const c = S.cues[(x.n | 0) - 1]; const t = cleanLine(x.text); if (c && list.includes(c) && t) { c[to] = t; n++; } }
  renderAll(); save();
  done(li, `Переведено ${n} из ${list.length} (${cost.toFixed(2)} ₽)`);
}
function aiCostHint() {
  let m; try { m = aiModel(); } catch { $("aiModelInfo").textContent = ""; return; }
  $("aiCustom").hidden = $("aiModel").value !== "custom";
  if (m.custom) { $("aiModelInfo").textContent = "Своя модель: если она не понимает формат ответа, программа попробует ещё раз попроще."; return; }
  const n = S.cues.length || 8, frames = $("aiFrames").checked && m.vision ? Math.min(40, n * 2) : 0;
  const tin = 1200 + n * 90 + frames * 300, tout = 600 + n * aiLangs().length * 70;
  const rub = (tin * m.pin + tout * m.pout) / 1e6 * (m.reason ? 1.6 : 1);
  $("aiModelInfo").textContent = `${m.vision ? "👁 видит кадры" : "📝 только текст"} · ≈${rub < 0.1 ? rub.toFixed(2) : rub.toFixed(1)} ₽ за запуск на ${n} отрезков${frames ? ` с ${frames} кадрами` : ""}`;
  $("aiFramesWrap").style.opacity = m.vision ? 1 : 0.5;
}
["aiModel", "aiCustom", "aiLangs", "aiFrames"].forEach((id) => $(id).addEventListener("input", aiCostHint));
