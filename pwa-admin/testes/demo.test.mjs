import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../js/config.js";
import {
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  onDemoEvento,
  _demoReset,
  _demoRecarregar,
  ErroApi
} from "../js/api.js";
import { secaoDoPedido, montarFilaPainel, ALFABETO_SENHA } from "../js/state.js";

function mockarWindow(storage) {
  const anterior = globalThis.window;
  globalThis.window = {
    sessionStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k)
    }
  };
  return () => {
    if (anterior === undefined) delete globalThis.window;
    else globalThis.window = anterior;
  };
}

function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

const CLIENTE_DEMO = {
  MODO_DEMO: CONFIG.MODO_DEMO,
  DEMO_NOVO_PEDIDO_MS: CONFIG.DEMO_NOVO_PEDIDO_MS,
  DEMO_DECLARA_MS: CONFIG.DEMO_DECLARA_MS
};

function demoLigar({ novoPedidoMs = 600000, declaraMs = 60000 } = {}) {
  CONFIG.MODO_DEMO = true;
  CONFIG.DEMO_NOVO_PEDIDO_MS = novoPedidoMs;
  CONFIG.DEMO_DECLARA_MS = declaraMs;
  _demoReset();
  return () => {
    CONFIG.MODO_DEMO = CLIENTE_DEMO.MODO_DEMO;
    CONFIG.DEMO_NOVO_PEDIDO_MS = CLIENTE_DEMO.DEMO_NOVO_PEDIDO_MS;
    CONFIG.DEMO_DECLARA_MS = CLIENTE_DEMO.DEMO_DECLARA_MS;
    _demoReset();
  };
}

test("seed: 7 itens (2 deles adicionais) + 5 pedidos cobrindo as 4 seções", async (t) => {
  const desligar = demoLigar();
  t.after(desligar);

  const itens = await apiGet("/itens");
  assert.equal(itens.length, 7);
  // adicionais só aplicam em item-base (nunca em outro adicional)
  for (const ad of itens.filter((i) => i.aplica_em?.length)) {
    for (const alvoId of ad.aplica_em) {
      const alvo = itens.find((i) => i.id === alvoId);
      assert.ok(alvo && !alvo.aplica_em?.length);
    }
  }
  assert.ok(itens.every((i) => i.imagem === null));
  // adicionais não têm categoria; itens-base do seed têm
  assert.ok(itens.filter((i) => i.aplica_em?.length).every((i) => i.categoria === null));
  assert.ok(itens.filter((i) => !i.aplica_em?.length).every((i) => i.categoria));

  const pedidos = await apiGet("/pedidos");
  assert.equal(pedidos.length, 5);
  // GET /pedidos vem em id decrescente
  assert.deepEqual(
    pedidos.map((p) => p.id),
    [5, 4, 3, 2, 1]
  );

  const porSecao = { NOVOS: [], PAGAMENTO: [], PREPARO: [], PAINEL: [] };
  for (const p of pedidos) porSecao[secaoDoPedido(p)].push(p.id);
  const ordem = (ids) => [...ids].sort((a, b) => a - b);
  assert.deepEqual(ordem(porSecao.NOVOS), [1]);
  assert.deepEqual(ordem(porSecao.PAGAMENTO), [2]);
  assert.deepEqual(ordem(porSecao.PREPARO), [3]);
  assert.deepEqual(ordem(porSecao.PAINEL), [4, 5]);

  // id 2 (Maria) já vem com a declaração do cliente
  const maria = pedidos.find((p) => p.id === 2);
  assert.ok(maria.pagamento_declarado_em);

  // respostas não expõem campos de painel (espelha o backend)
  assert.ok(!("painel_status" in maria));
  assert.ok(!("painel_fila_posicao" in maria));

  // derivação da seção PAINEL: Ana EXIBINDO fora da fila, Caio na fila pos 1
  const fila = await apiGet("/pedidos/fila-painel");
  assert.deepEqual(fila.map((p) => p.id), [5]);
  const secao = montarFilaPainel(pedidos, fila);
  assert.equal(secao.length, 2);
  assert.equal(secao[0].pedido.id, 4);
  assert.equal(secao[0].exibindo, true);
  assert.equal(secao[0].posicao, null);
  assert.equal(secao[1].pedido.id, 5);
  assert.equal(secao[1].exibindo, false);
  assert.equal(secao[1].posicao, 1);
});

