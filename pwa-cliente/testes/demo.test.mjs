import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../js/config.js";
import { apiGet, apiPost, _demoReset, _demoRecarregar, ErroApi } from "../js/api.js";

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
import { gerarSenhaDemo, qrExpirado, ALFABETO_SENHA } from "../js/pix.js";

function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

test("senha demo: 4 chars do alfabeto sem ambiguidade", () => {
  for (let i = 0; i < 100; i++) {
    const senha = gerarSenhaDemo();
    assert.equal(senha.length, 4);
    for (const c of senha) {
      assert.ok(ALFABETO_SENHA.includes(c), `caractere fora do alfabeto: ${c}`);
      assert.ok(!"IO01".includes(c), `caractere ambíguo: ${c}`);
    }
  }
});

test("qrExpirado identifica payload vencido", () => {
  assert.equal(qrExpirado(new Date(Date.now() + 60_000).toISOString()), false);
  assert.equal(qrExpirado(new Date(Date.now() - 1000).toISOString()), true);
  assert.equal(qrExpirado(null), false);
  assert.equal(qrExpirado("invalido"), false);
});

test("fluxo demo completo: itens → pedido → confirmação → Pix → PAGO (nº + senha)", async (t) => {
  CONFIG.MODO_DEMO = true;
  CONFIG.DEMO_CONFIRMAR_MS = 50;
  CONFIG.MODO_DEMO_APROVA_MS = 50;
  _demoReset();
  t.after(() => {
    CONFIG.MODO_DEMO = false;
    CONFIG.DEMO_CONFIRMAR_MS = 6000;
    CONFIG.MODO_DEMO_APROVA_MS = 8000;
    _demoReset();
  });

  const itens = await apiGet("/itens");
  assert.equal(itens.length, 5);
  assert.ok(itens.every((i) => i.disponivel === true));

  const pedido = await apiPost("/pedidos", {
    itens: [
      { item_id: 1, quantidade: 2 },
      { item_id: 3, quantidade: 1 }
    ],
    horario_agendamento: "19:30",
    nome_cliente: "João"
  });
  assert.equal(pedido.status, "PENDENTE");
  assert.equal(pedido.total, 36); // 2×15 + 1×6

  await esperar(80); // a "loja" do demo confirma
  const confirmado = await apiGet(`/pedidos/${pedido.id}`);
  assert.equal(confirmado.status, "CONFIRMADO");

  const pagamento = await apiPost(`/pedidos/${pedido.id}/pagamento`);
  assert.ok(pagamento.qr_code_base64.startsWith("data:image/"));
  assert.ok(pagamento.copia_cola.includes(`PED${pedido.id}`));
  assert.ok(pagamento.expira_em);

  await esperar(80); // o Pix "cai"
  const status = await apiGet(`/pedidos/${pedido.id}/pagamento`);
  assert.equal(status.status, "APROVADO");

  const pago = await apiGet(`/pedidos/${pedido.id}`);
  assert.equal(pago.status, "PAGO");
  assert.equal(typeof pago.numero, "number");
  assert.ok(typeof pago.senha_retirada === "string" && pago.senha_retirada.length === 4);
});

test("demo: pagamento antes de CONFIRMADO é rejeitado (409)", async (t) => {
  CONFIG.MODO_DEMO = true;
  CONFIG.DEMO_CONFIRMAR_MS = 60_000; // não confirma durante o teste
  _demoReset();
  t.after(() => {
    CONFIG.MODO_DEMO = false;
    CONFIG.DEMO_CONFIRMAR_MS = 6000;
    _demoReset();
  });

  const pedido = await apiPost("/pedidos", {
    itens: [{ item_id: 4, quantidade: 1 }],
    horario_agendamento: "20:00"
  });
  assert.equal(pedido.status, "PENDENTE");

  await assert.rejects(
    () => apiPost(`/pedidos/${pedido.id}/pagamento`),
    (e) => e instanceof ErroApi && e.status === 409
  );
});

test("demo: pagamento funciona após recarregar a página (estado persiste)", async (t) => {
  CONFIG.MODO_DEMO = true;
  CONFIG.DEMO_CONFIRMAR_MS = 50;
  const storage = new Map();
  const restaurarWindow = mockarWindow(storage);
  t.after(() => {
    restaurarWindow();
    CONFIG.MODO_DEMO = false;
    CONFIG.DEMO_CONFIRMAR_MS = 6000;
    _demoReset();
  });

  _demoReset();
  const pedido = await apiPost("/pedidos", {
    itens: [{ item_id: 2, quantidade: 1 }],
    horario_agendamento: "19:30"
  });
  await esperar(80); // a "loja" do demo confirma
  const confirmado = await apiGet(`/pedidos/${pedido.id}`);
  assert.equal(confirmado.status, "CONFIRMADO");

  _demoRecarregar(); // simula F5: memória some, sessionStorage permanece

  const pagamento = await apiPost(`/pedidos/${pedido.id}/pagamento`);
  assert.ok(pagamento.qr_code_base64.startsWith("data:image/"));
  assert.ok(pagamento.copia_cola.includes(`PED${pedido.id}`));

  const restaurado = await apiGet(`/pedidos/${pedido.id}`);
  assert.equal(restaurado.id, pedido.id);
  assert.equal(restaurado.total, 16);
});

test("demo: declarar-pagamento não muda o status", async (t) => {
  CONFIG.MODO_DEMO = true;
  CONFIG.DEMO_CONFIRMAR_MS = 60_000;
  _demoReset();
  t.after(() => {
    CONFIG.MODO_DEMO = false;
    CONFIG.DEMO_CONFIRMAR_MS = 6000;
    _demoReset();
  });

  const pedido = await apiPost("/pedidos", {
    itens: [{ item_id: 5, quantidade: 1 }],
    horario_agendamento: "21:00"
  });
  const resposta = await apiPost(`/pedidos/${pedido.id}/declarar-pagamento`);
  assert.equal(resposta.status, "OK");
  const atual = await apiGet(`/pedidos/${pedido.id}`);
  assert.equal(atual.status, "PENDENTE");
});
