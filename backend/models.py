"""
Modelos SQLAlchemy: Item, Pedido, PedidoItem.
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import relationship

from database import Base


class Item(Base):
    __tablename__ = "itens"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    descricao = Column(String, nullable=True)
    preco = Column(Numeric(10, 2), nullable=False)
    disponivel = Column(Boolean, default=True)

    pedido_itens = relationship("PedidoItem", back_populates="item")


class Pedido(Base):
    __tablename__ = "pedidos"

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(Integer, nullable=True, index=True)  # Gerado quando status vira PAGO
    horario_agendamento = Column(String, nullable=True)
    status = Column(String, default="PENDENTE", nullable=False)
    origem = Column(String, default="PWA", nullable=False)  # Sempre "PWA" neste fluxo
    total = Column(Numeric(10, 2), default=0.0, nullable=False)
    painel_status = Column(String, nullable=True)
    painel_exibido_em = Column(DateTime, nullable=True)
    painel_expirado_em = Column(DateTime, nullable=True)
    painel_entregue_em = Column(DateTime, nullable=True)

    itens = relationship("PedidoItem", back_populates="pedido", cascade="all, delete-orphan")


class PedidoItem(Base):
    __tablename__ = "pedido_itens"

    id = Column(Integer, primary_key=True, index=True)
    pedido_id = Column(Integer, ForeignKey("pedidos.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("itens.id"), nullable=False)
    quantidade = Column(Integer, default=1, nullable=False)

    pedido = relationship("Pedido", back_populates="itens")
    item = relationship("Item", back_populates="pedido_itens")
