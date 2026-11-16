// Wrapper de fetch para a API do backend + motor do MODO_DEMO.
// Todo request real leva o header X-API-Key.
// No MODO_DEMO as rotas são atendidas localmente (mesmos formatos do
// backend) e um "cliente" simulado cria pedidos e declara pagamento —
// ele NUNCA marca PAGO/PRONTO/ENTREGUE: isso é trabalho do atendente.

import { CONFIG } from "./config.js";
import { transicaoStatusValida, gerarSenhaDemo } from "./state.js";

export class ErroApi extends Error {
  constructor(mensagem, status = 0) {
    super(mensagem);
    this.name = "ErroApi";
    this.status = status;
  }
}

function cabecalhos() {
  return {
    "X-API-Key": CONFIG.API_KEY,
    "Content-Type": "application/json"
  };
}

async function requisitar(caminho, opcoes = {}) {
  if (CONFIG.MODO_DEMO) {
    return demoAtender(caminho, opcoes.method || "GET", opcoes.corpo);
  }
  const resposta = await fetch(`${CONFIG.API_BASE}${caminho}`, {
    headers: cabecalhos(),
    ...opcoes
  });
  if (!resposta.ok) {
    let detalhe = `Erro ${resposta.status}`;
    try {
      const corpo = await resposta.json();
      if (corpo && corpo.detail) detalhe = corpo.detail;
    } catch {
      // corpo não-JSON
    }
    throw new ErroApi(detalhe, resposta.status);
  }
  if (resposta.status === 204) return null;
  return resposta.json();
}

export const apiGet = (caminho) => requisitar(caminho, { method: "GET" });
export const apiPost = (caminho, corpo) =>
  requisitar(caminho, { method: "POST", corpo, body: JSON.stringify(corpo ?? {}) });
export const apiPut = (caminho, corpo) =>
  requisitar(caminho, { method: "PUT", corpo, body: JSON.stringify(corpo ?? {}) });
export const apiPatch = (caminho, corpo) =>
  requisitar(caminho, { method: "PATCH", corpo, body: JSON.stringify(corpo ?? {}) });
export const apiDelete = (caminho) => requisitar(caminho, { method: "DELETE" });

// Upload direto para a R2: o backend assina um PUT (presigned URL, 15 min)
// e o arquivo vai do browser direto para a Cloudflare — nunca pelo backend.
export async function apiUploadImagem(arquivo) {
  const auth = await apiPost("/itens/imagem/autorizacao", {
    nome: arquivo.name,
    tipo: arquivo.type,
    tamanho: arquivo.size
  });
  if (auth.uploadUrl) {
    // o Content-Type precisa ser o MESMO que foi assinado (a R2 confere)
    const resposta = await fetch(auth.uploadUrl, {
      method: "PUT",
      body: arquivo,
      headers: { "Content-Type": auth.contentType }
    });
    if (!resposta.ok) {
      throw new ErroApi(`Falha no upload da imagem (${resposta.status})`, resposta.status);
    }
  }
  return auth.url;
}

// ────────────────────────────────────────────────────────────────
// MODO DEMO — simula o backend + um cliente simulado
// ────────────────────────────────────────────────────────────────
// Limitação conhecida: NÃO simula a rotação por timeout da fila do painel
// (10 min no backend) — irrelevante para a UI do admin, e o estado do demo
// é inspecionado pelo atendente em tempo real.

const DEMO_STORAGE_KEY = "pwa_admin_demo";

