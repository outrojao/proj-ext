// View PAGAMENTO: QR Pix + copia-e-cola + polling de aprovação.
// O PWA só exibe o QR gerado no backend (chave Pix fica no servidor).
import { CONFIG } from "../config.js";
import { apiGet, apiPost, ErroApi } from "../api.js";
import { criarPoll, formatarTempo, copiarTexto, formatarBRL } from "../state.js";
import { qrExpirado } from "../pix.js";

let ctx = null;
let poll = null;
let cronometro = null;
let inicio = 0;
let expiraEm = null;
let aguardandoNumero = false;
let vinculado = false;

export function entrar(c) {
  ctx = c;
  if (!vinculado) {
    vinculado = true;
    document.getElementById("btn-copiar-pix").addEventListener("click", copiarCopiaCola);
    document.getElementById("btn-novo-qr").addEventListener("click", () => iniciarPagamento());
    document.getElementById("btn-novo-pedido-pagamento").addEventListener("click", () => ctx.novoPedido());
    document.getElementById("btn-ja-paguei").addEventListener("click", jaPaguei);
  }
  const pedido = ctx.store.pedido;
  document.getElementById("pagamento-total").textContent = `Total: ${formatarBRL(pedido.total)}`;
  iniciarPagamento();
}

export function sair() {
  pararTudo();
}

function pararTudo() {
  if (poll) {
    poll.parar();
    poll = null;
  }
  if (cronometro) {
    clearInterval(cronometro);
    cronometro = null;
  }
}

// Gera um QR Code REAL a partir do copia-e-cola (payload EMV montado pelo
// backend). A lib roda 100% local (js/vendor), offline incluso. Fallback: a
// imagem pré-gerada que o backend também devolve.
function montarQr(pagamento) {
  try {
    const qr = window.qrcode(0, "M");
    qr.addData(pagamento.copia_cola);
    qr.make();
    return qr.createDataURL(8, 2);
  } catch {
    return pagamento.qr_code_base64 || "";
  }
}

function mostrarGerando(mostrar) {
  document.getElementById("pagamento-gerando").hidden = !mostrar;
  document.getElementById("pagamento-qrcode").hidden = mostrar;
}

function mostrarFalhaGeracao() {
  mostrarGerando(false);
  document.getElementById("pagamento-qrcode").hidden = true;
  document.getElementById("pagamento-expirado").hidden = false;
  document.getElementById("pagamento-status").textContent = "Não foi possível gerar o QR Code.";
}

function iniciarPagamento() {
  pararTudo();
  expiraEm = null;
  aguardandoNumero = false;
  const pedido = ctx.store.pedido;
  document.getElementById("pagamento-expirado").hidden = true;
  document.getElementById("pagamento-status").textContent = "Gerando QR Code…";
  const qrImagem = document.getElementById("pagamento-qr");
  qrImagem.src = "";
  qrImagem.alt = "Gerando QR Code…";
  mostrarGerando(true);

  apiPost(`/pedidos/${pedido.id}/pagamento`)
    .then((pagamento) => {
      expiraEm = pagamento.expira_em;
      const imagem = document.getElementById("pagamento-qr");
      imagem.src = montarQr(pagamento);
      imagem.alt = `QR Code Pix para pagamento do pedido ${pedido.id}`;
      document.getElementById("pagamento-copia-cola").value = pagamento.copia_cola;
      document.getElementById("pagamento-status").textContent = "Aguardando pagamento.";
      mostrarGerando(false);
      iniciarCronometro();
      iniciarPoll();
    })
    .catch((e) => {
      if (e instanceof ErroApi && e.status === 401) {
        ctx.erroAutenticacao();
        return;
      }
      // 409: status mudou (ex.: pedido cancelado). Confirma o estado real.
      apiGet(`/pedidos/${pedido.id}`)
        .then((atual) => {
          ctx.store.pedido = atual;
          ctx.persistir();
          if (atual.status === "CANCELADO") {
            ctx.store.cancelado = true;
            ctx.persistir();
            ctx.irPara("AGUARDANDO_CONFIRMACAO");
          } else if (atual.status === "PAGO") {
            ctx.irPara("CONFIRMACAO");
          } else {
            mostrarFalhaGeracao();
          }
        })
        .catch(() => {
          mostrarFalhaGeracao();
        });
    });
}

function iniciarCronometro() {
  inicio = Date.now();
  const cronEl = document.getElementById("pagamento-cronometro");
  cronEl.textContent = "Aguardando pagamento… 00:00";
  cronometro = setInterval(() => {
    cronEl.textContent = `Aguardando pagamento… ${formatarTempo((Date.now() - inicio) / 1000)}`;
  }, 1000);
}

function iniciarPoll() {
  const pedido = ctx.store.pedido;
  poll = criarPoll(async () => {
    if (aguardandoNumero) return;
    if (qrExpirado(expiraEm)) {
      pararTudo();
      document.getElementById("pagamento-qrcode").hidden = true;
      document.getElementById("pagamento-expirado").hidden = false;
      document.getElementById("pagamento-status").textContent = "QR Code expirou.";
      return;
    }
    try {
      const status = await apiGet(`/pedidos/${pedido.id}/pagamento`);
      if (status.status === "APROVADO") {
        pararTudo();
        await aguardarNumeroESenha(pedido.id);
      }
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) {
        ctx.erroAutenticacao();
        return;
      }
      // Falha de rede: o próximo ciclo tenta de novo.
    }
  }, CONFIG.POLL_PIX_MS);
}

// Após o Pix cair, o backend gera numero + senha_retirada no mesmo passo.
// Poll o pedido até os dois campos existirem (máx. ~15s).
async function aguardarNumeroESenha(pedidoId) {
  aguardandoNumero = true;
  document.getElementById("pagamento-status").textContent = "Pagamento aprovado! Gerando seu número…";
  for (let i = 0; i < 10; i++) {
    try {
      const atual = await apiGet(`/pedidos/${pedidoId}`);
      ctx.store.pedido = atual;
      if (atual.numero != null && atual.senha_retirada) {
        ctx.persistir();
        ctx.irPara("CONFIRMACAO");
        return;
      }
      if (atual.status === "CANCELADO") {
        ctx.store.cancelado = true;
        ctx.persistir();
        ctx.irPara("AGUARDANDO_CONFIRMACAO");
        return;
      }
    } catch {
      // tenta de novo no próximo ciclo
    }
    await new Promise((resolver) => setTimeout(resolver, 1500));
  }
  ctx.persistir();
  ctx.irPara("CONFIRMACAO");
}

async function copiarCopiaCola() {
  const ok = await copiarTexto(document.getElementById("pagamento-copia-cola").value);
  ctx.toast(ok ? "Código copiado!" : "Não foi possível copiar.", ok ? "sucesso" : "erro");
}

async function jaPaguei() {
  const pedido = ctx.store.pedido;
  try {
    await apiPost(`/pedidos/${pedido.id}/declarar-pagamento`);
    ctx.toast("A loja foi avisada. Aguardando a confirmação do pagamento.", "sucesso");
  } catch (e) {
    if (e instanceof ErroApi && e.status === 401) {
      ctx.erroAutenticacao();
      return;
    }
    ctx.toast("Não foi possível avisar a loja agora.", "erro");
  }
}
