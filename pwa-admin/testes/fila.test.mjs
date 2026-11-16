import test from "node:test";
import assert from "node:assert/strict";
import { montarFilaPainel } from "../js/state.js";

const P = (id, status, numero, extras = {}) => ({ id, status, numero, ...extras });

test("montarFilaPainel: exibido = PRONTO fora da fila-painel", () => {
  const pedidos = [
    P(1, "PRONTO", 101), // EXIBINDO (não está na fila)
    P(2, "PRONTO", 102), // na fila
    P(3, "PAGO", 103),
    P(4, "PENDENTE", null)
  ];
  const fila = [P(2, "PRONTO", 102)];
  const secao = montarFilaPainel(pedidos, fila);
  assert.deepEqual(secao.map((e) => e.pedido.id), [1, 2]);
  assert.equal(secao[0].exibindo, true);
  assert.equal(secao[0].posicao, null);
  assert.equal(secao[1].exibindo, false);
  assert.equal(secao[1].posicao, 1);
});

test("montarFilaPainel: ordem = exibidos primeiro, depois a fila na ordem retornada", () => {
  const pedidos = [
    P(1, "PRONTO", 101), // exibindo
    P(2, "PRONTO", 102), // fila pos 2
    P(3, "PRONTO", 103) // fila pos 1 (ordem da fila ≠ ordem de número)
  ];
  const fila = [P(3, "PRONTO", 103), P(2, "PRONTO", 102)];
  const secao = montarFilaPainel(pedidos, fila);
  assert.deepEqual(secao.map((e) => e.pedido.id), [1, 3, 2]);
  assert.deepEqual(secao.map((e) => e.posicao), [null, 1, 2]);
  assert.equal(secao[2].exibindo, false);
});

test("montarFilaPainel: fila vazia → só o exibido", () => {
  const pedidos = [P(1, "PRONTO", 101), P(2, "PAGO", 102)];
  const secao = montarFilaPainel(pedidos, []);
  assert.equal(secao.length, 1);
  assert.equal(secao[0].pedido.id, 1);
  assert.equal(secao[0].exibindo, true);
});

test("montarFilaPainel: sem PRONTO → lista vazia", () => {
  const pedidos = [P(1, "PAGO", 101), P(2, "PENDENTE", null), P(3, "ENTREGUE", 103)];
  assert.deepEqual(montarFilaPainel(pedidos, []), []);
});

test("montarFilaPainel: entrada defensiva — fila com pedido não-PRONTO é ignorada", () => {
  const pedidos = [P(1, "PRONTO", 101)];
  const secao = montarFilaPainel(pedidos, [P(9, "ENTREGUE", 109)]);
  assert.deepEqual(secao.map((e) => e.pedido.id), [1]);
});
