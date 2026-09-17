"""
Testes do CRUD de itens do cardápio.
"""

from fastapi.testclient import TestClient


def test_criar_item(client, api_headers):
    """POST /itens cria um item e retorna 201."""
    response = client.post(
        "/itens",
        json={"nome": "X-Burger", "descricao": "Hambúrguer com queijo", "preco": 15.00, "disponivel": True},
        headers=api_headers["pwa"],
    )
    assert response.status_code == 201
    data = response.json()
    assert data["nome"] == "X-Burger"
    assert data["preco"] == 15.00
    assert data["disponivel"] is True
    assert "id" in data


def test_listar_itens(client, api_headers):
    """GET /itens retorna lista de itens."""
    # Criar um item primeiro
    client.post(
        "/itens",
        json={"nome": "X-Burger", "descricao": "Hambúrguer", "preco": 15.00, "disponivel": True},
        headers=api_headers["pwa"],
    )
    # Listar
    response = client.get("/itens", headers=api_headers["pwa"])
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["nome"] == "X-Burger"


def test_listar_itens_vazio(client, api_headers):
    """GET /itens retorna lista vazia quando não há itens."""
    response = client.get("/itens", headers=api_headers["pwa"])
    assert response.status_code == 200
    assert response.json() == []


def test_obter_item_inexistente(client, api_headers):
    """GET /itens/999 retorna 404."""
    response = client.get("/itens/999", headers=api_headers["pwa"])
    assert response.status_code == 404


def test_obter_item_existente(client, api_headers):
    """GET /itens/{id} retorna o item correto."""
    create = client.post(
        "/itens",
        json={"nome": "Refrigerante", "descricao": "Lata 350ml", "preco": 6.00, "disponivel": True},
        headers=api_headers["pwa"],
    )
    item_id = create.json()["id"]

    response = client.get(f"/itens/{item_id}", headers=api_headers["pwa"])
    assert response.status_code == 200
    assert response.json()["nome"] == "Refrigerante"


def test_atualizar_item(client, api_headers):
    """PUT /itens/{id} atualiza os dados do item."""
    create = client.post(
        "/itens",
        json={"nome": "X-Burger", "descricao": "Hambúrguer", "preco": 15.00, "disponivel": True},
        headers=api_headers["pwa"],
    )
    item_id = create.json()["id"]

    response = client.put(
        f"/itens/{item_id}",
        json={"nome": "X-Burger Especial", "descricao": "Hambúrguer artesanal", "preco": 18.00, "disponivel": False},
        headers=api_headers["pwa"],
    )
    assert response.status_code == 200
    data = response.json()
    assert data["nome"] == "X-Burger Especial"
    assert data["preco"] == 18.00
    assert data["disponivel"] is False


def test_deletar_item(client, api_headers):
    """DELETE /itens/{id} remove o item e retorna 204."""
    create = client.post(
        "/itens",
        json={"nome": "Batata Frita", "descricao": "Porção", "preco": 10.00, "disponivel": True},
        headers=api_headers["pwa"],
    )
    item_id = create.json()["id"]

    response = client.delete(f"/itens/{item_id}", headers=api_headers["pwa"])
    assert response.status_code == 204

    # Verificar que não existe mais
    response = client.get(f"/itens/{item_id}", headers=api_headers["pwa"])
    assert response.status_code == 404


def test_sem_api_key(client):
    """GET /itens sem API key retorna 401."""
    response = client.get("/itens")
    assert response.status_code == 401


def test_api_key_invalida(client):
    """GET /itens com API key errada retorna 401."""
    response = client.get("/itens", headers={"X-API-Key": "chave-errada"})
    assert response.status_code == 401
