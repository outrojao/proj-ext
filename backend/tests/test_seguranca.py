"""
Fluxos de falha e autorização mapeados na auditoria de endurecimento:
mutação de item/status só com chave de admin, limites de payload
(422 antes de 500/503 de banco) e declaração de pagamento em terminal.
"""

ADMIN = {"X-API-Key": "test-key-app"}
CLIENTE = {"X-API-Key": "test-key-pwa"}
ESP32 = {"X-API-Key": "test-key-esp32"}


def _criar_pedido(client, item_id, headers=CLIENTE):
    r = client.post(
        "/pedidos",
        json={"itens": [{"item_id": item_id, "quantidade": 1}]},
        headers=headers,
    )
    assert r.status_code == 201
    return r.json()


# ── Autorização: mutações só com chave de admin ──


def test_cliente_nao_cria_item(client):
    assert client.post("/itens", json={"nome": "X", "preco": 1.0}, headers=CLIENTE).status_code == 401


def test_cliente_nao_altera_nem_exclui_item(client, seed_itens):
    alvo = f"/itens/{seed_itens[0]['id']}"
    assert client.put(alvo, json={"nome": "X", "preco": 1.0}, headers=CLIENTE).status_code == 401
    assert client.delete(alvo, headers=CLIENTE).status_code == 401
    # e nada mudou
    assert client.get(alvo, headers=ADMIN).json()["nome"] == seed_itens[0]["nome"]


def test_cliente_esp32_nao_mudam_status(client, seed_itens):
    pedido = _criar_pedido(client, seed_itens[0]["id"])
    for chave in (CLIENTE, ESP32):
        r = client.patch(f"/pedidos/{pedido['id']}/status", json={"novo_status": "CANCELADO"}, headers=chave)
        assert r.status_code == 401
    # o admin consegue
    r = client.patch(f"/pedidos/{pedido['id']}/status", json={"novo_status": "CANCELADO"}, headers=ADMIN)
    assert r.status_code == 200


# ── Limites de payload: 422 antes de estourar o banco ──


def test_preco_negativo_422(client):
    assert client.post("/itens", json={"nome": "X", "preco": -1}, headers=ADMIN).status_code == 422


def test_preco_enorme_422(client):
    assert client.post("/itens", json={"nome": "X", "preco": 1e300}, headers=ADMIN).status_code == 422


def test_nome_vazio_ou_gigante_422(client):
    assert client.post("/itens", json={"nome": "", "preco": 1}, headers=ADMIN).status_code == 422
    assert client.post("/itens", json={"nome": "x" * 61, "preco": 1}, headers=ADMIN).status_code == 422


def test_imagem_url_gigante_422(client):
    r = client.post(
        "/itens", json={"nome": "X", "preco": 1, "imagem": "https://x/" + "a" * 3000}, headers=ADMIN
    )
    assert r.status_code == 422


def test_quantidade_zero_negativa_enorme_422(client, seed_itens):
    for q in (0, -1, 10**12):
        r = client.post(
            "/pedidos",
            json={"itens": [{"item_id": seed_itens[0]["id"], "quantidade": q}]},
            headers=CLIENTE,
        )
        assert r.status_code == 422, q


def test_quantidade_adicional_zero_422(client):
    base = client.post("/itens", json={"nome": "Base", "preco": 10}, headers=ADMIN).json()
    ad = client.post(
        "/itens", json={"nome": "Ad", "preco": 2, "aplica_em": [base["id"]]}, headers=ADMIN
    ).json()
    r = client.post(
        "/pedidos",
        json={"itens": [{"item_id": base["id"], "adicionais": [{"item_id": ad["id"], "quantidade": 0}]}]},
        headers=CLIENTE,
    )
    assert r.status_code == 422


def test_pedido_sem_itens_422(client):
    assert client.post("/pedidos", json={"itens": []}, headers=CLIENTE).status_code == 422


def test_adicional_sem_base_no_create_400(client):
    r = client.post("/itens", json={"nome": "Ad", "preco": 2, "aplica_em": []}, headers=ADMIN)
    assert r.status_code == 400


# ── Pagamento: declaração em pedido terminal ──


def test_declarar_pagamento_em_cancelado_409(client, seed_itens):
    pedido = _criar_pedido(client, seed_itens[0]["id"])
    client.patch(f"/pedidos/{pedido['id']}/status", json={"novo_status": "CANCELADO"}, headers=ADMIN)
    r = client.post(f"/pedidos/{pedido['id']}/declarar-pagamento", headers=CLIENTE)
    assert r.status_code == 409


# ── Rotas de dev /test: exigem chave válida ──


def test_rotas_test_exigem_chave(client):
    assert client.get("/test/cenario").status_code == 401
    assert client.get("/test/cenario", headers=ADMIN).status_code == 200
