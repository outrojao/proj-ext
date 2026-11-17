// Entry point: boot, sync total, abas (VIEWS + irPara), toasts, offline,
// 401, checar HTTPS, instalação PWA, SW, atalhos e wiring do WS + fallback.
import { CONFIG } from "./config.js";
import { apiGet, apiPatch, ErroApi } from "./api.js";
import {
  transicaoStatusValida,
  secaoDoPedido,
  copiarTexto,
  criarPoll,
  somAtivo,
  salvarSom,
} from "./state.js";
import { notificar } from "./audio.js";
import { conectarWs } from "./ws.js";
import * as vAtendimento from "./views/atendimento.js";
import * as vRetirada from "./views/retirada.js";
import * as vCardapio from "./views/cardapio.js";
import { abrirDetalhe, inicializarModais } from "./views/pedido-detalhe.js";

// ── Abas (navegação livre — sem tabela rígida de transição) ──

const VIEWS = {
  ATENDIMENTO: vAtendimento,
  RETIRADA: vRetirada,
  CARDAPIO: vCardapio,
};

const TABS = {
  ATENDIMENTO: "tab-atendimento",
  RETIRADA: "tab-retirada",
  CARDAPIO: "tab-cardapio",
};

// ── Estado em memória (o backend é a fonte de verdade) ──

const store = {
  itens: [],
  pedidos: [],
  filaPainel: [],
  aba: "ATENDIMENTO",
  ws: "desconectado",
  som: somAtivo(),
  offline: false,
  acoesBloqueadas: false,
  carregou: false,
};

// ── Interface (toast, header) ──

