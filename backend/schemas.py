"""
Schemas Pydantic para request/response.
"""

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ── Item ──

class ItemBase(BaseModel):
    nome: str
    descricao: Optional[str] = None
    preco: float
    disponivel: bool = True


class ItemCreate(ItemBase):
    pass


class ItemResponse(ItemBase):
    id: int

    class Config:
        from_attributes = True


# ── PedidoItem ──

class PedidoItemCreate(BaseModel):
    item_id: int
    quantidade: int = 1


class PedidoItemResponse(BaseModel):
    id: int
    item_id: int
    quantidade: int
    item: Optional[ItemResponse] = None

    class Config:
        from_attributes = True


# ── Pedido ──

class PedidoCreate(BaseModel):
    itens: List[PedidoItemCreate]
    horario_agendamento: Optional[str] = None


class PedidoResponse(BaseModel):
    id: int
    numero: Optional[int] = None
    horario_agendamento: Optional[str] = None
    status: str
    origem: str
    total: float
    itens: List[PedidoItemResponse] = []

    class Config:
        from_attributes = True


class StatusUpdate(BaseModel):
    novo_status: str  # PENDENTE, CONFIRMADO, PAGO, PRONTO, ENTREGUE, CANCELADO


class NumeroResponse(BaseModel):
    numero: int
