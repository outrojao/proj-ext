import test from "node:test";
import assert from "node:assert/strict";
import { transicaoStatusValida, secaoDoPedido, acoesDoStatus, acoesDisponiveis } from "../js/state.js";

test("transições válidas (mesma tabela do backend)", () => {
  assert.equal(transicaoStatusValida("PENDENTE", "CONFIRMADO"), true);
  assert.equal(transicaoStatusValida("PENDENTE", "CANCELADO"), true);
  assert.equal(transicaoStatusValida("CONFIRMADO", "PAGO"), true);
  assert.equal(transicaoStatusValida("CONFIRMADO", "CANCELADO"), true);
  assert.equal(transicaoStatusValida("PAGO", "PRONTO"), true);
  assert.equal(transicaoStatusValida("PAGO", "CANCELADO"), true);
  assert.equal(transicaoStatusValida("PRONTO", "ENTREGUE"), true);
});

test("transições inválidas", () => {
  assert.equal(transicaoStatusValida("PENDENTE", "PAGO"), false);
  assert.equal(transicaoStatusValida("PENDENTE", "PRONTO"), false);
  assert.equal(transicaoStatusValida("PENDENTE", "ENTREGUE"), false);
  assert.equal(transicaoStatusValida("CONFIRMADO", "PRONTO"), false);
  assert.equal(transicaoStatusValida("CONFIRMADO", "ENTREGUE"), false);
  assert.equal(transicaoStatusValida("PAGO", "ENTREGUE"), false);
  assert.equal(transicaoStatusValida("PRONTO", "CANCELADO"), false);
  assert.equal(transicaoStatusValida("PRONTO", "CONFIRMADO"), false);
  // terminais: nenhuma saída
  assert.equal(transicaoStatusValida("ENTREGUE", "CANCELADO"), false);
  assert.equal(transicaoStatusValida("CANCELADO", "CONFIRMADO"), false);
  assert.equal(transicaoStatusValida("ENTREGUE", "PRONTO"), false);
  // status desconhecido: nunca vale
  assert.equal(transicaoStatusValida("OUTRO", "CONFIRMADO"), false);
});

test("secaoDoPedido para os 6 status", () => {
  assert.equal(secaoDoPedido({ status: "PENDENTE" }), "NOVOS");
  assert.equal(secaoDoPedido({ status: "CONFIRMADO" }), "PAGAMENTO");
  assert.equal(secaoDoPedido({ status: "PAGO" }), "PREPARO");
  assert.equal(secaoDoPedido({ status: "PRONTO" }), "PAINEL");
  assert.equal(secaoDoPedido({ status: "ENTREGUE" }), "FINALIZADO");
  assert.equal(secaoDoPedido({ status: "CANCELADO" }), "FINALIZADO");
});

test("acoesDoStatus: CTAs por status", () => {
  const pendente = acoesDoStatus("PENDENTE");
  assert.deepEqual(pendente.map((a) => a[1]), ["CONFIRMADO", "CANCELADO"]);
  assert.deepEqual(acoesDoStatus("CONFIRMADO").map((a) => a[1]), ["PAGO"]);
  assert.deepEqual(acoesDoStatus("PAGO").map((a) => a[1]), ["PRONTO"]);
  assert.deepEqual(acoesDoStatus("PRONTO").map((a) => a[1]), ["ENTREGUE"]);
  assert.deepEqual(acoesDoStatus("ENTREGUE"), []);
  assert.deepEqual(acoesDoStatus("CANCELADO"), []);
});

test("acoesDisponiveis: offline / banner HTTP / WS caído (regra dos CTAs)", () => {
  assert.equal(acoesDisponiveis({ offline: false, acoesBloqueadas: false, ws: "conectado" }), true);
  assert.equal(acoesDisponiveis({ offline: true, acoesBloqueadas: false, ws: "conectado" }), false);
  assert.equal(acoesDisponiveis({ offline: false, acoesBloqueadas: true, ws: "conectado" }), false);
  assert.equal(acoesDisponiveis({ offline: false, acoesBloqueadas: false, ws: "reconectando" }), false);
  assert.equal(acoesDisponiveis({ offline: false, acoesBloqueadas: false, ws: "desconectado" }), false);
});
