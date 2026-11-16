"""
Router de pedidos — CRUD, status, numeração e notificações WebSocket.

Fluxo de status:
    PENDENTE → CONFIRMADO → PAGO → PRONTO → ENTREGUE
                                    ↓
                              CANCELADO

Regras:
- Número gerado quando status vira PAGO usando sequence PostgreSQL
- Painel LCD (ESP32) notificado apenas quando status vira PRONTO
- Painel LCD (ESP32) notificado quando status vira ENTREGUE (próximo da fila)
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_

from auth import tipo_cliente
from database import get_db
from models import Pedido, PedidoItem, Item
from painel_service import (
    evento_pedido,
    finalizar_exibicao,
    preparar_pedido_pronto,
)
from pedidos_service import marcar_pago
from schemas import PedidoCreate, PedidoResponse, StatusUpdate, NumeroResponse
from websocket_manager import manager, websocket_event

router = APIRouter(prefix="/pedidos", tags=["pedidos"])

# Transições de status válidas
TRANSICOES_VALIDAS = {
    "PENDENTE": {"CONFIRMADO", "CANCELADO"},
    "CONFIRMADO": {"PAGO", "CANCELADO"},
    "PAGO": {"PRONTO", "CANCELADO"},
    "PRONTO": {"ENTREGUE"},
    "ENTREGUE": set(),
    "CANCELADO": set(),
}


def calcular_total(db: Session, itens: list[PedidoItem]) -> float:
    """Calcula o total do pedido: itens + adicionais escolhidos em cada linha."""
    total = Decimal("0.00")
    for pi in itens:
        item = db.query(Item).filter(Item.id == pi.item_id).first()
        if item:
            total += item.preco * pi.quantidade
        for ad in pi.adicionais or []:
            ad_item = db.query(Item).filter(Item.id == ad["item_id"]).first()
            if ad_item:
                total += ad_item.preco * ad.get("quantidade", 1)
    return total


@router.post("", response_model=PedidoResponse, status_code=201)
async def criar_pedido(pedido: PedidoCreate, db: Session = Depends(get_db)):
    """
    Cria um novo pedido (origem PWA, status PENDENTE).
    Notifica o App Mobile via WebSocket (novo_pedido).
    """
    # Validar itens + adicionais de cada linha
    for pi in pedido.itens:
        item = db.query(Item).filter(Item.id == pi.item_id).first()
        if not item:
            raise HTTPException(status_code=400, detail=f"Item {pi.item_id} não encontrado")
        if not item.disponivel:
            raise HTTPException(status_code=400, detail=f"Item '{item.nome}' não está disponível")
        for ad in pi.adicionais:
            ad_item = db.query(Item).filter(Item.id == ad.item_id).first()
            if not ad_item:
                raise HTTPException(status_code=400, detail=f"Adicional {ad.item_id} não encontrado")
            if not ad_item.disponivel:
                raise HTTPException(status_code=400, detail=f"Adicional '{ad_item.nome}' não está disponível")
            if not ad_item.aplica_em or pi.item_id not in ad_item.aplica_em:
                raise HTTPException(
                    status_code=400,
                    detail=f"Adicional '{ad_item.nome}' não pertence ao item '{item.nome}'",
                )

    # Criar pedido
    db_pedido = Pedido(
        horario_agendamento=pedido.horario_agendamento,
        nome_cliente=pedido.nome_cliente,
        observacao=pedido.observacao,
        status="PENDENTE",
        origem="PWA_CLIENTE",
        total=0.0,
    )
    db.add(db_pedido)

    # Criar itens do pedido (via relationship para o cálculo do total);
    # adicionais ficam congelados na linha (histórico do que foi escolhido)
    for pi in pedido.itens:
        db_pedido.itens.append(
            PedidoItem(
                item_id=pi.item_id,
                quantidade=pi.quantidade,
                adicionais=[{"item_id": ad.item_id, "quantidade": ad.quantidade} for ad in pi.adicionais],
            )
        )

    # Calcular total
    db_pedido.total = calcular_total(db, db_pedido.itens)

    db.commit()
    db.refresh(db_pedido)

    # Notificar App Mobile: novo pedido
    await manager.send_to_client(
        "pwa_admin",
        websocket_event("novo_pedido", {
            "pedido_id": db_pedido.id,
            "status": db_pedido.status,
        }),
    )

    return db_pedido


@router.get("", response_model=list[PedidoResponse])
def listar_pedidos(db: Session = Depends(get_db)):
    """Lista todos os pedidos (para o App Mobile)."""
    return db.query(Pedido).order_by(Pedido.id.desc()).all()


@router.get("/pendentes", response_model=list[PedidoResponse])
def listar_pendentes(db: Session = Depends(get_db)):
    """Lista pedidos pendentes de confirmação."""
    return db.query(Pedido).filter(Pedido.status == "PENDENTE").order_by(Pedido.id).all()


@router.get("/fila-painel", response_model=list[PedidoResponse])
def fila_painel(db: Session = Depends(get_db)):
    """
    Retorna pedidos com status PRONTO e origem PWA aguardando na fila,
    ordenados pela posição na fila (menor primeiro).
    Usado pelo ESP32 para sincronizar ao reconectar.
    """
    return (
        db.query(Pedido)
        .filter(
            Pedido.status == "PRONTO",
            Pedido.origem == "PWA_CLIENTE",
            or_(
                Pedido.painel_status == "AGUARDANDO",
                Pedido.painel_status.is_(None),
            ),
        )
        .order_by(
            Pedido.painel_fila_posicao.asc().nulls_last(),
            Pedido.numero,
        )
        .all()
    )


@router.get("/{pedido_id}", response_model=PedidoResponse)
def obter_pedido(pedido_id: int, db: Session = Depends(get_db)):
    """Obtém um pedido específico por ID."""
    pedido = db.query(Pedido).filter(Pedido.id == pedido_id).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return pedido


@router.get("/{pedido_id}/numero", response_model=NumeroResponse)
def obter_numero(pedido_id: int, db: Session = Depends(get_db)):
    """Retorna o número do pedido (apenas para pedidos PWA já pagos)."""
    pedido = db.query(Pedido).filter(Pedido.id == pedido_id).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if pedido.numero is None:
        raise HTTPException(status_code=400, detail="Pedido ainda não foi pago — número não gerado")
    return NumeroResponse(numero=pedido.numero)


@router.patch("/{pedido_id}/status", response_model=PedidoResponse)
async def atualizar_status(
    pedido_id: int,
    status_update: StatusUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Atualiza o status de um pedido.

    Regras:
    - PAGO: gera número sequencial + senha de retirada (não notifica painel)
    - PRONTO: notifica painel LCD (ESP32) — pedido_pronto
    - ENTREGUE: notifica painel LCD (ESP32) — pedido_entregue (próximo da fila)
    - Qualquer mudança: notifica PWA + App Mobile — status_atualizado
    - Apenas a chave do admin pode mudar status (401 para as demais)
    """
    if tipo_cliente(request.headers.get("X-API-Key")) != "pwa_admin":
        raise HTTPException(status_code=401, detail="Apenas o admin pode mudar o status de pedidos")

    pedido = db.query(Pedido).filter(Pedido.id == pedido_id).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    novo_status = status_update.novo_status.upper()

    # Validar transição
    status_atual = pedido.status
    if novo_status not in TRANSICOES_VALIDAS.get(status_atual, set()):
        raise HTTPException(
            status_code=400,
            detail=f"Transição inválida: {status_atual} → {novo_status}",
        )

    if novo_status == "PAGO":
        marcar_pago(db, pedido)
    else:
        pedido.status = novo_status
        db.commit()
        db.refresh(pedido)

    # Notificar PWA + App Mobile: status atualizado
    await manager.send_to_clients(
        ["pwa_cliente", "pwa_admin"],
        websocket_event("status_atualizado", {
            "pedido_id": pedido.id,
            "status": pedido.status,
            "numero": pedido.numero,
        }),
    )

    # Se virou PRONTO, colocar na fila do painel LCD (ESP32).
    if novo_status == "PRONTO" and pedido.origem == "PWA_CLIENTE":
        pedido_para_exibir = preparar_pedido_pronto(db, pedido)
        if pedido_para_exibir:
            await manager.send_to_client("esp32", evento_pedido("pedido_pronto", pedido_para_exibir))

    # Se virou ENTREGUE, liberar o painel LCD e avançar a fila.
    if novo_status == "ENTREGUE" and pedido.origem == "PWA_CLIENTE":
        proximo = finalizar_exibicao(db, pedido)
        await manager.send_to_client("esp32", evento_pedido("pedido_entregue", pedido))
        if proximo:
            await manager.send_to_client("esp32", evento_pedido("pedido_pronto", proximo))
        else:
            await manager.send_to_client("esp32", websocket_event("fila_vazia"))

    return pedido
