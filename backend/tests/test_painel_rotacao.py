"""
Testes do timeout de exibição do painel LCD e rotação da fila.

O timeout é do backend: se um pedido exibido exceder PAINEL_TIMEOUT_MINUTOS
(padrão 10) e houver outro PRONTO na fila, ele vai para o fim da fila e o
próximo da fila passa a ser exibido. Com um único pedido não há rotação.
"""

import json
import os
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Pedido
from painel_service import (
    PAINEL_AGUARDANDO,
    PAINEL_EXIBINDO,
    expirar_exibicao,
    finalizar_exibicao,
    preparar_pedido_pronto,
    proximo_pedido,
    timeout_exibicao,
    agendar_expiracao_exibicao,
)

_TEST_URL = os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
_TestSession = sessionmaker(
    autocommit=False, autoflush=False,
    bind=create_engine(_TEST_URL, pool_pre_ping=True),
)


# ── Helpers ──

def _pedido(status_painel=None, posicao=None, exibido_em=None):
    return Pedido(
        status="PRONTO",
        origem="PWA",
        total=Decimal("20.00"),
        painel_status=status_painel,
        painel_exibido_em=exibido_em,
        painel_fila_posicao=posicao,
    )


def _criar_itens(client, api_headers):
    itens = []
    for nome, preco in [("X-Burger", 15.0), ("Refrigerante", 6.0)]:
        resp = client.post(
            "/itens",
            json={"nome": nome, "descricao": nome, "preco": preco, "disponivel": True},
            headers=api_headers["pwa"],
        )
        assert resp.status_code == 201
        itens.append(resp.json())
    return itens


def _levar_ate_pronto(client, api_headers, item_id):
    create = client.post(
        "/pedidos",
        json={"itens": [{"item_id": item_id, "quantidade": 1}], "horario_agendamento": "12:00"},
        headers=api_headers["pwa"],
    ).json()
    pedido_id = create["id"]
    for status in ("CONFIRMADO", "PAGO", "PRONTO"):
        r = client.patch(
            f"/pedidos/{pedido_id}/status",
            json={"novo_status": status},
            headers=api_headers["app"],
        )
        assert r.status_code == 200
    return pedido_id


def _regressar_exibicao(pedido_id, minutos=11):
    with _TestSession() as db:
        pedido = db.query(Pedido).filter(Pedido.id == pedido_id).first()
        pedido.painel_exibido_em = datetime.now(UTC) - timedelta(minutes=minutos)
        db.commit()


# ── Regras da fila (unit) ──

def test_preparar_primeiro_exibe_e_demais_entram_na_fila(db_session):
    p1 = _pedido()
    db_session.add(p1)
    assert preparar_pedido_pronto(db_session, p1) is p1
    assert p1.painel_status == PAINEL_EXIBINDO
    assert p1.painel_fila_posicao is None

    p2 = _pedido()
    db_session.add(p2)
    assert preparar_pedido_pronto(db_session, p2) is None
    assert p2.painel_status == PAINEL_AGUARDANDO
    assert p2.painel_fila_posicao == 1

    p3 = _pedido()
    db_session.add(p3)
    preparar_pedido_pronto(db_session, p3)
    assert p3.painel_fila_posicao == 2

    assert proximo_pedido(db_session).id == p2.id


def test_rotao_poe_exibindo_no_fim_da_fila_e_exibe_proximo(db_session):
    p1 = _pedido(status_painel=PAINEL_EXIBINDO, exibido_em=datetime.now(UTC) - timedelta(minutes=11))
    p2 = _pedido(status_painel=PAINEL_AGUARDANDO, posicao=1)
    p3 = _pedido(status_painel=PAINEL_AGUARDANDO, posicao=2)
    for p in (p1, p2, p3):
        db_session.add(p)
    db_session.commit()

    proximo = expirar_exibicao(db_session, p1.id)

    assert proximo is not None
    assert proximo.id == p2.id
    assert p2.painel_status == PAINEL_EXIBINDO
    assert p2.painel_fila_posicao is None
    assert p1.painel_status == PAINEL_AGUARDANDO
    assert p1.painel_fila_posicao == 3  # fim da fila (depois do p3)
    assert p1.painel_expirado_em is not None


def test_pedido_unico_sem_rotao(db_session):
    p1 = _pedido(status_painel=PAINEL_EXIBINDO, exibido_em=datetime.now(UTC) - timedelta(minutes=11))
    db_session.add(p1)
    db_session.commit()

    assert expirar_exibicao(db_session, p1.id) is None
    assert p1.painel_status == PAINEL_EXIBINDO


def test_sem_tempo_excedido_nao_rota(db_session):
    p1 = _pedido(status_painel=PAINEL_EXIBINDO, exibido_em=datetime.now(UTC))
    p2 = _pedido(status_painel=PAINEL_AGUARDANDO, posicao=1)
    db_session.add_all([p1, p2])
    db_session.commit()

    assert expirar_exibicao(db_session, p1.id) is None
    assert p1.painel_status == PAINEL_EXIBINDO
    assert p2.painel_status == PAINEL_AGUARDANDO