function toast(mensagem, tipo = "info") {
  const caixa = document.getElementById("toasts");
  while (caixa.children.length >= 2) caixa.firstElementChild.remove();
  const el = document.createElement("div");
  el.className = `toast toast-${tipo}`;
  el.textContent = mensagem;
  caixa.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function tela401Visivel() {
  return !document.getElementById("tela-401").hidden;
}

function atualizarBotaoSom() {
  const btn = document.getElementById("btn-som");
  btn.setAttribute("aria-pressed", String(store.som));
  btn.setAttribute("aria-label", store.som ? "Desligar sons" : "Ligar sons");
}

function atualizarIndicadores() {
  // Badge da aba Atendimento + contagens das 4 seções
  const porSecao = { NOVOS: 0, PAGAMENTO: 0, PREPARO: 0, PAINEL: 0 };
  for (const p of store.pedidos) {
    const secao = secaoDoPedido(p);
    if (porSecao[secao] != null) porSecao[secao]++;
  }
  const pendentes = porSecao.NOVOS;

  const badge = document.getElementById("badge-novos");
  badge.hidden = pendentes === 0;
  badge.textContent = String(pendentes);

  document.getElementById("contagem-novos").textContent = String(
    porSecao.NOVOS,
  );
  document.getElementById("contagem-pagamento").textContent = String(
    porSecao.PAGAMENTO,
  );
  document.getElementById("contagem-preparo").textContent = String(
    porSecao.PREPARO,
  );
  document.getElementById("contagem-painel").textContent = String(
    porSecao.PAINEL,
  );
  document
    .getElementById("contagem-novos")
    .classList.toggle("chamada", pendentes > 0);

  // Chip de conexão
  const chip = document.getElementById("chip-conexao");
  const texto = document.getElementById("chip-conexao-texto");
  chip.classList.remove("conectado", "reconectando");
  if (store.ws === "conectado") {
    chip.classList.add("conectado");
    texto.textContent = "Conectado";
  } else if (store.ws === "reconectando") {
    chip.classList.add("reconectando");
    texto.textContent = "Reconectando…";
  } else {
    texto.textContent = "Offline";
  }

  // Notificação na aba do navegador (útil no desktop)
  const base = `${CONFIG.NOME_LOJA} — Atendimento`;
  document.title = pendentes > 0 ? `(${pendentes}) ${base}` : base;
}

// ── Navegação entre abas ──
let pollAdmin = null;
function irPara(aba) {
  if (!VIEWS[aba] || aba === store.aba) return;
  const anterior = store.aba;
  store.aba = aba;
  if (aba === "CARDAPIO") {
    if (pollAdmin) {
      pollAdmin.parar();
      pollAdmin = null;
    }
  } else if (!pollAdmin) {
    pollAdmin = criarPoll(recarregarTudo, CONFIG.POLL_FALLBACK_MS);
  }

  if (VIEWS[anterior] && VIEWS[anterior].sair) VIEWS[anterior].sair();

  document.querySelectorAll("main section[data-view]").forEach((secao) => {
    secao.hidden = secao.dataset.view !== aba.toLowerCase();
  });
  document
    .querySelectorAll("nav.tabs .tab")
    .forEach((botao) => botao.removeAttribute("aria-current"));
  document.getElementById(TABS[aba]).setAttribute("aria-current", "page");

  VIEWS[aba].entrar(ctx);

  const titulo = document.querySelector(
    `main section[data-view="${aba.toLowerCase()}"] h1`,
  );
  if (titulo) titulo.focus({ preventScroll: true });

  atualizarIndicadores();
  window.scrollTo(0, 0);
}

// Re-render da aba atual após mudança de dados (WS/poll/ação).
// entrar() é idempotente (vinculado): re-liga nada, só re-renderiza a lista.
function renderizarAba() {
  if (!store.aba) return;

  // Não reconstruir o cardápio por atualizações externas.
  if (store.aba === "CARDAPIO") return;

  const modulo = VIEWS[store.aba];
  if (modulo && modulo.entrar) modulo.entrar(ctx);

  atualizarIndicadores();
}

// ── Ações de status (única mutação de pedido) ──

async function aplicarAcao(pedidoId, novoStatus) {
  const pedido = store.pedidos.find((p) => p.id === pedidoId);
  if (!pedido) return;
  if (!transicaoStatusValida(pedido.status, novoStatus)) {
    toast("Ação não disponível para este pedido.", "erro");
    return;
  }
  try {
    const atualizado = await apiPatch(`/pedidos/${pedidoId}/status`, {
      novo_status: novoStatus,
    });
    const idx = store.pedidos.findIndex((p) => p.id === pedidoId);
    if (idx >= 0) store.pedidos[idx] = atualizado;
    // PRONTO/ENTREGUE mexem na fila do painel
    if (novoStatus === "PRONTO" || novoStatus === "ENTREGUE") {
      store.filaPainel = await apiGet("/pedidos/fila-painel");
    }
    const mensagens = {
      CONFIRMADO: "Pedido aceito.",
      PAGO: "Pagamento confirmado.",
      PRONTO: "Pedido pronto.",
      ENTREGUE: "Pedido entregue.",
      CANCELADO: "Pedido rejeitado.",
    };
    toast(mensagens[novoStatus] || "Pedido atualizado.", "sucesso");
    notificar("ok");
    renderizarAba();
  } catch (e) {
    if (e instanceof ErroApi && e.status === 400) {
      toast("Pedido já foi atualizado em outra tela.", "erro");
      try {
        const atual = await apiGet(`/pedidos/${pedidoId}`);
        const idx = store.pedidos.findIndex((p) => p.id === pedidoId);
        if (idx >= 0) store.pedidos[idx] = atual;
      } catch {
        // o pedido sumiu do lado do backend: deixa o poll consertar
      }
      renderizarAba();
    } else if (e instanceof ErroApi && e.status === 401) {
      erroAutenticacao();
    } else if (e instanceof ErroApi && e.status === 404) {
      toast("Pedido não encontrado.", "erro");
      recarregarTudo();
    } else {
      toast("Falha ao atualizar o pedido. Tente novamente.", "erro");
    }
  }
}

// ── Sync total (fonte: backend) ──

async function recarregarTudo() {
  if (tela401Visivel()) return;
  try {
    const [pedidos, itens, fila] = await Promise.all([
      apiGet("/pedidos"),
      apiGet("/itens"),
      apiGet("/pedidos/fila-painel"),
    ]);
    store.pedidos = pedidos || [];
    store.itens = itens || [];
    store.filaPainel = fila || [];
    store.carregou = true;
  } catch (e) {
    if (e instanceof ErroApi && e.status === 401) {
      erroAutenticacao();
      return;
    }
    setOffline(true);
    return;
  }
  setOffline(!navigator.onLine);
  renderizarAba();
}

// ── Eventos do WebSocket ──

async function aoEvento(ev, data) {
  if (tela401Visivel()) return;
  const id = data && data.pedido_id;
  if (id == null) return;

  if (ev === "novo_pedido") notificar("novo_pedido");
  else if (ev === "pagamento_declarado") notificar("declarado");
  // status_atualizado é silencioso: costuma ser o próprio atendente fazendo
  // a ação (o backend broadcasteia também para o dispositivo dele).

  try {
    const pedido = await apiGet(`/pedidos/${id}`);
    const idx = store.pedidos.findIndex((p) => p.id === pedido.id);
    if (idx >= 0) store.pedidos[idx] = pedido;
    else store.pedidos.unshift(pedido);
    if (ev === "status_atualizado") {
      // PRONTO/ENTREGUE reorganizam a fila do painel
      store.filaPainel = await apiGet("/pedidos/fila-painel");
    }
  } catch (e) {
    if (e instanceof ErroApi && e.status === 401) {
      erroAutenticacao();
      return;
    }
    if (e instanceof ErroApi && e.status === 404) {
      recarregarTudo();
      return;
    }
    return; // queda transitória: o poll de fallback cobre
  }
  renderizarAba();
}

function erroAutenticacao() {
  const tela = document.getElementById("tela-401");
  tela.hidden = false;
  const titulo = tela.querySelector("h1");
  if (titulo) titulo.focus({ preventScroll: true });
}

// ── Offline / saúde do backend ──

function setOffline(offline) {
  // No modo demo o app não depende de rede: nunca mostra o banner.
  store.offline = offline;
  document.getElementById("banner-offline").hidden =
    CONFIG.MODO_DEMO || !offline;
}

async function checarSaude() {
  if (CONFIG.MODO_DEMO) {
    setOffline(false);
    return;
  }
  for (let i = 0; i < 2; i++) {
    try {
      await apiGet("/health");
      setOffline(!navigator.onLine);
      return;
    } catch {
      // tenta de novo
    }
  }
  setOffline(true);
}

// ── HTTPS (produção): ações bloqueadas fora de localhost ──

function checarSeguranca() {
  if (CONFIG.MODO_DEMO) return;
  const local = ["localhost", "127.0.0.1", ""].includes(location.hostname);
  if (CONFIG.API_BASE.startsWith("http:") && !local) {
    document.getElementById("banner-http").hidden = false;
    store.acoesBloqueadas = true;
  }
}

// ── Instalação (beforeinstallprompt) ──

function configurarInstalacao() {
  let eventoInstalacao = null;
  let rejeitada = false; // só em memória: sessionStorage é reservado ao demo
  const banner = document.getElementById("banner-instalacao");
  const fechar = () => {
    banner.hidden = true;
    rejeitada = true;
  };
  window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();
    eventoInstalacao = evento;
    if (!rejeitada) banner.hidden = false;
  });
  document
    .getElementById("btn-instalar")
    .addEventListener("click", async () => {
      if (!eventoInstalacao) return;
      eventoInstalacao.prompt();
      await eventoInstalacao.userChoice;
      eventoInstalacao = null;
      banner.hidden = true;
    });
  document
    .getElementById("btn-fechar-instalacao")
    .addEventListener("click", fechar);
}

