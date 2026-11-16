"""
Schemas Pydantic para request/response.
"""

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime


# ── Item ──

class ItemBase(BaseModel):
    # Limites espelham o maxlength dos forms (admin PWA) e o banco
    # (preco Numeric(10,2)): entrada fora do limite vira 422, não 500.
    nome: str = Field(..., min_length=1, max_length=60)
    descricao: Optional[str] = Field(None, max_length=200)
    preco: float = Field(..., ge=0, le=99_999_999.99)
    disponivel: bool = True
    imagem: Optional[str] = Field(None, max_length=2048)
    categoria: Optional[str] = Field(None, max_length=40)
    # Ids dos itens-base onde este item vale (M:N). Não-nula (mesmo vazia) =
    # este item é um adicional; None = item comum.
    aplica_em: Optional[List[int]] = None


class ItemCreate(ItemBase):
    pass


class ItemResponse(ItemBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# ── PedidoItem ──

class PedidoAdicionalCreate(BaseModel):
    item_id: int
    quantidade: int = Field(1, ge=1, le=999)


class PedidoItemCreate(BaseModel):
    item_id: int
    quantidade: int = Field(1, ge=1, le=999)
    # Adicionais escolhidos para esta linha (vazio quando o cliente não escolheu)
    adicionais: List[PedidoAdicionalCreate] = []


class PedidoItemResponse(BaseModel):
    id: int
    item_id: int
    quantidade: int
    # None em linhas antigas (pré-feature); clients tratam como vazia
    adicionais: Optional[List[PedidoAdicionalCreate]] = None
    item: Optional[ItemResponse] = None

    model_config = ConfigDict(from_attributes=True)


# ── Pedido ──

class PedidoCreate(BaseModel):
    itens: List[PedidoItemCreate] = Field(..., min_length=1)
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
    observacao: Optional[str] = Field(
        None,
        max_length=200,
        description="Observação livre do cliente (ex.: 'sem cebola')",
    )


class PedidoResponse(BaseModel):
    id: int
    numero: Optional[int] = None
    senha_retirada: Optional[str] = None
    nome_cliente: Optional[str] = None
    observacao: Optional[str] = None
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
