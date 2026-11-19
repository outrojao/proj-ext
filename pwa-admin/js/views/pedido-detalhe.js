// Modais: detalhe do pedido (abrir/fechar) + confirmação genérica
// (rejeitar pedido / remover item). Foco: título ao abrir, Esc fecha,
// foco volta ao disparador.

import { formatarBRL, formatarHorarioRelogio, referenciaPix, acoesDoStatus, acoesDisponiveis } from "../state.js";

let ctx = null;
let vinculado = false;
let elementoDisparador = null;
let aoConfirmarPendente = null;

const ROTULO_STATUS = {
  PENDENTE: "Novo",
  CONFIRMADO: "Aguardando pagamento",
  PAGO: "Pago — em preparo",
  PRONTO: "Pronto",
  ENTREGUE: "Entregue",
  CANCELADO: "Rejeitado"
};

// ── CTAs compartilhados: card da coluna e modal de detalhe usam o MESMO
//    construtor, então nunca divergem. PENDENTE leva os ícones ✓/✗ do card
//    "Novos"; os demais status, os botões de texto de acoesDoStatus.
//    disabled segue a conexão (mesma regra dos cards). ──

const SVG_CERTO = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>`;

export const SVG_X = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"></path></svg>`;

// Lápis (edit-2): reutilizado no cardápio (botão "Editar" dos cards)
export const SVG_LAPIS = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;

function botaoIcone(pedido, acao, classe, svg, titulo) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `btn-icone ${classe}`;
  b.dataset.acao = acao;
  b.dataset.id = String(pedido.id);
  b.title = titulo;
  b.setAttribute("aria-label", titulo);
  b.innerHTML = svg;
  b.disabled = !acoesDisponiveis(ctx.store);
  return b;
}

// Devolve fragmento de botões: quem chama decide o contêiner
// (o card usa <div class="pedido-ctas">, o modal o #modal-detalhe-acoes).
export function montarCtas(pedido) {
  const fragmento = document.createDocumentFragment();
  if (pedido.status === "PENDENTE") {
    fragmento.append(
      // Cancelar à esquerda, confirmar à direita (ordem pedida no card)
      botaoIcone(pedido, "CANCELADO", "btn-icone-rejeitar", SVG_X, "Rejeitar pedido"),
      botaoIcone(pedido, "CONFIRMADO", "btn-icone-aceitar", SVG_CERTO, "Aceitar pedido")
    );
    return fragmento;
  }
  for (const [rotulo, acao, classe] of acoesDoStatus(pedido.status)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = classe;
    b.dataset.acao = acao;
    b.dataset.id = String(pedido.id);
    b.textContent = rotulo;
    b.disabled = !acoesDisponiveis(ctx.store);
    fragmento.appendChild(b);
  }
  return fragmento;
}

export function inicializarModais(c) {
  ctx = c;
  if (vinculado) return;
  vinculado = true;

  document.getElementById("btn-fechar-detalhe").addEventListener("click", fecharDetalhe);
  document.getElementById("modal-detalhe").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) fecharDetalhe(); // clique fora do painel
  });
  document.getElementById("modal-detalhe-acoes").addEventListener("click", (e) => {
    const botao = e.target.closest("button[data-acao]");
    if (botao) aoAcaoDetalhe(botao);
  });

  document.getElementById("btn-confirmar-ok").addEventListener("click", () => {
    const fn = aoConfirmarPendente;
    fecharConfirmacao();
    if (fn) fn();
  });
  document.getElementById("btn-confirmar-cancelar").addEventListener("click", fecharConfirmacao);
  document.getElementById("modal-confirmar").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) fecharConfirmacao();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!document.getElementById("modal-confirmar").hidden) fecharConfirmacao();
    else if (!document.getElementById("modal-detalhe").hidden) fecharDetalhe();
  });
}

