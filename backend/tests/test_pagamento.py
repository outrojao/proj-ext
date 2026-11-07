"""
Testes dos endpoints de pagamento Pix.
"""

import re

PRECO_ITEM = 15.0


def _criar_item(client, api_headers):
    resp = client.post(
        "/itens",
        json={"nome": "X-Burger", "descricao": "Hambúrguer", "preco": PRECO_ITEM, "disponivel": True},
        headers=api_headers["pwa"],
    )
    assert resp.status_code == 201
    return resp.json()


def _criar_pedido(client, api_headers, item, status="CONFIRMADO"):
    r = client.post(
        "/pedidos",
        json={"itens": [{"item_id": item["id"], "quantidade": 1}], "horario_agendamento": "12:00"},
        headers=api_headers["pwa"],
    )
    assert r.status_code == 201
    pedido_id = r.json()["id"]
    if status != "PENDENTE":
        r = client.patch(
            f"/pedidos/{pedido_id}/status",
            json={"novo_status": status},
            headers=api_headers["app"],
        )
        assert r.status_code == 200
    return pedido_id


def test_post_pagamento_pedido_inexistente_404(client, api_headers):
    r = client.post("/pedidos/999/pagamento", headers=api_headers["pwa"])
    assert r.status_code == 404


def test_post_pagamento_fora_de_confirmado_409(client, api_headers):
    item = _criar_item(client, api_headers)
    pedido_id = _criar_pedido(client, api_headers, item, status="PENDENTE")
    r = client.post(f"/pedidos/{pedido_id}/pagamento", headers=api_headers["pwa"])
    assert r.status_code == 409


def test_post_pagamento_confirmado_retorna_contrato(client, api_headers):
    item = _criar_item(client, api_headers)
    pedido_id = _criar_pedido(client, api_headers, item)

    r = client.post(f"/pedidos/{pedido_id}/pagamento", headers=api_headers["pwa"])
    assert r.status_code == 200
    data = r.json()
    assert {"qr_code", "qr_code_base64", "copia_cola", "expira_em"} <= set(data)
    assert data["qr_code"] == data["copia_cola"]
    assert data["qr_code"].startswith("000201")
    assert data["qr_code_base64"].startswith("data:image/png;base64,")
    assert re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", data["expira_em"])

    # Valor exato (15.00) e txid do pedido no payload
    assert "540515.00" in data["copia_cola"]
    txid = f"PED{pedido_id}"
    assert f"05{len(txid):02d}{txid}" in data["copia_cola"]


def test_post_pagamento_payload_deterministico(client, api_headers):
    item = _criar_item(client, api_headers)
    pedido_id = _criar_pedido(client, api_headers, item)

    r1 = client.post(f"/pedidos/{pedido_id}/pagamento", headers=api_headers["pwa"]).json()
    r2 = client.post(f"/pedidos/{pedido_id}/pagamento", headers=api_headers["pwa"]).json()
    assert r1["copia_cola"] == r2["copia_cola"]


def test_get_pagamento_reflete_status(client, api_headers):
    item = _criar_item(client, api_headers)
    pedido_id = _criar_pedido(client, api_headers, item)

    r = client.get(f"/pedidos/{pedido_id}/pagamento", headers=api_headers["pwa"])
    assert r.status_code == 200
    assert r.json() == {"status": "PENDENTE"}

    # Atendente marca PAGO no App Mobile
    r = client.patch(
        f"/pedidos/{pedido_id}/status",
        json={"novo_status": "PAGO"},
        headers=api_headers["app"],
    )
    assert r.status_code == 200

    r = client.get(f"/pedidos/{pedido_id}/pagamento", headers=api_headers["pwa"])
    assert r.json() == {"status": "APROVADO"}


def test_get_pagamento_pedido_inexistente_404(client, api_headers):
    r = client.get("/pedidos/999/pagamento", headers=api_headers["pwa"])
    assert r.status_code == 404


def test_declarar_pagamento_nao_muda_status(client, api_headers):
    item = _criar_item(client, api_headers)
    pedido_id = _criar_pedido(client, api_headers, item, status="PENDENTE")

    r = client.post(f"/pedidos/{pedido_id}/declarar-pagamento", headers=api_headers["pwa"])
    assert r.status_code == 200

    r = client.get(f"/pedidos/{pedido_id}", headers=api_headers["app"])
    assert r.status_code == 200
    assert r.json()["status"] == "PENDENTE"


def test_declarar_pagamento_persiste(client, api_headers):
    """
    declarar-pagamento persiste pagamento_declarado_em no pedido
    (o pwa-admin faz sync e vê a declaração mesmo que estivesse offline).
    """
    item = _criar_item(client, api_headers)
    pedido_id = _criar_pedido(client, api_headers, item, status="CONFIRMADO")

    r = client.post(f"/pedidos/{pedido_id}/declarar-pagamento", headers=api_headers["pwa"])
    assert r.status_code == 200
    assert r.json()["pagamento_declarado_em"]

    r = client.get(f"/pedidos/{pedido_id}", headers=api_headers["app"])
    assert r.status_code == 200
    assert r.json()["status"] == "CONFIRMADO"
    assert r.json()["pagamento_declarado_em"] is not None


def test_pago_limpa_pagamento_declarado(client, api_headers):
    """Ao marcar PAGO, a declaração é consumida (campo volta a nulo)."""
    item = _criar_item(client, api_headers)
    pedido_id = _criar_pedido(client, api_headers, item, status="CONFIRMADO")

    client.post(f"/pedidos/{pedido_id}/declarar-pagamento", headers=api_headers["pwa"])
    r = client.patch(
        f"/pedidos/{pedido_id}/status",
        json={"novo_status": "PAGO"},
        headers=api_headers["app"],
    )
    assert r.status_code == 200
    assert r.json()["pagamento_declarado_em"] is None


def test_declarar_pagamento_pedido_inexistente_404(client, api_headers):
    r = client.post("/pedidos/999/declarar-pagamento", headers=api_headers["pwa"])
    assert r.status_code == 404