test("fluxo demo completo: aceitar → declaração → PAGO → PRONTO → ENTREGUE", async (t) => {
  const desligar = demoLigar({ declaraMs: 50 });
  t.after(desligar);

  // 1) atendente aceita o PENDENTE do seed
  const confirmado = await apiPatch("/pedidos/1/status", { novo_status: "CONFIRMADO" });
  assert.equal(confirmado.status, "CONFIRMADO");

  // 2) o cliente simulado declara o pagamento (lazy — avança no próximo request)
  await esperar(80);
  const declarado = await apiGet("/pedidos/1");
  assert.equal(declarado.status, "CONFIRMADO");
  assert.ok(declarado.pagamento_declarado_em);

  // 3) atendente confirma o pagamento: número sequencial + senha, declaração limpa
  const pago = await apiPatch("/pedidos/1/status", { novo_status: "PAGO" });
  assert.equal(pago.status, "PAGO");
  assert.equal(pago.numero, 106); // depois de 103/104/105 do seed
  assert.equal(pago.senha_retirada.length, 4);
  for (const c of pago.senha_retirada) {
    assert.ok(ALFABETO_SENHA.includes(c), `caractere fora do alfabeto: ${c}`);
  }
  assert.equal(pago.pagamento_declarado_em, null);

  // 4) "está pronto": entra na fila atrás do Caio (pos 2), painel segue com a Ana
  const pronto = await apiPatch("/pedidos/1/status", { novo_status: "PRONTO" });
  assert.equal(pronto.status, "PRONTO");
  let fila = await apiGet("/pedidos/fila-painel");
  assert.deepEqual(fila.map((p) => p.id), [5, 1]);
  let secao = montarFilaPainel(await apiGet("/pedidos"), fila);
  assert.deepEqual(
    secao.map((e) => e.pedido.id),
    [4, 5, 1] // Ana exibindo, Caio 1º, João 2º
  );
  assert.equal(secao[2].posicao, 2);

  // 5) atendente entrega o que está EXIBINDO (Ana) → o 1º da fila (Caio) vira exibido
  const entregue = await apiPatch("/pedidos/4/status", { novo_status: "ENTREGUE" });
  assert.equal(entregue.status, "ENTREGUE");
  fila = await apiGet("/pedidos/fila-painel");
  assert.deepEqual(fila.map((p) => p.id), [1]);
  secao = montarFilaPainel(await apiGet("/pedidos"), fila);
  assert.deepEqual(
    secao.map((e) => e.pedido.id),
    [5, 1] // Caio agora exibindo, João 1º na fila
  );
  assert.equal(secao[0].exibindo, true);
  assert.equal(secao[1].posicao, 1);
});

test("demo: PATCH fora da transição válida → 400", async (t) => {
  const desligar = demoLigar();
  t.after(desligar);

  await assert.rejects(
    () => apiPatch("/pedidos/1/status", { novo_status: "PRONTO" }), // PENDENTE→PRONTO
    (e) => e instanceof ErroApi && e.status === 400
  );
  await assert.rejects(
    () => apiPatch("/pedidos/5/status", { novo_status: "CANCELADO" }), // PRONTO→CANCELADO
    (e) => e instanceof ErroApi && e.status === 400
  );
  await assert.rejects(
    () => apiPatch("/pedidos/99/status", { novo_status: "CONFIRMADO" }),
    (e) => e instanceof ErroApi && e.status === 404
  );
});

test("demo: CRUD de itens (criar c/ imagem+categoria, editar preço, toggle)", async (t) => {
  const desligar = demoLigar();
  t.after(desligar);

  const novo = await apiPost("/itens", {
    nome: "Combo Demo",
    descricao: "Burger + refri 350ml",
    preco: 25.5,
    disponivel: true,
    imagem: "https://exemplo.com/combo.png",
    categoria: "Combos"
  });
  assert.equal(novo.id, 8); // seed já traz 7 itens (5 bases + 2 adicionais)
  assert.equal(novo.imagem, "https://exemplo.com/combo.png");
  assert.equal(novo.categoria, "Combos");

  const editado = await apiPut(`/itens/${novo.id}`, {
    nome: novo.nome,
    descricao: novo.descricao,
    preco: 27,
    disponivel: true,
    imagem: novo.imagem,
    categoria: novo.categoria
  });
  assert.equal(editado.preco, 27);

  const desativado = await apiPut(`/itens/${novo.id}`, {
    ...editado,
    disponivel: false
  });
  assert.equal(desativado.disponivel, false);

  const lista = await apiGet("/itens");
  assert.equal(lista.length, 8);
  assert.equal(lista.find((i) => i.id === novo.id).disponivel, false);

  // PUT que esvazia aplica_em em adicional → 400 (mesma regra do backend:
  // sem item-base o adicional não existe no cardápio)
  const ad = await apiPost("/itens", {
    nome: "Bacon extra",
    preco: 3,
    disponivel: true,
    categoria: null,
    aplica_em: [1]
  });
  assert.deepEqual(ad.aplica_em, [1]);
  await assert.rejects(
    () => apiPut(`/itens/${ad.id}`, {
      nome: ad.nome,
      descricao: ad.descricao,
      preco: ad.preco,
      disponivel: ad.disponivel,
      imagem: ad.imagem,
      categoria: null,
      aplica_em: null
    }),
    (e) => e instanceof ErroApi && e.status === 400
  );
  // o adicional continua intacto
  const intacto = (await apiGet("/itens")).find((i) => i.id === ad.id);
  assert.deepEqual(intacto.aplica_em, [1]);
});

