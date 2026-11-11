import test from "node:test";
import assert from "node:assert/strict";
import { validarSessao, montarSessao, maxAgeCookie } from "../js/state.js";

const AGORA = 1_000_000;

test("sessão dentro do TTL é válida", () => {
  assert.equal(validarSessao({ ts: AGORA - 299_000 }, AGORA), true);
  assert.equal(validarSessao({ ts: AGORA }, AGORA), true);
});

test("sessão além do TTL (5 min) é rejeitada", () => {
  assert.equal(validarSessao({ ts: AGORA - 300_001 }, AGORA), false);
  assert.equal(validarSessao({ ts: AGORA - 10_000_000 }, AGORA), false);
});

test("payload inválido é rejeitado", () => {
  assert.equal(validarSessao(null, AGORA), false);
  assert.equal(validarSessao({}, AGORA), false);
  assert.equal(validarSessao({ ts: "x" }, AGORA), false);
});

test("montarSessao grava ts recente e preserva campos", () => {
  const antes = Date.now();
  const payload = montarSessao({ step: "PAGAMENTO", carrinho: [], pedido: { id: 1 } });
  assert.ok(payload.ts >= antes);
  assert.equal(payload.step, "PAGAMENTO");
  assert.deepEqual(payload.pedido, { id: 1 });
  assert.deepEqual(payload.carrinho, []);
});

test("maxAgeCookie reflete o TTL de 5 min (300s)", () => {
  assert.equal(maxAgeCookie(300_000), 300);
  assert.equal(maxAgeCookie(), 300);
});
