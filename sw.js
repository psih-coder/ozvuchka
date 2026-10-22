"use strict";
// Озвучка Ai Pro — приложение и офлайн-копия.
// Всегда сначала сеть: с интернетом открывается свежая версия сайта (переустанавливать не нужно),
// без интернета — последняя сохранённая. Чужие адреса (Polza, CDN, Hugging Face) не трогаем.
const CACHE = "ozvuchka-v1";
const CORE = [
  "./", "index.html", "css/style.css", "css/fonts.css", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "js/core.js", "js/models.js", "js/state.js", "js/video.js", "js/cues.js", "js/timeline.js", "js/polza.js", "js/script.js", "js/phrases.js", "js/tts.js", "js/effects.js", "js/voices.js", "js/playback.js", "js/export.js", "js/subs.js", "js/whisper.js", "js/style.js", "js/ui.js", "js/music.js", "js/render.js", "js/main.js",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  // старые копии приложения — долой; кэш модели Whisper («transformers-cache») не трогаем
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("ozvuchka-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    fetch(r, { cache: "no-cache" })   // сверяемся с сайтом каждый раз — старая страница после обновления не застрянет
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); } return res; })
      .catch(() => caches.match(r, { ignoreSearch: true }).then((m) => m || (r.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
