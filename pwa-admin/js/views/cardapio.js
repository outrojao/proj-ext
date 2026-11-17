// View CARDAPIO (admin): CRUD completo de itens + toggle de disponibilidade.
// Fonte de dados: ctx.store.itens (sincronizado pelo app) — sem fetch próprio,
// a não ser pelas mutações (POST/PUT/DELETE).

import {
  apiPost,
  apiPut,
  apiDelete,
  apiUploadImagem,
  ErroApi,
} from "../api.js";
import { formatarBRL, normalizarPreco } from "../state.js";
import { confirmarAcao, SVG_LAPIS, SVG_X } from "./pedido-detalhe.js";

let ctx = null;
let vinculado = false;
let itemEmEdicao = null;
let arquivoImagem = null;

export function entrar(c) {
  ctx = c;
  if (!vinculado) {
    vinculado = true;
    document
      .getElementById("btn-novo-item")
      .addEventListener("click", () => abrirFormulario(null));
    document
      .getElementById("btn-novo-item-vazio")
      .addEventListener("click", () => abrirFormulario(null));
    document
      .getElementById("btn-tentar-cardapio-admin")
      .addEventListener("click", renderizar);
    document.getElementById("form-item").addEventListener("submit", aoSalvar);
    document
      .getElementById("btn-cancelar-item")
      .addEventListener("click", fecharFormulario);

    document
      .getElementById("btn-item-arquivo")
      .addEventListener("click", () =>
        document.getElementById("input-item-arquivo").click(),
      );

    document
      .getElementById("input-item-arquivo")
      .addEventListener("change", aoEscolherArquivo);

    document
      .getElementById("input-item-e-adicional")
      .addEventListener("change", (e) => {
        const ehAdicional = e.target.checked;
        document.getElementById("campo-item-categoria").hidden = ehAdicional;

        if (ehAdicional) {
          document.getElementById("input-item-categoria").value = "";
          document.getElementById("secao-adicionais").hidden = true;
        } else {
          if (itemEmEdicao) {
            document.getElementById("input-item-categoria").value =
              itemEmEdicao.categoria || "";
          }
          renderizarSecaoAdicionais(itemEmEdicao);
        }

        renderizarSecaoAplicaEm(ehAdicional, itemEmEdicao);
        esconderErroForm();
      });

    const lista = document.getElementById("lista-cardapio-admin");
    lista.addEventListener("click", aoClicarLista);
    lista.addEventListener("change", aoMudarDisponibilidade);

    const listaAdicionais = document.getElementById("lista-adicionais-form");
    listaAdicionais.addEventListener("click", aoClicarLista);
    listaAdicionais.addEventListener("change", aoMudarDisponibilidade);

    document
      .getElementById("btn-add-adicional")
      .addEventListener("click", adicionarAdicional);
  }

  if (document.getElementById("form-item").hidden) {
    renderizar();
  }
}

export function sair() {}

function tratarErro(e, aoRepetir) {
  if (e instanceof ErroApi && e.status === 401) {
    ctx.erroAutenticacao();
    return;
  }

  ctx.toast(
    e instanceof ErroApi ? e.message : "Falha de conexão. Tente novamente.",
    "erro",
  );

  if (aoRepetir) aoRepetir();
}

// ── Lista ──

function iniciais(nome) {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0].toUpperCase())
    .join("");
}

// ── Wrapper das seções do cardápio ──

