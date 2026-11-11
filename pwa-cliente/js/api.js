// Wrapper de fetch para a API do backend + motor do MODO_DEMO.
// Todo request real leva o header X-API-Key.
// No MODO_DEMO as rotas são atendidas localmente (mesmos formatos),
// permitindo testar o fluxo inteiro sem backend.

import { CONFIG } from "./config.js";
import { gerarSenhaDemo, qrDemoDataUri } from "./pix.js";

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
export const apiPatch = (caminho, corpo) =>
  requisitar(caminho, { method: "PATCH", corpo, body: JSON.stringify(corpo ?? {}) });

// ────────────────────────────────────────────────────────────────
// MODO DEMO — simula o backend (itens, pedido, Pix manual, PAGO)
// ────────────────────────────────────────────────────────────────

const DEMO_ITENS = [
  { id: 1, nome: "X-Burger", descricao: "Pão brioche, hambúrguer 150g, queijo e molho da casa.", preco: 15.0, disponivel: true, imagem: null, categoria: "Lanches" },
  { id: 2, nome: "X-Salada", descricao: "Pão brioche, hambúrguer 150g, queijo, alface e tomate.", preco: 16.0, disponivel: true, imagem: null, categoria: "Lanches" },
  { id: 3, nome: "Refrigerante", descricao: "Lata 350ml.", preco: 6.0, disponivel: true, imagem: null, categoria: "Bebidas" },
  { id: 4, nome: "Batata Frita", descricao: "Porção média.", preco: 10.0, disponivel: true, imagem: null, categoria: "Acompanhamentos" },
  { id: 5, nome: "Milkshake", descricao: "Chocolate, morango ou baunilha (500ml).", preco: 12.0, disponivel: true, imagem: null, categoria: "Sobremesas" }
];

const DEMO_STORAGE_KEY = "pwa_demo_estado";

let demo = null;

// O estado do demo é persistido no sessionStorage para sobreviver a
// recarregamentos da página (a sessão do cliente também persiste, então o
// pedido precisa continuar existindo do lado da "loja").
function demoPersistir() {
  if (typeof window === "undefined" || !demo) return;
  try {
    window.sessionStorage.setItem(
      DEMO_STORAGE_KEY,
      JSON.stringify({
        proximoId: demo.proximoId,
        proximoNumero: demo.proximoNumero,
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
      // chaves viram string no JSON: devolve para número
      pedidos: new Map(Object.entries(serial.pedidos || {}).map(([id, p]) => [Number(id), p]))
    };
  } catch {
    return null;
  }
}

// Hook de teste: zera o estado do demo (memória + storage).
export function _demoReset() {
  demo = null;
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

function demoEstado() {
  if (!demo) {
    demo = demoRestaurar() || { proximoId: 1, proximoNumero: 101, pedidos: new Map() };
  }
  return demo;
}

function demoPedido(id) {
  const pedido = demoEstado().pedidos.get(Number(id));
  if (!pedido) throw new ErroApi("Pedido não encontrado", 404);
  return pedido;
}

function demoAtender(caminho, metodo, corpo) {
  const estado = demoEstado();
  const partes = caminho.split("/").filter(Boolean);

  // GET /health
  if (metodo === "GET" && caminho === "/health") return Promise.resolve({ status: "ok" });

  // GET /itens
  if (metodo === "GET" && caminho === "/itens") {
    return Promise.resolve(DEMO_ITENS.map((item) => ({ ...item })));
  }

  // POST /pedidos
  if (metodo === "POST" && caminho === "/pedidos") {
    let total = 0;
    for (const pi of corpo.itens) {
      const item = DEMO_ITENS.find((i) => i.id === pi.item_id);
      if (!item) throw new ErroApi(`Item ${pi.item_id} não encontrado`, 400);
      total += item.preco * pi.quantidade;
    }
    const id = estado.proximoId++;
    const pedido = {
      id,
      numero: null,
      senha_retirada: null,
      nome_cliente: corpo.nome_cliente || null,
      horario_agendamento: corpo.horario_agendamento || null,
      status: "PENDENTE",
      origem: "PWA",
      total,
      itens: corpo.itens,
      criadoEm: Date.now(),
      pagamentoCriadoEm: null
    };
    estado.pedidos.set(id, pedido);
    demoPersistir();
    return Promise.resolve({ ...pedido });
  }

  // GET /pedidos/{id}
  if (metodo === "GET" && partes[0] === "pedidos" && partes.length === 2) {
    const pedido = demoPedido(partes[1]);
    // A "loja" do demo confirma o pedido sozinha após DEMO_CONFIRMAR_MS.
    if (pedido.status === "PENDENTE" && Date.now() - pedido.criadoEm >= CONFIG.DEMO_CONFIRMAR_MS) {
      pedido.status = "CONFIRMADO";
      demoPersistir();
    }
    return Promise.resolve({ ...pedido });
  }

  // POST /pedidos/{id}/pagamento
  if (metodo === "POST" && partes[0] === "pedidos" && partes[2] === "pagamento") {
    const pedido = demoPedido(partes[1]);
    if (pedido.status === "PAGO") throw new ErroApi("Pagamento já foi feito", 409);
    if (pedido.status !== "CONFIRMADO") {
      throw new ErroApi(`Pagamento só pode ser gerado para pedidos CONFIRMADO (status atual: ${pedido.status})`, 409);
    }
    const codigo = `000201PIX-DEMO-PED${pedido.id}-${Number(pedido.total).toFixed(2)}`;
    pedido.pagamentoCriadoEm = Date.now();
    demoPersistir();
    return Promise.resolve({
      qr_code: codigo,
      qr_code_base64: qrDemoDataUri(pedido.total),
      copia_cola: codigo,
      expira_em: new Date(Date.now() + CONFIG.PIX_TIMEOUT_MS).toISOString()
    });
  }

  // GET /pedidos/{id}/pagamento
  if (metodo === "GET" && partes[0] === "pedidos" && partes[2] === "pagamento") {
    const pedido = demoPedido(partes[1]);
    if (pedido.status === "PAGO") return Promise.resolve({ status: "APROVADO" });
    if (pedido.pagamentoCriadoEm && Date.now() - pedido.pagamentoCriadoEm >= CONFIG.MODO_DEMO_APROVA_MS) {
      // O Pix "caiu": vira PAGO com número sequencial + senha de retirada.
      pedido.status = "PAGO";
      pedido.numero = estado.proximoNumero++;
      pedido.senha_retirada = gerarSenhaDemo();
      demoPersistir();
      return Promise.resolve({ status: "APROVADO" });
    }
    return Promise.resolve({ status: "PENDENTE" });
  }

  // POST /pedidos/{id}/declarar-pagamento
  if (metodo === "POST" && partes[0] === "pedidos" && partes[2] === "declarar-pagamento") {
    const pedido = demoPedido(partes[1]);
    const quando = new Date().toISOString();
    return Promise.resolve({ status: "OK", pedido_id: pedido.id, pagamento_declarado_em: quando });
  }

  return Promise.reject(new ErroApi(`Rota do demo não implementada: ${metodo} ${caminho}`, 500));
}
