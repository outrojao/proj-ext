"""
Testes de WebSocket — conexão, autenticação e eventos.
"""

import json
import pytest
from fastapi.testclient import TestClient


def _criar_itens(client, api_headers):
    """Helper: cria itens de cardápio e retorna a lista."""
    itens = []
    for nome, preco in [("X-Burger", 15.0), ("Refrigerante", 6.0)]:
        resp = client.post(
            "/itens",
            json={"nome": nome, "descricao": f"Descrição {nome}", "preco": preco, "disponivel": True},
            headers=api_headers["pwa"],
        )
        itens.append(resp.json())
    return itens


def test_ws_conexao_valida(client):
    """WebSocket conecta com API key válida (app_mobile)."""
    with client.websocket_connect("/ws/app_mobile?api_key=test-key-app") as ws:
        # Se conectou sem erro, o teste passa
        # Envia uma mensagem para manter a conexão ativa
        ws.send_text("ping")


def test_ws_conexao_sem_key(client):
    """WebSocket recusa conexão sem API key."""
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/app_mobile") as ws:
            ws.send_text("ping")


def test_ws_conexao_key_invalida(client):
    """WebSocket recusa conexão com API key errada."""
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/app_mobile?api_key=chave-errada") as ws:
            ws.send_text("ping")


def test_ws_tipo_cliente_invalido(client):
    """WebSocket recusa tipo de cliente inválido."""
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/invalido?api_key=test-key-app") as ws:
            ws.send_text("ping")


def test_ws_novo_pedido_notifica_app(client, api_headers):
    """Criar um pedido notifica o App Mobile via WebSocket (novo_pedido)."""
    itens = _criar_itens(client, api_headers)

    with client.websocket_connect("/ws/app_mobile?api_key=test-key-app") as ws_app:
        # Criar pedido
        response = client.post(
            "/pedidos",
            json={"itens": [{"item_id": itens[0]["id"], "quantidade": 1}], "horario_agendamento": "12:00"},
            headers=api_headers["pwa"],
        )
        assert response.status_code == 201

        # Receber notificação
        msg = ws_app.receive_text()
        data = json.loads(msg)
        assert data["event"] == "novo_pedido"
        assert data["pedido_id"] == response.json()["id"]
        assert data["status"] == "PENDENTE"


def test_ws_status_atualizado_notifica_pwa_e_app(client, api_headers):
    """Mudança de status notifica PWA e App Mobile (status_atualizado)."""
    itens = _criar_itens(client, api_headers)

    with client.websocket_connect("/ws/pwa?api_key=test-key-pwa") as ws_pwa, \
         client.websocket_connect("/ws/app_mobile?api_key=test-key-app") as ws_app:

        # Criar pedido
        create = client.post(
            "/pedidos",
            json={"itens": [{"item_id": itens[0]["id"], "quantidade": 1}], "horario_agendamento": "12:00"},
            headers=api_headers["pwa"],
        ).json()
        pedido_id = create["id"]

        # Consumir notificação novo_pedido no app
        ws_app.receive_text()

        # Confirmar pedido
        client.patch(
            f"/pedidos/{pedido_id}/status",
            json={"novo_status": "CONFIRMADO"},
            headers=api_headers["app"],
        )

        # PWA recebe status_atualizado
        msg_pwa = ws_pwa.receive_text()
        data_pwa = json.loads(msg_pwa)
        assert data_pwa["event"] == "status_atualizado"
        assert data_pwa["status"] == "CONFIRMADO"

        # App recebe status_atualizado
        msg_app = ws_app.receive_text()
        data_app = json.loads(msg_app)
        assert data_app["event"] == "status_atualizado"
        assert data_app["status"] == "CONFIRMADO"


def test_ws_pedido_pronto_notifica_esp32(client, api_headers):
    """Status PRONTO notifica o ESP32 (painel LCD) com pedido_pronto."""
    itens = _criar_itens(client, api_headers)

    with client.websocket_connect("/ws/esp32?api_key=test-key-esp32") as ws_esp32, \
         client.websocket_connect("/ws/app_mobile?api_key=test-key-app") as ws_app:

        # Criar e levar até PRONTO
        create = client.post(
            "/pedidos",
            json={"itens": [{"item_id": itens[0]["id"], "quantidade": 1}], "horario_agendamento": "12:00"},
            headers=api_headers["pwa"],
        ).json()
        pedido_id = create["id"]

        # Consumir novo_pedido no app
        ws_app.receive_text()

        # Confirmar
        client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": "CONFIRMADO"}, headers=api_headers["app"])
        ws_pwa_msg = None
        # Consumir status_atualizado no app
        ws_app.receive_text()

        # Pagar
        client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": "PAGO"}, headers=api_headers["pwa"])
        ws_app.receive_text()

        # Pronto
        client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": "PRONTO"}, headers=api_headers["app"])
        # Consumir status_atualizado no app
        ws_app.receive_text()

        # ESP32 recebe pedido_pronto
        msg = ws_esp32.receive_text()
        data = json.loads(msg)
        assert data["event"] == "pedido_pronto"
        assert data["numero"] is not None
        assert data["pedido_id"] == pedido_id


def test_ws_pedido_entregue_notifica_esp32(client, api_headers):
    """Status ENTREGUE notifica o ESP32 (pedido_entregue)."""
    itens = _criar_itens(client, api_headers)

    with client.websocket_connect("/ws/esp32?api_key=test-key-esp32") as ws_esp32, \
         client.websocket_connect("/ws/app_mobile?api_key=test-key-app") as ws_app:

        # Criar e levar até PRONTO
        create = client.post(
            "/pedidos",
            json={"itens": [{"item_id": itens[0]["id"], "quantidade": 1}], "horario_agendamento": "12:00"},
            headers=api_headers["pwa"],
        ).json()
        pedido_id = create["id"]

        # Consumir todas as notificações do app até PRONTO
        ws_app.receive_text()  # novo_pedido
        client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": "CONFIRMADO"}, headers=api_headers["app"])
        ws_app.receive_text()  # status_atualizado CONFIRMADO
        client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": "PAGO"}, headers=api_headers["pwa"])
        ws_app.receive_text()  # status_atualizado PAGO
        client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": "PRONTO"}, headers=api_headers["app"])
        ws_app.receive_text()  # status_atualizado PRONTO

        # ESP32 recebe pedido_pronto
        ws_esp32.receive_text()

        # Entregar
        client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": "ENTREGUE"}, headers=api_headers["app"])
        ws_app.receive_text()  # status_atualizado ENTREGUE

        # ESP32 recebe pedido_entregue
        msg = ws_esp32.receive_text()
        data = json.loads(msg)
        assert data["event"] == "pedido_entregue"
        assert data["pedido_id"] == pedido_id
