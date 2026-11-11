"""
Testes de integração PWA Cliente (pwa-cliente) × PWA Atendente (pwa-admin).

Simulam os dois apps batendo na mesma API com as chaves de cada um
(pwa = cliente, app = atendente) e verificam consistência:
- o mesmo item/pedido aparece nos dois lados com os MESMOS dados;
- cada ação (aceitar, declarar pagamento, PAGO, PRONTO, ENTREGUE)
  reflete corretamente na visão do outro app.
"""

import json
import re

from fastapi.testclient import TestClient

# Alfabeto da senha de retirada: 30 chars, sem 0/1/I/O
ALFABETO_SENHA = re.compile(r"^[A-HJ-NP-Z2-9]{4}$")


def _criar_item(client, api_headers, **dados):
    """Cria um item no cardápio com a chave do admin (CRUD do pwa-admin)."""
    corpo = {
        "nome": "Item Teste",
        "descricao": "Descricao padrao",
        "preco": 15.0,
        "disponivel": True,
        "imagem": None,
        "categoria": None,
    }
    corpo.update(dados)
    resp = client.post("/itens", json=corpo, headers=api_headers["app"])
    assert resp.status_code == 201
    return resp.json()


def _criar_pedido(client, api_headers, itens, nome_cliente="Joao", horario="12:30"):
    """Cria um pedido com a chave do cliente (POST /pedidos do pwa-cliente)."""
    resp = client.post(
        "/pedidos",
        json={"itens": itens, "nome_cliente": nome_cliente, "horario_agendamento": horario},
        headers=api_headers["pwa"],
    )
    assert resp.status_code == 201
    return resp.json()


