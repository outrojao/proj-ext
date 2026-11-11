import test from "node:test";
import assert from "node:assert/strict";
import { gerarSlotsHoje } from "../js/views/agendamento.js";

const HORARIO = { abre: "08:00", fecha: "22:00", passo_min: 15 };

test("primeiro slot respeita AVISO_MIN (10:00 + 20min → 10:30)", () => {
  const agora = new Date(2026, 0, 15, 10, 0, 0);
  const slots = gerarSlotsHoje(agora, HORARIO, 20);
  assert.equal(slots[0], "10:30");
  assert.ok(slots.includes("22:00"));
});

test("slots passados não aparecem", () => {
  const agora = new Date(2026, 0, 15, 14, 1, 0);
  const slots = gerarSlotsHoje(agora, HORARIO, 20);
  assert.ok(!slots.includes("14:15"));
  assert.equal(slots[0], "14:30");
});

test("fim do dia: 21:50 + AVISO 20min → sem slots (mensagem correta)", () => {
  const agora = new Date(2026, 0, 15, 21, 50, 0);
  assert.deepEqual(gerarSlotsHoje(agora, HORARIO, 20), []);
});

test("fim do dia: 21:50 + AVISO 5min → só 22:00", () => {
  const agora = new Date(2026, 0, 15, 21, 50, 0);
  assert.deepEqual(gerarSlotsHoje(agora, HORARIO, 5), ["22:00"]);
});

test("antes da abertura → começa no primeiro slot do dia", () => {
  const agora = new Date(2026, 0, 15, 7, 0, 0);
  const slots = gerarSlotsHoje(agora, HORARIO, 20);
  assert.equal(slots[0], "08:00");
});

test("slots sempre em HH:MM no passo de 15 min", () => {
  const agora = new Date(2026, 0, 15, 8, 0, 0);
  const slots = gerarSlotsHoje(agora, HORARIO, 0);
  assert.ok(slots.length > 0);
  for (const slot of slots) {
    assert.match(slot, /^([01]\d|2[0-3]):[0-5]\d$/);
  }
});
