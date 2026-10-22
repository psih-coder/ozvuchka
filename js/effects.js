"use strict";
// ================= Эффекты голоса =================
// акцент и характер — это подсказка нейросети (понимают Gemini и gpt-4o-mini-tts); [ключ, название, для RU, для EN]
const ACCENTS = [
  ["", "Без акцента", "", ""],
  ["us", "Американский", "с американским акцентом", "with a General American accent"],
  ["uk", "Британский", "с британским акцентом", "with a posh British accent"],
  ["south", "Южный (США)", "с южноамериканским ковбойским акцентом", "with a strong Southern US drawl"],
  ["ru", "Русский", "с лёгким русским акцентом", "with a heavy Russian accent"],
  ["es", "Испанский / латино", "с испанским акцентом", "with a Latino Spanish accent"],
  ["it", "Итальянский", "с итальянским акцентом, эмоционально", "with an Italian accent"],
  ["fr", "Французский", "с французским акцентом", "with a French accent"],
  ["de", "Немецкий", "с немецким акцентом", "with a German accent"],
  ["jp", "Японский", "с японским акцентом", "with a Japanese accent"],
  ["in", "Индийский", "с индийским акцентом", "with an Indian accent"],
  ["jam", "Ямайский", "с ямайским акцентом", "with a Jamaican accent"],
  ["cau", "Кавказский", "с кавказским акцентом", "with a Caucasian (Georgian) accent"],
  ["ua", "Украинский", "с украинским акцентом и мягким «г»", "with a Ukrainian accent"],
  ["gangsta", "Уличный, как в GTA", "как уличный гангстер из Лос-Сантоса, с сленгом в интонации", "like a street gangster from Los Santos, West Coast slang intonation"],
];
const CHARS = [
  ["", "Как в манере речи", "", ""],
  ["whisper", "Шёпотом", "шёпотом, таинственно", "whispering, mysterious"],
  ["shout", "Кричит, на эмоциях", "громко, на эмоциях, почти кричит", "shouting, very excited"],
  ["tired", "Устало", "устало и лениво", "tired and lazy"],
  ["villain", "Злодей", "как зловещий злодей, низко и угрожающе", "like a sinister villain, low and menacing"],
  ["news", "Диктор новостей", "как диктор новостей, чётко и серьёзно", "like a TV news anchor, crisp and serious"],
  ["sport", "Спорт-комментатор", "как спортивный комментатор, быстро и азартно", "like a hyped sports commentator, fast"],
  ["trailer", "Голос трейлера", "как голос кинотрейлера, очень низко, медленно и эпично", "like an epic movie trailer narrator, deep and slow"],
  ["pirate", "Пират", "как пират, хрипло и задорно", "like a pirate, raspy and playful"],
  ["old", "Старик", "как ворчливый старик", "like a grumpy old man"],
  ["kid", "Ребёнок", "как восторженный ребёнок", "like an excited little kid"],
  ["robotic", "Без эмоций", "монотонно, без эмоций, как автоответчик", "monotone, emotionless, like an answering machine"],
  ["sarcasm", "С сарказмом", "с сарказмом и усмешкой", "sarcastic, with a smirk"],
  ["nervous", "Нервно", "нервно и торопливо", "nervous and hurried"],
];
// звуковые эффекты — считаются здесь же, в браузере, бесплатно (озвучку заново не просят)
const FX_DEF = { pitch: 0, echo: 0, echoT: 260, rev: 0, room: 1.6, noise: 0, noiseT: "hiss", dist: 0, filter: "none", robot: 0, comp: 1 };
const FX_PRESETS = {
  normal: ["Обычный", {}],
  clear: ["Чётко и плотно", { filter: "bright", comp: 1 }],
  squeak: ["Писклявый", { pitch: 6 }],
  chipmunk: ["Бурундук", { pitch: 11 }],
  deep: ["Низкий, брутальный", { pitch: -4, filter: "warm" }],
  monster: ["Монстр", { pitch: -9, dist: 25, rev: 20 }],
  radio: ["Рация", { filter: "radio", dist: 40, noise: 22, noiseT: "radio" }],
  phone: ["Телефон", { filter: "phone", noise: 6 }],
  oldradio: ["Старое радио", { filter: "old", noise: 32, noiseT: "vinyl", dist: 10 }],
  hall: ["Эхо в зале", { rev: 45, room: 2.6 }],
  cave: ["Пещера", { echo: 45, echoT: 320, rev: 35, room: 3 }],
  stadium: ["Стадион", { echo: 30, echoT: 450, rev: 30, room: 3.5 }],
  robot: ["Робот", { robot: 75, pitch: -1, filter: "bright" }],
  wall: ["За стеной", { filter: "muffled", rev: 10 }],
  dream: ["Сон / флешбэк", { rev: 55, room: 3.5, echo: 20, echoT: 380, pitch: 1 }],
};
const fxIds = (l) => Object.keys(FX_DEF).map((k) => `fx_${l}_${k}`);
const fxHtml = (pid) => `<details class="fxbox" data-fx="${pid}">
    <summary>🎛 Эффекты голоса: <span id="fxName_${pid}">обычный</span></summary>
    <div class="fxchips" id="fxChips_${pid}">${Object.entries(FX_PRESETS).map(([k, [n]]) => `<button class="chip" data-fxp="${k}" data-lang="${pid}">${n}</button>`).join("")}</div>
    <div class="fxgrid">
      <div><label class="f">Тон: <b id="fx_${pid}_pitchV">0</b></label><input type="range" id="fx_${pid}_pitch" min="-12" max="12" step="1" value="0" title="Выше — писклявее, ниже — басовитее"></div>
      <div><label class="f">Эхо: <b id="fx_${pid}_echoV">0%</b></label><input type="range" id="fx_${pid}_echo" min="0" max="100" step="5" value="0"></div>
      <div><label class="f">Задержка эха: <b id="fx_${pid}_echoTV">260 мс</b></label><input type="range" id="fx_${pid}_echoT" min="60" max="700" step="10" value="260"></div>
      <div><label class="f">Реверберация: <b id="fx_${pid}_revV">0%</b></label><input type="range" id="fx_${pid}_rev" min="0" max="100" step="5" value="0"></div>
      <div><label class="f">Размер зала: <b id="fx_${pid}_roomV">1,6 с</b></label><input type="range" id="fx_${pid}_room" min="0.3" max="5" step="0.1" value="1.6"></div>
      <div><label class="f">Шум: <b id="fx_${pid}_noiseV">0%</b></label><input type="range" id="fx_${pid}_noise" min="0" max="100" step="2" value="0"></div>
      <div><label class="f">Какой шум</label><select id="fx_${pid}_noiseT"><option value="hiss">Шипение</option><option value="radio">Эфир рации</option><option value="vinyl">Пластинка</option><option value="rumble">Гул, улица</option><option value="rain">Дождь</option></select></div>
      <div><label class="f">Искажение: <b id="fx_${pid}_distV">0%</b></label><input type="range" id="fx_${pid}_dist" min="0" max="100" step="5" value="0"></div>
      <div><label class="f">Робот: <b id="fx_${pid}_robotV">0%</b></label><input type="range" id="fx_${pid}_robot" min="0" max="100" step="5" value="0"></div>
      <div><label class="f">Окраска</label><select id="fx_${pid}_filter"><option value="none">Нет</option><option value="bright">Чётче, звонче</option><option value="warm">Теплее, бархатно</option><option value="phone">Телефон</option><option value="radio">Рация</option><option value="old">Старое радио</option><option value="muffled">Глухо, за стеной</option></select></div>
      <label class="chk" style="align-self:end"><input type="checkbox" id="fx_${pid}_comp" checked> Компрессор (громче, ровнее)</label>
    </div>
  </details>`;