const DEMO_ITENS_SEED = [
  { id: 1, nome: "X-Burger", descricao: "Pão brioche, hambúrguer 150g, queijo e molho da casa.", preco: 15.0, disponivel: true, imagem: null, categoria: "Lanches" },
  { id: 2, nome: "X-Salada", descricao: "Pão brioche, hambúrguer 150g, queijo, alface e tomate.", preco: 16.0, disponivel: true, imagem: null, categoria: "Lanches" },
  { id: 3, nome: "Refrigerante", descricao: "Lata 350ml.", preco: 6.0, disponivel: true, imagem: null, categoria: "Bebidas" },
  { id: 4, nome: "Batata Frita", descricao: "Porção média.", preco: 10.0, disponivel: true, imagem: null, categoria: "Acompanhamentos" },
  { id: 5, nome: "Milkshake", descricao: "Chocolate, morango ou baunilha (500ml).", preco: 12.0, disponivel: true, imagem: null, categoria: "Sobremesas" },
  // Adicionais não têm categoria (idem backend)
  { id: 6, nome: "Queijo extra", descricao: "Porção extra de queijo (serve no X-Burger).", preco: 2.0, disponivel: true, imagem: null, categoria: null, aplica_em: [1] },
  { id: 7, nome: "Carne extra 50g", descricao: "Hambúrguer extra de 50g (serve no X-Burger).", preco: 5.0, disponivel: true, imagem: null, categoria: null, aplica_em: [1] }
];

// Nomes/itens dos pedidos do "cliente" simulado: determinísticos por índice.
const DEMO_NOMES_CLIENTE = ["Rafael", "Bia", "Léo", "Duda", "Marcelo", "Tati"];
const DEMO_OBS_CLIENTE = [null, "Sem cebola, por favor", null, "Trocando a mostarda por ketchup", null, "Sem pimenta"];

let demo = null;
let demoImgSeq = 1;

// Eventos que o "backend" demo emite (o ws.js se assina no MODO_DEMO).
const demoOuvintes = new Set();

export function onDemoEvento(fn) {
  demoOuvintes.add(fn);
  return () => demoOuvintes.delete(fn);
}

function emitDemoEvento(evento, data) {
  for (const fn of demoOuvintes) {
    try {
      fn(evento, data);
    } catch {
      // um ouvinte com erro não derruba o demo
    }
  }
}

// ── Persistência (sessionStorage — sobrevive a F5, como no demo do cliente) ──

function demoPersistir() {
  if (typeof window === "undefined" || !demo) return;
  try {
    window.sessionStorage.setItem(
      DEMO_STORAGE_KEY,
      JSON.stringify({
        proximoId: demo.proximoId,
        proximoNumero: demo.proximoNumero,
        proximoItemId: demo.proximoItemId,
        proximoClienteEm: demo.proximoClienteEm,
        clienteIdx: demo.clienteIdx,
        itens: demo.itens,
        pedidos: Object.fromEntries(demo.pedidos)
      })
    );
  } catch {
    // storage indisponível: segue só em memória
  }
}

function demoRestaurar() {
  if (typeof window === "undefined") return null;
  try {
    const bruto = window.sessionStorage.getItem(DEMO_STORAGE_KEY);
    if (!bruto) return null;
    const serial = JSON.parse(bruto);
    return {
      proximoId: Number(serial.proximoId) || 1,
      proximoNumero: Number(serial.proximoNumero) || 101,
      proximoItemId: Number(serial.proximoItemId) || 1,
      proximoClienteEm: Number(serial.proximoClienteEm) || Date.now(),
      clienteIdx: Number(serial.clienteIdx) || 0,
      itens: Array.isArray(serial.itens) ? serial.itens : [],
      // chaves viram string no JSON: devolve para número
      pedidos: new Map(Object.entries(serial.pedidos || {}).map(([id, p]) => [Number(id), p]))
    };
  } catch {
    return null;
  }
}

