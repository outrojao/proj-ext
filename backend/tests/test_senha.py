"""
Testes da senha de retirada e da idempotência do marcar_pago.
"""

import pytest
from sqlalchemy.exc import IntegrityError

from models import Pedido
from pedidos_service import ALFABETO_SENHA, gerar_senha_retirada, marcar_pago

ALFABETO = set(ALFABETO_SENHA)


def test_comprimento_e_alfabeto():
    for _ in range(100):
        senha = gerar_senha_retirada()
        assert len(senha) == 4
        assert set(senha) <= ALFABETO


def test_sem_caracteres_ambiguos():
    for ambiguo in ("0", "O", "1", "I"):
        assert ambiguo not in ALFABETO


def test_geracoes_distintas():
    gerados = [gerar_senha_retirada() for _ in range(100)]
    for atual, seguinte in zip(gerados, gerados[1:]):
        assert atual != seguinte


def test_marcar_pago_gera_numero_e_senha(db_session):
    pedido = Pedido(status="CONFIRMADO", origem="PWA", total=15.0)
    db_session.add(pedido)
    db_session.commit()
    db_session.refresh(pedido)

    marcar_pago(db_session, pedido)

    assert pedido.status == "PAGO"
    assert pedido.numero is not None
    assert pedido.senha_retirada is not None
    assert len(pedido.senha_retirada) == 4

    numero = pedido.numero
    senha = pedido.senha_retirada
    marcar_pago(db_session, pedido)  # Idempotente
    assert pedido.numero == numero
    assert pedido.senha_retirada == senha


def test_senhas_unicas_entre_pedidos(db_session):
    senhas = []
    for _ in range(3):
        pedido = Pedido(status="CONFIRMADO", origem="PWA", total=1.0)
        db_session.add(pedido)
        db_session.flush()
        marcar_pago(db_session, pedido)
        senhas.append(pedido.senha_retirada)
    assert len(set(senhas)) == len(senhas)


def test_constraint_unicidade_senha(db_session):
    p1 = Pedido(status="PAGO", origem="PWA", total=1.0, numero=1, senha_retirada="AB2C")
    p2 = Pedido(status="PAGO", origem="PWA", total=1.0, numero=2, senha_retirada="AB2C")
    db_session.add_all([p1, p2])
    with pytest.raises(IntegrityError):
        db_session.commit()
