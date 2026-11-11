// View AGUARDANDO_CONFIRMACAO: espera a loja confirmar (polling) ou cancela.
import { CONFIG } from "../config.js";
import { apiGet, ErroApi } from "../api.js";
import { criarPoll, formatarTempo } from "../state.js";

let ctx = null;
let poll = null;
let cronometro = null;
let inicio = 0;
let vinculado = false;
const DICA_DEPOIS_MIN = 15;

// Mensagens que acompanham o tempo de espera (função pura, testada).
const MENSAGENS_ESPERA = [
  "Seu pedido está sendo conferido pela loja…",
  "Conferindo seus itens no balcão…",
  "Quase lá! A loja está confirmando…",
  "Ainda confere… já está quase!"
];

export function mensagemEspera(segundos) {
  if (segundos < 10) return MENSAGENS_ESPERA[0];
  if (segundos < 30) return MENSAGENS_ESPERA[1];
  if (segundos < 90) return MENSAGENS_ESPERA[2];
  return MENSAGENS_ESPERA[3];
}

export function entrar(c) {
  ctx = c;
  if (!vinculado) {
    vinculado = true;
    document.getElementById("btn-novo-pedido").addEventListener("click", () => ctx.novoPedido());
  }
  if (ctx.store.cancelado) {
    mostrarCancelado();
    return;
  }
  mostrarEspera();
}

export function sair() {
  if (poll) {
    poll.parar();
    poll = null;
  }
  if (cronometro) {
    clearInterval(cronometro);
    cronometro = null;
  }
}

function mostrarCancelado() {
  document.getElementById("aguardando-espera").hidden = true;
  document.getElementById("aguardando-cancelado").hidden = false;
  const titulo = document.querySelector("#aguardando-cancelado h1");
  if (titulo) titulo.focus({ preventScroll: true });
}

function mostrarEspera() {
  const pedido = ctx.store.pedido;
  document.getElementById("aguardando-espera").hidden = false;
  document.getElementById("aguardando-cancelado").hidden = true;
  document.getElementById("aguardando-dica").hidden = true;
  document.getElementById("aguardando-status").textContent = "Aguardando confirmação da loja.";

  inicio = Date.now();
  const cronEl = document.getElementById("aguardando-cronometro");
  const msgEl = document.getElementById("aguardando-mensagem");
  cronEl.textContent = "00:00";
  msgEl.textContent = mensagemEspera(0);
  cronometro = setInterval(() => {
    const seg = (Date.now() - inicio) / 1000;
    cronEl.textContent = formatarTempo(seg);
    msgEl.textContent = mensagemEspera(seg);
    if (seg >= DICA_DEPOIS_MIN * 60) {
      document.getElementById("aguardando-dica").hidden = false;
    }
  }, 1000);

  poll = criarPoll(async () => {
    try {
      const atual = await apiGet(`/pedidos/${pedido.id}`);
      if (atual.status === "CANCELADO") {
        pararTudo();
        ctx.store.cancelado = true;
        ctx.persistir();
        mostrarCancelado();
        return;
      }
      ctx.store.pedido = atual;
      ctx.persistir();
      if (atual.status === "CONFIRMADO") {
        pararTudo();
        document.getElementById("aguardando-status").textContent = "Pedido confirmado! Preparando pagamento.";
        ctx.irPara("PAGAMENTO");
      }
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) {
        ctx.erroAutenticacao();
        return;
      }
      // Falha de rede: o próximo ciclo do polling tenta de novo.
    }
  }, CONFIG.POLL_STATUS_MS);
}

function pararTudo() {
  if (poll) {
    poll.parar();
    poll = null;
  }
  if (cronometro) {
    clearInterval(cronometro);
    cronometro = null;
  }
}
