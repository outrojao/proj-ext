// View CARDAPIO: lista itens disponíveis, carrinho +/-.
import { apiGet, ErroApi } from "../api.js";
import { formatarBRL } from "../state.js";

let ctx = null;
let itens = [];
let vinculado = false;

export function entrar(c) {
  ctx = c;
  if (!vinculado) {
    vinculado = true;
    document.getElementById("btn-atualizar-cardapio").addEventListener("click", () => carregarItens());
    const btnTentar = document.getElementById("btn-tentar-cardapio");
    btnTentar.addEventListener("click", () => {
      if (btnTentar.dataset.acao === "recarregar") window.location.reload();
      else carregarItens();
    });
    document.getElementById("lista-itens").addEventListener("click", (evento) => {
      const botao = evento.target.closest("button[data-qtd]");
      if (!botao) return;
      mudarQuantidade(Number(botao.dataset.itemId), botao.dataset.qtd === "mais" ? 1 : -1);
    });
  }
  // Reentra com estado limpo (ex.: após erro de 401)
  const btnTentar = document.getElementById("btn-tentar-cardapio");
  btnTentar.textContent = "Tentar novamente";
  delete btnTentar.dataset.acao;
  const pErro = document.querySelector("#cardapio-erro p");
  if (pErro) pErro.textContent = "Não foi possível carregar o cardápio.";
  carregarItens();
}

export function sair() {}

function quantidadeDe(itemId) {
  const entrada = ctx.store.carrinho.find((e) => e.item.id === itemId);
  return entrada ? entrada.qtd : 0;
}

function mudarQuantidade(itemId, delta) {
  const item = itens.find((i) => i.id === itemId);
  if (!item) return;
  let entrada = ctx.store.carrinho.find((e) => e.item.id === itemId);
  if (delta > 0) {
    if (entrada) entrada.qtd += 1;
    else ctx.store.carrinho.push({ item, qtd: 1 });
  } else if (entrada) {
    entrada.qtd -= 1;
    if (entrada.qtd <= 0) ctx.store.carrinho = ctx.store.carrinho.filter((e) => e !== entrada);
  }
  ctx.persistir();
  renderizar();
  ctx.atualizarBarra();
  // "Pop" na quantidade do item tocado
  const qtdEl = document.querySelector(`#lista-itens .item-card[data-id="${itemId}"] .qtd-valor`);
  if (qtdEl) {
    qtdEl.classList.remove("pop");
    void qtdEl.offsetWidth; // reinicia a animação
    qtdEl.classList.add("pop");
  }
}

function iniciais(nome) {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0].toUpperCase())
    .join("");
}

// Índice estável da categoria → cor do tile (tile-0..3).
function indiceCategoria() {
  const mapa = new Map();
  let n = 0;
  for (const item of itens) {
    const cat = item.categoria || "Outros";
    if (!mapa.has(cat)) mapa.set(cat, n++ % 4);
  }
  return mapa;
}

function renderizar() {
  const lista = document.getElementById("lista-itens");
  lista.innerHTML = "";
  const categorias = indiceCategoria();
  let i = 0;
  for (const item of itens) {
    const qtd = quantidadeDe(item.id);
    const card = document.createElement("article");
    card.className = "item-card";
    card.dataset.id = String(item.id);
    card.style.setProperty("--i", String(Math.min(i, 10)));
    i += 1;

    let media;
    if (item.imagem) {
      media = document.createElement("img");
      media.className = "item-media";
      media.src = item.imagem;
      media.alt = item.nome;
      media.loading = "lazy";
      media.decoding = "async";
      media.draggable = false;
    } else {
      media = document.createElement("div");
      media.className = `item-media item-media-placeholder tile-${categorias.get(item.categoria || "Outros")}`;
      media.setAttribute("aria-hidden", "true");
      media.textContent = iniciais(item.nome);
    }
    card.appendChild(media);

    const info = document.createElement("div");
    info.className = "item-info";
    const nome = document.createElement("h2");
    nome.className = "item-nome";
    nome.textContent = item.nome;
    info.appendChild(nome);
    if (item.descricao) {
      const desc = document.createElement("p");
      desc.className = "item-desc";
      desc.textContent = item.descricao;
      info.appendChild(desc);
    }
    const preco = document.createElement("span");
    preco.className = "item-preco";
    preco.textContent = formatarBRL(item.preco);
    info.appendChild(preco);
    card.appendChild(info);

    const grupo = document.createElement("div");
    grupo.className = "item-qtd";
    grupo.setAttribute("role", "group");
    grupo.setAttribute("aria-label", `Quantidade de ${item.nome}`);
    const menos = document.createElement("button");
    menos.type = "button";
    menos.className = "qtd-btn";
    menos.dataset.itemId = String(item.id);
    menos.dataset.qtd = "menos";
    menos.textContent = "−";
    menos.setAttribute("aria-label", `Diminuir quantidade de ${item.nome}`);
    menos.disabled = qtd === 0;
    const valor = document.createElement("span");
    valor.className = "qtd-valor";
    valor.setAttribute("aria-live", "polite");
    valor.textContent = String(qtd);
    const mais = document.createElement("button");
    mais.type = "button";
    mais.className = "qtd-btn";
    mais.dataset.itemId = String(item.id);
    mais.dataset.qtd = "mais";
    mais.textContent = "+";
    mais.setAttribute("aria-label", `Aumentar quantidade de ${item.nome}`);
    grupo.append(menos, valor, mais);
    card.appendChild(grupo);

    lista.appendChild(card);
  }
}

async function carregarItens() {
  const esqueleto = document.getElementById("cardapio-skeleton");
  const erro = document.getElementById("cardapio-erro");
  const vazio = document.getElementById("cardapio-vazio");
  const lista = document.getElementById("lista-itens");
  erro.hidden = true;
  vazio.hidden = true;
  lista.hidden = true;
  esqueleto.hidden = false;

  try {
    const resposta = await apiGet("/itens");
    itens = (resposta || []).filter((item) => item.disponivel);
  } catch (e) {
    if (e instanceof ErroApi && e.status === 401) {
      ctx.erroAutenticacao();
      return;
    }
    esqueleto.hidden = true;
    erro.hidden = false;
    return;
  }

  esqueleto.hidden = true;
  if (itens.length === 0) {
    vazio.hidden = false;
    return;
  }
  lista.hidden = false;
  renderizar();
}
