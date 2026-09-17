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

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db
from models import Pedido, PedidoItem, Item
from schemas import PedidoCreate, PedidoResponse, StatusUpdate, NumeroResponse
from websocket_manager import manager

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


def gerar_numero_pedido(db: Session) -> int:
    """Obtém o próximo número de pedido da sequence."""
    return db.execute(
        text("SELECT nextval('pedido_numero_seq')")
    ).scalar_one()


def calcular_total(db: Session, itens: list[PedidoItem]) -> float:
    """Calcula o total do pedido baseado nos itens e quantidades."""
    total = Decimal("0.00")
    for pi in itens:
        item = db.query(Item).filter(Item.id == pi.item_id).first()
        if item:
            total += item.preco * pi.quantidade
    return total


@router.post("", response_model=PedidoResponse, status_code=201)
async def criar_pedido(pedido: PedidoCreate, db: Session = Depends(get_db)):
    """
    Cria um novo pedido (origem PWA, status PENDENTE).
    Notifica o App Mobile via WebSocket (novo_pedido).
    """
    # Validar itens
    for pi in pedido.itens:
        item = db.query(Item).filter(Item.id == pi.item_id).first()
        if not item:
            raise HTTPException(status_code=400, detail=f"Item {pi.item_id} não encontrado")
        if not item.disponivel:
            raise HTTPException(status_code=400, detail=f"Item '{item.nome}' não está disponível")

    # Criar pedido
    db_pedido = Pedido(
        horario_agendamento=pedido.horario_agendamento,
        status="PENDENTE",
        origem="PWA",
        total=0.0,
    )
    db.add(db_pedido)
    db.flush()  # Para obter o ID

    # Criar itens do pedido
    for pi in pedido.itens:
        db_pedido_item = PedidoItem(
            pedido_id=db_pedido.id,
            item_id=pi.item_id,
            quantidade=pi.quantidade,
        )
        db.add(db_pedido_item)

    # Calcular total
    db_pedido.total = calcular_total(db, db_pedido.itens)

    db.commit()
    db.refresh(db_pedido)

    # Notificar App Mobile: novo pedido
    await manager.send_to_client("app_mobile", {
        "event": "novo_pedido",
        "pedido_id": db_pedido.id,
        "status": db_pedido.status,
    })

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
    Retorna pedidos com status PRONTO e origem PWA, ordenados por número.
    Usado pelo ESP32 para sincronizar ao reconectar.
    """
    return (
        db.query(Pedido)
        .filter(Pedido.status == "PRONTO", Pedido.origem == "PWA")
        .order_by(Pedido.numero)
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
    db: Session = Depends(get_db),
):
    """
    Atualiza o status de um pedido.

    Regras:
    - PAGO: gera número sequencial (não notifica painel)
    - PRONTO: notifica painel LCD (ESP32) — pedido_pronto
    - ENTREGUE: notifica painel LCD (ESP32) — pedido_entregue (próximo da fila)
    - Qualquer mudança: notifica PWA + App Mobile — status_atualizado
    """
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

    pedido.status = novo_status

    # Se virou PAGO, gerar número sequencial
    if novo_status == "PAGO" and pedido.numero is None:
        pedido.numero = gerar_numero_pedido(db)

    db.commit()
    db.refresh(pedido)

    # Notificar PWA + App Mobile: status atualizado
    await manager.send_to_clients(["pwa", "app_mobile"], {
        "event": "status_atualizado",
        "pedido_id": pedido.id,
        "status": pedido.status,
        "numero": pedido.numero,
    })

    # Se virou PRONTO, notificar painel LCD (ESP32)
    if novo_status == "PRONTO" and pedido.origem == "PWA":
        await manager.send_to_client("esp32", {
            "event": "pedido_pronto",
            "pedido_id": pedido.id,
            "numero": pedido.numero,
        })

    # Se virou ENTREGUE, notificar painel LCD para próximo da fila
    if novo_status == "ENTREGUE" and pedido.origem == "PWA":
        await manager.send_to_client("esp32", {
            "event": "pedido_entregue",
            "pedido_id": pedido.id,
        })

    return pedido
