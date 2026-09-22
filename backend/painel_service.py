"""Regras de fila e eventos do painel LCD ESP32."""

from datetime import datetime

from sqlalchemy import or_
from sqlalchemy.orm import Session

from models import Pedido
from websocket_manager import websocket_event

PAINEL_AGUARDANDO = "AGUARDANDO"
PAINEL_EXIBINDO = "EXIBINDO"
PAINEL_EXPIRADO = "EXPIRADO"
PAINEL_ENTREGUE = "ENTREGUE"


def evento_pedido(event: str, pedido: Pedido) -> dict:
    """Cria o formato de evento usado exclusivamente pelo painel ESP32."""
    return websocket_event(event, {
            "pedido_id": pedido.id,
            "numero": pedido.numero,
        })


def pedido_exibindo(db: Session) -> Pedido | None:
    return (
        db.query(Pedido)
        .filter(
            Pedido.status == "PRONTO",
            Pedido.origem == "PWA",
            Pedido.painel_status == PAINEL_EXIBINDO,
        )
        .order_by(Pedido.painel_exibido_em, Pedido.numero)
        .first()
    )


def proximo_pedido(db: Session) -> Pedido | None:
    return (
        db.query(Pedido)
        .filter(
            Pedido.status == "PRONTO",
            Pedido.origem == "PWA",
            or_(
                Pedido.painel_status == PAINEL_AGUARDANDO,
                Pedido.painel_status.is_(None),
            ),
        )
        .order_by(Pedido.numero)
        .first()
    )


def iniciar_proximo_pedido(db: Session) -> Pedido | None:
    """Reserva o próximo pedido para exibição no LCD."""
    pedido = proximo_pedido(db)
    if pedido is None:
        return None

    pedido.painel_status = PAINEL_EXIBINDO
    pedido.painel_exibido_em = datetime.utcnow()
    db.commit()
    db.refresh(pedido)
    return pedido


def preparar_pedido_pronto(db: Session, pedido: Pedido) -> Pedido | None:
    """Coloca um pedido recém-pronto na fila e inicia-o se o painel estiver livre."""
    pedido.painel_status = PAINEL_AGUARDANDO
    pedido.painel_exibido_em = None
    pedido.painel_expirado_em = None
    db.flush()

    if pedido_exibindo(db) is not None:
        db.commit()
        return None

    return iniciar_proximo_pedido(db)


def expirar_pedido(db: Session, pedido_id: int) -> Pedido | None:
    """Marca uma exibição como expirada e reserva o próximo pedido."""
    pedido = (
        db.query(Pedido)
        .filter(
            Pedido.id == pedido_id,
            Pedido.status == "PRONTO",
            Pedido.origem == "PWA",
        )
        .first()
    )
    if pedido is None:
        return None

    if pedido.painel_status == PAINEL_EXPIRADO:
        return None

    if pedido.painel_status != PAINEL_EXIBINDO:
        return None

    pedido.painel_status = PAINEL_EXPIRADO
    pedido.painel_expirado_em = datetime.utcnow()
    db.flush()
    next_order = iniciar_proximo_pedido(db)
    if next_order is None:
        db.commit()
    return next_order


def finalizar_exibicao(db: Session, pedido: Pedido) -> Pedido | None:
    """Finaliza a exibição e reserva o próximo pedido da fila."""
    estava_exibindo = pedido.painel_status == PAINEL_EXIBINDO
    pedido.painel_status = PAINEL_ENTREGUE
    pedido.painel_entregue_em = datetime.utcnow()
    db.flush()
    if not estava_exibindo:
        db.commit()
        return None

    next_order = iniciar_proximo_pedido(db)
    if next_order is None:
        db.commit()
    return next_order