"""
Testes do CRUD de pedidos, fluxo de status, numeração e validações.
"""

from fastapi.testclient import TestClient


def _criar_itens(client, api_headers):
    """Helper: cria itens de cardápio e retorna a lista."""
    itens = []
    for nome, preco in [("X-Burger", 15.0), ("Refrigerante", 6.0), ("Batata Frita", 10.0)]:
        resp = client.post(
            "/itens",
            json={"nome": nome, "descricao": f"Descrição {nome}", "preco": preco, "disponivel": True},
            headers=api_headers["pwa_cliente"],
        )
        itens.append(resp.json())
    return itens


# ── Criação de pedidos ──

def test_criar_pedido(client, api_headers):
    """POST /pedidos cria um pedido PENDENTE com origem PWA."""
    itens = _criar_itens(client, api_headers)

    response = client.post(
        "/pedidos",
        json={
            "itens": [
                {"item_id": itens[0]["id"], "quantidade": 2},
                {"item_id": itens[1]["id"], "quantidade": 1},
            ],
            "horario_agendamento": "12:30",
        },
        headers=api_headers["pwa_cliente"],
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "PENDENTE"
    assert data["origem"] == "PWA_CLIENTE"
    assert data["numero"] is None
    assert data["total"] == 36.0  # 2x15 + 1x6
    assert len(data["itens"]) == 2


def test_criar_pedido_com_nome_cliente(client, api_headers):
    """POST /pedidos com nome_cliente grava e devolve o nome (opcional)."""
    itens = _criar_itens(client, api_headers)

    response = client.post(
        "/pedidos",
        json={
            "itens": [{"item_id": itens[0]["id"], "quantidade": 1}],
            "horario_agendamento": "12:30",
            "nome_cliente": "João",
        },
        headers=api_headers["pwa_cliente"],
    )
    assert response.status_code == 201
    assert response.json()["nome_cliente"] == "João"

    # Persistiu
    fetched = client.get(f"/pedidos/{response.json()['id']}", headers=api_headers["app"])
    assert fetched.json()["nome_cliente"] == "João"

    # Sem nome → nulo
    sem_nome = client.post(
        "/pedidos",
        json={"itens": [{"item_id": itens[1]["id"], "quantidade": 1}], "horario_agendamento": "12:30"},
        headers=api_headers["pwa_cliente"],
    )
    assert sem_nome.status_code == 201
    assert sem_nome.json()["nome_cliente"] is None


def test_criar_pedido_item_inexistente(client, api_headers):
    """POST /pedidos com item_id inválido retorna 400."""
    response = client.post(
        "/pedidos",
        json={"itens": [{"item_id": 999, "quantidade": 1}], "horario_agendamento": "12:00"},
        headers=api_headers["pwa_cliente"],
    )
    assert response.status_code == 400


def test_criar_pedido_item_indisponivel(client, api_headers):
    """POST /pedidos com item indisponível retorna 400."""
    itens = _criar_itens(client, api_headers)
    # Marcar item como indisponível
    client.put(
        f"/itens/{itens[0]['id']}",
        json={"nome": itens[0]["nome"], "descricao": itens[0]["descricao"], "preco": itens[0]["preco"], "disponivel": False},
        headers=api_headers["pwa_cliente"],
    )
    response = client.post(
        "/pedidos",
        json={"itens": [{"item_id": itens[0]["id"], "quantidade": 1}], "horario_agendamento": "12:00"},
        headers=api_headers["pwa_cliente"],
    )
    assert response.status_code == 400


# ── Listagem ──

def test_listar_pedidos(client, api_headers):
    """GET /pedidos retorna lista de pedidos."""
    itens = _criar_itens(client, api_headers)
    client.post(
        "/pedidos",
        json={"itens": [{"item_id": itens[0]["id"], "quantidade": 1}], "horario_agendamento": "12:00"},
        headers=api_headers["pwa_cliente"],
    )
    response = client.get("/pedidos", headers=api_headers["app"])
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_listar_pendentes(client, api_headers):
    """GET /pedidos/pendentes retorna apenas pedidos PENDENTE."""
    itens = _criar_itens(client, api_headers)
    client.post(
        "/pedidos",
        json={"itens": [{"item_id": itens[0]["id"], "quantidade": 1}], "horario_agendamento": "12:00"},
        headers=api_headers["pwa_cliente"],
    )
    response = client.get("/pedidos/pendentes", headers=api_headers["app"])
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["status"] == "PENDENTE"


def test_fila_painel_vazia(client, api_headers):
    """GET /pedidos/fila-painel retorna vazio quando não há pedidos PRONTO."""
    response = client.get("/pedidos/fila-painel", headers=api_headers["esp32"])
    assert response.status_code == 200
    assert response.json() == []


# ── Atualização de status ──

def test_atualizar_status_valido(client, api_headers):
    """PATCH /pedidos/{id}/status PENDENTE → CONFIRMADO funciona."""
    itens = _criar_itens(client, api_headers)
    create = client.post(
        "/pedidos",
        json={"itens": [{"item_id": itens[0]["id"], "quantidade": 1}], "horario_agendamento": "12:00"},
        headers=api_headers["pwa_cliente"],
    )
    pedido_id = create.json()["id"]

    response = client.patch(
        f"/pedidos/{pedido_id}/status",
        json={"novo_status": "CONFIRMADO"},
        headers=api_headers["app"],
    )
    assert response.status_code == 200
    assert response.json()["status"] == "CONFIRMADO"


def test_atualizar_status_invalido(client, api_headers):
    """PATCH /pedidos/{id}/status PENDENTE → PRONTO retorna 400 (transição inválida)."""
    itens = _criar_itens(client, api_headers)
    create = client.post(
        "/pedidos",
        json={"itens": [{"item_id": itens[0]["id"], "quantidade": 1}], "horario_agendamento": "12:00"},
        headers=api_headers["pwa_cliente"],
    )
    pedido_id = create.json()["id"]

    response = client.patch(
        f"/pedidos/{pedido_id}/status",
        json={"novo_status": "PRONTO"},
        headers=api_headers["app"],
    )
    assert response.status_code == 400


def test_atualizar_status_pedido_inexistente(client, api_headers):
    """PATCH /pedidos/999/status retorna 404."""
    response = client.patch(
        "/pedidos/999/status",
        json={"novo_status": "CONFIRMADO"},
        headers=api_headers["app"],
    )
    assert response.status_code == 404


# ── Numeração ──

def test_numero_gerado_no_pago(client, api_headers):
    """Número é null antes de PAGO e preenchido depois."""
    itens = _criar_itens(client, api_headers)
    create = client.post(
        "/pedidos",
        json={"itens": [{"item_id": itens[0]["id"], "quantidade": 1}], "horario_agendamento": "12:00"},
        headers=api_headers["pwa_cliente"],
    )
    pedido_id = create.json()["id"]
    assert create.json()["numero"] is None

    # Confirmar
    client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": "CONFIRMADO"}, headers=api_headers["app"])

    # Pagar
    response = client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": "PAGO"}, headers=api_headers["app"])
    assert response.status_code == 200
    assert response.json()["numero"] is not None
    assert response.json()["numero"] == 1


def test_obter_numero_pedido_nao_pago(client, api_headers):
    """GET /pedidos/{id}/numero retorna 400 quando pedido não foi pago."""
    itens = _criar_itens(client, api_headers)
    create = client.post(
        "/pedidos",
        json={"itens": [{"item_id": itens[0]["id"], "quantidade": 1}], "horario_agendamento": "12:00"},
        headers=api_headers["pwa_cliente"],
    )
    pedido_id = create.json()["id"]

    response = client.get(f"/pedidos/{pedido_id}/numero", headers=api_headers["pwa_cliente"])
    assert response.status_code == 400


def test_numeracao_sequencial(client, api_headers):
    """Dois pedidos pagos geram números sequenciais (1, 2)."""
    itens = _criar_itens(client, api_headers)

    # Pedido 1
    p1 = client.post(
        "/pedidos",
        json={"itens": [{"item_id": itens[0]["id"], "quantidade": 1}], "horario_agendamento": "12:00"},
        headers=api_headers["pwa_cliente"],
    ).json()
    client.patch(f"/pedidos/{p1['id']}/status", json={"novo_status": "CONFIRMADO"}, headers=api_headers["app"])
    p1_pago = client.patch(f"/pedidos/{p1['id']}/status", json={"novo_status": "PAGO"}, headers=api_headers["app"]).json()
    assert p1_pago["numero"] == 1

    # Pedido 2
    p2 = client.post(
        "/pedidos",
        json={"itens": [{"item_id": itens[1]["id"], "quantidade": 1}], "horario_agendamento": "13:00"},
        headers=api_headers["pwa_cliente"],
    ).json()
    client.patch(f"/pedidos/{p2['id']}/status", json={"novo_status": "CONFIRMADO"}, headers=api_headers["app"])
    p2_pago = client.patch(f"/pedidos/{p2['id']}/status", json={"novo_status": "PAGO"}, headers=api_headers["app"]).json()
    assert p2_pago["numero"] == 2


# ── Fluxos completos ──

def test_fluxo_completo(client, api_headers):
    """Fluxo completo: PENDENTE → CONFIRMADO → PAGO → PRONTO → ENTREGUE."""
    itens = _criar_itens(client, api_headers)
    create = client.post(
        "/pedidos",
        json={"itens": [{"item_id": itens[0]["id"], "quantidade": 2}], "horario_agendamento": "14:00"},
        headers=api_headers["pwa_cliente"],
    )
    pedido_id = create.json()["id"]

    # Confirmar
    r = client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": "CONFIRMADO"}, headers=api_headers["app"])
    assert r.json()["status"] == "CONFIRMADO"

    # Pagar
    r = client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": "PAGO"}, headers=api_headers["app"])
    assert r.json()["status"] == "PAGO"
    assert r.json()["numero"] is not None

    # Pronto
    r = client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": "PRONTO"}, headers=api_headers["app"])
    assert r.json()["status"] == "PRONTO"

    # Entregue
    r = client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": "ENTREGUE"}, headers=api_headers["app"])
    assert r.json()["status"] == "ENTREGUE"


def test_fluxo_cancelado(client, api_headers):
    """Fluxo: PENDENTE → CANCELADO."""
    itens = _criar_itens(client, api_headers)
    create = client.post(
        "/pedidos",
        json={"itens": [{"item_id": itens[0]["id"], "quantidade": 1}], "horario_agendamento": "15:00"},
        headers=api_headers["pwa_cliente"],
    )
    pedido_id = create.json()["id"]

    r = client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": "CANCELADO"}, headers=api_headers["app"])
    assert r.status_code == 200
    assert r.json()["status"] == "CANCELADO"


def test_fluxo_cancelado_depois_de_pago(client, api_headers):
    """Fluxo: PENDENTE → CONFIRMADO → PAGO → CANCELADO (transição válida)."""
    itens = _criar_itens(client, api_headers)
    create = client.post(
        "/pedidos",
        json={"itens": [{"item_id": itens[0]["id"], "quantidade": 1}], "horario_agendamento": "15:00"},
        headers=api_headers["pwa_cliente"],
    )
    pedido_id = create.json()["id"]

    client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": "CONFIRMADO"}, headers=api_headers["app"])
    client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": "PAGO"}, headers=api_headers["app"])

    r = client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": "CANCELADO"}, headers=api_headers["app"])
    assert r.status_code == 200
    assert r.json()["status"] == "CANCELADO"


def _levar_ate_pronto(client, api_headers, item_id):
    """Cria um pedido e leva até PRONTO. Retorna o id."""
    create = client.post(
        "/pedidos",
        json={"itens": [{"item_id": item_id, "quantidade": 1}], "horario_agendamento": "12:00"},
        headers=api_headers["pwa_cliente"],
    )
    assert create.status_code == 201
    pedido_id = create.json()["id"]
    for novo in ("CONFIRMADO", "PAGO", "PRONTO"):
        r = client.patch(f"/pedidos/{pedido_id}/status", json={"novo_status": novo}, headers=api_headers["app"])
        assert r.status_code == 200
    return pedido_id


def test_fila_painel_com_pedido_pronto(client, api_headers):
    """
    GET /pedidos/fila-painel retorna pedidos PRONTO aguardando na fila.

    Com o painel livre, o primeiro pedido PRONTO é imediatamente EXIBINDO;
    o segundo fica AGUARDANDO e é ele que aparece na fila.
    """
    itens = _criar_itens(client, api_headers)
    primeiro = _levar_ate_pronto(client, api_headers, itens[0]["id"])
    segundo = _levar_ate_pronto(client, api_headers, itens[1]["id"])

    response = client.get("/pedidos/fila-painel", headers=api_headers["esp32"])
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == segundo
    assert data[0]["status"] == "PRONTO"
    assert data[0]["numero"] is not None
