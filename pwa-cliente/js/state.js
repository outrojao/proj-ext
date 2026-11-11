// Estado de sessão (persistência com TTL) + utilidades compartilhadas.
// As funções puras (validarSessao, montarSessao, formatarBRL, ...) são
// testáveis no Node; as de persistência só rodam em browser.

export const CHAVE_SESSAO = "pwa_session";

// ── Utilidades puras ──

export function formatarBRL(valor) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

export function formatarTempo(segundos) {
  const s = Math.max(0, Math.floor(segundos));
  const minutos = Math.floor(s / 60);
  return `${String(minutos).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// Aberto/fechado conforme o horário configurado (função pura, testada).
export function statusLoja(agora, horario) {
  const [hA, mA] = horario.abre.split(":").map(Number);
  const [hF, mF] = horario.fecha.split(":").map(Number);
  const agoraMin = agora.getHours() * 60 + agora.getMinutes();
  const abre = hA * 60 + mA;
  const fecha = hF * 60 + mF;
  if (agoraMin >= abre && agoraMin < fecha) {
    return { aberta: true, rotulo: `Aberto · fecha ${horario.fecha}` };
  }
  return { aberta: false, rotulo: `Fechado · abre ${horario.abre}` };
}

// Válido enquanto `agora - ts` não ultrapassa o TTL (deslizante: cada
// gravação reescreve ts).
export function validarSessao(payload, agora, ttlMs = 300000) {
  if (!payload || typeof payload !== "object") return false;
  if (typeof payload.ts !== "number") return false;
  return agora - payload.ts <= ttlMs;
}

export function montarSessao({ step, carrinho, pedido }) {
  return {
    step,
    carrinho: carrinho || [],
    pedido: pedido || null,
    ts: Date.now()
  };
}

export function maxAgeCookie(ttlMs = 300000) {
  return Math.max(1, Math.floor(ttlMs / 1000));
}

// ── Persistência (browser) ──

function temBrowser() {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

function textoSessao(payload) {
  return encodeURIComponent(JSON.stringify(payload));
}

function lerCookie() {
  const trecho = document.cookie.split("; ").find((linha) => linha.startsWith(`${CHAVE_SESSAO}=`));
  if (!trecho) return null;
  try {
    return JSON.parse(decodeURIComponent(trecho.slice(CHAVE_SESSAO.length + 1)));
  } catch {
    return null;
  }
}

export function salvarSessao(payload, ttlMs = 300000) {
  if (!temBrowser()) return;
  const texto = textoSessao(payload);
  try {
    document.cookie = `${CHAVE_SESSAO}=${texto}; path=/; max-age=${maxAgeCookie(ttlMs)}; SameSite=Lax`;
    window.sessionStorage.setItem(CHAVE_SESSAO, texto);
  } catch {
    // Storage indisponível (modo privado estrito): segue sem persistência.
  }
}

export function carregarSessao(agora = Date.now(), ttlMs = 300000) {
  if (!temBrowser()) return null;
  let payload = null;
  try {
    payload = lerCookie();
  } catch {
    payload = null;
  }
  if (!payload) {
    try {
      const bruto = window.sessionStorage.getItem(CHAVE_SESSAO);
      if (bruto) payload = JSON.parse(bruto);
    } catch {
      payload = null;
    }
  }
  if (!validarSessao(payload, agora, ttlMs)) {
    if (payload) limparSessao();
    return null;
  }
  return payload;
}

export function limparSessao() {
  if (!temBrowser()) return;
  try {
    document.cookie = `${CHAVE_SESSAO}=; path=/; max-age=0; SameSite=Lax`;
    window.sessionStorage.removeItem(CHAVE_SESSAO);
  } catch {
    // ok
  }
}

// ── Utilidades de interface ──

export async function copiarTexto(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // cai no fallback abaixo
    }
  }
  const campo = document.createElement("textarea");
  campo.value = texto;
  campo.setAttribute("readonly", "");
  campo.style.position = "fixed";
  campo.style.opacity = "0";
  document.body.appendChild(campo);
  campo.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  campo.remove();
  return ok;
}

export function vibrar(padrao) {
  if (navigator.vibrate) navigator.vibrate(padrao);
}

// Polling com pausa automática quando a aba fica oculta.
// fn() é chamado imediatamente e a cada `intervaloMs` (aba visível).
export function criarPoll(fn, intervaloMs) {
  let timer = null;

  const agendar = () => {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (!document.hidden) fn();
    }, intervaloMs);
  };

  const aoVisibilidade = () => {
    if (document.hidden) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    } else {
      fn();
      agendar();
    }
  };

  fn();
  agendar();
  document.addEventListener("visibilitychange", aoVisibilidade);

  return {
    parar() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      document.removeEventListener("visibilitychange", aoVisibilidade);
    }
  };
}
