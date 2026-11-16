import test from "node:test";
import assert from "node:assert/strict";
import { acharRetirada } from "../js/state.js";

const PEDIDOS = [
  { id: 1, numero: null, senha_retirada: null, status: "PENDENTE" },
  { id: 2, numero: 101, senha_retirada: "AB12", status: "PAGO" },
  { id: 3, numero: 102, senha_retirada: "KQ78", status: "PRONTO" },
  { id: 4, numero: 103, senha_retirada: null, status: "CONFIRMADO" },
  { id: 5, numero: 101, senha_retirada: "ZZ99", status: "ENTREGUE" }
];

test("acharRetirada: match com senha minúscula e espaços", () => {
  const achado = acharRetirada(PEDIDOS, "102", " kq78 ");
  assert.ok(achado);
  assert.equal(achado.id, 3);
});

test("acharRetirada: número certo + senha errada → null", () => {
  assert.equal(acharRetirada(PEDIDOS, 101, "ab13"), null);
  assert.equal(acharRetirada(PEDIDOS, 102, "kq77"), null);
});

test("acharRetirada: múltiplos com o mesmo número → só o da senha certa", () => {
  assert.equal(acharRetirada(PEDIDOS, 101, "AB12").id, 2);
  assert.equal(acharRetirada(PEDIDOS, 101, "ZZ99").id, 5);
});

test("acharRetirada: sem número/senha ou sem match → null", () => {
  assert.equal(acharRetirada(PEDIDOS, 999, "AB12"), null);
  assert.equal(acharRetirada(PEDIDOS, "abc", "AB12"), null);
  assert.equal(acharRetirada(PEDIDOS, 4, ""), null);
  assert.equal(acharRetirada([], 101, "AB12"), null);
});