function criarSecaoCardapio(titulo, quantidade, listaPrincipal) {
  const wrapper = document.createElement("li");

  Object.assign(wrapper.style, {
    listStyle: "none",
    width: "100%",
    boxSizing: "border-box",
    gridColumn: "1 / -1",
    margin: "0 0 12px",
    padding: "0",
    background: "#fff",
    borderRadius: "10px",
  });

  const cabecalho = document.createElement("button");
  cabecalho.type = "button";

  Object.assign(cabecalho.style, {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    color: "inherit",
    font: "inherit",
  });

  const identificacao = document.createElement("span");

  identificacao.style.display = "flex";
  identificacao.style.alignItems = "center";
  identificacao.style.gap = "8px";

  const nome = document.createElement("strong");
  nome.textContent = titulo;

  const contador = document.createElement("span");
  contador.textContent = `(${quantidade})`;
  contador.style.opacity = "0.6";

  identificacao.append(nome, contador);

  const seta = document.createElement("span");
  seta.textContent = "⌄";
  seta.style.transition = "transform 0.2s ease";
  seta.style.fontSize = "18px";

  cabecalho.append(identificacao, seta);

  const conteudo = document.createElement("ul");

  // Preserva o layout dos itens da lista original.
  const estilo = window.getComputedStyle(listaPrincipal);

  const displayOriginal = estilo.display === "none" ? "grid" : estilo.display;

  Object.assign(conteudo.style, {
    width: "100%",
    boxSizing: "border-box",
    margin: "0",
    padding: "0 14px 14px",
    listStyle: "none",
    display: "none",
    gap: estilo.gap,
    gridTemplateColumns: estilo.gridTemplateColumns,
    gridAutoFlow: estilo.gridAutoFlow,
    flexDirection: estilo.flexDirection,
    flexWrap: estilo.flexWrap,
    alignItems: estilo.alignItems,
    justifyContent: estilo.justifyContent,
  });

  cabecalho.setAttribute("aria-expanded", "false");

  cabecalho.addEventListener("click", () => {
    const aberto = cabecalho.getAttribute("aria-expanded") !== "true";

    cabecalho.setAttribute("aria-expanded", String(aberto));

    conteudo.style.display = aberto ? displayOriginal : "none";

    seta.style.transform = aberto ? "rotate(180deg)" : "rotate(0deg)";
  });

  wrapper.append(cabecalho, conteudo);
  listaPrincipal.appendChild(wrapper);

  return conteudo;
}

// ── Renderização do cardápio ──

function renderizar() {
  const esqueleto = document.getElementById("cardapio-admin-skeleton");
  const erro = document.getElementById("cardapio-admin-erro");
  const vazio = document.getElementById("cardapio-admin-vazio");
  const lista = document.getElementById("lista-cardapio-admin");

  erro.hidden = true;
  vazio.hidden = true;
  lista.hidden = true;

  if (!ctx.store.carregou) {
    if (ctx.store.offline) {
      esqueleto.hidden = true;
      erro.hidden = false;
    } else {
      esqueleto.hidden = false;
    }
    return;
  }

  esqueleto.hidden = true;

  const itens = ctx.store.itens;

  if (itens.length === 0) {
    vazio.hidden = false;
    return;
  }

  lista.innerHTML = "";

  // Itens-base e adicionais.
  // Cada adicional aparece uma única vez, sob o primeiro item-base ao qual se aplica.

  const bases = itens.filter((item) => !item.aplica_em?.length);
  const adicionais = itens.filter((item) => item.aplica_em?.length);

  const paiExibido = (ad) =>
    bases.find((base) => ad.aplica_em.includes(base.id))?.id;

  const adicionaisExibidos = new Set();

  function adicionarItemComAdicionais(destino, item) {
    destino.appendChild(cardItem(item));

    for (const adicional of adicionais) {
      if (paiExibido(adicional) === item.id) {
        destino.appendChild(cardItem(adicional, true, item.id));
        adicionaisExibidos.add(adicional.id);
      }
    }
  }

  // Itens disponíveis separados por categoria.

  const disponiveis = bases.filter((item) => item.disponivel);
  const categorias = new Map();

  for (const item of disponiveis) {
    const categoria = item.categoria?.trim() || "Sem categoria";

    if (!categorias.has(categoria)) {
      categorias.set(categoria, []);
    }

    categorias.get(categoria).push(item);
  }

  // Cria uma seção para cada categoria.

  for (const [categoria, produtos] of categorias) {
    const secao = criarSecaoCardapio(categoria, produtos.length, lista);

    for (const produto of produtos) {
      adicionarItemComAdicionais(secao, produto);
    }
  }

  // Itens indisponíveis ficam em uma seção própria.

  const indisponiveis = bases.filter((item) => !item.disponivel);

  if (indisponiveis.length > 0) {
    const secao = criarSecaoCardapio(
      "Indisponíveis",
      indisponiveis.length,
      lista,
    );

    for (const produto of indisponiveis) {
      adicionarItemComAdicionais(secao, produto);
    }
  }

  // Adicionais sem vínculo continuam gerenciáveis.

  const adicionaisSemVinculo = adicionais.filter(
    (adicional) => !adicionaisExibidos.has(adicional.id),
  );

  if (adicionaisSemVinculo.length > 0) {
    const secao = criarSecaoCardapio(
      "Adicionais sem vínculo",
      adicionaisSemVinculo.length,
      lista,
    );

    for (const adicional of adicionaisSemVinculo) {
      secao.appendChild(cardItem(adicional, true));
    }
  }

  lista.hidden = false;
}

