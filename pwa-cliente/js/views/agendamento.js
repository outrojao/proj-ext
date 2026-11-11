// View AGENDAMENTO: resumo do carrinho, slots de hoje (HH:MM) e nome.
// gerarSlotsHoje é pura (testada em testes/slots.test.mjs).
import { CONFIG } from "../config.js";
import { apiPost, ErroApi } from "../api.js";
import { formatarBRL } from "../state.js";

let ctx = null;
let slotSelecionado = null;
let vinculado = false;

export function gerarSlotsHoje(agora, horario, avisoMin) {
  const passo = horario.passo_min;
  const limite = new Date(agora.getTime() + avisoMin * 60000);
  const [hA, mA] = horario.abre.split(":").map(Number);
  const [hF, mF] = horario.fecha.split(":").map(Number);
  const inicio = hA * 60 + mA;
  const fim = hF * 60 + mF;
  const slots = [];
  for (let minutos = inicio; minutos <= fim; minutos += passo) {
    const hora = Math.floor(minutos / 60);
    const minuto = minutos % 60;
    const slot = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), hora, minuto);
    if (slot >= limite) {
      slots.push(`${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`);
    }
  }
  return slots;
}

export function entrar(c) {
  ctx = c;
  slotSelecionado = null;
  if (!vinculado) {
    vinculado = true;
    document.getElementById("btn-voltar-cardapio").addEventListener("click", () => ctx.irPara("CARDAPIO"));
    document.getElementById("slots").addEventListener("click", (evento) => {
      const chip = evento.target.closest("button[data-slot]");
      if (!chip) return;
      slotSelecionado = chip.dataset.slot;
      document.querySelectorAll("#slots button[data-slot]").forEach((b) => {
        b.setAttribute("aria-pressed", b === chip ? "true" : "false");
      });
      ctx.atualizarBarra();
    });
  }
  renderizarResumo();
  renderizarSlots();
}

export function sair() {}

function renderizarResumo() {
  const lista = document.getElementById("resumo-carrinho");
  lista.innerHTML = "";
  for (const entrada of ctx.store.carrinho) {
    const li = document.createElement("li");
    const nome = document.createElement("span");
    nome.textContent = `${entrada.item.nome} × ${entrada.qtd}`;
    const preco = document.createElement("span");
    preco.textContent = formatarBRL(entrada.item.preco * entrada.qtd);
    li.append(nome, preco);
    lista.appendChild(li);
  }
}

function renderizarSlots() {
  const caixa = document.getElementById("slots");
  const vazio = document.getElementById("slots-vazio");
  caixa.innerHTML = "";
  const slots = gerarSlotsHoje(new Date(), CONFIG.HORARIO, CONFIG.AVISO_MIN);
  if (slots.length === 0) {
    vazio.hidden = false;
    ctx.atualizarBarra();
    return;
  }
  vazio.hidden = true;
  for (const slot of slots) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.slot = slot;
    chip.textContent = slot;
    chip.setAttribute("aria-pressed", "false");
    caixa.appendChild(chip);
  }
}

export function fazerPedido() {
  if (ctx.store.carrinho.length === 0) return;
  if (!slotSelecionado) {
    ctx.toast("Escolha um horário para continuar.", "erro");
    return;
  }
  const corpo = {
    itens: ctx.store.carrinho.map((e) => ({ item_id: e.item.id, quantidade: e.qtd })),
    horario_agendamento: slotSelecionado,
    nome_cliente: document.getElementById("input-nome").value.trim() || undefined
  };
  const botao = document.getElementById("barra-cta");
  botao.disabled = true;
  apiPost("/pedidos", corpo)
    .then((pedido) => {
      ctx.store.pedido = pedido;
      ctx.store.carrinho = [];
      ctx.persistir();
      ctx.irPara("AGUARDANDO_CONFIRMACAO");
    })
    .catch((e) => {
      if (e instanceof ErroApi && e.status === 401) {
        ctx.erroAutenticacao();
        return;
      }
      ctx.toast("Não foi possível criar o pedido. Tente novamente.", "erro");
      botao.disabled = false;
    });
}