test("demo: M:N — excluir um base desvincula o adicional; o último, remove o adicional", async (t) => {
  const desligar = demoLigar();
  t.after(desligar);

  // bases do seed (1, 2) estão em pedidos → não dá para excluir; usa bases livres
  const base = await apiPost("/itens", { nome: "X-Tudo", preco: 20 });
  const ad = await apiPost("/itens", {
    nome: "Ovo extra",
    preco: 1,
    disponivel: true,
    categoria: null,
    aplica_em: [1, base.id]
  });

  await apiDelete(`/itens/${base.id}`);
  // o adicional sobrevive, agora só no X-Burger (id 1)
  const depois = (await apiGet("/itens")).find((i) => i.id === ad.id);
  assert.deepEqual(depois.aplica_em, [1]);

  // excluir o ÚLTIMO base remove o adicional (sem base ele não existe
  // no cardápio — mesma regra do backend)
  const base2 = await apiPost("/itens", { nome: "X-Bacon", preco: 19 });
  await apiPut(`/itens/${ad.id}`, {
    nome: ad.nome,
    descricao: ad.descricao,
    preco: ad.preco,
    disponivel: ad.disponivel,
    imagem: ad.imagem,
    categoria: null,
    aplica_em: [base2.id]
  });
  await apiDelete(`/itens/${base2.id}`);
  assert.ok(!(await apiGet("/itens")).some((i) => i.id === ad.id));
});

test("demo: DELETE item em pedido → 500; item livre → 204", async (t) => {
  const desligar = demoLigar();
  t.after(desligar);

  // X-Burger (id 1) está no pedido 1 do seed
  await assert.rejects(
    () => apiDelete("/itens/1"),
    (e) => e instanceof ErroApi && e.status === 500
  );
  const listaAinda = await apiGet("/itens");
  assert.ok(listaAinda.some((i) => i.id === 1));

  const livre = await apiPost("/itens", { nome: "Item Livre", preco: 5 });
  const resposta = await apiDelete(`/itens/${livre.id}`);
  assert.equal(resposta, null);
  assert.ok(!(await apiGet("/itens")).some((i) => i.id === livre.id));
});

test("demo: recarregar a página mantém pedidos e itens (F5)", async (t) => {
  const storage = new Map();
  const restaurarWindow = mockarWindow(storage);
  const desligar = demoLigar();
  t.after(() => {
    restaurarWindow();
    desligar();
  });

  _demoReset();
  const antes = await apiGet("/pedidos");
  assert.equal(antes.length, 5);

  const novoItem = await apiPost("/itens", { nome: "Sobreviveu", preco: 9 });

  _demoRecarregar(); // simula F5: memória some, sessionStorage permanece

  const depois = await apiGet("/pedidos");
  assert.deepEqual(depois.map((p) => p.id), antes.map((p) => p.id));
  const itens = await apiGet("/itens");
  assert.ok(itens.some((i) => i.id === novoItem.id));
  assert.equal(itens.find((i) => i.id === novoItem.id).preco, 9);
});

test("demo: cliente simulado cria pedido novo após DEMO_NOVO_PEDIDO_MS (lazy)", async (t) => {
  const desligar = demoLigar({ novoPedidoMs: 50, declaraMs: 60000 });
  t.after(desligar);

  let novos = 0;
  const desassar = onDemoEvento((ev, data) => {
    if (ev === "novo_pedido") {
      novos++;
      assert.equal(data.status, "PENDENTE");
    }
  });
  t.after(desassar);

  const primeiro = await apiGet("/pedidos");
  assert.equal(primeiro.length, 5);
  assert.equal(novos, 0);

  await esperar(80); // agora now >= proximoClienteEm: o "cliente" pede
  const depois = await apiGet("/pedidos");
  assert.equal(depois.length, 6);
  assert.equal(novos, 1);
  const novo = depois.find((p) => p.id === 6);
  assert.equal(novo.status, "PENDENTE");
  assert.ok(typeof novo.nome_cliente === "string" && novo.nome_cliente.length > 0);
  assert.equal(novo.pagamento_declarado_em, null);
});

test("demo: cliente simulado pede adicionais e observação (determinístico)", async (t) => {
  const desligar = demoLigar({ novoPedidoMs: 50, declaraMs: 60000 });
  t.after(desligar);

  const primeiro = await apiGet("/pedidos");
  assert.equal(primeiro.length, 5);

  await esperar(80); // idx 0: 1º item-base (X-Burger) + seus 2 adicionais
  const depois = await apiGet("/pedidos");
  assert.equal(depois.length, 6);
  const p1 = depois.find((p) => p.id === 6);
  assert.equal(p1.itens[0].item_id, 1);
  assert.equal(p1.itens[0].quantidade, 1);
  assert.equal(p1.itens[0].adicionais.length, 2); // Queijo extra + Carne extra
  assert.equal(p1.total, 22); // 15 + 2 + 5
  assert.equal(p1.observacao, null); // idx 0

  await esperar(80); // idx 1: outro item, sem adicionais, com observação
  const p2 = (await apiGet("/pedidos")).find((p) => p.id === 7);
  assert.equal(p2.itens[0].adicionais.length, 0);
  assert.equal(p2.observacao, "Sem cebola, por favor");
});
