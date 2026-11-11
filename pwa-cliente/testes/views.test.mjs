// Checagem estática: todo passo da máquina de estados (app.js) tem uma seção
// correspondente no index.html. O roteador esconde as seções comparando
// data-view com passo.toLowerCase() — sem a seção, TODAS ficam ocultas e a
// página abre em branco (bug real que este teste impede de voltar).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { TRANSICOES } from "../js/app.js";

const html = readFileSync(
  path.join(fileURLToPath(new URL("..", import.meta.url)), "index.html"),
  "utf-8"
);

test("views: cada passo da máquina de estados tem seção data-view no HTML", () => {
  const vistas = new Set([...html.matchAll(/data-view="([^"]+)"/g)].map((m) => m[1]));

  const faltando = Object.keys(TRANSICOES).filter(
    (passo) => !vistas.has(passo.toLowerCase())
  );
  assert.deepEqual(faltando, [], `passos sem seção no HTML: ${faltando.join(", ")}`);
});
