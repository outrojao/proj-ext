// Valida a lib de QR embutida (js/vendor/qrcode-generator.js, MIT):
// precisa gerar uma imagem QR real a partir de um copia-e-cola Pix.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

function carregarQrcode() {
  const caminho = path.join(fileURLToPath(new URL("..", import.meta.url)), "js", "vendor", "qrcode-generator.js");
  const codigo = readFileSync(caminho, "utf-8");
  const contexto = vm.createContext({});
  vm.runInContext(codigo, contexto, { filename: "qrcode-generator.js" });
  return contexto.qrcode;
}

test("QR: lib embutida é carregável e gera função qrcode", () => {
  const qrcode = carregarQrcode();
  assert.equal(typeof qrcode, "function");
});

test("QR: copia-e-cola Pix vira imagem QR real (dataURL)", () => {
  const qrcode = carregarQrcode();
  const copiaCola =
    "00020126580014BR.GOV.BCB.PIX013612345678-1234-1234-1234-123456789012520400005303986540636.505802BR5909LANCHONETE6009SAO PAULO62070503***6304ABCD";
  const qr = qrcode(0, "M");
  qr.addData(copiaCola);
  qr.make();
  assert.ok(qr.getModuleCount() >= 29, "payload Pix longo exige versão >= 3");
  const uri = qr.createDataURL(8, 2);
  assert.ok(uri.startsWith("data:image/"), "deve gerar dataURL de imagem");
  assert.ok(uri.length > 1000, "imagem real tem conteúdo");
});

test("QR: conteúdo diferente gera imagem diferente", () => {
  const qrcode = carregarQrcode();
  const a = qrcode(0, "M");
  a.addData("PEDIDO-A-10.00");
  a.make();
  const b = qrcode(0, "M");
  b.addData("PEDIDO-B-99.99");
  b.make();
  assert.notEqual(a.createDataURL(4, 2), b.createDataURL(4, 2));
});
