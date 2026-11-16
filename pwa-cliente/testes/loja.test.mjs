// Funções puras de "vida da loja": status aberto/fechado e mensagens de espera.
import test from "node:test";
import assert from "node:assert/strict";
import { statusLoja } from "../js/state.js";
import { mensagemEspera } from "../js/views/aguardando.js";

const HORARIO = { abre: "08:00", fecha: "22:00", passo_min: 15 };

function hora(h, m) {
  const d = new Date(2026, 0, 15);
  d.setHours(h, m, 0, 0);
  return d;
}

test("statusLoja: aberto dentro do horário", () => {
  const s = statusLoja(hora(12, 30), HORARIO);
  assert.equal(s.aberta, true);
  assert.equal(s.rotulo, "Aberto · fecha 22:00");
});

test("statusLoja: fechado fora do horário (noite)", () => {
  const s = statusLoja(hora(23, 30), HORARIO);
  assert.equal(s.aberta, false);
  assert.equal(s.rotulo, "Fechado · abre 08:00");
});

test("statusLoja: fechado fora do horário (antes de abrir)", () => {
  const s = statusLoja(hora(6, 15), HORARIO);
  assert.equal(s.aberta, false);
});

test("statusLoja: exatamente na abertura → aberto", () => {
  assert.equal(statusLoja(hora(8, 0), HORARIO).aberta, true);
});

test("statusLoja: exatamente no fechamento → fechado", () => {
  assert.equal(statusLoja(hora(22, 0), HORARIO).aberta, false);
});

test("mensagemEspera: acompanha o tempo", () => {
  assert.ok(mensagemEspera(0).includes("conferido"));
  assert.ok(mensagemEspera(9).includes("conferido"));
  assert.ok(mensagemEspera(15).includes("Conferindo"));
  assert.ok(mensagemEspera(45).includes("Quase lá"));
  assert.ok(mensagemEspera(120).includes("quase"));
});

test("mensagemEspera: mensagens sempre em pt-BR e distintas", () => {
  const unicas = new Set([0, 15, 45, 120].map(mensagemEspera));
  assert.equal(unicas.size, 4);
});
