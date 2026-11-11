"""
Regras de fila e eventos do painel LCD ESP32.

O ESP32 é um consumidor simples: o backend decide o que exibir e envia
por WebSocket. O timeout de exibição é todo do lado do backend: se um
pedido ficar exibido por mais que o tempo limite (PAINEL_TIMEOUT_MINUTOS,
padrão 10) e houver outro pedido PRONTO aguardando, ele vai para o fim
da fila e o próximo pedido pronto passa a ser exibido. Com um único
pedido na fila não há rotação.
"""

import asyncio
import os
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Pedido
from websocket_manager import manager, websocket_event

PAINEL_AGUARDANDO = "AGUARDANDO"
PAINEL_EXIBINDO = "EXIBINDO"
PAINEL_ENTREGUE = "ENTREGUE"

ENV_TIMEOUT_MINUTOS = "PAINEL_TIMEOUT_MINUTOS"
TIMEOUT_PADRAO_MINUTOS = 10


def timeout_exibicao() -> timedelta:
    """Tempo limite de exibição de um pedido no painel (configurável via env)."""
    try:
        minutos = float(os.getenv(ENV_TIMEOUT_MINUTOS, str(TIMEOUT_PADRAO_MINUTOS)))
    except ValueError:
        minutos = TIMEOUT_PADRAO_MINUTOS
    return timedelta(minutes=minutos)


def evento_pedido(event: str, pedido: Pedido) -> dict:
    """Cria o formato de evento usado exclusivamente pelo painel ESP32."""
    return websocket_event(event, {
            "pedido_id": pedido.id,
            "numero": pedido.numero,
            "nome_cliente": pedido.nome_cliente,
        })


def _na_fila():
    """Condição: na fila do painel (aguardando ou sem estado de painel)."""
    return or_(
        Pedido.painel_status == PAINEL_AGUARDANDO,
        Pedido.painel_status.is_(None),
    )


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
            _na_fila(),
        )
        .order_by(
            Pedido.painel_fila_posicao.asc().nulls_last(),
            Pedido.numero,
        )
        .first()
    )


def _proxima_posicao_fila(db: Session) -> int:
    """Próxima posição da fila (maior + 1): quem entra recebe o fim da fila."""
    maior = (
        db.query(func.max(Pedido.painel_fila_posicao))
        .filter(
            Pedido.status == "PRONTO",
            Pedido.origem == "PWA",
            _na_fila(),
        )
        .scalar()
    )
    return (maior + 1) if maior is not None else 1


def iniciar_proximo_pedido(db: Session) -> Pedido | None:
    """Reserva o próximo pedido para exibição no LCD e agenda o timeout."""
    pedido = proximo_pedido(db)
    if pedido is None:
        return None

    pedido.painel_status = PAINEL_EXIBINDO
    pedido.painel_exibido_em = datetime.now(UTC)
    pedido.painel_fila_posicao = None
    db.commit()
    db.refresh(pedido)

    agendar_expiracao_exibicao(pedido.id)
    return pedido


def preparar_pedido_pronto(db: Session, pedido: Pedido) -> Pedido | None:
    """Coloca um pedido recém-pronto na fila e inicia-o se o painel estiver livre."""
    pedido.painel_status = PAINEL_AGUARDANDO
    pedido.painel_exibido_em = None
    pedido.painel_expirado_em = None
    pedido.painel_fila_posicao = _proxima_posicao_fila(db)
    db.flush()

    if pedido_exibindo(db) is not None:
        db.commit()
        return None

    return iniciar_proximo_pedido(db)

def _tempo_exibicao_excedido(db: Session, pedido: Pedido) -> bool:
    exibido_em = pedido.painel_exibido_em

    if exibido_em is None:
        return False

    agora = db.scalar(select(func.now()))
    if agora is None:
        return False
    if agora.tzinfo is not None:
        agora = agora.replace(tzinfo=None)
    if exibido_em.tzinfo is not None:
        exibido_em = exibido_em.replace(tzinfo=None)
    return (agora - exibido_em) >= timeout_exibicao()

def expirar_exibicao(db: Session, pedido_id: int) -> Pedido | None:
    """
    Rotação de fila por timeout, controlada pelo backend.

    Se o pedido pedido_id segue EXIBINDO há mais que o tempo limite e há
    outro pedido PRONTO na fila, ele vai para o fim da fila (AGUARDANDO)
    e o próximo da fila passa a ser exibido. Com apenas um pedido não
    há rotação. Retorna o pedido que passou a ser exibido (ou None).
    """
    exibindo = (
        db.query(Pedido)
        .filter(
            Pedido.id == pedido_id,
            Pedido.status == "PRONTO",
            Pedido.origem == "PWA",
            Pedido.painel_status == PAINEL_EXIBINDO,
        )
        .first()
    )
    if exibindo is None or not _tempo_exibicao_excedido(db, exibindo):
        return None

    if proximo_pedido(db) is None:
        return None  # pedido único: sem rotação

    exibindo.painel_status = PAINEL_AGUARDANDO
    exibindo.painel_exibido_em = None
    exibindo.painel_expirado_em = datetime.now(UTC)
    exibindo.painel_fila_posicao = _proxima_posicao_fila(db)
    db.flush()

    return iniciar_proximo_pedido(db)


def finalizar_exibicao(db: Session, pedido: Pedido) -> Pedido | None:
    """Finaliza a exibição e reserva o próximo pedido da fila."""
    estava_exibindo = pedido.painel_status == PAINEL_EXIBINDO
    pedido.painel_status = PAINEL_ENTREGUE
    pedido.painel_entregue_em = datetime.now(UTC)
    pedido.painel_fila_posicao = None
    db.flush()
    if not estava_exibindo:
        db.commit()
        return None

    next_order = iniciar_proximo_pedido(db)
    if next_order is None:
        db.commit()
    return next_order


async def _tarefa_expirar_exibicao(pedido_id: int) -> None:
    """
    Tarefa de fundo do timeout de exibição.

    A cada ciclo verifica se a exibição do pedido expirou e se há pedido
    na fila: se sim, rotaciona e notifica o ESP32 (a nova exibição agenda
    a própria tarefa). Se a exibição terminou (entregue/cancelado), encerra.
    Se o tempo passou sem fila, continua verificando (a fila pode encher
    depois).
    """
    while True:
        await asyncio.sleep(timeout_exibicao().total_seconds())

        db = SessionLocal()
        try:
            pedido = db.query(Pedido).filter(Pedido.id == pedido_id).first()
            ainda_exibindo = (
                pedido is not None
                and pedido.status == "PRONTO"
                and pedido.origem == "PWA"
                and pedido.painel_status == PAINEL_EXIBINDO
            )
            proximo = expirar_exibicao(db, pedido_id) if ainda_exibindo else None
        finally:
            db.close()

        if proximo is not None:
            await manager.send_to_client("esp32", evento_pedido("pedido_pronto", proximo))
            return

        if not ainda_exibindo:
            return  # exibição finalizada: nada a fazer


def agendar_expiracao_exibicao(pedido_id: int) -> None:
    """
    Agenda a verificação de timeout da exibição atual.

    Sem event loop em execução (ex.: testes síncronos) não agenda; a
    verificação será refeita no reconectar do ESP32.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(_tarefa_expirar_exibicao(pedido_id))
