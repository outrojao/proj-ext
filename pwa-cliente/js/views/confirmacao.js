// View CONFIRMACAO: número do pedido + senha de retirada (clímax do fluxo).
// O backend gera número + senha atômico com o PAGO, mas a busca que chegou
// aqui pode ter falhado ou antecipado o commit (rede oscilando). Se a
// identificação não existe, um retry (mesmo ritmo dos outros polls) busca
// até chegar e re-renderiza — sem depender de recarregar a página.
import { CONFIG } from "../config.js";
import { apiGet, ErroApi } from "../api.js";
import { criarPoll, vibrar, temIdentificacao } from "../state.js";

let ctx = null;
let poll = null;
let vinculado = false;

export function entrar(c) {
  ctx = c;
  const pedido = ctx.store.pedido;

  vincularBotoes();
  renderizarIdentificacao(pedido);
  vibrar(80);

  if (!temIdentificacao(pedido)) iniciarRetry();
}

export function sair() {
  pararRetry();
}

function vincularBotoes() {
  if (vinculado) return;
  vinculado = true;
  document.getElementById("btn-copiar-numero").addEventListener("click", () => {
    if (ctx.store.pedido.numero != null) ctx.copiar(String(ctx.store.pedido.numero), "Número copiado!");
  });
  document.getElementById("btn-copiar-senha").addEventListener("click", () => {
    if (ctx.store.pedido.senha_retirada) ctx.copiar(ctx.store.pedido.senha_retirada, "Senha copiada!");
  });
  document.getElementById("btn-acompanhar").addEventListener("click", () => ctx.irPara("ACOMPANHAMENTO"));
}

function renderizarIdentificacao(pedido) {
  const numeroEl = document.getElementById("confirmacao-numero");
  const senhaEl = document.getElementById("confirmacao-senha");
  const senhaSr = document.getElementById("confirmacao-senha-sr");

  if (pedido.numero != null) {
    numeroEl.textContent = String(pedido.numero);
  } else {
    numeroEl.textContent = "…";
  }

  senhaEl.innerHTML = "";
  if (pedido.senha_retirada) {
    for (const caractere of pedido.senha_retirada) {
      const tecla = document.createElement("span");
      tecla.className = "senha-tecla";
      tecla.textContent = caractere;
      senhaEl.appendChild(tecla);
    }
    senhaSr.textContent = `Senha de retirada: ${pedido.senha_retirada.split("").join(" ")}`;
  } else {
    senhaSr.textContent = "Senha de retirada em processamento.";
  }
}

function iniciarRetry() {
  pararRetry();
  document.getElementById("confirmacao-processando").hidden = false;
  poll = criarPoll(async () => {
    try {
      const atual = await apiGet(`/pedidos/${ctx.store.pedido.id}`);
      ctx.store.pedido = atual;
      ctx.persistir();
      if (atual.status === "CANCELADO") {
        pararRetry();
        ctx.store.cancelado = true;
        ctx.persistir();
        ctx.irPara("AGUARDANDO_CONFIRMACAO");
        return;
      }
      if (temIdentificacao(atual)) {
        pararRetry();
        document.getElementById("confirmacao-processando").hidden = true;
        renderizarIdentificacao(atual);
        vibrar(80); // a identificação chegou
      }
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) {
        pararRetry();
        ctx.erroAutenticacao();
        return;
      }
      // Falha de rede: o próximo ciclo tenta de novo.
    }
  }, CONFIG.POLL_STATUS_MS);
}

function pararRetry() {
  if (poll) {
    poll.parar();
    poll = null;
  }
}
