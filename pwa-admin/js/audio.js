// Beeps WebAudio para as notificações do atendente (zero arquivos de áudio).
// O contexto é criado sob demanda e retomado no primeiro gesto — a política
// de autoplay do navegador pode negar o som antes do primeiro clique/toque;
// nesse caso o beep é pulado em silêncio (o visual nunca depende do som).

import { somAtivo, vibrar } from "./state.js";

// [freq, duração ms] por nota, tocadas em sequência com intervalo fixo.
// "novo_pedido" era 3x o MESMO tom (880Hz) e soava como se o som estivesse
// se repetindo/travando; virou um par ascendente (a subida = "chegou algo").
const PADROES = {
  novo_pedido: [[660, 120], [880, 160]],
  declarado: [[660, 500]],
  ok: [[440, 80]]
};
const INTERVALO_NOTAS_MS = 60;

const VIBRACOES = {
  novo_pedido: [200, 100, 200],
  declarado: [400]
};

let contexto = null;

function obterContexto() {
  if (typeof window === "undefined") return null;
  const Construtor = window.AudioContext || window.webkitAudioContext;
  if (!Construtor) return null;
  if (!contexto) {
    try {
      contexto = new Construtor();
    } catch {
      return null;
    }
  }
  if (contexto.state === "suspended") {
    // sem gesto anterior o resumo pode não ocorrer: o beep simplesmente não toca
    contexto.resume().catch(() => {});
  }
  return contexto;
}

export function tocar(tipo) {
  const padrao = PADROES[tipo];
  if (!padrao) return;
  if (!somAtivo()) return;
  if (typeof document !== "undefined" && document.hidden) return;
  const ctx = obterContexto();
  if (!ctx) return;
  try {
    let t = ctx.currentTime + 0.02;
    for (const [freq, dur] of padrao) {
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      ganho.gain.value = 0.08;
      osc.connect(ganho);
      ganho.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur / 1000);
      t += (dur + INTERVALO_NOTAS_MS) / 1000;
    }
  } catch {
    // áudio indisponível: segue em silêncio
  }
}

export function notificar(tipo) {
  tocar(tipo);
  if (VIBRACOES[tipo]) vibrar(VIBRACOES[tipo]);
}
