"use strict";
// ================= Модели =================
// для сценария: [id, название, видит картинки, понимает json_schema, reasoning, ₽ за 1M токенов вход, выход]
// список сверен с каталогом Polza AI 20.10.2026
const AI_MODELS = [
  ["Google", [
    ["google/gemini-3.8-flash", "Gemini 3.8 Flash — быстро и недорого", 1, 1, "low", 44, 220],
    ["google/gemini-4-argon", "Gemini 4 Argon — новейшая, умная", 1, 1, "low", 117, 587],
    ["google/gemini-3.5-flash", "Gemini 3.5 Flash", 1, 1, "low", 88, 528],
    ["google/gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite — дешёвая", 1, 1, "low", 18, 147],
    ["google/gemini-3.1-flash-lite", "Gemini 3.1 Flash Lite — самая дешёвая Gemini", 1, 1, "low", 15, 88],
    ["google/gemma-4-31b-it", "Gemma 4 31B — открытая", 1, 1, null, 12, 40],
  ]],
  ["OpenAI", [
    ["openai/gpt-6.1-sol", "GPT-6.1 Sol — сильная", 1, 1, "low", 117, 587],
    ["openai/gpt-6-astra", "GPT-6 Astra — топ, дорогая", 1, 1, "low", 587, 2936],
    ["openai/gpt-6-luna", "GPT-6 Luna — очень дешёвая", 1, 1, "low", 6, 29],
    ["openai/gpt-5.6-luna-pro", "GPT-5.6 Luna Pro", 1, 1, "low", 12, 70],
  ]],
  ["Anthropic", [
    ["anthropic/claude-sonnet-5.5", "Claude Sonnet 5.5 — самый живой текст", 1, 1, "low", 235, 1174],
    ["anthropic/claude-opus-5.5", "Claude Opus 5.5 — очень умная", 1, 1, "low", 470, 2349],
    ["anthropic/claude-fable-5.1", "Claude Fable 5.1 — топ, дорогая", 1, 1, "low", 1174, 5872],
    ["anthropic/claude-haiku-5.5", "Claude Haiku 5.5 — быстрая и дешёвая", 1, 1, "low", 12, 59],
  ]],
  ["xAI", [["x-ai/grok-4.7", "Grok 4.7 — дерзкий стиль", 1, 1, "low", 235, 705]]],
  ["Qwen", [
    ["qwen/qwen3.8-max", "Qwen 3.8 Max", 1, 1, "low", 235, 705],
    ["qwen/qwen3.8-flash", "Qwen 3.8 Flash — дешёвая", 1, 1, null, 18, 55],
  ]],
  ["DeepSeek", [
    ["deepseek/deepseek-v4.1-flash", "DeepSeek V4.1 Flash — копейки", 1, 1, "low", 7, 14],
    ["deepseek/deepseek-v4-pro", "DeepSeek V4 Pro — только текст", 0, 1, null, 106, 176],
  ]],
  ["Другие", [
    ["moonshotai/kimi-k2.6", "Kimi K2.6", 1, 1, null, 53, 229],
    ["z-ai/glm-5.3", "GLM 5.3 — только текст", 0, 1, "low", 9, 164],
    ["z-ai/glm-5.3-flash", "GLM 5.3 Flash — очень дешёвая", 1, 1, "low", 6, 19],
    ["minimax/minimax-m3", "MiniMax M3", 1, 1, null, 26, 103],
    ["mistralai/mistral-medium-3-5", "Mistral Medium 3.5", 1, 1, null, 176, 881],
    ["meta-llama/llama-4-maverick", "Llama 4 Maverick", 1, 1, null, 22, 77],
  ]],
  ["Российские", [
    ["GigaChat/GigaChat-3-Pro", "GigaChat 3 Pro — Сбер, только текст", 0, 1, null, 104, 250],
    ["yandex/yandexgpt-5.1-pro", "YandexGPT 5.1 Pro — только текст", 0, 0, null, 1136, 1136],
    ["yandex/aliceai-llm", "Alice AI — Яндекс, только текст", 0, 0, null, 710, 1704],
  ]],
];
const AI_FLAT = AI_MODELS.flatMap(([, l]) => l);
$("aiModel").innerHTML = AI_MODELS.map(([g, l]) => `<optgroup label="${g}">${l.map((m) => `<option value="${m[0]}">${m[1]}</option>`).join("")}</optgroup>`).join("") +
  `<optgroup label="Любая другая"><option value="custom">✎ Свой ID модели из каталога Polza…</option></optgroup>`;
