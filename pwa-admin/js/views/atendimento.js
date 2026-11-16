// View ATENDIMENTO: 4 seções por status (Novos, Aguardando pagamento,
// Fila de preparo, No painel) + cards com CTAs. Clique no corpo do card
// abre o modal de detalhe.

import {
  formatarBRL,
  formatarHorarioRelogio,
  referenciaPix,
  secaoDoPedido,
  montarFilaPainel,
  acoesDisponiveis
} from "../state.js";
import { confirmarAcao, montarCtas } from "./pedido-detalhe.js";

let ctx = null;
let vinculado = false;

const LISTAS = {
  NOVOS: "lista-novos",
  PAGAMENTO: "lista-pagamento",
  PREPARO: "lista-preparo",
  PAINEL: "lista-painel"
};

const VAZIOS = {
  NOVOS: "vazio-novos",
  PAGAMENTO: "vazio-pagamento",
  PREPARO: "vazio-preparo",
  PAINEL: "vazio-painel"
};

export function entrar(c) {
  ctx = c;
  if (!vinculado) {
    vinculado = true;
    for (const id of Object.values(LISTAS)) {
      const lista = document.getElementById(id);
      lista.addEventListener("click", aoClicarLista);
      lista.addEventListener("keydown", aoTeclaLista);
    }
  }
  renderizar();
}

export function sair() {}

// ── Render ──

function renderizar() {
  const { pedidos, filaPainel, carregou } = ctx.store;

  if (!carregou) {
    document.getElementById("atendimento-skeleton").hidden = false;
    for (const id of Object.values(LISTAS)) document.getElementById(id).hidden = true;
    return;
  }
  document.getElementById("atendimento-skeleton").hidden = true;
  for (const id of Object.values(LISTAS)) document.getElementById(id).hidden = false;

  const porSecao = { NOVOS: [], PAGAMENTO: [], PREPARO: [] };
  for (const p of pedidos) {
    const secao = secaoDoPedido(p);
    if (porSecao[secao]) porSecao[secao].push(p);
  }
  // mais antigo no topo (ordem de chegada)
  for (const secao of Object.keys(porSecao)) porSecao[secao].sort((a, b) => a.id - b.id);

  const secoes = {
    NOVOS: porSecao.NOVOS.map(cardNovos),
    PAGAMENTO: porSecao.PAGAMENTO.map(cardPagamento),
    PREPARO: porSecao.PREPARO.map(cardPreparo),
    PAINEL: montarFilaPainel(pedidos, filaPainel).map(cardPainel)
  };
  for (const secao of Object.keys(secoes)) {
    const lista = document.getElementById(LISTAS[secao]);
    lista.innerHTML = "";
    for (const card of secoes[secao]) lista.appendChild(card);
    document.getElementById(VAZIOS[secao]).hidden = secoes[secao].length > 0;
  }
}

// ── Construção de cards (com wrapper .pedido-corpo p/ o layout desktop) ──

function cardBase(pedido, extraClasses = "") {
  const card = document.createElement("article");
  card.className = `pedido-card ${extraClasses}`.trim();
  card.dataset.id = String(pedido.id);
  return card;
}

function corpoCard(pedido, elementos) {
  const corpo = document.createElement("div");
  corpo.className = "pedido-corpo";
  corpo.tabIndex = 0;
  corpo.setAttribute("role", "button");
  corpo.setAttribute(
    "aria-label",
    `Detalhes do pedido ${pedido.nome_cliente || "cliente sem nome"} — ${formatarBRL(pedido.total)}`
  );
  for (const el of elementos) corpo.appendChild(el);
  return corpo;
}

// CTA do card: MESMO construtor do modal de detalhe (montarCtas em
// pedido-detalhe.js) — um construtor só, os dois lados nunca divergem.
// (Os ícones ✓/✗ do card "Novos" também saem de lá: PENDENTE leva os
// ícones, os demais status levam botões de texto.)
function caixaCtas(pedido) {
  const ctas = document.createElement("div");
  ctas.className = "pedido-ctas";
  ctas.appendChild(montarCtas(pedido));
  return ctas;
}

function linhaIdentidade(pedido) {
  const linha = document.createElement("div");
  linha.className = "pedido-linha";
  const nome = document.createElement("span");
  nome.className = "pedido-nome";
  nome.textContent = pedido.nome_cliente || "Cliente sem nome";
  const total = document.createElement("span");
  total.className = "pedido-total";
  total.textContent = formatarBRL(pedido.total);
  linha.append(nome, total);
  return linha;
}

