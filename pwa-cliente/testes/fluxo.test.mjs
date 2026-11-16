import test from "node:test";
import assert from "node:assert/strict";
import { transicaoValida } from "../js/app.js";

test("transições válidas do fluxo principal", () => {
  assert.ok(transicaoValida("CARDAPIO", "AGENDAMENTO"));
  assert.ok(transicaoValida("AGENDAMENTO", "AGUARDANDO_CONFIRMACAO"));
  assert.ok(transicaoValida("AGUARDANDO_CONFIRMACAO", "PAGAMENTO"));
  assert.ok(transicaoValida("PAGAMENTO", "CONFIRMACAO"));
  assert.ok(transicaoValida("CONFIRMACAO", "ACOMPANHAMENTO"));
  assert.ok(transicaoValida("ACOMPANHAMENTO", "CARDAPIO"));
});

test("voltar ao cardápio mantendo o carrinho", () => {
  assert.ok(transicaoValida("AGENDAMENTO", "CARDAPIO"));
});

test("novo pedido após cancelamento / entrega", () => {
  assert.ok(transicaoValida("AGUARDANDO_CONFIRMACAO", "CARDAPIO"));
  assert.ok(transicaoValida("PAGAMENTO", "CARDAPIO"));
  assert.ok(transicaoValida("ACOMPANHAMENTO", "CARDAPIO"));
});

test("cancelamento chega à tela de fim a partir de qualquer passo", () => {
  assert.ok(transicaoValida("PAGAMENTO", "AGUARDANDO_CONFIRMACAO"));
  assert.ok(transicaoValida("ACOMPANHAMENTO", "AGUARDANDO_CONFIRMACAO"));
});

test("voltar ao acompanhamento a partir de qualquer passo com pedido", () => {
  assert.ok(transicaoValida("CARDAPIO", "ACOMPANHAMENTO"));
  assert.ok(transicaoValida("AGENDAMENTO", "ACOMPANHAMENTO"));
  assert.ok(transicaoValida("PAGAMENTO", "ACOMPANHAMENTO"));
});

test("transições inválidas são bloqueadas", () => {
  assert.equal(transicaoValida("CARDAPIO", "PAGAMENTO"), false);
  assert.equal(transicaoValida("CARDAPIO", "CONFIRMACAO"), false);
  assert.equal(transicaoValida("PAGAMENTO", "AGENDAMENTO"), false);
  assert.equal(transicaoValida("CONFIRMACAO", "CARDAPIO"), false);
  assert.equal(transicaoValida("CARDAPIO", "CARDAPIO"), false);
  assert.equal(transicaoValida(undefined, "CARDAPIO"), false);
  assert.equal(transicaoValida("CARDAPIO", undefined), false);
});
