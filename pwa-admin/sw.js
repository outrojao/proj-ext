const CACHE = "pwa-admin-v8";

// Sem cache de API de propósito: o atendente nunca deve operar com dados
// de pedido/cardápio antigos — a rede é a fonte, o cache é só o shell offline.
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/config.js",
  "./js/api.js",
  "./js/ws.js",
  "./js/state.js",
  "./js/audio.js",
  "./js/views/atendimento.js",
  "./js/views/pedido-detalhe.js",
  "./js/views/retirada.js",
  "./js/views/cardapio.js",
  "./assets/logo.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/fonts/archivo-black-400.woff2",
  "./assets/fonts/inter-400.woff2",
  "./assets/fonts/inter-500.woff2",
  "./assets/fonts/inter-600.woff2",
  "./assets/fonts/inter-700.woff2"
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== "GET") return;

  const url = new URL(requisicao.url);

  // Shell: network-first — sempre serve o código mais recente do disco e
  // mantém o cache atualizado; só cai no cache quando não há rede (offline).
  if (url.origin === self.location.origin) {
    evento.respondWith(
      fetch(requisicao)
        .then((resposta) => {
          if (resposta.ok) {
            const copia = resposta.clone();
            caches.open(CACHE).then((cache) => cache.put(requisicao, copia));
          }
          return resposta;
        })
        .catch(() => caches.match(requisicao))
    );
  }
});
