"""
Testes do guard de status: apenas a chave de admin muda o status de um pedido.
"""


def _criar_item(client, api_headers):
    resp = client.post(
        "/itens",
        json={"nome": "X-Burger", "descricao": "Hambúrguer", "preco": 15.0, "disponivel": True},
        headers=api_headers["app"],
    )
    assert resp.status_code == 201
    return resp.json()


def _criar_e_confirmar(client, api_headers, item):
    r = client.post(
        "/pedidos",
        json={"itens": [{"item_id": item["id"], "quantidade": 1}]},
        headers=api_headers["pwa_cliente"],
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


def test_pago_com_chave_pwa_retorna_401(client, api_headers):
    item = _criar_item(client, api_headers)
    pedido_id = _criar_e_confirmar(client, api_headers, item)

    r = client.patch(
        f"/pedidos/{pedido_id}/status",
        json={"novo_status": "PAGO"},
        headers=api_headers["pwa_cliente"],
    )
    assert r.status_code == 401

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


def test_cliente_tampouco_cancela(client, api_headers):
    """A restrição é para TODAS as transições: a PWA não cancela o próprio pedido."""
    item = _criar_item(client, api_headers)
    r = client.post(
        "/pedidos",
        json={"itens": [{"item_id": item["id"], "quantidade": 1}]},
        headers=api_headers["pwa_cliente"],
    )
    assert r.status_code == 201
    pedido_id = r.json()["id"]

    r = client.patch(
        f"/pedidos/{pedido_id}/status",
        json={"novo_status": "CANCELADO"},
        headers=api_headers["pwa_cliente"],
    )
    assert r.status_code == 401

    # Status inalterado
    r = client.get(f"/pedidos/{pedido_id}", headers=api_headers["app"])
    assert r.json()["status"] == "PENDENTE"
