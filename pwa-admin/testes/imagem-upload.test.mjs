import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../js/config.js";
import { apiUploadImagem, _demoReset } from "../js/api.js";

function mockarWindow(storage) {
  const anterior = globalThis.window;
  globalThis.window = {
    sessionStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k)
    }
  };
  return () => {
    if (anterior === undefined) delete globalThis.window;
    else globalThis.window = anterior;
  };
}

const ANTERIOR = { MODO_DEMO: CONFIG.MODO_DEMO };

// O demo não lê bytes do arquivo — só nome/tipo/size
const FAKE_FILE = { name: "foto.png", type: "image/png", size: 100 };

test("demo: upload de imagem devolve URL fake, sem sequência quebrada", async () => {
  const soltar = mockarWindow(new Map());
  CONFIG.MODO_DEMO = true;
  try {
    _demoReset();
    assert.equal(
      await apiUploadImagem(FAKE_FILE),
      "https://lutzgrill-demo.local/imagens/imagem-demo-1.png"
    );
    assert.equal(
      await apiUploadImagem(FAKE_FILE),
      "https://lutzgrill-demo.local/imagens/imagem-demo-2.png"
    );
    // reset zera a sequência (volta a imagem-demo-1)
    _demoReset();
    assert.equal(
      await apiUploadImagem(FAKE_FILE),
      "https://lutzgrill-demo.local/imagens/imagem-demo-1.png"
    );
  } finally {
    CONFIG.MODO_DEMO = ANTERIOR.MODO_DEMO;
    soltar();
  }
});
