// View CARDAPIO: lista itens disponíveis, carrinho +/-.
import { apiGet, ErroApi } from "../api.js";
import { formatarBRL } from "../state.js";

let ctx = null;
let itens = [];
let adicionais = []; // disponíveis; cada um lista os itens-base onde vale (aplica_em)
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
      // Wrapper de categoria: abre/fecha o grupo (sem re-render — só o estado)
      const toggle = evento.target.closest("button[data-categoria]");
      if (toggle) {
        const cat = toggle.dataset.categoria;
        if (categoriasAbertas.has(cat)) categoriasAbertas.delete(cat);
        else categoriasAbertas.add(cat);
        const aberta = categoriasAbertas.has(cat);
        toggle.setAttribute("aria-expanded", String(aberta));
        toggle.closest(".categoria-grupo").querySelector(".categoria-itens").hidden = !aberta;
        return;
      }
      const botao = evento.target.closest("button[data-qtd]");
      if (!botao) return;
      mudarQuantidade(Number(botao.dataset.itemId), botao.dataset.qtd === "mais" ? 1 : -1);
    });
    // Checkboxes de adicionais (só existem quando o item já está no carrinho)
    document.getElementById("lista-itens").addEventListener("change", (evento) => {
      const caixa = evento.target.closest("input[data-adicional]");
      if (!caixa) return;
      mudarAdicional(Number(caixa.dataset.itemId), Number(caixa.dataset.adicional), caixa.checked);
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
    else ctx.store.carrinho.push({ item, qtd: 1, adicionais: [] });
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

// Checkbox de adicional: qtd fixa 1 (limitação da UI — o backend aceita
// quantidade por adicional; se precisar, vira o mesmo stepper de item).
function mudarAdicional(itemId, adId, marcado) {
  const entrada = ctx.store.carrinho.find((e) => e.item.id === itemId);
  if (!entrada) return; // a seção só aparece com qtd > 0
  const ad = adicionais.find((a) => a.id === adId);
  if (!ad) return;
  const atuais = entrada.adicionais || (entrada.adicionais = []);
  if (marcado && !atuais.some((e) => e.item.id === adId)) atuais.push({ item: ad, qtd: 1 });
  else if (!marcado) entrada.adicionais = atuais.filter((e) => e.item.id !== adId);
  ctx.persistir();
  renderizar();
  ctx.atualizarBarra();
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

// Cardápio em acordeão: só os wrappers (títulos de categoria) ficam
// visíveis; clicar abre o grupo. O estado aberto/fechado sobrevive aos
// re-renders (o carrinho rebuilds a lista) — por padrão, tudo fechado
const categoriasAbertas = new Set();

// O cardápio é agrupado por categoria (ordem = 1ª aparição na lista do
// backend); item sem categoria cai em "Outros" — mesma regra da cor do tile
function renderizar() {
  const lista = document.getElementById("lista-itens");
  lista.innerHTML = "";
  const categorias = indiceCategoria();
  const porCategoria = new Map();
  for (const item of itens) {
    const cat = item.categoria || "Outros";
    if (!porCategoria.has(cat)) porCategoria.set(cat, []);
    porCategoria.get(cat).push(item);
  }
  let i = 0;
  let grupoIdx = 0;
  for (const [cat, grupo] of porCategoria) {
    const aberta = categoriasAbertas.has(cat);
    const secao = document.createElement("section");
    secao.className = "categoria-grupo";

    const cabecalho = document.createElement("h3");
    cabecalho.className = "categoria-titulo";
    const botao = document.createElement("button");
    botao.type = "button";
    // tile-0..3: mesma cor da categoria usada no tile dos itens do grupo
    botao.className = "categoria-toggle tile-" + categorias.get(cat);
    botao.dataset.categoria = cat;
    botao.textContent = cat;
    botao.setAttribute("aria-expanded", String(aberta));
    botao.setAttribute("aria-controls", `itens-categoria-${grupoIdx}`);
    cabecalho.appendChild(botao);

    const itensDiv = document.createElement("div");
    itensDiv.className = "categoria-itens";
    itensDiv.id = `itens-categoria-${grupoIdx}`;
    itensDiv.hidden = !aberta;
    for (const item of grupo) {
      itensDiv.appendChild(cardItem(item, categorias, i));
      i += 1;
    }
    grupoIdx += 1;
    secao.append(cabecalho, itensDiv);
    lista.appendChild(secao);
  }
}

function cardItem(item, categorias, i) {
  const qtd = quantidadeDe(item.id);
  const card = document.createElement("article");
  card.className = "item-card";
  card.dataset.id = String(item.id);
  card.style.setProperty("--i", String(Math.min(i, 10)));

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

  // Adicionais só entram em cena quando o item já está no carrinho
  if (qtd > 0) {
    const doItem = adicionais.filter((a) => a.aplica_em.includes(item.id));
    if (doItem.length) card.appendChild(secaoAdicionais(item, doItem));
  }

  return card;
}

function secaoAdicionais(item, doItem) {
  const entrada = ctx.store.carrinho.find((e) => e.item.id === item.id);
  const escolhidos = (entrada && entrada.adicionais) || [];
  const caixa = document.createElement("div");
  caixa.className = "item-adicionais";
  const titulo = document.createElement("p");
  titulo.className = "item-adicionais-titulo";
  titulo.textContent = "Adicionais";
  caixa.appendChild(titulo);
  for (const ad of doItem) {
    const linha = document.createElement("label");
    linha.className = "item-adicional-opcao";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = escolhidos.some((e) => e.item.id === ad.id);
    cb.dataset.itemId = String(item.id);
    cb.dataset.adicional = String(ad.id);
    const nome = document.createElement("span");
    nome.textContent = ad.nome;
    const preco = document.createElement("span");
    preco.className = "item-adicional-preco";
    preco.textContent = formatarBRL(ad.preco);
    linha.append(cb, nome, preco);
    caixa.appendChild(linha);
  }
  return caixa;
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
    const resposta = await apiGet("/itens") || [];
    const disponiveis = resposta.filter((item) => item.disponivel);
    // Adicionais (aplica_em não-vazia) não aparecem como itens do cardápio:
    // são opções dos itens-base a que aplicam
    itens = disponiveis.filter((item) => !item.aplica_em?.length);
    adicionais = disponiveis.filter((item) => item.aplica_em?.length);
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
