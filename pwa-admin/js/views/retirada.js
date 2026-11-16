// View RETIRADA: busca por número + senha, SEM chamada de rede (usa o
// store já sincronizado). Mostrar o número/senha em escala ampliada para
// conferência visual à distância do balcão.

import { acharRetirada, formatarBRL } from "../state.js";

let ctx = null;
let vinculado = false;

export function entrar(c) {
  ctx = c;
  if (!vinculado) {
    vinculado = true;
    document.getElementById("form-retirada").addEventListener("submit", aoBuscar);
    document.getElementById("btn-limpar").addEventListener("click", aoLimpar);
    document.getElementById("btn-entregar").addEventListener("click", aoEntregar);
  }
  limparResultado();
}

export function sair() {}

function acoesDisponiveis() {
  const s = ctx.store;
  return !(s.offline || s.acoesBloqueadas || s.ws !== "conectado");
}

function aoBuscar(evento) {
  evento.preventDefault();
  const numero = document.getElementById("input-numero").value.trim();
  const senha = document.getElementById("input-senha").value;
  const pedido = acharRetirada(ctx.store.pedidos, numero, senha);
  if (pedido) mostrarPedido(pedido);
  else mostrarNaoEncontrado();
  // pronto para o próximo: foco de volta no número
  document.getElementById("input-numero").focus();
}

function aoLimpar() {
  document.getElementById("form-retirada").reset();
  limparResultado();
  document.getElementById("input-numero").focus();
}

function limparResultado() {
  document.getElementById("retirada-achado").hidden = true;
  document.getElementById("retirada-nao-encontrado").hidden = true;
  document.getElementById("btn-entregar").hidden = true;
  document.getElementById("retirada-etiqueta").hidden = true;
}

function mostrarNaoEncontrado() {
  document.getElementById("retirada-achado").hidden = true;
  document.getElementById("retirada-nao-encontrado").hidden = false;
}

function mostrarPedido(pedido) {
  document.getElementById("retirada-nao-encontrado").hidden = true;
  const card = document.getElementById("retirada-achado");
  card.hidden = false;

  document.getElementById("retirada-numero").textContent = String(pedido.numero);

  const senhaEl = document.getElementById("retirada-senha");
  senhaEl.innerHTML = "";
  for (const c of pedido.senha_retirada || "") {
    const bloco = document.createElement("span");
    bloco.className = "senha-tecla";
    bloco.setAttribute("aria-hidden", "true");
    bloco.textContent = c;
    senhaEl.appendChild(bloco);
  }

  document.getElementById("retirada-nome").textContent = pedido.nome_cliente || "Cliente sem nome";
  const resumo = (pedido.itens || [])
    .map((pi) => {
      const item = ctx.store.itens.find((i) => i.id === pi.item_id);
      return item ? `${pi.quantidade}× ${item.nome}` : `Item #${pi.item_id}`;
    })
    .join(", ");
  document.getElementById("retirada-resumo").textContent = `${resumo} · ${formatarBRL(pedido.total)}`;

  const etiqueta = document.getElementById("retirada-etiqueta");
  const botao = document.getElementById("btn-entregar");
  etiqueta.hidden = false;
  botao.hidden = true;

  if (pedido.status === "PRONTO") {
    etiqueta.className = "etiqueta etiqueta-pronto";
    etiqueta.textContent = "Pronto para retirada";
    botao.hidden = false;
    botao.dataset.id = String(pedido.id);
    botao.disabled = !acoesDisponiveis();
  } else if (pedido.status === "PAGO") {
    etiqueta.className = "etiqueta etiqueta-pago";
    etiqueta.textContent = "Ainda em preparo";
  } else {
    // ENTREGUE (ou qualquer estado final — senha só existe a partir do PAGO)
    etiqueta.className = "etiqueta etiqueta-entregue";
    etiqueta.textContent = "Já entregue";
  }
}

function aoEntregar() {
  const botao = document.getElementById("btn-entregar");
  if (!acoesDisponiveis()) {
    ctx.toast("Ações indisponíveis agora — verifique a conexão.", "erro");
    return;
  }
  botao.disabled = true;
  ctx.aplicarAcao(Number(botao.dataset.id), "ENTREGUE");
}
