// WebSocket /ws/pwa_admin com reconexão (backoff exponencial + jitter) e
// "demo-WS" no MODO_DEMO: assina os eventos do motor demo do api.js.
//
// O WS do backend é em memória: evento de período desconectado se perde.
// Por isso todo onopen/reconexão dispara resync() (sync total) — e o
// fallback de polling (app.js) cobre também mudanças da fila do painel,
// que não geram evento para o pwa_admin.

import { CONFIG } from "./config.js";
import { onDemoEvento, _demoTick } from "./api.js";

// Pura: próximo atraso do backoff (sem jitter — o chamador aplica).
export function proximaTentativa(atualMs, cfg) {
  return Math.min(atualMs * 2, cfg.WS_BACKOFF_MAX_MS);
}

function urlWebSocket() {
  const base = CONFIG.API_BASE.replace(/^http/i, "ws");
  return `${base}/ws/pwa_admin?api_key=${encodeURIComponent(CONFIG.API_KEY)}`;
}

export function conectarWs(handlers) {
  // ── MODO_DEMO: sem socket; eventos do motor demo + cadência de 5 s ──
  if (CONFIG.MODO_DEMO) {
    const desassar = onDemoEvento((evento, data) => handlers.evento(evento, data));
    const tick =
      typeof window !== "undefined"
        ? setInterval(() => _demoTick(), 5000)
        : null;
    handlers.status("conectado");
    handlers.resync();
    return {
      desconectar() {
        desassar();
        if (tick) clearInterval(tick);
      }
    };
  }

  // ── WebSocket real ──
  let websocket = null;
  let timer = null;
  let atraso = 0;
  let encerrado = false;

  const abrir = () => {
    if (encerrado) return;
    websocket = new WebSocket(urlWebSocket());

    websocket.onopen = () => {
      atraso = 0; // sucesso: zera o backoff
      handlers.status("conectado");
      handlers.resync();
    };

    websocket.onmessage = (mensagem) => {
      let pacote;
      try {
        pacote = JSON.parse(mensagem.data);
      } catch {
        return; // mensagem não-JSON: ignora
      }
      if (pacote && typeof pacote.event === "string") {
        handlers.evento(pacote.event, pacote.data || {});
      }
    };

    const aoCair = () => {
      if (encerrado) return;
      websocket.onopen = null;
      websocket.onmessage = null;
      websocket.onerror = null;
      websocket.onclose = null;
      try {
        websocket.close();
      } catch {
        // já fechado
      }
      handlers.status("reconectando");
      atraso = atraso === 0 ? CONFIG.WS_BACKOFF_INICIAL_MS : proximaTentativa(atraso, CONFIG);
      const comJitter = atraso * (0.8 + Math.random() * 0.4);
      timer = setTimeout(abrir, comJitter);
    };

    websocket.onerror = aoCair;
    websocket.onclose = aoCair;
  };

  abrir();

  return {
    desconectar() {
      encerrado = true;
      if (timer) clearTimeout(timer);
      try {
        if (websocket) websocket.close();
      } catch {
        // ok
      }
      handlers.status("desconectado");
    }
  };
}
