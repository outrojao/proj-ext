"""
Testes do guard de PAGO: apenas o App Mobile confirma o pagamento.
"""


def _criar_item(client, api_headers):
    resp = client.post(
        "/itens",
        json={"nome": "X-Burger", "descricao": "Hambúrguer", "preco": 15.0, "disponivel": True},
        headers=api_headers["pwa"],
    )
    assert resp.status_code == 201
    return resp.json()


def _criar_e_confirmar(client, api_headers, item):
    r = client.post(
        "/pedidos",
        json={"itens": [{"item_id": item["id"], "quantidade": 1}]},
        headers=api_headers["pwa"],
    )
    assert r.status_code == 201
    pedido_id = r.json()["id"]
    r = client.patch(
        f"/pedidos/{pedido_id}/status",
        json={"novo_status": "CONFIRMADO"},
        headers=api_headers["app"],
    )
    assert r.status_code == 200
    return pedido_id


def test_pago_com_chave_pwa_retorna_403(client, api_headers):
    item = _criar_item(client, api_headers)
    pedido_id = _criar_e_confirmar(client, api_headers, item)

    r = client.patch(
        f"/pedidos/{pedido_id}/status",
        json={"novo_status": "PAGO"},
        headers=api_headers["pwa"],
    )
    assert r.status_code == 403

    # Status inalterado
    r = client.get(f"/pedidos/{pedido_id}", headers=api_headers["app"])
    assert r.json()["status"] == "CONFIRMADO"


def test_pago_com_chave_app_popula_numero_e_senha(client, api_headers):
    item = _criar_item(client, api_headers)
    pedido_id = _criar_e_confirmar(client, api_headers, item)

    r = client.patch(
        f"/pedidos/{pedido_id}/status",
        json={"novo_status": "PAGO"},
        headers=api_headers["app"],
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "PAGO"
    assert data["numero"] is not None
    assert data["senha_retirada"] is not None
    assert len(data["senha_retirada"]) == 4


def test_outras_transicoes_com_chave_pwa_nao_afetadas(client, api_headers):
    """A restrição é só para PAGO: a PWA continua fazendo PENDENTE → CANCELADO."""
    item = _criar_item(client, api_headers)
    r = client.post(
        "/pedidos",
        json={"itens": [{"item_id": item["id"], "quantidade": 1}]},
        headers=api_headers["pwa"],
    )
    assert r.status_code == 201
    pedido_id = r.json()["id"]

    r = client.patch(
        f"/pedidos/{pedido_id}/status",
        json={"novo_status": "CANCELADO"},
        headers=api_headers["pwa"],
    )
    assert r.status_code == 200
    assert r.json()["status"] == "CANCELADO"
