import test from "node:test";
import assert from "node:assert/strict";
import { validarSessao, montarSessao, maxAgeCookie, temIdentificacao } from "../js/state.js";

const AGORA = 1_000_000;

test("sessão dentro do TTL é válida", () => {
  assert.equal(validarSessao({ ts: AGORA - 1_199_000 }, AGORA), true);
  assert.equal(validarSessao({ ts: AGORA }, AGORA), true);
});

test("sessão além do TTL (20 min) é rejeitada", () => {
  assert.equal(validarSessao({ ts: AGORA - 1_200_001 }, AGORA), false);
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

test("maxAgeCookie reflete o TTL de 20 min (1200s)", () => {
  assert.equal(maxAgeCookie(1_200_000), 1200);
  assert.equal(maxAgeCookie(), 1200);
});

test("temIdentificacao: número e senha juntos (o backend gera atômico no PAGO)", () => {
  assert.equal(temIdentificacao({ numero: 7, senha_retirada: "AB12" }), true);
  assert.equal(temIdentificacao({ numero: 7, senha_retirada: null }), false);
  assert.equal(temIdentificacao({ numero: null, senha_retirada: "AB12" }), false);
  assert.equal(temIdentificacao({ numero: null, senha_retirada: null }), false);
  assert.equal(temIdentificacao(null), false);
});
