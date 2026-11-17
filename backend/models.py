"""
Modelos SQLAlchemy: Item, Pedido, PedidoItem.
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from database import Base


class Item(Base):
    __tablename__ = "itens"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    descricao = Column(String, nullable=True)
    preco = Column(Numeric(10, 2), nullable=False)
    disponivel = Column(Boolean, default=True)
    imagem = Column(String, nullable=True)
    categoria = Column(String, nullable=True)
    # Aplicabilidade M:N: lista de ids dos itens-base onde este item vale.
    # Não-nula (mesmo vazia) = este item É um adicional; None = item-base.
    # Excluir um item-base remove o id daqui (desvincula, não apaga o adicional).
    aplica_em = Column(JSONB, nullable=True)

    pedido_itens = relationship("PedidoItem", back_populates="item")


class Pedido(Base):
    __tablename__ = "pedidos"

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(Integer, nullable=True, index=True)  # Gerado quando status vira PAGO
    senha_retirada = Column(String(4), unique=True, nullable=True)  # Gerada quando status vira PAGO
    nome_cliente = Column(String(40), nullable=True)  # Nome opcional informado na PWA cliente
    observacao = Column(String(200), nullable=True)  # Observação livre do cliente ("sem cebola")
    horario_agendamento = Column(String, nullable=True)
    status = Column(String, default="PENDENTE", nullable=False)
    origem = Column(String, default="PWA_CLIENTE", nullable=False)  # Sempre "PWA_CLIENTE" neste fluxo
    total = Column(Numeric(10, 2), default=0.0, nullable=False)
    painel_status = Column(String, nullable=True)
    painel_exibido_em = Column(DateTime, nullable=True)
    painel_expirado_em = Column(DateTime, nullable=True)
    painel_entregue_em = Column(DateTime, nullable=True)
    painel_fila_posicao = Column(Integer, nullable=True)  # Posição na fila do painel (fim da fila = maior)
    pagamento_declarado_em = Column(DateTime(timezone=True), nullable=True)  # "Já paguei" da PWA (persiste p/ sync offline)

    itens = relationship("PedidoItem", back_populates="pedido", cascade="all, delete-orphan")


class PedidoItem(Base):
    __tablename__ = "pedido_itens"

    id = Column(Integer, primary_key=True, index=True)
    pedido_id = Column(Integer, ForeignKey("pedidos.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("itens.id"), nullable=False)
    quantidade = Column(Integer, default=1, nullable=False)
    # Adicionais escolhidos para ESTA linha: [{"item_id": int, "quantidade": int}]
    adicionais = Column(JSONB, nullable=True)

    pedido = relationship("Pedido", back_populates="itens")
    item = relationship("Item", back_populates="pedido_itens")
