import test from "node:test";
import assert from "node:assert/strict";
import { proximaTentativa } from "../js/ws.js";

test("backoff: dobra a cada falha até o teto do cfg (sem jitter)", () => {
  const cfg = { WS_BACKOFF_INICIAL_MS: 1, WS_BACKOFF_MAX_MS: 30 };
  let atraso = cfg.WS_BACKOFF_INICIAL_MS;
  const sequencia = [atraso];
  for (let i = 0; i < 6; i++) {
    atraso = proximaTentativa(atraso, cfg);
    sequencia.push(atraso);
  }
  assert.deepEqual(sequencia, [1, 2, 4, 8, 16, 30, 30]);
});

test("backoff: teto é sempre o WS_BACKOFF_MAX_MS do cfg", () => {
  const cfg = { WS_BACKOFF_INICIAL_MS: 1000, WS_BACKOFF_MAX_MS: 30000 };
  assert.equal(proximaTentativa(1000, cfg), 2000);
  assert.equal(proximaTentativa(16000, cfg), 30000);
  assert.equal(proximaTentativa(30000, cfg), 30000);
  assert.equal(proximaTentativa(999999, cfg), 30000);
});

test("backoff: cfg com teto menor respeita o teto", () => {
  const cfg = { WS_BACKOFF_INICIAL_MS: 7, WS_BACKOFF_MAX_MS: 12 };
  assert.equal(proximaTentativa(7, cfg), 12);
});