// ── Toggle de disponibilidade ──

function criarToggle(item) {
  const toggle = document.createElement("label");
  toggle.className = "toggle";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = item.disponivel;
  input.dataset.toggle = "";
  input.dataset.id = String(item.id);
  input.setAttribute("aria-label", `Disponibilidade de ${item.nome}`);

  const trilho = document.createElement("span");
  trilho.className = "toggle-trilho";
  trilho.setAttribute("aria-hidden", "true");

  const rotulo = document.createElement("span");
  rotulo.className = "toggle-rotulo";
  rotulo.textContent = "Disponível";

  toggle.append(input, trilho, rotulo);

  return toggle;
}

// ── Card individual ──

function cardItem(item, ehAdicional = false, paiId = null) {
  const li = document.createElement("li");

  li.className = `item-card-admin${
    item.disponivel ? "" : " indisponivel"
  }${ehAdicional ? " item-adicional" : ""}`;

  li.dataset.id = String(item.id);

  if (!ehAdicional && item.imagem) {
    const img = document.createElement("img");

    img.className = "item-media-admin";
    img.src = item.imagem;
    img.alt = item.nome;
    img.loading = "lazy";
    img.decoding = "async";
    img.draggable = false;

    li.appendChild(img);
  } else if (!ehAdicional) {
    const placeholder = document.createElement("div");

    placeholder.className = "item-media-admin item-media-admin-placeholder";

    placeholder.setAttribute("aria-hidden", "true");
    placeholder.textContent = iniciais(item.nome);

    li.appendChild(placeholder);
  }

  const info = document.createElement("div");
  info.className = "item-info-admin";

  const topo = document.createElement("div");
  topo.className = "item-topo-admin";

  if (ehAdicional) {
    const tag = document.createElement("span");

    tag.className = "item-adicional-tag";
    tag.textContent = "Adicional";

    topo.appendChild(tag);
  }

  const nome = document.createElement("span");

  nome.className = "item-nome-admin";
  nome.textContent = item.nome;

  topo.append(nome);
  info.appendChild(topo);

  if (item.descricao) {
    const desc = document.createElement("p");

    desc.className = "item-desc-admin";
    desc.textContent = item.descricao;

    info.appendChild(desc);
  }

  if (item.categoria) {
    const cat = document.createElement("p");

    cat.className = "item-desc-admin";
    cat.textContent = `Categoria: ${item.categoria}`;

    info.appendChild(cat);
  }

  // Adicional compartilhado: mostra os outros itens aos quais se aplica.

  if (ehAdicional && item.aplica_em.length > 1) {
    const outros = item.aplica_em
      .filter((id) => id !== paiId)
      .map((id) => ctx.store.itens.find((i) => i.id === id)?.nome)
      .filter(Boolean);

    if (outros.length) {
      const hint = document.createElement("p");

      hint.className = "item-desc-admin";
      hint.textContent = `Também em: ${outros.join(", ")}`;

      info.appendChild(hint);
    }
  }

  const acoes = document.createElement("div");
  acoes.className = "item-acoes-admin";
  acoes.appendChild(criarToggle(item));

  info.appendChild(acoes);
  li.appendChild(info);

  // Botões de editar e remover.

  const ctas = document.createElement("div");
  ctas.className = "item-ctas-admin";

  const editar = document.createElement("button");

  editar.type = "button";
  editar.className = "btn-icone btn-icone-editar";
  editar.dataset.acao = "editar";
  editar.dataset.id = String(item.id);
  editar.title = `Editar ${item.nome}`;
  editar.setAttribute("aria-label", `Editar ${item.nome}`);
  editar.innerHTML = SVG_LAPIS;

  const remover = document.createElement("button");

  remover.type = "button";
  remover.className = "btn-icone btn-icone-rejeitar";
  remover.dataset.acao = "remover";
  remover.dataset.id = String(item.id);
  remover.title = `Remover ${item.nome}`;
  remover.setAttribute("aria-label", `Remover ${item.nome}`);
  remover.innerHTML = SVG_X;

  ctas.append(editar, remover);
  li.appendChild(ctas);

  return li;
}

