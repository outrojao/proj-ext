"""
Testes do CRUD de itens do cardápio.

Mutação (POST/PUT/DELETE /itens) exige a chave de admin (api_headers["app"]).
Leitura (GET) continua aberta a qualquer chave válida, inclusive a do cliente.
"""

from fastapi.testclient import TestClient


def test_criar_item(client, api_headers):
    """POST /itens cria um item e retorna 201."""
    response = client.post(
        "/itens",
        json={"nome": "X-Burger", "descricao": "Hambúrguer com queijo", "preco": 15.00, "disponivel": True},
        headers=api_headers["app"],
    )
    assert response.status_code == 201
    data = response.json()
    assert data["nome"] == "X-Burger"
    assert data["preco"] == 15.00
    assert data["disponivel"] is True
    assert "id" in data


def test_criar_item_com_imagem_e_categoria(client, api_headers):
    """POST /itens com imagem e categoria persiste os dois campos."""
    response = client.post(
        "/itens",
        json={
            "nome": "X-Burger",
            "descricao": "Hambúrguer com queijo",
            "preco": 15.00,
            "disponivel": True,
            "imagem": "https://r2.exemplo.com/x-burger.png",
            "categoria": "Hambúrgueres",
        },
        headers=api_headers["app"],
    )
    assert response.status_code == 201
    data = response.json()
    assert data["imagem"] == "https://r2.exemplo.com/x-burger.png"
    assert data["categoria"] == "Hambúrgueres"

    # Persistiu (não só no response)
    fetched = client.get(f"/itens/{data['id']}", headers=api_headers["pwa_cliente"])
    assert fetched.json()["imagem"] == "https://r2.exemplo.com/x-burger.png"
    assert fetched.json()["categoria"] == "Hambúrgueres"


def test_atualizar_item_imagem_e_categoria(client, api_headers):
    """PUT /itens/{id} atualiza imagem e categoria."""
    create = client.post(
        "/itens",
        json={"nome": "X-Burger", "descricao": "Hambúrguer", "preco": 15.00, "disponivel": True},
        headers=api_headers["app"],
    )
    item_id = create.json()["id"]
    assert create.json()["imagem"] is None
    assert create.json()["categoria"] is None

    response = client.put(
        f"/itens/{item_id}",
        json={
            "nome": "X-Burger",
            "descricao": "Hambúrguer",
            "preco": 15.00,
            "disponivel": True,
            "imagem": "https://r2.exemplo.com/x-burger.png",
            "categoria": "Hambúrgueres",
        },
        headers=api_headers["app"],
    )
    assert response.status_code == 200
    assert response.json()["imagem"] == "https://r2.exemplo.com/x-burger.png"
    assert response.json()["categoria"] == "Hambúrgueres"

    fetched = client.get(f"/itens/{item_id}", headers=api_headers["pwa_cliente"])
    assert fetched.json()["imagem"] == "https://r2.exemplo.com/x-burger.png"
    assert fetched.json()["categoria"] == "Hambúrgueres"


def test_listar_itens(client, api_headers):
    """GET /itens retorna lista de itens."""
    # Criar um item primeiro
    client.post(
        "/itens",
        json={"nome": "X-Burger", "descricao": "Hambúrguer", "preco": 15.00, "disponivel": True},
        headers=api_headers["app"],
    )
    # Listar
    response = client.get("/itens", headers=api_headers["pwa_cliente"])
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["nome"] == "X-Burger"


def test_listar_itens_vazio(client, api_headers):
    """GET /itens retorna lista vazia quando não há itens."""
    response = client.get("/itens", headers=api_headers["pwa_cliente"])
    assert response.status_code == 200
    assert response.json() == []


def test_obter_item_inexistente(client, api_headers):
    """GET /itens/999 retorna 404."""
    response = client.get("/itens/999", headers=api_headers["pwa_cliente"])
    assert response.status_code == 404


def test_obter_item_existente(client, api_headers):
    """GET /itens/{id} retorna o item correto."""
    create = client.post(
        "/itens",
        json={"nome": "Refrigerante", "descricao": "Lata 350ml", "preco": 6.00, "disponivel": True},
        headers=api_headers["app"],
    )
    item_id = create.json()["id"]

    response = client.get(f"/itens/{item_id}", headers=api_headers["pwa_cliente"])
    assert response.status_code == 200
    assert response.json()["nome"] == "Refrigerante"


def test_atualizar_item(client, api_headers):
    """PUT /itens/{id} atualiza os dados do item."""
    create = client.post(
        "/itens",
        json={"nome": "X-Burger", "descricao": "Hambúrguer", "preco": 15.00, "disponivel": True},
        headers=api_headers["app"],
    )
    item_id = create.json()["id"]

    response = client.put(
        f"/itens/{item_id}",
        json={"nome": "X-Burger Especial", "descricao": "Hambúrguer artesanal", "preco": 18.00, "disponivel": False},
        headers=api_headers["app"],
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
        headers=api_headers["app"],
    )
    item_id = create.json()["id"]

    response = client.delete(f"/itens/{item_id}", headers=api_headers["app"])
    assert response.status_code == 204

    # Verificar que não existe mais
    response = client.get(f"/itens/{item_id}", headers=api_headers["pwa_cliente"])
    assert response.status_code == 404


def test_sem_api_key(client):
    """GET /itens sem API key retorna 401."""
    response = client.get("/itens")
    assert response.status_code == 401


def test_api_key_invalida(client):
    """GET /itens com API key errada retorna 401."""
    response = client.get("/itens", headers={"X-API-Key": "chave-errada"})
    assert response.status_code == 401


# ── Adicionais (M:N via aplica_em) ──


