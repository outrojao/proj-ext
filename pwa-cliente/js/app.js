// Entry point: boot, restauração de sessão, roteador de views (máquina de
// estados), toasts, offline, instalação PWA e barra inferior.
import { CONFIG } from "./config.js";
import { apiGet, ErroApi } from "./api.js";
import { carregarSessao, salvarSessao, limparSessao, montarSessao, copiarTexto, formatarBRL, statusLoja } from "./state.js";
import * as vCardapio from "./views/cardapio.js";
import * as vAgendamento from "./views/agendamento.js";
import * as vAguardando from "./views/aguardando.js";
import * as vPagamento from "./views/pagamento.js";
import * as vConfirmacao from "./views/confirmacao.js";
import * as vAcompanhamento from "./views/acompanhamento.js";

// ── Máquina de estados (transições válidas) ──

export const TRANSICOES = {
  CARDAPIO: ["AGENDAMENTO"],
  AGENDAMENTO: ["CARDAPIO", "AGUARDANDO_CONFIRMACAO"],
  AGUARDANDO_CONFIRMACAO: ["PAGAMENTO", "CARDAPIO"],
  PAGAMENTO: ["CONFIRMACAO", "AGUARDANDO_CONFIRMACAO", "CARDAPIO"],
  CONFIRMACAO: ["ACOMPANHAMENTO"],
  ACOMPANHAMENTO: ["CARDAPIO", "AGUARDANDO_CONFIRMACAO"]
};

// De qualquer passo com pedido ativo é possível ir ao acompanhamento.
const PASSOS_COM_PEDIDO = ["CARDAPIO", "AGENDAMENTO", "AGUARDANDO_CONFIRMACAO", "PAGAMENTO", "CONFIRMACAO", "ACOMPANHAMENTO"];

export function transicaoValida(de, para) {
  if (!de || !para || de === para) return false;
  if (para === "ACOMPANHAMENTO" && PASSOS_COM_PEDIDO.includes(de)) return true;
  return (TRANSICOES[de] || []).includes(para);
}

const VIEWS = {
  CARDAPIO: vCardapio,
  AGENDAMENTO: vAgendamento,
  AGUARDANDO_CONFIRMACAO: vAguardando,
  PAGAMENTO: vPagamento,
  CONFIRMACAO: vConfirmacao,
  ACOMPANHAMENTO: vAcompanhamento
};

const PASSOS_QUE_EXIGEM_PEDIDO = ["AGUARDANDO_CONFIRMACAO", "PAGAMENTO", "CONFIRMACAO", "ACOMPANHAMENTO"];

// ── Estado em memória ──

const store = {
  step: "CARDAPIO",
  carrinho: [], // [{ item, qtd }]
  pedido: null, // { id, status, numero, senha_retirada, ... }
  cancelado: false
};

// ── Interface (toasts, barra, header) ──

function toast(mensagem, tipo = "info") {
  const caixa = document.getElementById("toasts");
  while (caixa.children.length >= 2) caixa.firstElementChild.remove();
  const el = document.createElement("div");
  el.className = `toast toast-${tipo}`;
  el.textContent = mensagem;
  caixa.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function totalCarrinho() {
  return store.carrinho.reduce((soma, e) => soma + e.item.preco * e.qtd, 0);
}

function atualizarBarra() {
  const barra = document.getElementById("barra-inferior");
  const cta = document.getElementById("barra-cta");
  const totalEl = document.getElementById("barra-total");
  const mostrar = store.step === "CARDAPIO" || store.step === "AGENDAMENTO";
  barra.hidden = !mostrar;
  if (!mostrar) return;

  totalEl.textContent = formatarBRL(totalCarrinho());
  if (store.step === "CARDAPIO") {
    cta.textContent = "Continuar";
    cta.disabled = store.carrinho.length === 0;
    cta.onclick = () => {
      if (store.carrinho.length > 0) irPara("AGENDAMENTO");
    };
  } else {
    cta.textContent = "Fazer pedido";
    cta.disabled = store.carrinho.length === 0;
    cta.onclick = () => vAgendamento.fazerPedido();
  }
}

function atualizarHeader() {
  const temPedidoAtivo =
    store.pedido && !store.cancelado && !["ENTREGUE", "CANCELADO"].includes(store.pedido.status);
  document.getElementById("btn-meu-pedido").hidden = !temPedidoAtivo || store.step === "ACOMPANHAMENTO";
}

// ── Navegação entre views ──

let ctx = null;

function irPara(novoStep, opcoes = {}) {
  if (novoStep !== store.step && !opcoes.forcar && !transicaoValida(store.step, novoStep)) {
    return false;
  }
  const moduloAntigo = VIEWS[store.step];
  if (moduloAntigo && moduloAntigo.sair && store.step !== novoStep) moduloAntigo.sair();

  store.step = novoStep;
  if (opcoes.cancelado !== undefined) store.cancelado = opcoes.cancelado;
  persistir();

  document.querySelectorAll("main section[data-view]").forEach((secao) => {
    secao.hidden = secao.dataset.view !== novoStep.toLowerCase();
  });

  const modulo = VIEWS[novoStep];
  if (modulo && modulo.entrar) modulo.entrar(ctx);

  const titulo = document.querySelector(`main section[data-view="${novoStep.toLowerCase()}"] h1`);
  if (titulo) titulo.focus({ preventScroll: true });

  atualizarHeader();
  atualizarBarra();
  window.scrollTo(0, 0);
  return true;
}

function persistir() {
  salvarSessao(montarSessao({ step: store.step, carrinho: store.carrinho, pedido: store.pedido }), CONFIG.TTL_MS);
}

function novoPedido() {
  limparSessao();
  store.pedido = null;
  store.carrinho = [];
  store.cancelado = false;
  document.getElementById("banner-restore").hidden = true;
  irPara("CARDAPIO", { forcar: true });
}

function erroAutenticacao() {
  limparSessao();
  store.pedido = null;
  store.carrinho = [];
  store.cancelado = false;

  const moduloAntigo = VIEWS[store.step];
  if (moduloAntigo && moduloAntigo.sair) moduloAntigo.sair();
  store.step = "CARDAPIO";
  document.querySelectorAll("main section[data-view]").forEach((secao) => {
    secao.hidden = secao.dataset.view !== "cardapio";
  });
  document.getElementById("lista-itens").hidden = true;
  document.getElementById("cardapio-vazio").hidden = true;
  document.getElementById("cardapio-skeleton").hidden = true;

  const pErro = document.querySelector("#cardapio-erro p");
  if (pErro) pErro.textContent = "Chave de API inválida ou ausente. Confira o API_KEY em js/config.js e recarregue.";
  const btnTentar = document.getElementById("btn-tentar-cardapio");
  btnTentar.dataset.acao = "recarregar";
  btnTentar.textContent = "Recarregar";
  document.getElementById("cardapio-erro").hidden = false;

  atualizarHeader();
  atualizarBarra();
  window.scrollTo(0, 0);
}

// ── Offline ──

function setOffline(offline) {
  // No modo demo o app não depende de rede: nunca mostra o banner.
  document.getElementById("banner-offline").hidden = CONFIG.MODO_DEMO || !offline;
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

// ── Instalação (beforeinstallprompt) ──

function configurarInstalacao() {
  let eventoInstalacao = null;
  const banner = document.getElementById("banner-instalacao");
  const fechar = () => {
    banner.hidden = true;
    try {
      window.sessionStorage.setItem("instalacao_rejeitada", "1");
    } catch {
      // ok
    }
  };
  window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();
    eventoInstalacao = evento;
    let rejeitado = false;
    try {
      rejeitado = window.sessionStorage.getItem("instalacao_rejeitada") === "1";
    } catch {
      // ok
    }
    if (!rejeitado) banner.hidden = false;
  });
  document.getElementById("btn-instalar").addEventListener("click", async () => {
    if (!eventoInstalacao) return;
    eventoInstalacao.prompt();
    await eventoInstalacao.userChoice;
    eventoInstalacao = null;
    banner.hidden = true;
  });
  document.getElementById("btn-fechar-instalacao").addEventListener("click", fechar);
}