// ── Toggle de disponibilidade (PUT imediato) ──

async function aoMudarDisponibilidade(evento) {
  const input = evento.target.closest("input[data-toggle]");

  if (!input) return;

  const item = ctx.store.itens.find((i) => String(i.id) === input.dataset.id);

  if (!item) return;

  input.disabled = true;

  try {
    const atualizado = await apiPut(`/itens/${item.id}`, {
      ...item,
      disponivel: input.checked,
    });

    const idx = ctx.store.itens.findIndex((i) => i.id === item.id);

    if (idx >= 0) {
      ctx.store.itens[idx] = atualizado;
    }

    renderizar();

    if (!document.getElementById("form-item").hidden) {
      renderizarSecaoAdicionais(itemEmEdicao);
    }
  } catch (e) {
    input.checked = item.disponivel;
    tratarErro(e, renderizar);
  }
}

// ── Ações da lista ──

function aoClicarLista(evento) {
  const botao = evento.target.closest("button[data-acao]");

  if (!botao) return;

  const id = Number(botao.dataset.id);
  const item = ctx.store.itens.find((i) => i.id === id);

  if (!item) return;

  if (botao.dataset.acao === "editar") {
    abrirFormulario(item);
  } else if (botao.dataset.acao === "remover") {
    confirmarAcao(
      `Remover "${item.nome}" do cardápio? Essa ação não pode ser desfeita.`,
      () => removerItem(item),
    );
  }
}

async function removerItem(item) {
  try {
    await apiDelete(`/itens/${item.id}`);

    // Desvincula o item dos adicionais.
    // Se era o único item-base de um adicional, remove esse adicional também.

    ctx.store.itens = ctx.store.itens
      .filter((i) => i.id !== item.id)
      .flatMap((i) => {
        if (i.aplica_em?.length && i.aplica_em.includes(item.id)) {
          const restantes = i.aplica_em.filter((id) => id !== item.id);

          return restantes.length ? [{ ...i, aplica_em: restantes }] : [];
        }

        return [i];
      });

    ctx.toast("Item removido.", "sucesso");

    renderizar();

    if (!document.getElementById("form-item").hidden) {
      renderizarSecaoAdicionais(itemEmEdicao);
    }
  } catch (e) {
    if (e instanceof ErroApi && e.status === 500) {
      ctx.toast(
        "Não foi possível remover — item presente em pedidos. Use Desativar.",
        "erro",
      );
    } else {
      tratarErro(e);
    }
  }
}

// ── Formulário (novo / editar) ──

function limparArquivoImagem() {
  arquivoImagem = null;

  document.getElementById("input-item-arquivo").value = "";

  const nome = document.getElementById("nome-arquivo-imagem");

  nome.hidden = true;
  nome.textContent = "";

  document.getElementById("input-item-imagem").disabled = false;
}

function aoEscolherArquivo() {
  const input = document.getElementById("input-item-arquivo");
  const arquivo = input.files[0] || null;

  if (!arquivo) {
    limparArquivoImagem();
    return;
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(arquivo.type)) {
    ctx.toast("Formato inválido (use jpg, png ou webp).", "erro");
    input.value = "";
    return;
  }

  if (arquivo.size > 5 * 1024 * 1024) {
    ctx.toast("Imagem acima de 5 MB.", "erro");
    input.value = "";
    return;
  }

  arquivoImagem = arquivo;

  const nome = document.getElementById("nome-arquivo-imagem");

  nome.textContent = arquivo.name;
  nome.hidden = false;

  document.getElementById("input-item-imagem").disabled = true;
}

