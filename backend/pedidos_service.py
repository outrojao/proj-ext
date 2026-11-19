"""
Regras de pagamento de pedidos: numeração e senha de retirada.

Todo caminho que marca um pedido como PAGO deve usar marcar_pago,
garantindo numeração sequencial e senha de retirada consistentes.
"""

import os
import secrets
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from models import Pedido

# Alfabeto sem caracteres confusos (0/O/1/I)
ALFABETO_SENHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


# Numeração diária: a loja só opera pedidos do dia, então o número de
# retirada reinicia no 1º PAGO de cada dia LOCAL da loja (TZ_LOJA) — o dia
# comercial 16h–23h atravessa a meia-noite do servidor (UTC).
TZ_LOJA_PADRAO = "America/Sao_Paulo"
# Lock consultivo (qualquer inteiro estável): check + reset + nextval atômicos,
# para dois PAGOs no mesmo instante não virarem ambos "número 1".
LOCK_NUMERO_PEDIDO = 0x5EED0


def gerar_numero_pedido(db: Session) -> int:
    """Obtém o próximo número de retirada (reinicia no 1º PAGO do dia)."""
    tz = os.getenv("TZ_LOJA", TZ_LOJA_PADRAO)
    db.execute(text("SELECT pg_advisory_xact_lock(:l)"), {"l": LOCK_NUMERO_PEDIDO})
    ultimo_dia = db.execute(
        text(
            "SELECT MAX((pago_em AT TIME ZONE :tz)::date) "
            "FROM pedidos WHERE numero IS NOT NULL"
        ),
        {"tz": tz},
    ).scalar()
    hoje = db.execute(
        text("SELECT (CURRENT_TIMESTAMP AT TIME ZONE :tz)::date"),
        {"tz": tz},
    ).scalar()
    if ultimo_dia != hoje:
        db.execute(text("SELECT setval('pedido_numero_seq', 1, false)"))
    return db.execute(text("SELECT nextval('pedido_numero_seq')")).scalar_one()


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
    if pedido.pago_em is None:
        pedido.pago_em = datetime.now(UTC)
    if pedido.numero is None:
        pedido.numero = gerar_numero_pedido(db)
    if pedido.senha_retirada is None:
        pedido.senha_retirada = gerar_senha_retirada()
    pedido.pagamento_declarado_em = None
    db.commit()
    db.refresh(pedido)
    return pedido
