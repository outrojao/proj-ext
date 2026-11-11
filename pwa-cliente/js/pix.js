// Lógica de pagamento Pix no lado do cliente.
// O PWA NUNCA monta payload Pix: recebe o QR/copia-e-cola prontos do
// backend (chave Pix da loja fica apenas no .env do servidor).
// Aqui vivem as regras de expiração do QR e os helpers do MODO_DEMO.

import { CONFIG } from "./config.js";

// Alfabeto sem caracteres ambíguos (sem I/O/0/1) — espelha o backend.
export const ALFABETO_SENHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function gerarSenhaDemo() {
  return Array.from({ length: 4 }, () => ALFABETO_SENHA[Math.floor(Math.random() * ALFABETO_SENHA.length)]).join("");
}

export function qrExpirado(expiraEmIso, agora = Date.now()) {
  if (!expiraEmIso) return false;
  const tempo = new Date(expiraEmIso).getTime();
  if (Number.isNaN(tempo)) return false;
  return tempo < agora;
}

// QR "fake" para o modo demo (SVG com valor, não é um Pix real).
export function qrDemoDataUri(total) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280" viewBox="0 0 280 280">` +
    `<rect width="280" height="280" fill="#ffffff"/>` +
    `<g fill="#400101">` +
    `<rect x="20" y="20" width="56" height="56" rx="8"/><rect x="204" y="20" width="56" height="56" rx="8"/><rect x="20" y="204" width="56" height="56" rx="8"/>` +
    `<rect x="32" y="32" width="32" height="32" fill="#ffffff"/><rect x="216" y="32" width="32" height="32" fill="#ffffff"/><rect x="32" y="216" width="32" height="32" fill="#ffffff"/>` +
    `<rect x="100" y="24" width="16" height="16"/><rect x="132" y="40" width="16" height="16"/><rect x="164" y="24" width="16" height="16"/>` +
    `<rect x="100" y="204" width="16" height="16"/><rect x="132" y="236" width="16" height="16"/><rect x="164" y="204" width="16" height="16"/>` +
    `<rect x="236" y="100" width="16" height="16"/><rect x="204" y="132" width="16" height="16"/><rect x="236" y="164" width="16" height="16"/>` +
    `<rect x="24" y="100" width="16" height="16"/><rect x="56" y="132" width="16" height="16"/><rect x="24" y="164" width="16" height="16"/>` +
    `</g>` +
    `<rect x="88" y="96" width="104" height="88" rx="10" fill="#ffffff" stroke="#400101" stroke-width="4"/>` +
    `<text x="140" y="132" text-anchor="middle" font-family="monospace" font-size="20" font-weight="bold" fill="#400101">PIX</text>` +
    `<text x="140" y="162" text-anchor="middle" font-family="monospace" font-size="18" fill="#400101">${Number(total).toFixed(2)} BRL</text>` +
    `</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

// Monta a "resposta" de pagamento do modo demo (mesmo formato do backend).
export function payloadDemo(pedido) {
  const codigo = `000201PIX-DEMO-PED${pedido.id}-${Number(pedido.total).toFixed(2)}`;
  return {
    qr_code: codigo,
    qr_code_base64: qrDemoDataUri(pedido.total),
    copia_cola: codigo,
    expira_em: new Date(Date.now() + CONFIG.PIX_TIMEOUT_MS).toISOString()
  };
}