function abrirFormulario(item) {
  itemEmEdicao = item;

  limparArquivoImagem();

  const ehAdicional = Boolean(item?.aplica_em?.length);

  document.getElementById("form-item").hidden = false;

  document.getElementById("form-item-titulo").textContent = item
    ? "Editar item"
    : "Novo item";

  document.getElementById("input-item-nome").value = item ? item.nome : "";

  document.getElementById("input-item-desc").value = item
    ? item.descricao || ""
    : "";

  document.getElementById("input-item-preco").value = item
    ? String(item.preco).replace(".", ",")
    : "";

  document.getElementById("campo-item-categoria").hidden = ehAdicional;

  document.getElementById("input-item-categoria").value =
    !ehAdicional && item ? item.categoria || "" : "";

  document.getElementById("input-item-imagem").value = item
    ? item.imagem || ""
    : "";

  document.getElementById("input-item-disponivel").checked = item
    ? item.disponivel
    : true;

  document.getElementById("input-item-e-adicional").checked = ehAdicional;

  renderizarSecaoAdicionais(item);
  renderizarSecaoAplicaEm(ehAdicional, item);
  esconderErroForm();

  document.getElementById("input-item-nome").focus();
}

function fecharFormulario() {
  itemEmEdicao = null;

  document.getElementById("form-item").hidden = true;
  document.getElementById("form-item").reset();

  limparArquivoImagem();

  renderizarSecaoAdicionais(null);
  renderizarSecaoAplicaEm(false);
  esconderErroForm();
}

// ── Adicionais no formulário ──

function renderizarSecaoAdicionais(item) {
  const secao = document.getElementById("secao-adicionais");
  const lista = document.getElementById("lista-adicionais-form");
  const vazio = document.getElementById("vazio-adicionais-form");

  const editandoBase = Boolean(item && !item.aplica_em?.length);

  secao.hidden = !editandoBase;

  if (!editandoBase) {
    lista.innerHTML = "";
    return;
  }

  lista.innerHTML = "";

  const adicionais = ctx.store.itens.filter((a) =>
    a.aplica_em?.includes(item.id),
  );

  vazio.hidden = adicionais.length > 0;

  for (const ad of adicionais) {
    const li = document.createElement("li");

    li.className = "adicial-form";
    li.dataset.id = String(ad.id);

    const info = document.createElement("span");

    info.className = "adicial-form-info";
    info.textContent = `${ad.nome} · ${formatarBRL(ad.preco)}`;

    const remover = document.createElement("button");

    remover.type = "button";
    remover.className = "btn-icone btn-icone-rejeitar";
    remover.dataset.acao = "remover";
    remover.dataset.id = String(ad.id);
    remover.title = `Remover ${ad.nome}`;
    remover.setAttribute("aria-label", `Remover ${ad.nome}`);
    remover.innerHTML = SVG_X;

    li.append(info, criarToggle(ad), remover);

    lista.appendChild(li);
  }
}

async function adicionarAdicional() {
  if (!itemEmEdicao) return;

  const nome = document.getElementById("input-adicional-nome").value.trim();

  const preco = normalizarPreco(
    document.getElementById("input-adicional-preco").value,
  );

  if (!nome) {
    mostrarErroForm("Informe o nome do adicional.", "input-adicional-nome");
    return;
  }

  if (preco == null) {
    mostrarErroForm(
      "Informe um preço válido para o adicional (ex.: 2,00).",
      "input-adicional-preco",
    );
    return;
  }

  const botao = document.getElementById("btn-add-adicional");

  botao.disabled = true;

  try {
    const criado = await apiPost("/itens", {
      nome,
      descricao: null,
      preco,
      disponivel: true,
      imagem: null,
      categoria: null,
      aplica_em: [itemEmEdicao.id],
    });

    ctx.store.itens = [...ctx.store.itens, criado];

    document.getElementById("input-adicional-nome").value = "";
    document.getElementById("input-adicional-preco").value = "";

    esconderErroForm();
    renderizarSecaoAdicionais(itemEmEdicao);
    renderizar();

    ctx.toast("Adicional criado.", "sucesso");
  } catch (e) {
    tratarErro(e);
  } finally {
    botao.disabled = false;
  }
}

// ── "Aplica em" no formulário ──

