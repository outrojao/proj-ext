"""
Endpoints de pagamento Pix (manual, sem gateway de pagamento).

O payload é determinístico por pedido (txid = PED{id}), então não há
estado novo no banco: regenerar o QR é recomputar o mesmo payload.
"""

import os
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Pedido
from pix import build_pix_payload, pix_qr_base64
from websocket_manager import manager, websocket_event

router = APIRouter(prefix="/pedidos", tags=["pagamentos"])

EXPIRACAO_QR_MINUTOS = 10


def _obter_pedido(pedido_id: int, db: Session) -> Pedido:
    pedido = db.query(Pedido).filter(Pedido.id == pedido_id).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return pedido


def _config_pix() -> dict:
    return {
        "chave": os.getenv("PIX_CHAVE", ""),
        "nome": os.getenv("PIX_NOME", ""),
        "cidade": os.getenv("PIX_CIDADE", ""),
    }


@router.post("/{pedido_id}/pagamento")
def gerar_pagamento(pedido_id: int, db: Session = Depends(get_db)):
    """
    Gera o payload "copia e cola" e o QR Code Pix para um pedido CONFIRMADO.

    Retorna qr_code/copia_cola (payload EMV), qr_code_base64 (PNG data URI)
    e expira_em (apenas UX — o payload é determinístico, sem estado no banco).
    """
    pedido = _obter_pedido(pedido_id, db)
    if pedido.status != "CONFIRMADO":
        raise HTTPException(
            status_code=409,
            detail=f"Pagamento só pode ser gerado para pedidos CONFIRMADO (status atual: {pedido.status})",
        )

    config = _config_pix()
    if not config["chave"]:
        raise HTTPException(status_code=503, detail="Configuração Pix ausente no servidor (PIX_CHAVE)")

    payload = build_pix_payload(
        chave=config["chave"],
        nome=config["nome"],
        cidade=config["cidade"],
        valor=float(pedido.total),
        txid=f"PED{pedido.id}",
    )

    return {
        "qr_code": payload,
        "qr_code_base64": pix_qr_base64(payload),
        "copia_cola": payload,
        "expira_em": (datetime.now(UTC) + timedelta(minutes=EXPIRACAO_QR_MINUTOS)).isoformat(),
    }


@router.get("/{pedido_id}/pagamento")
def status_pagamento(pedido_id: int, db: Session = Depends(get_db)):
    """
    Retorna o status do pagamento para a PWA fazer polling.

    APROVADO quando o atendente marcou o pedido como PAGO no App Mobile.
    """
    pedido = _obter_pedido(pedido_id, db)
    return {"status": "APROVADO" if pedido.status == "PAGO" else "PENDENTE"}


@router.post("/{pedido_id}/declarar-pagamento")
async def declarar_pagamento(pedido_id: int, db: Session = Depends(get_db)):
    """
    Botão "Já paguei" da PWA: o cliente declara que pagou.

    Não muda o status do pedido — a confirmação é manual pelo atendente
    no App Mobile (PATCH /pedidos/{id}/status com PAGO).
    Persiste pagamento_declarado_em (o pwa-admin faz sync e vê declarações
    mesmo que estivesse offline quando o cliente clicou) e notifica o
    App Mobile via WebSocket (pagamento_declarado).
    """
    pedido = _obter_pedido(pedido_id, db)
    pedido.pagamento_declarado_em = datetime.now(UTC)
    db.commit()
    db.refresh(pedido)
    await manager.send_to_client(
        "pwa_admin",
        websocket_event("pagamento_declarado", {"pedido_id": pedido.id}),
    )
    return {
        "status": "OK",
        "pedido_id": pedido.id,
        "pagamento_declarado_em": pedido.pagamento_declarado_em.isoformat(),
    }
