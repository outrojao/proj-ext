import test from "node:test";
import assert from "node:assert/strict";
import { formatarBRL, formatarTempo } from "../js/state.js";

// O separador entre "R$" e o valor pode ser espaço ou narrow no-break space
// dependendo da versão do ICU do Node — por isso regex com \s.
test("formatarBRL (pt-BR)", () => {
  assert.match(formatarBRL(15), /^R\$\s?15,00$/);
  assert.match(formatarBRL(42.5), /^R\$\s?42,50$/);
  assert.match(formatarBRL(0), /^R\$\s?0,00$/);
  assert.match(formatarBRL(1234.56), /^R\$\s?1.234,56$/);
});

test("formatarTempo (mm:ss)", () => {
  assert.equal(formatarTempo(0), "00:00");
  assert.equal(formatarTempo(59), "00:59");
  assert.equal(formatarTempo(75), "01:15");
  assert.equal(formatarTempo(3661), "61:01");
  assert.equal(formatarTempo(-5), "00:00");
});