function renderizarSecaoAplicaEm(ehAdicional, itemExclusao = null) {
  const secao = document.getElementById("secao-aplica-em");
  const lista = document.getElementById("lista-aplica-em");

  secao.hidden = !ehAdicional;

  if (!ehAdicional) {
    lista.innerHTML = "";
    return;
  }

  lista.innerHTML = "";

  const aplicamEm = itemExclusao?.aplica_em ?? [];

  for (const base of ctx.store.itens.filter(
    (i) => i.id !== itemExclusao?.id && !i.aplica_em?.length,
  )) {
    const linha = document.createElement("label");

    linha.className = "linha-check";

    const cb = document.createElement("input");

    cb.type = "checkbox";
    cb.checked = aplicamEm.includes(base.id);
    cb.dataset.id = String(base.id);

    const nome = document.createElement("span");

    nome.textContent = base.nome;

    linha.append(cb, nome);
    lista.appendChild(linha);
  }
}

// ── Erros do formulário ──

function mostrarErroForm(mensagem, inputId = null) {
  const erro = document.getElementById("erro-item-form");

  erro.textContent = mensagem;
  erro.hidden = false;

  for (const id of ["input-item-nome", "input-item-preco"]) {
    document.getElementById(id).removeAttribute("aria-invalid");
  }

  if (inputId) {
    document.getElementById(inputId).setAttribute("aria-invalid", "true");
  }
}

function esconderErroForm() {
  document.getElementById("erro-item-form").hidden = true;

  for (const id of ["input-item-nome", "input-item-preco"]) {
    document.getElementById(id).removeAttribute("aria-invalid");
  }
}

// ── Salvar item ──

async function aoSalvar(evento) {
  evento.preventDefault();

  const nome = document.getElementById("input-item-nome").value.trim();

  const preco = normalizarPreco(
    document.getElementById("input-item-preco").value,
  );

  if (!nome) {
    mostrarErroForm("Informe o nome do item.", "input-item-nome");
    return;
  }

  if (preco == null) {
    mostrarErroForm(
      "Informe um preço válido (ex.: 15,50).",
      "input-item-preco",
    );
    return;
  }

  const ehAdicional = document.getElementById("input-item-e-adicional").checked;

  let aplicaEm = null;

  if (ehAdicional) {
    aplicaEm = [
      ...document.querySelectorAll("#lista-aplica-em input:checked"),
    ].map((cb) => Number(cb.dataset.id));

    if (!aplicaEm.length) {
      mostrarErroForm(
        "Um adicional precisa de pelo menos um item-base. Para tirar do cardápio, remova o item.",
      );
      return;
    }
  }

  // Upload da imagem, se houver arquivo escolhido.

  let imagem =
    document.getElementById("input-item-imagem").value.trim() || null;

  const botao = document.getElementById("btn-salvar-item");

  if (arquivoImagem) {
    botao.disabled = true;
    botao.textContent = "Enviando…";

    try {
      imagem = await apiUploadImagem(arquivoImagem);
    } catch (e) {
      botao.disabled = false;
      botao.textContent = "Salvar";

      tratarErro(e);
      mostrarErroForm("Falha ao enviar a imagem.");

      return;
    }
  }

  const corpo = {
    nome,
    descricao: document.getElementById("input-item-desc").value.trim() || null,
    preco,
    disponivel: document.getElementById("input-item-disponivel").checked,
    imagem,
    categoria: ehAdicional
      ? null
      : document.getElementById("input-item-categoria").value.trim() || null,
    aplica_em: aplicaEm,
  };

  botao.disabled = true;

  try {
    if (itemEmEdicao) {
      const atualizado = await apiPut(`/itens/${itemEmEdicao.id}`, corpo);

      const idx = ctx.store.itens.findIndex((i) => i.id === atualizado.id);

      if (idx >= 0) {
        ctx.store.itens[idx] = atualizado;
      }
    } else {
      const criado = await apiPost("/itens", corpo);

      ctx.store.itens = [...ctx.store.itens, criado];
    }

    fecharFormulario();

    ctx.toast("Item salvo.", "sucesso");

    renderizar();
  } catch (e) {
    tratarErro(e);
    mostrarErroForm("Falha ao salvar o item.");
  } finally {
    botao.disabled = false;
    botao.textContent = "Salvar";
  }
}
