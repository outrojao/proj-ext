// View ACOMPANHAMENTO: timeline do status do pedido até ENTREGUE.
import { CONFIG } from "../config.js";
import { apiGet, ErroApi } from "../api.js";
import { criarPoll, vibrar } from "../state.js";

const ROTULO_STATUS = {
  PENDENTE: "Confirmando com a loja…",
  CONFIRMADO: "Pedido confirmado! Aguardando pagamento.",
  PAGO: "Pagamento recebido. Em preparo…",
  PRONTO: "Seu pedido está pronto! Retire com o número e a senha.",
  ENTREGUE: "Pedido entregue. Obrigado!"
};

const INDICE_STATUS = {
  PENDENTE: 0,
  CONFIRMADO: 1,
  PAGO: 2,
  PRONTO: 3,
  ENTREGUE: 4
};

let ctx = null;
let poll = null;
let ultimoStatus = null;
let vinculado = false;

export function entrar(c) {
  ctx = c;
  const pedido = ctx.store.pedido;
  if (!pedido) {
    ctx.irPara("CARDAPIO");
    return;
  }
  if (!vinculado) {
    vinculado = true;
    document.getElementById("btn-entregue-novo").addEventListener("click", () => ctx.novoPedido());
    // Lê do store (não do fechamento): a identificação pode mudar depois
    // do entrar, quando o número/senha chegam.
    document.getElementById("btn-copiar-identificacao").addEventListener("click", () => {
      const p = ctx.store.pedido;
      const texto = `Pedido ${p.numero ?? "…"} — senha ${p.senha_retirada ?? "…"}`;
      ctx.copiar(texto, "Informações copiadas!");
    });
  }

  atualizarIdentificacao(pedido);
  ultimoStatus = pedido.status;
  atualizarTimeline(pedido.status);

  if (pedido.status === "ENTREGUE") {
    mostrarFim();
    return;
  }
  if (pedido.status === "PRONTO") vibrar([200, 100, 200]);

  poll = criarPoll(async () => {
    try {
      const atual = await apiGet(`/pedidos/${pedido.id}`);
      if (atual.status !== ultimoStatus) {
        if (atual.status === "PRONTO") {
          vibrar([200, 100, 200]);
          ctx.toast("Seu pedido está pronto!", "sucesso");
        }
        ultimoStatus = atual.status;
        atualizarTimeline(atual.status);
      }
      if (atual.status === "ENTREGUE") {
        poll.parar();
        poll = null;
        mostrarFim();
        return;
      }
      if (atual.status === "CANCELADO") {
        poll.parar();
        poll = null;
        ctx.store.cancelado = true;
        ctx.persistir();
        ctx.irPara("AGUARDANDO_CONFIRMACAO");
        return;
      }
      const anterior = ctx.store.pedido;
      ctx.store.pedido = atual;
      ctx.persistir();
      // O número/senha podem chegar depois do entrar (retry da tela de
      // confirmação): re-renderiza a identificação quando mudarem.
      if (
        (anterior.numero ?? null) !== (atual.numero ?? null) ||
        (anterior.senha_retirada ?? null) !== (atual.senha_retirada ?? null)
      ) {
        atualizarIdentificacao(atual);
      }
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) {
        ctx.erroAutenticacao();
        return;
      }
      // Falha de rede: o próximo ciclo tenta de novo.
    }
  }, CONFIG.POLL_STATUS_MS);
}

export function sair() {
  if (poll) {
    poll.parar();
    poll = null;
  }
}

function atualizarIdentificacao(pedido) {
  document.getElementById("acom-numero").textContent =
    pedido.numero != null ? String(pedido.numero) : "—";
  document.getElementById("acom-senha").textContent = pedido.senha_retirada || "—";
}

function atualizarTimeline(status) {
  const indice = INDICE_STATUS[status] ?? 0;
  document.querySelectorAll("#timeline li").forEach((li) => {
    const passo = Number(li.dataset.passo);
    li.classList.toggle("feito", passo < indice);
    li.classList.toggle("ativo", passo === indice);
    if (passo === indice) li.setAttribute("aria-current", "step");
    else li.removeAttribute("aria-current");
  });
  document.getElementById("acompanhamento-status").textContent = ROTULO_STATUS[status] || "";
}

function mostrarFim() {
  atualizarTimeline("ENTREGUE");
  // O cartão final já traz "Pedido entregue. Obrigado!" — limpa a linha de
  // status para a mensagem não aparecer duas vezes.
  document.getElementById("acompanhamento-status").textContent = "";
  document.getElementById("acompanhamento-fim").hidden = false;
}