function resumoItens(pedido) {
  const linhas = (pedido.itens || []).map((pi) => {
    const item = ctx.store.itens.find((i) => i.id === pi.item_id);
    const doItem = [item ? `${pi.quantidade}× ${item.nome}` : `Item #${pi.item_id}`];
    // adicionais escolhidos nesta linha (congelados no pedido)
    for (const ad of pi.adicionais || []) {
      const adItem = ctx.store.itens.find((i) => i.id === ad.item_id);
      doItem.push(`  + ${ad.quantidade}× ${adItem ? adItem.nome : `Item #${ad.item_id}`}`);
    }
    return doItem.join("\n");
  });
  if (pedido.observacao) linhas.push(`Obs.: ${pedido.observacao}`);
  // Um item por linha (pre-line no CSS) — com vírgulas o texto quebrava
  // no meio do item quando não cabia tudo numa linha.
  return linhas.join("\n");
}

function elementoResumo(texto) {
  const p = document.createElement("p");
  p.className = "pedido-resumo";
  p.textContent = texto;
  return p;
}

function chipsCard(...chips) {
  const chipsEl = document.createElement("div");
  chipsEl.className = "pedido-chips";
  for (const chip of chips) {
    if (!chip) continue;
    const span = document.createElement("span");
    span.className = chip.classe;
    span.textContent = chip.texto;
    chipsEl.appendChild(span);
  }
  return chipsEl;
}

function numeroGrande(pedido) {
  const span = document.createElement("span");
  span.className = "numero-grande";
  span.textContent = String(pedido.numero ?? "—");
  return span;
}

function senhaBlocos(pedido) {
  const cont = document.createElement("span");
  cont.className = "senha-blocos";
  cont.setAttribute("aria-label", `Senha de retirada ${pedido.senha_retirada || ""}`);
  const chars = pedido.senha_retirada || "····";
  for (const c of chars) {
    const bloco = document.createElement("span");
    bloco.className = "senha-tecla";
    bloco.setAttribute("aria-hidden", "true");
    bloco.textContent = c;
    cont.appendChild(bloco);
  }
  return cont;
}

function cardNovos(pedido) {
  const card = cardBase(pedido);
  card.appendChild(
    corpoCard(pedido, [
      linhaIdentidade(pedido),
      elementoResumo(resumoItens(pedido)),
      chipsCard(
        { classe: "etiqueta etiqueta-pendente", texto: "Novo" },
        // Horário do slot escolhido pelo cliente (o fluxo do cliente sempre
        // traz; o "—" evita "null" em registros antigos malformados)
        { classe: "chip", texto: `Horário: ${pedido.horario_agendamento ?? "—"}` }
      )
    ])
  );
  card.appendChild(caixaCtas(pedido));
  return card;
}

function cardPagamento(pedido) {
  const declarado = Boolean(pedido.pagamento_declarado_em);
  const card = cardBase(pedido, declarado ? "declarado" : "");
  card.appendChild(
    corpoCard(pedido, [
      linhaIdentidade(pedido),
      elementoResumo(resumoItens(pedido)),
      chipsCard(
        { classe: "chip", texto: referenciaPix(pedido.id) },
        declarado
          ? {
              classe: "chip chip-declarado",
              texto: `Declarou que pagou · ${formatarHorarioRelogio(pedido.pagamento_declarado_em)}`
            }
          : null
      )
    ])
  );
  card.appendChild(caixaCtas(pedido));
  return card;
}

function cardPreparo(pedido) {
  const card = cardBase(pedido);
  // Pedido já saiu de "aguardando pagamento": o valor não precisa mais no
  // card (continua no modal de detalhe, em todas as etapas)
  const linha = document.createElement("div");
  linha.className = "pedido-linha";
  linha.append(numeroGrande(pedido));
  card.appendChild(
    corpoCard(pedido, [linha, elementoResumo(`${pedido.nome_cliente || "Cliente sem nome"}\n${resumoItens(pedido)}`)])
  );
  card.appendChild(caixaCtas(pedido));
  return card;
}

function linhaTotal(pedido) {
  const total = document.createElement("span");
  total.className = "pedido-total";
  total.textContent = formatarBRL(pedido.total);
  return total;
}

function cardPainel(entrada) {
  const { pedido, exibindo, posicao } = entrada;
  const card = cardBase(pedido, exibindo ? "exibindo" : "");
  // Mesmo motivo do cardPreparo: valor só no modal de detalhe
  const linha = document.createElement("div");
  linha.className = "pedido-linha";
  linha.append(numeroGrande(pedido));
  card.appendChild(
    corpoCard(pedido, [
      linha,
      senhaBlocos(pedido),
      elementoResumo(pedido.nome_cliente || "Cliente sem nome"),
      chipsCard(
        exibindo
          ? { classe: "chip chip-painel", texto: "No painel" }
          : { classe: "chip", texto: `Nº na fila: ${posicao}` }
      )
    ])
  );
  card.appendChild(caixaCtas(pedido));
  return card;
}

// ── Eventos (delegação) ──

function aoClicarLista(evento) {
  const botao = evento.target.closest("button[data-acao]");
  if (botao) {
    evento.preventDefault();
    aoAcao(botao);
    return;
  }
  const card = evento.target.closest(".pedido-card");
  if (card) abrirDetalheDoCard(card);
}

function aoTeclaLista(evento) {
  if (evento.key !== "Enter" && evento.key !== " ") return;
  const corpo = evento.target.closest(".pedido-corpo");
  if (!corpo) return;
  evento.preventDefault();
  const card = corpo.closest(".pedido-card");
  if (card) abrirDetalheDoCard(card);
}

function abrirDetalheDoCard(card) {
  const pedido = ctx.store.pedidos.find((p) => String(p.id) === card.dataset.id);
  if (pedido) ctx.abrirDetalhe(pedido, ctx.store.itens);
}

function aoAcao(botao) {
  if (!acoesDisponiveis(ctx.store)) {
    ctx.toast("Ações indisponíveis agora — verifique a conexão.", "erro");
    return;
  }
  const id = Number(botao.dataset.id);
  const acao = botao.dataset.acao;
  if (acao === "CANCELADO") {
    confirmarAcao("Rejeitar este pedido? Essa ação não pode ser desfeita.", () =>
      ctx.aplicarAcao(id, acao)
    );
    return;
  }
  botao.disabled = true; // evita clique duplo durante o PATCH
  ctx.aplicarAcao(id, acao);
}