// ── Boot ──

let ctx = null;

async function boot() {
  document.getElementById("app-nome-loja").textContent = CONFIG.NOME_LOJA;
  document.title = `${CONFIG.NOME_LOJA} — Atendimento`;
  document.getElementById("banner-demo").hidden = !CONFIG.MODO_DEMO;
  checarSeguranca();

  ctx = {
    store,
    irPara,
    toast,
    copiar: async (texto, rotulo = "Copiado!") => {
      const ok = await copiarTexto(texto);
      toast(ok ? rotulo : "Não foi possível copiar.", ok ? "sucesso" : "erro");
    },
    notificar,
    abrirDetalhe,
    aplicarAcao,
    atualizarIndicadores,
    erroAutenticacao,
    recarregarTudo,
  };

  document
    .getElementById("tab-atendimento")
    .addEventListener("click", () => irPara("ATENDIMENTO"));
  document
    .getElementById("tab-retirada")
    .addEventListener("click", () => irPara("RETIRADA"));
  document
    .getElementById("tab-cardapio")
    .addEventListener("click", () => irPara("CARDAPIO"));

  document.getElementById("btn-som").addEventListener("click", () => {
    store.som = !store.som;
    salvarSom(store.som);
    atualizarBotaoSom();
  });
  atualizarBotaoSom();

  document
    .getElementById("btn-recarregar-401")
    .addEventListener("click", () => window.location.reload());

  inicializarModais(ctx);

  // Atalhos 1/2/3 (port desktop) — nunca seqüestram a digitação de um form
  window.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const alvo = e.target;
    if (
      alvo &&
      (alvo.tagName === "INPUT" ||
        alvo.tagName === "TEXTAREA" ||
        alvo.tagName === "SELECT" ||
        alvo.isContentEditable)
    )
      return;
    if (e.key === "1") irPara("ATENDIMENTO");
    else if (e.key === "2") irPara("RETIRADA");
    else if (e.key === "3") irPara("CARDAPIO");
  });

  window.addEventListener("online", () => {
    setOffline(false);
    checarSaude();
  });
  window.addEventListener("offline", () => setOffline(true));

  configurarInstalacao();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("sw.js")
        .then((registration) => {
          // Auto-update: sw.js novo encontrado → recarrega uma vez para aplicar.
          registration.addEventListener("updatefound", () => {
            const novo = registration.installing;
            if (!novo) return;
            novo.addEventListener("statechange", () => {
              if (
                novo.state === "installed" &&
                navigator.serviceWorker.controller &&
                store.aba !== "CARDAPIO"
              ) {
                window.location.reload();
              }
            });
          });
        })
        .catch(() => {
          // Sem SW o app continua funcionando online.
        });
    });
  }

  await checarSaude();
  await recarregarTudo();

  conectarWs({
    evento: aoEvento,
    status: (s) => {
      store.ws = s;
      atualizarIndicadores();
    },
    resync: recarregarTudo,
  });

  // Fallback SEMPRE ativo: a fila do painel muda sem evento para o pwa_admin.
  pollAdmin = criarPoll(recarregarTudo, CONFIG.POLL_FALLBACK_MS);

  irPara("ATENDIMENTO");
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
