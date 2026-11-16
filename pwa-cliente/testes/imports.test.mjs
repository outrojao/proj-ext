// Checagem estática: nenhum arquivo de js/ pode usar um nome exportado por
// outro módulo sem importá-lo (evita ReferenceError só visível no navegador).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RAIZ_JS = path.join(fileURLToPath(new URL("..", import.meta.url)), "js");

function listarArquivos(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const completo = path.join(dir, nome);
    return statSync(completo).isDirectory() ? listarArquivos(completo) : [completo];
  });
}

const GLOBAIS = new Set([
  "console", "window", "document", "navigator", "localStorage", "sessionStorage",
  "location", "Promise", "Date", "Math", "Number", "String", "Boolean", "JSON",
  "Array", "Object", "Map", "Set", "Error", "TypeError", "ReferenceError",
  "RegExp", "URL", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "encodeURIComponent", "decodeURIComponent", "fetch", "performance"
]);

function analisar(caminho) {
  const codigo = readFileSync(caminho, "utf-8");

  const importados = new Set();
  for (const m of codigo.matchAll(/import\s+(?:([A-Za-z_$][\w$]*)\s*,\s*)?\{([^}]*)\}\s+from/g)) {
    if (m[1]) importados.add(m[1]);
    for (const nome of (m[2] || "").split(",")) {
      const limpo = nome.trim().split(/\s+as\s+/).pop().trim();
      if (limpo) importados.add(limpo);
    }
  }
  for (const m of codigo.matchAll(/import\s+\{([^}]*)\}\s+from/g)) {
    for (const nome of m[1].split(",")) {
      const limpo = nome.trim().split(/\s+as\s+/).pop().trim();
      if (limpo) importados.add(limpo);
    }
  }
  for (const m of codigo.matchAll(/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)/g)) {
    importados.add(m[1]);
  }

  const locais = new Set();
  for (const m of codigo.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) locais.add(m[1]);
  for (const m of codigo.matchAll(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) locais.add(m[1]);
  for (const m of codigo.matchAll(/^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm)) locais.add(m[1]);

  const exportados = new Set();
  for (const m of codigo.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) exportados.add(m[1]);
  for (const m of codigo.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) exportados.add(m[1]);
  for (const m of codigo.matchAll(/export\s+class\s+([A-Za-z_$][\w$]*)/gm)) exportados.add(m[1]);

  return { codigo, importados, locais, exportados };
}

test("imports: todo nome exportado por outro módulo é importado antes do uso", () => {
  const arquivos = listarArquivos(RAIZ_JS);
  assert.ok(arquivos.length >= 10, `esperava >=10 arquivos, achei ${arquivos.length}`);

  const info = new Map(arquivos.map((a) => [a, analisar(a)]));

  const porNome = new Map();
  for (const [arq, i] of info) {
    for (const nome of i.exportados) {
      if (!porNome.has(nome)) porNome.set(nome, []);
      porNome.get(nome).push(path.basename(arq));
    }
  }

  for (const [arq, i] of info) {
    const falhas = [];
    for (const [nome, origem] of porNome) {
      if (i.locais.has(nome) || i.importados.has(nome) || GLOBAIS.has(nome)) continue;
      const usada = new RegExp(`(?<![\\w$.])${nome}\\b`).test(i.codigo);
      if (usada) {
        falhas.push(`${path.basename(arq)} usa "${nome}" (exportado por ${origem.join(", ")}) sem importar`);
      }
    }
    assert.deepEqual(falhas, [], falhas.join("; "));
  }
});