// ── Boot ──

async function boot() {
  document.getElementById("app-nome-loja").textContent = CONFIG.NOME_LOJA;
  document.title = `${CONFIG.NOME_LOJA} — Pedidos`;
  document.getElementById("banner-demo").hidden = !CONFIG.MODO_DEMO;

  // Chip "Aberto · fecha HH:MM" / "Fechado · abre HH:MM"
  const chip = document.getElementById("chip-status-loja");
  const estadoLoja = statusLoja(new Date(), CONFIG.HORARIO);
  chip.textContent = estadoLoja.rotulo;
  chip.classList.add(estadoLoja.aberta ? "aberto" : "fechada");
  chip.hidden = false;

  ctx = {
    store,
    irPara,
    toast,
    persistir,
    atualizarBarra,
    novoPedido,
    erroAutenticacao,
    copiar: async (texto, rotulo = "Copiado!") => {
      const ok = await copiarTexto(texto);
      toast(ok ? rotulo : "Não foi possível copiar.", ok ? "sucesso" : "erro");
    }
  };

  document.getElementById("btn-meu-pedido").addEventListener("click", () => {
    if (store.pedido) irPara("ACOMPANHAMENTO");
  });
  document.getElementById("btn-novo-pedido-topo").addEventListener("click", () => novoPedido());

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
          // Auto-update: quando o navegador encontra um sw.js novo, recarrega
          // a página uma vez para aplicar a versão nova (evita código velho).
          registration.addEventListener("updatefound", () => {
            const novo = registration.installing;
            if (!novo) return;
            novo.addEventListener("statechange", () => {
              if (novo.state === "installed" && navigator.serviceWorker.controller) {
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

  // Restauração de sessão (cookie → sessionStorage, TTL 5 min deslizante)
  const sessao = carregarSessao(Date.now(), CONFIG.TTL_MS);
  let passoInicial = "CARDAPIO";
  if (sessao) {
    store.carrinho = Array.isArray(sessao.carrinho) ? sessao.carrinho : [];
    store.pedido = sessao.pedido || null;
    passoInicial = sessao.step;
    if (passoInicial === "CONFIRMACAO") passoInicial = "ACOMPANHAMENTO";
    if (PASSOS_QUE_EXIGEM_PEDIDO.includes(passoInicial) && !store.pedido) passoInicial = "CARDAPIO";
    if (!TRANSICOES[passoInicial] && passoInicial !== "CARDAPIO") passoInicial = "CARDAPIO";
    document.getElementById("banner-restore").hidden = false;
  }

  // No modo demo a "loja" vive no sessionStorage; se o pedido não existir
  // mais (ex.: dados do site limpos), recomeça do cardápio sem travar.
  if (CONFIG.MODO_DEMO && store.pedido && PASSOS_QUE_EXIGEM_PEDIDO.includes(passoInicial)) {
    try {
      await apiGet(`/pedidos/${store.pedido.id}`);
    } catch {
      store.pedido = null;
      passoInicial = "CARDAPIO";
      document.getElementById("banner-restore").hidden = true;
      toast("Seu pedido anterior não existe mais. Comece um novo pedido.");
    }
  }

  irPara(passoInicial, { forcar: true });
  await checarSaude();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