// Seed: 5 itens (idem cliente) + 5 pedidos cobrindo as 4 seções.
function demoSeed() {
  const agora = Date.now();
  const pedidos = new Map([
    [
      1,
      {
        id: 1, numero: null, senha_retirada: null, nome_cliente: "João", horario_agendamento: null,
        status: "PENDENTE", origem: "PWA_CLIENTE", total: 36,
        itens: [{ item_id: 1, quantidade: 2 }, { item_id: 3, quantidade: 1 }],
        pagamento_declarado_em: null,
        criadoEm: agora - 60000, confirmadoEm: null, painel_status: null, painel_fila_posicao: null
      }
    ],
    [
      2,
      {
        // já com declaração: o destaque âmbar aparece logo no boot do demo
        id: 2, numero: null, senha_retirada: null, nome_cliente: "Maria", horario_agendamento: null,
        status: "CONFIRMADO", origem: "PWA_CLIENTE", total: 22,
        itens: [{ item_id: 2, quantidade: 1 }, { item_id: 3, quantidade: 1 }],
        pagamento_declarado_em: new Date(agora - 120000).toISOString(),
        criadoEm: agora - 300000, confirmadoEm: agora - 180000, painel_status: null, painel_fila_posicao: null
      }
    ],
    [
      3,
      {
        id: 3, numero: 103, senha_retirada: "K7PQ", nome_cliente: "Pedro", horario_agendamento: null,
        status: "PAGO", origem: "PWA_CLIENTE", total: 26,
        itens: [{ item_id: 1, quantidade: 1 }, { item_id: 4, quantidade: 1 }],
        pagamento_declarado_em: null,
        criadoEm: agora - 900000, confirmadoEm: agora - 840000, painel_status: null, painel_fila_posicao: null
      }
    ],
    [
      4,
      {
        id: 4, numero: 104, senha_retirada: "M4TR", nome_cliente: "Ana", horario_agendamento: null,
        status: "PRONTO", origem: "PWA_CLIENTE", total: 18,
        itens: [{ item_id: 3, quantidade: 1 }, { item_id: 5, quantidade: 1 }],
        pagamento_declarado_em: null,
        criadoEm: agora - 1200000, confirmadoEm: agora - 1140000,
        painel_status: "EXIBINDO", painel_fila_posicao: null
      }
    ],
    [
      5,
      {
        id: 5, numero: 105, senha_retirada: "H9XZ", nome_cliente: "Caio", horario_agendamento: null,
        status: "PRONTO", origem: "PWA_CLIENTE", total: 32,
        itens: [{ item_id: 2, quantidade: 2 }],
        pagamento_declarado_em: null,
        criadoEm: agora - 1500000, confirmadoEm: agora - 1440000,
        painel_status: "AGUARDANDO", painel_fila_posicao: 1
      }
    ]
  ]);
  return {
    proximoId: 6,
    proximoNumero: 106,
    proximoItemId: 8,
    proximoClienteEm: agora + CONFIG.DEMO_NOVO_PEDIDO_MS,
    clienteIdx: 0,
    itens: DEMO_ITENS_SEED.map((item) => ({ ...item })),
    pedidos
  };
}

function demoEstado() {
  if (!demo) {
    demo = demoRestaurar() || demoSeed();
  }
  return demo;
}

// Hook de teste: zera o estado do demo (memória + storage).
export function _demoReset() {
  demo = null;
  demoImgSeq = 1;
  try {
    window.sessionStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    // sem window (Node) ou storage indisponível
  }
}

// Hook de teste: simula um novo carregamento da página (só a memória some,
// o sessionStorage permanece — é o que acontece no F5).
export function _demoRecarregar() {
  demo = null;
}

function demoPedido(id) {
  const pedido = demoEstado().pedidos.get(Number(id));
  if (!pedido) throw new ErroApi("Pedido não encontrado", 404);
  return pedido;
}

// Resposta no formato do PedidoResponse do backend: SEM painel_status/
// painel_fila_posicao (o backend real também não expõe).
function resumo(p) {
  return {
    id: p.id,
    numero: p.numero ?? null,
    senha_retirada: p.senha_retirada ?? null,
    nome_cliente: p.nome_cliente ?? null,
    observacao: p.observacao ?? null,
    horario_agendamento: p.horario_agendamento ?? null,
    status: p.status,
    origem: p.origem,
    total: p.total,
    // adicionais: null em linhas antigas (idem backend), lista quando há
    itens: (p.itens || []).map((i) => ({
      ...i,
      adicionais: i.adicionais ? i.adicionais.map((a) => ({ ...a })) : null
    })),
    pagamento_declarado_em: p.pagamento_declarado_em ?? null
  };
}