def _mudar_status(client, api_headers, pedido_id, novo_status):
    """Muda o status com a chave do admin (aplicarAcao do pwa-admin)."""
    resp = client.patch(
        f"/pedidos/{pedido_id}/status",
        json={"novo_status": novo_status},
        headers=api_headers["app"],
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ── Cardápio: item criado/editado no admin aparece igual no cliente ──


def test_item_criado_no_admin_aparece_no_cliente_com_mesmos_dados(client, api_headers):
    item = _criar_item(
        client, api_headers,
        nome="X-Bacon", descricao="Hambúrguer com bacon", preco=18.5,
        imagem=None, categoria="Lanches",
    )

    # Visão do cliente (lista + detalhe)
    lista = client.get("/itens", headers=api_headers["pwa"]).json()
    no_cliente = next(i for i in lista if i["id"] == item["id"])
    detalhe = client.get(f"/itens/{item['id']}", headers=api_headers["pwa"]).json()

    for campo in ("id", "nome", "descricao", "preco", "disponivel", "imagem", "categoria"):
        assert no_cliente[campo] == item[campo], f"campo {campo} difere no cliente"
        assert detalhe[campo] == item[campo], f"campo {campo} difere no detalhe"


def test_item_editado_no_admin_reflete_no_cliente(client, api_headers):
    item = _criar_item(client, api_headers, nome="Milkshake", preco=12.0)

    # Admin edita preço e desativa (toggle de disponibilidade do pwa-admin)
    resp = client.put(
        f"/itens/{item['id']}",
        json={"nome": "Milkshake", "descricao": "500ml", "preco": 14.9,
              "disponivel": False, "imagem": None, "categoria": None},
        headers=api_headers["app"],
    )
    assert resp.status_code == 200

    # Cliente vê os mesmos valores
    no_cliente = next(
        i for i in client.get("/itens", headers=api_headers["pwa"]).json()
        if i["id"] == item["id"]
    )
    assert no_cliente["preco"] == 14.9
    assert no_cliente["disponivel"] is False

    # Cliente usa ?disponivel=true: item desativado some da lista de compra
    ids_disponiveis = [i["id"] for i in client.get("/itens?disponivel=true", headers=api_headers["pwa"]).json()]
    assert item["id"] not in ids_disponiveis


def test_item_desativado_no_admin_bloqueia_novo_pedido_no_cliente(client, api_headers):
    item = _criar_item(client, api_headers, nome="Batata", preco=10.0)
    client.put(
        f"/itens/{item['id']}",
        json={"nome": "Batata", "descricao": None, "preco": 10.0,
              "disponivel": False, "imagem": None, "categoria": None},
        headers=api_headers["app"],
    )

    resp = client.post(
        "/pedidos",
        json={"itens": [{"item_id": item["id"], "quantidade": 1}], "horario_agendamento": "13:00"},
        headers=api_headers["pwa"],
    )
    assert resp.status_code == 400  # item indisponível não pode ser pedido


# ── Pedido: criado no cliente, idêntico no admin ──


def test_pedido_criado_no_cliente_aparece_no_admin_com_mesmos_dados(client, api_headers):
    a = _criar_item(client, api_headers, nome="X-Burger", preco=15.0)
    b = _criar_item(client, api_headers, nome="Refrigerante", preco=6.0)

    criado = _criar_pedido(
        client, api_headers,
        itens=[{"item_id": a["id"], "quantidade": 2}, {"item_id": b["id"], "quantidade": 1}],
        nome_cliente="Joao", horario="12:30",
    )

    # Visão do admin (lista e detalhe)
    no_admin = next(p for p in client.get("/pedidos", headers=api_headers["app"]).json()
                    if p["id"] == criado["id"])
    detalhe = client.get(f"/pedidos/{criado['id']}", headers=api_headers["app"]).json()

    for fonte in (no_admin, detalhe):
        assert fonte["status"] == "PENDENTE"
        assert fonte["total"] == 36.0, f"total diverge: {fonte['total']}"
        assert fonte["nome_cliente"] == "Joao"
        assert fonte["horario_agendamento"] == "12:30"
        assert fonte["origem"] == "PWA"
        assert fonte["numero"] is None
        assert fonte["senha_retirada"] is None
        assert [(i["item_id"], i["quantidade"]) for i in fonte["itens"]] == \
               [(a["id"], 2), (b["id"], 1)]

    # Visão do cliente (ele consulta o próprio pedido) é a mesma
    no_cliente = client.get(f"/pedidos/{criado['id']}", headers=api_headers["pwa"]).json()
    assert no_cliente["total"] == no_admin["total"]
    assert no_cliente["status"] == no_admin["status"]


# ── Ações de um lado refletem no outro ──


def test_aceite_do_admin_reflete_no_cliente(client, api_headers):
    item = _criar_item(client, api_headers)
    pedido = _criar_pedido(client, api_headers, itens=[{"item_id": item["id"], "quantidade": 1}])

    _mudar_status(client, api_headers, pedido["id"], "CONFIRMADO")

    no_cliente = client.get(f"/pedidos/{pedido['id']}", headers=api_headers["pwa"]).json()
    assert no_cliente["status"] == "CONFIRMADO"


def test_declaracao_do_cliente_reflete_no_admin_sem_mudar_status(client, api_headers):
    item = _criar_item(client, api_headers)
    pedido = _criar_pedido(client, api_headers, itens=[{"item_id": item["id"], "quantidade": 1}])
    _mudar_status(client, api_headers, pedido["id"], "CONFIRMADO")

    # Cliente clica "Já paguei"
    resp = client.post(f"/pedidos/{pedido['id']}/declarar-pagamento", headers=api_headers["pwa"])
    assert resp.status_code == 200

    # Admin vê a declaração (destaque âmbar) SEM o status ter mudado
    no_admin = client.get(f"/pedidos/{pedido['id']}", headers=api_headers["app"]).json()
    assert no_admin["pagamento_declarado_em"] is not None
    assert no_admin["status"] == "CONFIRMADO"


def test_pago_gera_numero_e_senha_identicos_nos_dois_lados(client, api_headers):
    item = _criar_item(client, api_headers)
    pedido = _criar_pedido(client, api_headers, itens=[{"item_id": item["id"], "quantidade": 1}])
    _mudar_status(client, api_headers, pedido["id"], "CONFIRMADO")
    client.post(f"/pedidos/{pedido['id']}/declarar-pagamento", headers=api_headers["pwa"])

    _mudar_status(client, api_headers, pedido["id"], "PAGO")

    no_admin = client.get(f"/pedidos/{pedido['id']}", headers=api_headers["app"]).json()
    no_cliente = client.get(f"/pedidos/{pedido['id']}", headers=api_headers["pwa"]).json()

    # Primeiro PAGO da sequência (conftest reseta) → número 1
    assert no_admin["numero"] == 1
    assert ALFABETO_SENHA.match(no_admin["senha_retirada"])
    # Os dois lados veem o MESMO número e a MESMA senha
    assert no_cliente["numero"] == no_admin["numero"]
    assert no_cliente["senha_retirada"] == no_admin["senha_retirada"]
    # Confirmar pagamento limpa a declaração
    assert no_admin["pagamento_declarado_em"] is None
    assert no_cliente["pagamento_declarado_em"] is None


def test_guard_pwa_nao_consegue_marcar_pago(client, api_headers):
    item = _criar_item(client, api_headers)
    pedido = _criar_pedido(client, api_headers, itens=[{"item_id": item["id"], "quantidade": 1}])
    _mudar_status(client, api_headers, pedido["id"], "CONFIRMADO")

    resp = client.patch(
        f"/pedidos/{pedido['id']}/status",
        json={"novo_status": "PAGO"},
        headers=api_headers["pwa"],
    )
    assert resp.status_code == 403

    # E o pedido segue CONFIRMADO nos dois lados
    assert client.get(f"/pedidos/{pedido['id']}", headers=api_headers["pwa"]).json()["status"] == "CONFIRMADO"
    assert client.get(f"/pedidos/{pedido['id']}", headers=api_headers["app"]).json()["status"] == "CONFIRMADO"


def test_painel_fila_somente_aguardando_e_campos_painel_nao_expostos(client, api_headers):
    item = _criar_item(client, api_headers)
    p1 = _criar_pedido(client, api_headers, itens=[{"item_id": item["id"], "quantidade": 1}], nome_cliente="Ana")
    p2 = _criar_pedido(client, api_headers, itens=[{"item_id": item["id"], "quantidade": 1}], nome_cliente="Caio")
    for p in (p1, p2):
        _mudar_status(client, api_headers, p["id"], "CONFIRMADO")
        _mudar_status(client, api_headers, p["id"], "PAGO")
        _mudar_status(client, api_headers, p["id"], "PRONTO")

    # Painel livre → o 1º vira EXIBINDO; o 2º fica na fila (pos 1)
    fila = client.get("/pedidos/fila-painel", headers=api_headers["app"]).json()
    assert [p["id"] for p in fila] == [p2["id"]]
    assert fila[0]["numero"] == 2

    # Contrato: painel_status / painel_fila_posicao NÃO aparecem nas respostas
    for pid in (p1["id"], p2["id"]):
        corpo = client.get(f"/pedidos/{pid}", headers=api_headers["pwa"]).json()
        assert "painel_status" not in corpo
        assert "painel_fila_posicao" not in corpo
        assert corpo["status"] == "PRONTO"


def test_fluxo_completo_reflete_ambos_lados_com_ws_do_admin(client, api_headers):
    item = _criar_item(client, api_headers)

    with client.websocket_connect("/ws/app_mobile?api_key=test-key-app") as ws_app:
        # Cliente cria → admin recebe em tempo real (novo_pedido)
        pedido = _criar_pedido(client, api_headers, itens=[{"item_id": item["id"], "quantidade": 1}])
        msg = json.loads(ws_app.receive_text())
        assert msg["event"] == "novo_pedido"
        assert msg["data"]["pedido_id"] == pedido["id"]
        assert msg["data"]["status"] == "PENDENTE"

        # Cliente declara → admin recebe pagamento_declarado
        _mudar_status(client, api_headers, pedido["id"], "CONFIRMADO")
        ws_app.receive_text()  # status_atualizado CONFIRMADO
        client.post(f"/pedidos/{pedido['id']}/declarar-pagamento", headers=api_headers["pwa"])
        msg = json.loads(ws_app.receive_text())
        assert msg["event"] == "pagamento_declarado"
        assert msg["data"]["pedido_id"] == pedido["id"]

        # Admin leva até o fim; o cliente acompanha cada passo
        _mudar_status(client, api_headers, pedido["id"], "PAGO")
        ws_app.receive_text()
        _mudar_status(client, api_headers, pedido["id"], "PRONTO")
        ws_app.receive_text()
        _mudar_status(client, api_headers, pedido["id"], "ENTREGUE")
        ws_app.receive_text()

        no_cliente = client.get(f"/pedidos/{pedido['id']}", headers=api_headers["pwa"]).json()
        assert no_cliente["status"] == "ENTREGUE"
        assert no_cliente["numero"] is not None
        assert no_cliente["senha_retirada"] is not None

        # Terminal: qualquer transição a partir de ENTREGUE é 400 nos dois lados
        resp = client.patch(
            f"/pedidos/{pedido['id']}/status",
            json={"novo_status": "CONFIRMADO"},
            headers=api_headers["app"],
        )
        assert resp.status_code == 400