function aiModel() {
  const v = $("aiModel").value;
  if (v === "custom") {
    const id = $("aiCustom").value.trim();
    if (!id) throw new Error("Впишите ID модели (например, google/gemini-3.8-flash) или выберите модель из списка.");
    return { id, vision: true, rf: true, reason: null, pin: 0, pout: 0, custom: true };
  }
  const m = AI_FLAT.find((x) => x[0] === v) || AI_FLAT[0];
  return { id: m[0], vision: !!m[2], rf: !!m[3], reason: m[4], pin: m[5], pout: m[6] };
}

// голоса
const GEM30 = [
  ["Puck", "муж., бодрый"], ["Charon", "муж., рассказчик"], ["Fenrir", "муж., возбуждённый"], ["Orus", "муж., твёрдый"],
  ["Enceladus", "муж., с придыханием"], ["Iapetus", "муж., чёткий"], ["Umbriel", "муж., спокойный"], ["Algieba", "муж., мягкий"],
  ["Algenib", "муж., с хрипотцой"], ["Rasalgethi", "муж., дикторский"], ["Alnilam", "муж., уверенный"], ["Schedar", "муж., ровный"],
  ["Achird", "муж., дружелюбный"], ["Zubenelgenubi", "муж., непринуждённый"], ["Sadachbia", "муж., живой"], ["Sadaltager", "муж., знающий"],
  ["Kore", "жен., твёрдый"], ["Zephyr", "жен., яркий"], ["Leda", "жен., молодой"], ["Aoede", "жен., лёгкий"],
  ["Callirrhoe", "жен., спокойный"], ["Autonoe", "жен., яркий"], ["Despina", "жен., мягкий"], ["Erinome", "жен., чёткий"],
  ["Laomedeia", "жен., бодрый"], ["Achernar", "жен., нежный"], ["Gacrux", "жен., зрелый"], ["Pulcherrima", "жен., напористый"],
  ["Vindemiatrix", "жен., мягкий"], ["Sulafat", "жен., тёплый"],
].map(([v, d]) => [v, `${v} — ${d}`]);
const EL22 = [
  ["JBFqnCBsd6RMkjVDRZzb", "George — муж., рассказчик"], ["pNInz6obpgDQGcFmaJgB", "Adam — муж., низкий"], ["nPczCjzI2devNBz1zQrb", "Brian — муж., глубокий"],
  ["onwK4e9ZLuTAKqWW03F9", "Daniel — муж., диктор"], ["CwhRBWXzGAHq8TQ4Fs17", "Roger — муж., спокойный"], ["iP95p4xoKVk53GoZ742B", "Chris — муж., живой"],
  ["cjVigY5qzO86Huf0OWal", "Eric — муж., дружелюбный"], ["TX3LPaxmHKxFdv7VOQHJ", "Liam — муж., молодой"], ["N2lVS1w4EtoT3dr4eOWO", "Callum — муж., хрипловатый"],
  ["IKne3meq5aSn9XLyUdCD", "Charlie — муж., бодрый"], ["bIHbv24MWmeRgasZH58o", "Will — муж., расслабленный"], ["pqHfZKP75CvOlQylNhV4", "Bill — муж., пожилой"],
  ["21m00Tcm4TlvDq8ikWAM", "Rachel — жен., спокойный"], ["9BWtsMINqrJLrRacOk9x", "Aria — жен."], ["EXAVITQu4vr4xnSDxMaL", "Sarah — жен., мягкий"],
  ["XB0fDUnXU5powFXDhCwa", "Charlotte — жен."], ["Xb7hH8MSUJpSbSDYk0k2", "Alice — жен., чёткий"], ["XrExE9yKIg1WjnnlVkGX", "Matilda — жен., тёплый"],
  ["cgSgspJ2msm6clMCkdW9", "Jessica — жен., бодрый"], ["FGY2WhTYpPnrIDTdsKH5", "Laura — жен., молодой"], ["pFZP5JQG7iQjIQuC4Bku", "Lily — жен."],
  ["SAz9YHcvj6GT2YYXdXww", "River — нейтральный"], ["custom", "✎ Свой voice_id…"],
];
// характер для ElevenLabs v4 — тегом эмоции в начале фразы
const EL_TAGS = { whisper: "[whispers]", shout: "[shouting]", sport: "[excited]", kid: "[excited]", sarcasm: "[sarcastic]", tired: "[sighs]", nervous: "[nervous]" };
const GEM11 = GEM30.filter(([v]) => ["Kore", "Aoede", "Puck", "Charon", "Zephyr", "Achird", "Algieba", "Algenib", "Fenrir", "Leda", "Orus"].includes(v));
const OAI_D = { alloy: "нейтральный", ash: "муж., чёткий", ballad: "муж., мягкий", coral: "жен., тёплый", echo: "муж., спокойный", fable: "рассказчик",
  onyx: "муж., низкий", nova: "жен., бодрый", sage: "жен., спокойный", shimmer: "жен., светлый", verse: "муж., выразительный" };
