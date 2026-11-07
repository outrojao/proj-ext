"""
Schemas Pydantic para request/response.
"""

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime


# ── Item ──

class ItemBase(BaseModel):
    nome: str
    descricao: Optional[str] = None
    preco: float
    disponivel: bool = True
    imagem: Optional[str] = None
    categoria: Optional[str] = None


class ItemCreate(ItemBase):
    pass


class ItemResponse(ItemBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# ── PedidoItem ──

class PedidoItemCreate(BaseModel):
    item_id: int
    quantidade: int = 1


class PedidoItemResponse(BaseModel):
    id: int
    item_id: int
    quantidade: int
    item: Optional[ItemResponse] = None

    model_config = ConfigDict(from_attributes=True)


# ── Pedido ──

class PedidoCreate(BaseModel):
    itens: List[PedidoItemCreate]
    nome_cliente: Optional[str] = Field(
        None,
        max_length=40,
        description="Nome opcional do cliente (para o atendente identificar o pedido)",
    )
    horario_agendamento: Optional[str] = Field(
        None,
        pattern=r"^([01]\d|2[0-3]):[0-5]\d$",
        description="Horário no formato HH:MM (ex.: 14:30)",
    )


class PedidoResponse(BaseModel):
    id: int
    numero: Optional[int] = None
    senha_retirada: Optional[str] = None
    nome_cliente: Optional[str] = None
    horario_agendamento: Optional[str] = None
    status: str
    origem: str
    total: float
    itens: List[PedidoItemResponse] = []
    pagamento_declarado_em: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class StatusUpdate(BaseModel):
    novo_status: str  # PENDENTE, CONFIRMADO, PAGO, PRONTO, ENTREGUE, CANCELADO


class NumeroResponse(BaseModel):
    numero: int
