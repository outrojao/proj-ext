// View CONFIRMACAO: número do pedido + senha de retirada (clímax do fluxo).
import { vibrar } from "../state.js";

let ctx = null;
let vinculado = false;

export function entrar(c) {
  ctx = c;
  const pedido = ctx.store.pedido;

  const numeroEl = document.getElementById("confirmacao-numero");
  const senhaEl = document.getElementById("confirmacao-senha");
  const senhaSr = document.getElementById("confirmacao-senha-sr");

  if (pedido.numero != null) {
    numeroEl.textContent = String(pedido.numero);
  } else {
    numeroEl.textContent = "…";
  }

  senhaEl.innerHTML = "";
  if (pedido.senha_retirada) {
    for (const caractere of pedido.senha_retirada) {
      const tecla = document.createElement("span");
      tecla.className = "senha-tecla";
      tecla.textContent = caractere;
      senhaEl.appendChild(tecla);
    }
    senhaSr.textContent = `Senha de retirada: ${pedido.senha_retirada.split("").join(" ")}`;
  } else {
    senhaSr.textContent = "Senha de retirada em processamento.";
  }

  if (!vinculado) {
    vinculado = true;
    document.getElementById("btn-copiar-numero").addEventListener("click", () => {
      if (ctx.store.pedido.numero != null) ctx.copiar(String(ctx.store.pedido.numero), "Número copiado!");
    });
    document.getElementById("btn-copiar-senha").addEventListener("click", () => {
      if (ctx.store.pedido.senha_retirada) ctx.copiar(ctx.store.pedido.senha_retirada, "Senha copiada!");
    });
    document.getElementById("btn-acompanhar").addEventListener("click", () => ctx.irPara("ACOMPANHAMENTO"));
  }

  vibrar(80);
}

export function sair() {}
