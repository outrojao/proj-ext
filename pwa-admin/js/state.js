// Estado do admin + utilidades compartilhadas.
// As funções puras (secaoDoPedido, transicaoStatusValida, ...) são
// testáveis no Node; as de interface (som, copiar, poll) só rodam em browser.
//
// Diferença do pwa-cliente: SEM sessão/TTL/cookie — o backend é a fonte de
// verdade e reabrir o app é re-sincronizar. Único dado persistente do app:
// a preferência de som em localStorage (configuração, não sessão).

import { CONFIG } from "./config.js";

export const CHAVE_SOM = "pwa_admin_som";

// Alfabeto da senha de retirada: sem caracteres confusos (0/O/1/I) —
// espelha pedidos_service.ALFAABETO do backend.
export const ALFABETO_SENHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// ── Utilidades puras ──

export function formatarBRL(valor) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

// Tabela espelhada do backend (routers/pedidos.py TRANSICOES_VALIDAS):
// fonte única compartilhada com o demo (api.js) e com a UI (app.js).
const TRANSICOES_VALIDAS = {
  PENDENTE: new Set(["CONFIRMADO", "CANCELADO"]),
  CONFIRMADO: new Set(["PAGO", "CANCELADO"]),
  PAGO: new Set(["PRONTO", "CANCELADO"]),
  PRONTO: new Set(["ENTREGUE"]),
  ENTREGUE: new Set(),
  CANCELADO: new Set()
};

export function transicaoStatusValida(atual, novo) {
  return TRANSICOES_VALIDAS[atual] ? TRANSICOES_VALIDAS[atual].has(novo) : false;
}

// CTAs por status (compartilhado entre card do Atendimento e modal de detalhe).
// [rotulo, novo_status, classe do botão]
export function acoesDoStatus(status) {
  switch (status) {
    case "PENDENTE":
      return [
        ["Aceitar", "CONFIRMADO", "btn-primario"],
        ["Rejeitar", "CANCELADO", "btn-perigo"]
      ];
    case "CONFIRMADO":
      return [["Confirmar pagamento", "PAGO", "btn-primario"]];
    case "PAGO":
      return [["Pronto", "PRONTO", "btn-primario"]];
    case "PRONTO":
      return [["Entregue", "ENTREGUE", "btn-primario"]];
    default:
      return [];
  }
}

// Se a ação pode rodar AGORA (offline, banner HTTP ou WS fora). Função pura
// do store: cards do Atendimento e modal de detalhe desabilitam os CTAs
// com a MESMA regra.
export function acoesDisponiveis(store) {
  return !(store.offline || store.acoesBloqueadas || store.ws !== "conectado");
}

// Em qual seção do Atendimento o pedido aparece (ou FINALIZADO, fora das 4).
export function secaoDoPedido(pedido) {
  switch (pedido.status) {
    case "PENDENTE": return "NOVOS";
    case "CONFIRMADO": return "PAGAMENTO";
    case "PAGO": return "PREPARO";
    case "PRONTO": return "PAINEL";
    default: return "FINALIZADO";
  }
}

// O backend só expõe a fila AGUARDANDO (GET /pedidos/fila-painel); o pedido
// EXIBINDO no LCD está fora dela. Derivação: exibidos = PRONTO fora da fila;
// ordem da seção = exibidos primeiro, depois a fila na ordem retornada.
export function montarFilaPainel(pedidos, filaPainel) {
  const naFila = new Set(filaPainel.map((p) => p.id));
  const exibidos = pedidos
    .filter((p) => p.status === "PRONTO" && !naFila.has(p.id))
    .sort((a, b) => (a.numero ?? Infinity) - (b.numero ?? Infinity));
  const fila = filaPainel
    .filter((p) => p.status === "PRONTO")
    .map((p, i) => ({ pedido: p, exibindo: false, posicao: i + 1 }));
  const exibindo = exibidos.map((p) => ({ pedido: p, exibindo: true, posicao: null }));
  return [...exibindo, ...fila];
}

// Busca local de retirada: número + senha (case-insensitive).
export function acharRetirada(pedidos, numero, senha) {
  const alvo = Number(numero);
  const alvoSenha = normalizarSenha(senha);
  if (!Number.isFinite(alvo) || !alvoSenha) return null;
  return (
    pedidos.find(
      (p) => p.numero === alvo && p.senha_retirada && normalizarSenha(p.senha_retirada) === alvoSenha
    ) || null
  );
}

export function normalizarSenha(s) {
  return String(s ?? "").trim().toUpperCase();
}

// Referência para o atendente achar o Pix no extrato (txid do backend).
export function referenciaPix(pedidoId) {
  return `PED${pedidoId}`;
}

// Preço digitado no form ("15,50" ou "15.50") → número; inválido → null.
export function normalizarPreco(texto) {
  const limpo = String(texto ?? "").trim().replace(",", ".");
  if (limpo === "") return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) && valor >= 0 ? valor : null;
}

// "HH:MM" local a partir de ISO (ex.: pagamento_declarado_em).
export function formatarHorarioRelogio(iso) {
  if (iso == null) return ""; // Date(null) daria 1970, não erro
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Senha do demo: 4 chars do alfabeto sem ambiguidade (mesma regra do backend).
export function gerarSenhaDemo() {
  return Array.from({ length: 4 }, () => ALFABETO_SENHA[Math.floor(Math.random() * ALFABETO_SENHA.length)]).join("");
}

// ── Preferência de som (único uso de localStorage) ──

export function somAtivo() {
  if (typeof localStorage === "undefined") return CONFIG.SOM;
  try {
    const bruto = localStorage.getItem(CHAVE_SOM);
    return bruto === null ? CONFIG.SOM : bruto === "1";
  } catch {
    return CONFIG.SOM;
  }
}

export function salvarSom(ativo) {
  try {
    localStorage.setItem(CHAVE_SOM, ativo ? "1" : "0");
  } catch {
    // storage indisponível (modo privado estrito): segue só em memória
  }
}

// ── Utilidades de interface (copiadas do pwa-cliente) ──

export async function copiarTexto(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // cai no fallback abaixo
    }
  }
  const campo = document.createElement("textarea");
  campo.value = texto;
  campo.setAttribute("readonly", "");
  campo.style.position = "fixed";
  campo.style.opacity = "0";
  document.body.appendChild(campo);
  campo.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  campo.remove();
  return ok;
}

export function vibrar(padrao) {
  if (navigator.vibrate) navigator.vibrate(padrao);
}

// Polling com pausa automática quando a aba fica oculta.
// fn() é chamado imediatamente e a cada `intervaloMs` (aba visível).
export function criarPoll(fn, intervaloMs) {
  let timer = null;

  const agendar = () => {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (!document.hidden) fn();
    }, intervaloMs);
  };

  const aoVisibilidade = () => {
    if (document.hidden) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    } else {
      fn();
      agendar();
    }
  };

  fn();
  agendar();
  document.addEventListener("visibilitychange", aoVisibilidade);

  return {
    parar() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      document.removeEventListener("visibilitychange", aoVisibilidade);
    }
  };
}
