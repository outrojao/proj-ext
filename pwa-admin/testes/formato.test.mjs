import test from "node:test";
import assert from "node:assert/strict";
import { formatarBRL, normalizarSenha, referenciaPix, formatarHorarioRelogio, normalizarPreco } from "../js/state.js";

// O separador entre "R$" e o valor pode ser espaço ou narrow no-break space
// dependendo da versão do ICU do Node — por isso regex com \s.
test("formatarBRL (pt-BR)", () => {
  assert.match(formatarBRL(36), /^R\$\s?36,00$/);
  assert.match(formatarBRL(15.5), /^R\$\s?15,50$/);
  assert.match(formatarBRL(0), /^R\$\s?0,00$/);
  assert.match(formatarBRL(1234.56), /^R\$\s?1\.234,56$/);
});

test("normalizarSenha: trim + maiúscula", () => {
  assert.equal(normalizarSenha("ab12"), "AB12");
  assert.equal(normalizarSenha("  Kq78  "), "KQ78");
  assert.equal(normalizarSenha(null), "");
  assert.equal(normalizarSenha(""), "");
});

test("referenciaPix: PED + id", () => {
  assert.equal(referenciaPix(42), "PED42");
  assert.equal(referenciaPix(1), "PED1");
});

test("normalizarPreco: aceita vírgula e ponto; rejeita inválido", () => {
  assert.equal(normalizarPreco("15,50"), 15.5);
  assert.equal(normalizarPreco("15.50"), 15.5);
  assert.equal(normalizarPreco(" 27 "), 27);
  assert.equal(normalizarPreco("0"), 0);
  assert.equal(normalizarPreco(""), null);
  assert.equal(normalizarPreco("abc"), null);
  assert.equal(normalizarPreco("-3"), null);
  assert.equal(normalizarPreco(null), null);
});

test("formatarHorarioRelogio: HH:MM local", () => {
  const local = new Date(2026, 0, 5, 14, 30, 0);
  assert.equal(formatarHorarioRelogio(local.toISOString()), "14:30");
  const meiaNoite = new Date(2026, 0, 5, 0, 5, 0);
  assert.equal(formatarHorarioRelogio(meiaNoite.toISOString()), "00:05");
  assert.equal(formatarHorarioRelogio("lixo"), "");
  assert.equal(formatarHorarioRelogio(null), "");
});
