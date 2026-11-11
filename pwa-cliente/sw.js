const CACHE = "pwa-cliente-v7";
// Espelha CONFIG.API_BASE em js/config.js (service worker clássico não importa módulos aqui).
const API_BASE = "https://proj-ext-api.onrender.com";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/config.js",
  "./js/api.js",
  "./js/state.js",
  "./js/pix.js",
  "./js/vendor/qrcode-generator.js",
  "./js/views/cardapio.js",
  "./js/views/agendamento.js",
  "./js/views/aguardando.js",
  "./js/views/pagamento.js",
  "./js/views/confirmacao.js",
  "./js/views/acompanhamento.js",
  "./assets/logo.svg",
  "./assets/aguardando-confirmacao.svg",
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

  // API: stale-while-revalidate apenas em GET /itens
  if (url.origin === new URL(API_BASE).origin && url.pathname === "/itens") {
    evento.respondWith(
      caches.match(requisicao).then((emCache) => {
        const rede = fetch(requisicao)
          .then((resposta) => {
            if (resposta.ok) {
              const copia = resposta.clone();
              caches.open(CACHE).then((cache) => cache.put(requisicao, copia));
            }
            return resposta;
          })
          .catch(() => emCache);
        return emCache || rede;
      })
    );
    return;
  }

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