def test_entrega_apos_rotao_exibe_fim_da_fila(db_session):
    p1 = _pedido(status_painel=PAINEL_EXIBINDO, exibido_em=datetime.now(UTC) - timedelta(minutes=11))
    p2 = _pedido(status_painel=PAINEL_AGUARDANDO, posicao=1)
    db_session.add_all([p1, p2])
    db_session.commit()

    expirar_exibicao(db_session, p1.id)  # p2 passa a exibir

    proximo = finalizar_exibicao(db_session, p2)

    assert proximo is not None
    assert proximo.id == p1.id
    assert p1.painel_status == PAINEL_EXIBINDO
    assert p2.painel_status == "ENTREGUE"


def test_timeout_lido_do_env(monkeypatch):
    monkeypatch.setenv("PAINEL_TIMEOUT_MINUTOS", "25")
    assert timeout_exibicao() == timedelta(minutes=25)

    monkeypatch.delenv("PAINEL_TIMEOUT_MINUTOS")
    assert timeout_exibicao() == timedelta(minutes=10)


def test_agendar_expiracao_sem_event_loop_nao_erro(db_session):
    agendar_expiracao_exibicao(1)  # sem loop em execução: apenas não agenda


# ── E2E: rede de segurança no reconectar do ESP32 ──

def test_ws_rotacao_por_timeout_no_reconectar(client, api_headers):
    """
    Exibição expirada + pedido na fila: ao reconectar, o backend rotaciona
    (exibido vai para o fim da fila) e o ESP32 recebe o próximo da fila.
    O ESP32 não envia mensagem de controle.
    """
    itens = _criar_itens(client, api_headers)

    with client.websocket_connect("/ws/esp32?api_key=test-key-esp32") as ws_esp32:
        assert json.loads(ws_esp32.receive_text())["event"] == "fila_vazia"

        p1 = _levar_ate_pronto(client, api_headers, itens[0]["id"])
        data = json.loads(ws_esp32.receive_text())
        assert data["event"] == "pedido_pronto"
        assert data["data"]["pedido_id"] == p1

        # A exibição do p1 "passou do tempo" (10 min padrão)
        _regressar_exibicao(p1)

        # Segundo pedido PRONTO: entra na fila, sem evento novo para o ESP32
        p2 = _levar_ate_pronto(client, api_headers, itens[1]["id"])

    # Reconecta: rede de segurança aplica a rotação
    with client.websocket_connect("/ws/esp32?api_key=test-key-esp32") as ws_esp32:
        data = json.loads(ws_esp32.receive_text())
        assert data["event"] == "pedido_pronto"
        assert data["data"]["pedido_id"] == p2

        with _TestSession() as db:
            p1_db = db.query(Pedido).filter(Pedido.id == p1).first()
            assert p1_db.painel_status == PAINEL_AGUARDANDO
            assert p1_db.painel_fila_posicao == 2  # fim da fila

        # Entregando o p2, o p1 vem do fim da fila
        r = client.patch(
            f"/pedidos/{p2}/status",
            json={"novo_status": "ENTREGUE"},
            headers=api_headers["app"],
        )
        assert r.status_code == 200

        data = json.loads(ws_esp32.receive_text())
        assert data["event"] == "pedido_entregue"
        assert data["data"]["pedido_id"] == p2

        data = json.loads(ws_esp32.receive_text())
        assert data["event"] == "pedido_pronto"
        assert data["data"]["pedido_id"] == p1


def test_ws_pedido_unico_sem_rotao_no_reconectar(client, api_headers):
    """
    Exibição expirada mas sem fila: ao reconectar o mesmo pedido continua
    exibido (pedido único não rotaciona).
    """
    itens = _criar_itens(client, api_headers)

    with client.websocket_connect("/ws/esp32?api_key=test-key-esp32") as ws_esp32:
        assert json.loads(ws_esp32.receive_text())["event"] == "fila_vazia"
        p1 = _levar_ate_pronto(client, api_headers, itens[0]["id"])
        data = json.loads(ws_esp32.receive_text())
        assert data["event"] == "pedido_pronto"
        assert data["data"]["pedido_id"] == p1

        _regressar_exibicao(p1)

    with client.websocket_connect("/ws/esp32?api_key=test-key-esp32") as ws_esp32:
        data = json.loads(ws_esp32.receive_text())
        assert data["event"] == "pedido_pronto"
        assert data["data"]["pedido_id"] == p1

        with _TestSession() as db:
            p1_db = db.query(Pedido).filter(Pedido.id == p1).first()
            assert p1_db.painel_status == PAINEL_EXIBINDO