// Fila do painel: maior posição + 1 (quem entra recebe o fim da fila).
function proximaPosicaoFila(estado) {
  const posicoes = [...estado.pedidos.values()]
    .filter((p) => p.status === "PRONTO" && (p.painel_status === "AGUARDANDO" || p.painel_status === null))
    .map((p) => p.painel_fila_posicao)
    .filter((v) => v != null);
  return posicoes.length ? Math.max(...posicoes) + 1 : 1;
}

function pedidoExibindo(estado) {
  return [...estado.pedidos.values()].find((p) => p.status === "PRONTO" && p.painel_status === "EXIBINDO");
}

function promoverProximoFila(estado) {
  const proximo = [...estado.pedidos.values()]
    .filter((p) => p.status === "PRONTO" && (p.painel_status === "AGUARDANDO" || p.painel_status === null))
    .sort((a, b) => (a.painel_fila_posicao ?? Infinity) - (b.painel_fila_posicao ?? Infinity) || a.numero - b.numero)[0];
  if (!proximo) return null;
  proximo.painel_status = "EXIBINDO";
  proximo.painel_fila_posicao = null;
  return proximo;
}

// Cliente simulado (lazy, sem timer real): roda a cada demoAtender e aplica
// tudo o que já "deveria ter acontecido" — mesmo padrão do criadoEm do demo
// do cliente. O browser ganha cadência real via _demoTick() (ws.js).
function demoClienteSimulado(estado) {
  const agora = Date.now();

  while (agora >= estado.proximoClienteEm) {
    // Adicionais não são itens de compra (idem pwa-cliente real): o
    // "cliente" só os escolhe junto de um item-base.
    const disponiveis = estado.itens.filter((i) => i.disponivel && !i.aplica_em?.length);
    if (disponiveis.length) {
      const item = disponiveis[estado.clienteIdx % disponiveis.length];
      const quantidade = (estado.clienteIdx % 2) + 1;
      // Determinístico: a cada 3 pedidos o cliente leva os adicionais
      // disponíveis do item (qtd 1 de cada)
      const adicionaisDoItem = estado.itens.filter(
        (a) => a.disponivel && a.aplica_em?.includes(item.id)
      );
      const adicionais =
        estado.clienteIdx % 3 === 0 && adicionaisDoItem.length
          ? adicionaisDoItem.map((a) => ({ item_id: a.id, quantidade: 1 }))
          : [];
      const total =
        item.preco * quantidade +
        adicionais.reduce((soma, ad) => {
          const adItem = estado.itens.find((a) => a.id === ad.item_id);
          return soma + (adItem ? adItem.preco * ad.quantidade : 0);
        }, 0);
      const pedido = {
        // próximo id por vez: sem o ++, o 2º pedido simulado sobrescrevia o 1º (mesmo id)
        id: estado.proximoId++,
        numero: null,
        senha_retirada: null,
        nome_cliente: DEMO_NOMES_CLIENTE[estado.clienteIdx % DEMO_NOMES_CLIENTE.length],
        observacao: DEMO_OBS_CLIENTE[estado.clienteIdx % DEMO_OBS_CLIENTE.length],
        horario_agendamento: null,
        status: "PENDENTE",
        origem: "PWA_CLIENTE",
        total,
        itens: [{ item_id: item.id, quantidade, adicionais }],
        pagamento_declarado_em: null,
        criadoEm: estado.proximoClienteEm,
        confirmadoEm: null,
        painel_status: null,
        painel_fila_posicao: null
      };
      estado.pedidos.set(pedido.id, pedido);
      emitDemoEvento("novo_pedido", { pedido_id: pedido.id, status: pedido.status });
    }
    estado.clienteIdx++;
    estado.proximoClienteEm += CONFIG.DEMO_NOVO_PEDIDO_MS;
  }

  for (const pedido of estado.pedidos.values()) {
    if (
      pedido.status === "CONFIRMADO" &&
      pedido.confirmadoEm != null &&
      !pedido.pagamento_declarado_em &&
      agora >= pedido.confirmadoEm + CONFIG.DEMO_DECLARA_MS
    ) {
      pedido.pagamento_declarado_em = new Date(agora).toISOString();
      emitDemoEvento("pagamento_declarado", { pedido_id: pedido.id });
    }
  }
}

