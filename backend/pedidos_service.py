"""
Regras de pagamento de pedidos: numeração e senha de retirada.

Todo caminho que marca um pedido como PAGO deve usar marcar_pago,
garantindo numeração sequencial e senha de retirada consistentes.
"""

import secrets

from sqlalchemy import text
from sqlalchemy.orm import Session

from models import Pedido

# Alfabeto sem caracteres confusos (0/O/1/I)
ALFABETO_SENHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def gerar_numero_pedido(db: Session) -> int:
    """Obtém o próximo número de pedido da sequence."""
    return db.execute(
        text("SELECT nextval('pedido_numero_seq')")
    ).scalar_one()


def gerar_senha_retirada() -> str:
    """Gera a senha de retirada: 4 caracteres do alfabeto sem ambiguidade."""
    return "".join(secrets.choice(ALFABETO_SENHA) for _ in range(4))


def marcar_pago(db: Session, pedido: Pedido) -> Pedido:
    """
    Marca o pedido como PAGO.

    Gera o número sequencial (se ausente) e a senha de retirada (se ausente).
    Limpa pagamento_declarado_em (a declaração foi consumida pelo PAGO).
    Idempotente: chamar novamente não altera número nem senha já gerados.
    """
    pedido.status = "PAGO"
    if pedido.numero is None:
        pedido.numero = gerar_numero_pedido(db)
    if pedido.senha_retirada is None:
        pedido.senha_retirada = gerar_senha_retirada()
    pedido.pagamento_declarado_em = None
    db.commit()
    db.refresh(pedido)
    return pedido