const fxOf = (l) => {
  const o = {};
  if (!l || !$(`fx_${l}_pitch`)) return { ...FX_DEF, comp: 0 };
  for (const k of Object.keys(FX_DEF)) { const el = $(`fx_${l}_${k}`); o[k] = el.type === "checkbox" ? (el.checked ? 1 : 0) : el.tagName === "SELECT" ? el.value : +el.value; }
  return o;
};
const fxNeutral = (f) => !f.pitch && !f.echo && !f.rev && !f.noise && !f.dist && !f.robot && f.filter === "none" && !f.comp;
function fxLabels(l) {
  if (!$(`fx_${l}_pitch`)) return;
  const f = fxOf(l), pct = (k) => (($(`fx_${l}_${k}V`).textContent = f[k] + "%"));
  $(`fx_${l}_pitchV`).textContent = (f.pitch > 0 ? "+" : "") + f.pitch + (f.pitch ? (f.pitch > 0 ? " (писклявее)" : " (ниже)") : "");
  ["echo", "rev", "noise", "dist", "robot"].forEach(pct);
  $(`fx_${l}_echoTV`).textContent = f.echoT + " мс"; $(`fx_${l}_roomV`).textContent = n1(f.room) + " с";
  const p = Object.entries(FX_PRESETS).find(([, [, o]]) => JSON.stringify({ ...FX_DEF, ...o }) === JSON.stringify(f));
  $("fxName_" + l).textContent = p ? p[1][0].toLowerCase() : "свой";
  document.querySelectorAll(`#fxChips_${l} .chip`).forEach((b) => b.classList.toggle("on", p && b.dataset.fxp === p[0]));
}
function setFx(l, o) {
  const f = { ...FX_DEF, ...o };
  for (const k of Object.keys(FX_DEF)) { const el = $(`fx_${l}_${k}`); if (el.type === "checkbox") el.checked = !!f[k]; else el.value = f[k]; }
  fxLabels(l);
}
// шумы
function noiseBuf(ctx, type, len) {
  const sr = ctx.sampleRate, b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
  let last = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (type === "rumble") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else if (type === "rain") { b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.18) * 0.2 + (Math.random() < 0.0009 ? (Math.random() - 0.5) * 1.2 : 0); }
    else if (type === "vinyl") { last = 0.995 * last + w * 0.02; d[i] = last * 0.6 + (Math.random() < 0.0006 ? (Math.random() - 0.5) * 2.2 : 0) + w * 0.05; }
    else d[i] = w * 0.5;
  }
  return b;
}
function distCurve(amount) {
  const k = amount * 4, n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = ((3 + k) * x * 20 * Math.PI / 180) / (Math.PI + k * Math.abs(x)); }
  return c;
}
function impulse(ctx, sec) {
  const n = Math.round(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.8);
  return b;
}
// голос → эффекты; хвост эха и зала остаётся после фразы
async function applyFxGraph(y, f) {
  if (fxNeutral(f)) return y;
  const sr = y.sampleRate;
  const fb = 0.3 + 0.45 * f.echo / 100;
  const tail = Math.min(4, Math.max(f.echo ? (f.echoT / 1000) * Math.log(0.01) / Math.log(fb) : 0, f.rev ? f.room : 0)) + 0.05;
  const len = y.length + Math.round(tail * sr);
  const ctx = new OfflineAudioContext(1, len, sr);
  const src = ctx.createBufferSource(); src.buffer = y;
  let node = src;
  const chain = (n) => { node.connect(n); node = n; return n; };
  const biq = (type, freq, q = 0.7, gain = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = freq; b.Q.value = q; b.gain.value = gain; return chain(b); };
  ({
    bright: () => { biq("highpass", 90); biq("peaking", 3200, 0.9, 3); biq("highshelf", 7000, 0.7, 4); },
    warm: () => { biq("lowshelf", 220, 0.7, 4); biq("highshelf", 6500, 0.7, -4); },
    phone: () => { biq("highpass", 450); biq("lowpass", 3200); biq("peaking", 1500, 1, 6); },
    radio: () => { biq("highpass", 650, 1); biq("lowpass", 2700, 1); biq("peaking", 1800, 1.2, 9); },
    old: () => { biq("highpass", 320); biq("lowpass", 2400); biq("peaking", 1000, 1, 5); },
    muffled: () => { biq("lowpass", 650, 0.9); biq("lowshelf", 150, 0.7, 3); },
  })[f.filter]?.();
  if (f.dist) { const ws = ctx.createWaveShaper(); ws.curve = distCurve(f.dist); ws.oversample = "4x"; chain(ws); const g = ctx.createGain(); g.gain.value = 1 / (1 + f.dist / 60); chain(g); }
  const bus = ctx.createGain();
  if (f.robot) {
    const dry = ctx.createGain(), ring = ctx.createGain(), osc = ctx.createOscillator();
    dry.gain.value = 1 - f.robot / 100 * 0.85; ring.gain.value = 0; osc.frequency.value = 55; osc.type = "sine";
    osc.connect(ring.gain); osc.start();
    node.connect(dry); node.connect(ring); dry.connect(bus);
    const rg = ctx.createGain(); rg.gain.value = f.robot / 100 * 1.6; ring.connect(rg); rg.connect(bus);
  } else node.connect(bus);
  const out = ctx.createGain(); bus.connect(out);
  if (f.echo) {
    const dl = ctx.createDelay(2), fbg = ctx.createGain(), wet = ctx.createGain(), lp = ctx.createBiquadFilter();
    dl.delayTime.value = f.echoT / 1000; fbg.gain.value = fb; wet.gain.value = 0.25 + f.echo / 100 * 0.5; lp.type = "lowpass"; lp.frequency.value = 4500;
    bus.connect(dl); dl.connect(lp); lp.connect(fbg); fbg.connect(dl); lp.connect(wet); wet.connect(out);
  }
  if (f.rev) {
    const cv = ctx.createConvolver(), wet = ctx.createGain();
    cv.normalize = true; cv.buffer = impulse(ctx, f.room); wet.gain.value = f.rev / 100 * 0.9;
    bus.connect(cv); cv.connect(wet); wet.connect(out);
  }
  if (f.noise) {
    const ns = ctx.createBufferSource(), ng = ctx.createGain();
    ns.buffer = noiseBuf(ctx, f.noiseT, y.length + Math.round(0.08 * sr)); ng.gain.value = f.noise / 100 * (f.noiseT === "hiss" ? 0.06 : 0.12);
    let nn = ns;
    if (f.noiseT === "radio") { const b = ctx.createBiquadFilter(); b.type = "bandpass"; b.frequency.value = 2200; b.Q.value = 0.6; ns.connect(b); nn = b; }
    nn.connect(ng); ng.connect(out); ns.start();
  }
  let last = out;
  if (f.comp) {
    const cp = ctx.createDynamicsCompressor(); cp.threshold.value = -22; cp.knee.value = 8; cp.ratio.value = 4; cp.attack.value = 0.004; cp.release.value = 0.15;
    const mk = ctx.createGain(); mk.gain.value = 1.5; out.connect(cp); cp.connect(mk); last = mk;
  }
  last.connect(ctx.destination);
  src.start();
  const r = await ctx.startRendering(), d = r.getChannelData(0);
  let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
  if (pk > 0.97) { const k = 0.97 / pk; for (let i = 0; i < d.length; i++) d[i] *= k; }
  return r;
}
// тон без изменения длины: ускоряем/замедляем запись (тон меняется) и возвращаем длину растяжкой WSOLA
async function pitchResample(buf, semis) {
  if (!semis) return buf;
  const p = Math.pow(2, semis / 12), sr = buf.sampleRate;
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.length / p)), sr), s = ctx.createBufferSource();
  s.buffer = buf; s.playbackRate.value = p; s.connect(ctx.destination); s.start();
  return ctx.startRendering();
}
let fxT = {};
function fxChanged(pid) { saveVoices(); clearTimeout(fxT[pid]); fxT[pid] = setTimeout(() => refit(pid), 300); }