const oai = (list) => list.map((v) => [v, `${v} — ${OAI_D[v]}`]);
const MM = ["Wise_Woman", "Friendly_Person", "Inspirational_girl", "Deep_Voice_Man", "Calm_Woman", "Casual_Guy", "Lively_Girl", "Patient_Man",
  "Young_Knight", "Determined_Man", "Lovely_Girl", "Decent_Boy", "Imposing_Manner", "Elegant_Man", "Abbess", "Sweet_Girl_2", "Exuberant_Girl"].map((v) => [v, v.replace(/_/g, " ")]);
const DG = ["thalia", "andromeda", "helena", "apollo", "arcas", "aries", "amalthea", "asteria", "athena", "atlas", "aurora", "callista", "cora", "cordelia",
  "delia", "draco", "electra", "harmonia", "hera", "hermes", "hyperion", "iris", "janus", "juno", "jupiter", "luna", "mars", "minerva", "neptune",
  "odysseus", "ophelia", "orion", "orpheus", "pandora", "phoebe", "pluto", "saturn", "selene", "theia", "vesta", "zeus"].map((v) => [`aura-2-${v}-en`, v[0].toUpperCase() + v.slice(1)]);
const mai = (sfx) => ({
  ru: [["ru-RU-Lev", "Лев — муж."], ["ru-RU-Masha", "Маша — жен."]].map(([v, d]) => [`${v}:${sfx}`, d]),
  en: [["en-US-Ethan", "Ethan — муж."], ["en-US-Harper", "Harper — жен."], ["en-US-Olivia", "Olivia — жен."], ["en-AU-Isla", "Isla — жен., Австралия"]].map(([v, d]) => [`${v}:${sfx}`, d]),
});
// ok — проверено на реальных запросах; цена — ₽ за 1000 символов по каталогу Polza
const TTS_MODELS = [
  { id: "google/gemini-3.8-flash-tts", name: "Gemini 3.8 Flash TTS — выразительный ✔", voices: GEM30, noStyle: 1, fmt: "wav", price: "≈1,6 ₽", def: { ru: "Charon", en: "Puck" } },
  { id: "google/gemini-3.8-flash-lite-tts", name: "Gemini 3.8 Flash Lite TTS — почти бесплатно, без характера ✔", voices: GEM30, noStyle: 1, fmt: "wav", price: "≈1,1 ₽", def: { ru: "Charon", en: "Puck" } },
  { id: "elevenlabs/eleven-v4", name: "ElevenLabs v4 — новейшая, эмоции тегами [laughs]", voices: EL22, fmt: "mp3", el: 1, price: "≈2,3 ₽", def: { ru: "JBFqnCBsd6RMkjVDRZzb", en: "nPczCjzI2devNBz1zQrb" } },
  { id: "google/gemini-3.1-flash-tts-preview", name: "Gemini 3.1 Flash TTS Preview", voices: GEM11, noStyle: 1, fmt: "wav", price: "≈0,03 ₽", def: { ru: "Charon", en: "Puck" } },
  { id: "openai/gpt-4o-mini-tts", name: "OpenAI gpt-4o-mini-tts — слушается манеры речи", voices: oai(Object.keys(OAI_D)), instr: 1, fmt: "wav", price: "≈2,1 ₽", def: { ru: "onyx", en: "ash" } },
  { id: "openai/tts-1-hd", name: "OpenAI TTS-1 HD", voices: oai(["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"]), fmt: "wav", price: "≈3,5 ₽", def: { ru: "onyx", en: "ash" } },
  { id: "openai/tts-1", name: "OpenAI TTS-1", voices: oai(["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"]), fmt: "wav", price: "≈1,8 ₽", def: { ru: "onyx", en: "ash" } },
  { id: "microsoft/mai-voice-2", name: "Microsoft MAI-Voice-2 — родные RU и EN голоса", voices: mai("MAI-Voice-2"), price: "≈2,6 ₽" },
  { id: "microsoft/mai-voice-2-flash", name: "Microsoft MAI-Voice-2 Flash", voices: mai("MAI-Voice-2-Flash"), price: "≈1,8 ₽" },
  { id: "minimax/speech-2.8-hd", name: "MiniMax Speech 2.8 HD — эмоциональный", voices: MM, fmt: "wav", langCode: 1, price: "≈12 ₽", def: { ru: "Deep_Voice_Man", en: "Casual_Guy" } },
  { id: "minimax/speech-2.8-turbo", name: "MiniMax Speech 2.8 Turbo", voices: MM, fmt: "wav", langCode: 1, price: "≈7 ₽", def: { ru: "Deep_Voice_Man", en: "Casual_Guy" } },
  { id: "deepgram/aura-2", name: "Deepgram Aura-2 — только English", voices: { en: DG }, price: "≈3,5 ₽", def: { en: "aura-2-apollo-en" } },
];
const ttsModel = (id) => TTS_MODELS.find((m) => m.id === id) || TTS_MODELS[0];
const voicesFor = (m, lang) => (Array.isArray(m.voices) ? m.voices : m.voices[lang] || []);
const TTS_OPTS = TTS_MODELS.map((m) => `<option value="${m.id}">${m.name} · ${m.price}/1000 симв.</option>`).join("");
function fillVoices(pid, keep) {
  const lang = prof(pid).lang, m = ttsModel($("tm_" + pid).value), list = voicesFor(m, lang), sel = $("tv_" + pid);
  sel.innerHTML = list.length ? list.map(([v, d]) => `<option value="${v}">${esc(d)}</option>`).join("") : `<option value="">— эта модель не говорит на этом языке —</option>`;
  // новому голосу — свободный голос модели, чтобы не совпал с уже выбранными
  const used = VOICES.filter((v) => v.id !== pid && $("tm_" + v.id)?.value === m.id).map((v) => $("tv_" + v.id)?.value);
  const want = keep && list.some((x) => x[0] === keep) ? keep : !used.includes(m.def?.[lang]) ? m.def?.[lang] : (list.find((x) => !used.includes(x[0])) || [])[0];
  if (want && list.some((x) => x[0] === want)) sel.value = want;
  $("ts_" + pid).disabled = !m.instr;
  if ($("acc_" + pid)) $("acc_" + pid).disabled = !m.instr;
  if ($("chr_" + pid)) $("chr_" + pid).disabled = !(m.instr || m.el);
  if ($("el_" + pid)) { $("el_" + pid).hidden = !m.el; $("tvc_" + pid).hidden = !(m.el && sel.value === "custom"); }
  if ($("instrNote_" + pid)) {
    $("instrNote_" + pid).hidden = !!m.instr;
    $("instrNote_" + pid).textContent = m.el ? "ElevenLabs не понимает манеру и акцент. Характер передаётся тегом эмоции (шёпот, крик, азарт, сарказм, вздох)." : "Gemini через Polza не понимает манеру, акцент и характер (проверено) — голос читает только текст. Нужен характер — выберите OpenAI gpt-4o-mini-tts.";
  }
  $("ts_" + pid).title = m.instr ? "" : "Эта модель не понимает подсказку о манере речи";
}
function vset(pid) {
  if (!pid || !prof(pid)) return { model: "", voice: "", style: "", none: true };
  const lang = prof(pid).lang, m = ttsModel($("tm_" + pid).value), i = 3;   // манера по-английски — так проверено (22.10.2026), модели понимают её лучше
  let style = "";
  if (m.instr) {
    const ch = CHARS.find((x) => x[0] === $("chr_" + pid).value), ac = ACCENTS.find((x) => x[0] === $("acc_" + pid).value);
    const ts = $("ts_" + pid).value.trim();
    style = [STYLE_EN[ts] ?? ts, ch?.[i], ac?.[i]].filter(Boolean).join(", ");
  }
  let voice = $("tv_" + pid).value, extra = "", tag = "";
  if (m.el) {
    if (voice === "custom") voice = $("tvc_" + pid).value.trim();
    extra = `s${(+$("els_" + pid).value).toFixed(2)}m${(+$("elm_" + pid).value).toFixed(2)}`;
    tag = EL_TAGS[$("chr_" + pid).value] || "";
    if (tag) extra += tag;
  }
  return { model: m.id, voice, style, lang, name: prof(pid).name, extra, tag, el: !!m.el, stability: +($("els_" + pid)?.value ?? 0.5), similarity: +($("elm_" + pid)?.value ?? 0.75) };
}