function demoAtender(caminho, metodo, corpo) {
  const estado = demoEstado();
  const partes = caminho.split("/").filter(Boolean);

  demoClienteSimulado(estado);
  demoPersistir();

  // GET /health
  if (metodo === "GET" && caminho === "/health") return Promise.resolve({ status: "ok" });

  // GET /itens
  if (metodo === "GET" && caminho === "/itens") {
    return Promise.resolve(estado.itens.map((item) => ({ ...item })));
  }

  // POST /itens
  if (metodo === "POST" && caminho === "/itens") {
    const id = estado.proximoItemId++;
    const item = {
      id,
      nome: corpo.nome,
      descricao: corpo.descricao ?? null,
      preco: Number(corpo.preco),
      disponivel: corpo.disponivel !== false,
      imagem: corpo.imagem ?? null,
      categoria: corpo.categoria ?? null,
      aplica_em: corpo.aplica_em ?? null
    };
    estado.itens.push(item);
    demoPersistir();
    return Promise.resolve({ ...item });
  }

  // PUT /itens/{id}
  if (metodo === "PUT" && partes[0] === "itens" && partes.length === 2) {
    const item = estado.itens.find((i) => i.id === Number(partes[1]));
    if (!item) throw new ErroApi("Item não encontrado", 404);
    // espelha o backend: adicional nunca fica sem item-base
    if (item.aplica_em?.length && !(corpo.aplica_em ?? null)) {
      throw new ErroApi("Adicional precisa de pelo menos um item-base — para tirar do cardápio, remova o item", 400);
    }
    item.nome = corpo.nome;
    item.descricao = corpo.descricao ?? null;
    item.preco = Number(corpo.preco);
    item.disponivel = corpo.disponivel !== false;
    item.imagem = corpo.imagem ?? null;
    item.categoria = corpo.categoria ?? null;
    item.aplica_em = corpo.aplica_em ?? null;
    demoPersistir();
    return Promise.resolve({ ...item });
  }

  // DELETE /itens/{id}
  if (metodo === "DELETE" && partes[0] === "itens" && partes.length === 2) {
    const id = Number(partes[1]);
    const item = estado.itens.find((i) => i.id === id);
    if (!item) throw new ErroApi("Item não encontrado", 404);
    // FK do backend: item presente em qualquer pedido → 500
    const emPedido = [...estado.pedidos.values()].some((p) => (p.itens || []).some((pi) => pi.item_id === id));
    if (emPedido) {
      throw new ErroApi(`Item '${item.nome}' está presente em pedidos e não pode ser removido. Use Desativar.`, 500);
    }
    // espelha o backend: desvincula o id dos adicionais; se era o ÚNICO
    // item-base de um deles, o adicional é removido junto
    estado.itens = estado.itens
      .filter((i) => i.id !== id)
      .flatMap((i) => {
        if (!i.aplica_em?.includes(id)) return [i];
        const restantes = i.aplica_em.filter((x) => x !== id);
        return restantes.length ? [{ ...i, aplica_em: restantes }] : [];
      });
    demoPersistir();
    return Promise.resolve(null);
  }

  // POST /itens/imagem/autorizacao (demo: URL falsa — não existe R2 no demo;
  // o browser não faz o PUT de verdade: uploadUrl vem null)
  if (metodo === "POST" && caminho === "/itens/imagem/autorizacao") {
    const seq = demoImgSeq++;
    return Promise.resolve({
      chave: `imagem-demo-${seq}`,
      url: `https://lutzgrill-demo.local/imagens/imagem-demo-${seq}.png`,
      uploadUrl: null,
      contentType: "image/png"
    });
  }

  // GET /pedidos
  if (metodo === "GET" && caminho === "/pedidos") {
    return Promise.resolve([...estado.pedidos.values()].sort((a, b) => b.id - a.id).map(resumo));
  }

  // GET /pedidos/fila-painel
  if (metodo === "GET" && caminho === "/pedidos/fila-painel") {
    const fila = [...estado.pedidos.values()]
      .filter((p) => p.status === "PRONTO" && p.origem === "PWA_CLIENTE" && (p.painel_status === "AGUARDANDO" || p.painel_status === null))
      .sort((a, b) => (a.painel_fila_posicao ?? Infinity) - (b.painel_fila_posicao ?? Infinity) || a.numero - b.numero)
      .map(resumo);
    return Promise.resolve(fila);
  }

  // GET /pedidos/{id}
  if (metodo === "GET" && partes[0] === "pedidos" && partes.length === 2) {
    return Promise.resolve(resumo(demoPedido(partes[1])));
  }

  // PATCH /pedidos/{id}/status
  if (metodo === "PATCH" && partes[0] === "pedidos" && partes[2] === "status") {
    const pedido = demoPedido(partes[1]);
    const novo = String(corpo.novo_status || "").toUpperCase();
    if (!transicaoStatusValida(pedido.status, novo)) {
      throw new ErroApi(`Transição inválida: ${pedido.status} → ${novo}`, 400);
    }
    pedido.status = novo;

    if (novo === "CONFIRMADO") {
      pedido.confirmadoEm = Date.now(); // o cliente simulado declara a partir daqui
    }

    if (novo === "PAGO") {
      // numero sequencial + senha (mesma regra do backend) e limpa a declaração
      if (pedido.numero == null) pedido.numero = estado.proximoNumero++;
      if (pedido.senha_retirada == null) pedido.senha_retirada = gerarSenhaDemo();
      pedido.pagamento_declarado_em = null;
    }

    if (novo === "PRONTO") {
      // entra na fila do painel; vira EXIBINDO se o painel estiver livre
      if (pedidoExibindo(estado) == null) {
        pedido.painel_status = "EXIBINDO";
        pedido.painel_fila_posicao = null;
      } else {
        pedido.painel_status = "AGUARDANDO";
        pedido.painel_fila_posicao = proximaPosicaoFila(estado);
      }
    }

    if (novo === "ENTREGUE") {
      const estavaExibindo = pedido.painel_status === "EXIBINDO";
      pedido.painel_status = "ENTREGUE";
      pedido.painel_fila_posicao = null;
      if (estavaExibindo) promoverProximoFila(estado);
    }

    demoPersistir();
    // o backend real broadcasteia o evento também para o próprio dispositivo
    emitDemoEvento("status_atualizado", { pedido_id: pedido.id, status: pedido.status, numero: pedido.numero });
    return Promise.resolve(resumo(pedido));
  }

  return Promise.reject(new ErroApi(`Rota do demo não implementada: ${metodo} ${caminho}`, 500));
}

// Cadência real no browser: chama o simulado a cada 5 s (só no MODO_DEMO,
// iniciado pelo ws.js). Sem timer em Node — os testes avançam o tempo
// chamando qualquer rota após esperar().
export function _demoTick() {
  if (!CONFIG.MODO_DEMO) return;
  const estado = demoEstado();
  demoClienteSimulado(estado);
  demoPersistir();
}