export function abrirDetalhe(pedido, itens = []) {
  elementoDisparador = document.activeElement;

  const titulo = document.getElementById("modal-detalhe-titulo");
  titulo.textContent = pedido.nome_cliente || "Cliente sem nome";

  const corpo = document.getElementById("modal-detalhe-corpo");
  corpo.innerHTML = "";

  const status = document.createElement("p");
  status.className = "detalhe-status";
  const etiqueta = document.createElement("span");
  etiqueta.className = `etiqueta etiqueta-${pedido.status.toLowerCase()}`;
  etiqueta.textContent = ROTULO_STATUS[pedido.status] || pedido.status;
  // Slot de agendamento escolhido pelo cliente (o fluxo do cliente sempre
  // traz; o "—" evita "null" em registros antigos malformados)
  const horario = document.createElement("span");
  horario.className = "chip";
  horario.textContent = `Horário: ${pedido.horario_agendamento ?? "—"}`;
  status.append(etiqueta, horario);
  corpo.appendChild(status);

  const pares = [
    ["Pedido", pedido.numero != null ? String(pedido.numero) : null],
    ["Senha de retirada", pedido.senha_retirada || null],
    ["Observação", pedido.observacao || null],
    // A referência só existe a partir do CONFIRMADO: é o único status em que
    // o backend gera o Pix — antes disso não há nada a apontar no extrato.
    ["Referência Pix", ["CONFIRMADO", "PAGO", "PRONTO", "ENTREGUE"].includes(pedido.status) ? referenciaPix(pedido.id) : null],
    ["Cliente declarou pagamento", pedido.pagamento_declarado_em ? formatarHorarioRelogio(pedido.pagamento_declarado_em) : null]
  ];
  for (const [rotulo, valor] of pares) {
    if (valor == null) continue;
    const par = document.createElement("div");
    par.className = "detalhe-par";
    const r = document.createElement("span");
    r.textContent = rotulo;
    const v = document.createElement("span");
    v.textContent = valor;
    par.append(r, v);
    corpo.appendChild(par);
  }

  if ((pedido.itens || []).length) {
    const lista = document.createElement("ul");
    lista.className = "detalhe-itens";
    lista.setAttribute("role", "list");
    for (const pi of pedido.itens) {
      const item = itens.find((i) => i.id === pi.item_id);
      let valorLinha = 0;
      if (item) valorLinha += item.preco * pi.quantidade;

      const linha = document.createElement("div");
      linha.className = "detalhe-linha";
      const nome = document.createElement("span");
      nome.textContent = item ? `${pi.quantidade}× ${item.nome}` : `Item #${pi.item_id}`;
      const valor = document.createElement("span");
      linha.append(nome, valor);

      const li = document.createElement("li");
      li.appendChild(linha);
      // adicionais desta linha (com preço); entram no valor da linha
      for (const ad of pi.adicionais || []) {
        const adItem = itens.find((i) => i.id === ad.item_id);
        const sub = document.createElement("div");
        sub.className = "detalhe-adicional";
        const sn = document.createElement("span");
        sn.textContent = adItem ? `+ ${ad.quantidade}× ${adItem.nome}` : `+ Item #${ad.item_id}`;
        sub.appendChild(sn);
        if (adItem) {
          valorLinha += adItem.preco * ad.quantidade;
          const sv = document.createElement("span");
          sv.textContent = formatarBRL(adItem.preco * ad.quantidade);
          sub.appendChild(sv);
        }
        li.appendChild(sub);
      }
      valor.textContent = item ? formatarBRL(valorLinha) : "";
      lista.appendChild(li);
    }
    corpo.appendChild(lista);

    const total = document.createElement("div");
    total.className = "detalhe-total";
    const r = document.createElement("span");
    r.textContent = "Total";
    const v = document.createElement("span");
    v.className = "valor";
    v.textContent = formatarBRL(pedido.total);
    total.append(r, v);
    corpo.appendChild(total);
  }

  const acoes = document.getElementById("modal-detalhe-acoes");
  acoes.innerHTML = "";
  acoes.appendChild(montarCtas(pedido));

  document.getElementById("modal-detalhe").hidden = false;
  titulo.focus({ preventScroll: true });
}

function fecharDetalhe() {
  document.getElementById("modal-detalhe").hidden = true;
  restaurarFoco();
}

function aoAcaoDetalhe(botao) {
  // Mesma guarda do card: modal aberto pode ficar visível quando a conexão cai
  if (!acoesDisponiveis(ctx.store)) {
    ctx.toast("Ações indisponíveis agora — verifique a conexão.", "erro");
    return;
  }
  const id = Number(botao.dataset.id);
  const acao = botao.dataset.acao;
  fecharDetalhe();
  if (acao === "CANCELADO") {
    confirmarAcao("Rejeitar este pedido? Essa ação não pode ser desfeita.", () => ctx.aplicarAcao(id, acao));
  } else {
    ctx.aplicarAcao(id, acao);
  }
}

export function confirmarAcao(texto, aoConfirmar) {
  aoConfirmarPendente = aoConfirmar;
  document.getElementById("modal-confirmar-texto").textContent = texto;
  document.getElementById("modal-confirmar").hidden = false;
  document.getElementById("btn-confirmar-ok").focus();
}

function fecharConfirmacao() {
  aoConfirmarPendente = null;
  document.getElementById("modal-confirmar").hidden = true;
  restaurarFoco();
}

function restaurarFoco() {
  if (elementoDisparador && typeof elementoDisparador.focus === "function") {
    try {
      elementoDisparador.focus();
    } catch {
      // elemento saiu do DOM
    }
  }
}