def _criar(client, api_headers, **dados):
    """Helper: cria um item (base ou adicional) e retorna o response."""
    corpo = {"nome": "X-Burger", "descricao": "Base", "preco": 15.0, "disponivel": True}
    corpo.update(dados)
    resp = client.post("/itens", json=corpo, headers=api_headers["app"])
    assert resp.status_code == 201
    return resp.json()


def test_criar_adicional_de_item(client, api_headers):
    """POST /itens com aplica_em vincula o adicional aos itens-base."""
    base = _criar(client, api_headers, nome="X-Burger")
    ad = _criar(client, api_headers, nome="Queijo extra", preco=2.0, aplica_em=[base["id"]])
    assert ad["aplica_em"] == [base["id"]]

    # Persistiu na listagem
    lista = client.get("/itens", headers=api_headers["pwa_cliente"]).json()
    assert next(i for i in lista if i["id"] == ad["id"])["aplica_em"] == [base["id"]]
    assert next(i for i in lista if i["id"] == base["id"])["aplica_em"] is None


def test_criar_adicional_com_multiplos_itens(client, api_headers):
    """M:N: o mesmo adicional vale para mais de um item-base."""
    a = _criar(client, api_headers, nome="X-Burger")
    b = _criar(client, api_headers, nome="X-Salada")
    ad = _criar(client, api_headers, nome="Queijo extra", preco=2.0, aplica_em=[a["id"], b["id"]])
    assert sorted(ad["aplica_em"]) == sorted([a["id"], b["id"]])

    # Desativar o adicional some para os dois de uma vez (o toggle do próprio item)
    resp = client.put(
        f"/itens/{ad['id']}",
        json={"nome": "Queijo extra", "descricao": None, "preco": 2.0,
              "disponivel": False, "aplica_em": ad["aplica_em"]},
        headers=api_headers["app"],
    )
    assert resp.status_code == 200
    assert resp.json()["disponivel"] is False
    assert resp.json()["aplica_em"] == ad["aplica_em"]


def test_criar_adicional_de_adicional_rejeitado(client, api_headers):
    """Adicional de adicional → 400 (aprofundar só 1 nível)."""
    base = _criar(client, api_headers, nome="X-Burger")
    ad = _criar(client, api_headers, nome="Queijo extra", preco=2.0, aplica_em=[base["id"]])
    resp = client.post(
        "/itens",
        json={"nome": "Bacon", "descricao": None, "preco": 3.0,
              "disponivel": True, "aplica_em": [ad["id"]]},
        headers=api_headers["app"],
    )
    assert resp.status_code == 400


def test_criar_adicional_com_pai_inexistente_rejeitado(client, api_headers):
    """POST com aplica_em apontando para item inexistente → 400."""
    resp = client.post(
        "/itens",
        json={"nome": "Queijo extra", "descricao": None, "preco": 2.0,
              "disponivel": True, "aplica_em": [999]},
        headers=api_headers["app"],
    )
    assert resp.status_code == 400


def test_put_self_referente_rejeitado(client, api_headers):
    """PUT com o id do próprio item dentro de aplica_em → 400."""
    item = _criar(client, api_headers, nome="Refrigerante")
    resp = client.put(
        f"/itens/{item['id']}",
        json={"nome": "Refrigerante", "descricao": None, "preco": 6.0,
              "disponivel": True, "aplica_em": [item["id"]]},
        headers=api_headers["app"],
    )
    assert resp.status_code == 400


def test_put_aplica_em_vazio_rejeitado(client, api_headers):
    """Adicional não pode ficar sem item-base (nem com [], nem com null):
    sem base ele não existe no cardápio do cliente."""
    base = _criar(client, api_headers, nome="X-Burger")
    ad = _criar(client, api_headers, nome="Queijo extra", preco=2.0, aplica_em=[base["id"]])

    for vazio in ([], None):
        resp = client.put(
            f"/itens/{ad['id']}",
            json={"nome": "Queijo extra", "descricao": None, "preco": 2.0,
                  "disponivel": True, "aplica_em": vazio},
            headers=api_headers["app"],
        )
        assert resp.status_code == 400
    # O adicional continua intacto
    assert client.get(f"/itens/{ad['id']}", headers=api_headers["pwa_cliente"]).json()["aplica_em"] == [base["id"]]


def test_remover_item_base_desvincula_adicionais(client, api_headers):
    """DELETE do item-base desvincula os adicionais (não os apaga —
    eles podem servir a outros itens)."""
    a = _criar(client, api_headers, nome="X-Burger")
    b = _criar(client, api_headers, nome="X-Salada")
    ad = _criar(client, api_headers, nome="Queijo extra", preco=2.0, aplica_em=[a["id"], b["id"]])

    assert client.delete(f"/itens/{a['id']}", headers=api_headers["app"]).status_code == 204
    # O adicional sobrevive, sem o id do item excluído
    sobrou = client.get(f"/itens/{ad['id']}", headers=api_headers["pwa_cliente"]).json()
    assert sobrou["aplica_em"] == [b["id"]]


def test_remover_ultimo_item_base_remove_adicional(client, api_headers):
    """Se o item-base era o ÚNICO do adicional, o adicional é removido junto
    (sem base, ele não existe no cardápio do cliente)."""
    base = _criar(client, api_headers, nome="X-Burger")
    ad = _criar(client, api_headers, nome="Queijo extra", preco=2.0, aplica_em=[base["id"]])

    assert client.delete(f"/itens/{base['id']}", headers=api_headers["app"]).status_code == 204
    assert client.get(f"/itens/{ad['id']}", headers=api_headers["pwa_cliente"]).status_code == 404
