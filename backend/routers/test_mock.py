"""
Router de teste com dados mockados.

Endpoints para que os colegas possam testar o PWA, App Mobile e ESP32
sem precisar configurar nada manualmente. Estes endpoints não exigem API key.

Uso:
1. POST /test/seed          → popula o banco com cardápio + pedidos de exemplo
2. GET  /test/cenario       → vê o estado atual do banco
3. POST /test/fluxo-completo → simula pedido do início ao ENTREGUE
4. POST /test/fluxo-rejeitado → simula pedido rejeitado
5. POST /test/fluxo-dois-pedidos → simula fila do painel LCD
6. DELETE /test/limpar      → limpa o banco
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Item, Pedido, PedidoItem
from pedidos_service import marcar_pago
from websocket_manager import manager, websocket_event

router = APIRouter(prefix="/test", tags=["teste"])

# ── Cardápio mockado ──

CARDAPIO_MOCK = [
    {"nome": "X-Burger", "descricao": "Hambúrguer com queijo, alface e tomate", "preco": 15.00, "disponivel": True},
    {"nome": "X-Salada", "descricao": "Hambúrguer com salada completa", "preco": 16.00, "disponivel": True},
    {"nome": "Refrigerante", "descricao": "Lata 350ml (Coca/Pepsi/Guaraná)", "preco": 6.00, "disponivel": True},
    {"nome": "Batata Frita", "descricao": "Porção 300g com cheddar e bacon", "preco": 10.00, "disponivel": True},
    {"nome": "Milkshake", "descricao": "500ml (Chocolate, Morango, Baunilha)", "preco": 12.00, "disponivel": True},
]


@router.post("/seed")
def seed(db: Session = Depends(get_db)):
    """
    Popula o banco com dados de exemplo:
    - 5 itens no cardápio
    - 3 pedidos em estágios diferentes (PENDENTE, PAGO, PRONTO)
    """
    # Verificar se já tem itens
    if db.query(Item).count() > 0:
        return {"mensagem": "Banco já possui dados. Use DELETE /test/limpar antes de fazer seed novamente."}

    # Criar cardápio
    itens_criados = []
    for item_data in CARDAPIO_MOCK:
        item = Item(**item_data)
        db.add(item)
        db.flush()
        itens_criados.append({"id": item.id, "nome": item.nome, "preco": item.preco})

    # Pedido 1: PENDENTE (aguardando confirmação)
    pedido1 = Pedido(horario_agendamento="12:30", status="PENDENTE", origem="PWA_CLIENTE", total=0.0)
    db.add(pedido1)
    db.flush()
    db.add(PedidoItem(pedido_id=pedido1.id, item_id=itens_criados[0]["id"], quantidade=2))
    db.add(PedidoItem(pedido_id=pedido1.id, item_id=itens_criados[2]["id"], quantidade=1))
    pedido1.total = 2 * 15.00 + 1 * 6.00  # 2x X-Burger + 1x Refrigerante = 36.00

    # Pedido 2: PAGO (número + senha de retirada gerados, cozinha imprimindo)
    pedido2 = Pedido(horario_agendamento="13:00", status="CONFIRMADO", origem="PWA_CLIENTE", total=0.0)
    db.add(pedido2)
    db.flush()
    db.add(PedidoItem(pedido_id=pedido2.id, item_id=itens_criados[0]["id"], quantidade=1))
    db.add(PedidoItem(pedido_id=pedido2.id, item_id=itens_criados[3]["id"], quantidade=1))
    pedido2.total = 1 * 15.00 + 1 * 10.00  # 1x X-Burger + 1x Batata = 25.00
    marcar_pago(db, pedido2)

    # Pedido 3: PRONTO (no painel LCD)
    pedido3 = Pedido(horario_agendamento="12:45", status="CONFIRMADO", origem="PWA_CLIENTE", total=0.0)
    db.add(pedido3)
    db.flush()
    db.add(PedidoItem(pedido_id=pedido3.id, item_id=itens_criados[1]["id"], quantidade=1))
    db.add(PedidoItem(pedido_id=pedido3.id, item_id=itens_criados[4]["id"], quantidade=2))
    pedido3.total = 1 * 16.00 + 2 * 12.00  # 1x X-Salada + 2x Milkshake = 40.00
    marcar_pago(db, pedido3)
    pedido3.status = "PRONTO"
    db.commit()
    db.refresh(pedido3)

    return {
        "mensagem": "Dados de exemplo criados com sucesso!",
        "cardapio": itens_criados,
        "pedidos": [
            {"id": pedido1.id, "status": "PENDENTE", "numero": None, "total": pedido1.total},
            {"id": pedido2.id, "status": "PAGO", "numero": pedido2.numero, "senha_retirada": pedido2.senha_retirada, "total": pedido2.total},
            {"id": pedido3.id, "status": "PRONTO", "numero": pedido3.numero, "senha_retirada": pedido3.senha_retirada, "total": pedido3.total},
        ],
    }


@router.get("/cenario")
def cenario(db: Session = Depends(get_db)):
    """
    Retorna o estado atual do banco: itens e pedidos com seus itens.
    Útil para os colegas verem o que existe antes de começar a testar.
    """
    itens = db.query(Item).all()
    pedidos = db.query(Pedido).order_by(Pedido.id).all()

    return {
        "itens": [
            {"id": i.id, "nome": i.nome, "preco": i.preco, "disponivel": i.disponivel}
            for i in itens
        ],
        "pedidos": [
            {
                "id": p.id,
                "numero": p.numero,
                "status": p.status,
                "origem": p.origem,
                "total": p.total,
                "horario_agendamento": p.horario_agendamento,
                "itens": [
                    {
                        "item_id": pi.item_id,
                        "nome": pi.item.nome if pi.item else None,
                        "quantidade": pi.quantidade,
                        "preco_unitario": pi.item.preco if pi.item else None,
                    }
                    for pi in p.itens
                ],
            }
            for p in pedidos
        ],
    }


@router.post("/fluxo-completo")
async def fluxo_completo(db: Session = Depends(get_db)):
    """
    Simula um pedido completo do início ao ENTREGUE:
    PENDENTE → CONFIRMADO → PAGO → PRONTO → ENTREGUE

    Retorna o histórico de cada passo.
    """
    passos = []

    # Garantir que existe cardápio
    item = db.query(Item).first()
    if not item:
        return {"erro": "Nenhum item no cardápio. Execute POST /test/seed primeiro."}

    # 1. Criar pedido
    pedido = Pedido(horario_agendamento="14:00", status="PENDENTE", origem="PWA_CLIENTE", total=0.0)
    db.add(pedido)
    db.flush()
    db.add(PedidoItem(pedido_id=pedido.id, item_id=item.id, quantidade=2))
    pedido.total = item.preco * 2
    db.commit()
    db.refresh(pedido)

    passos.append({"passo": 1, "acao": "criar_pedido", "pedido_id": pedido.id, "status": "PENDENTE", "numero": None})

    # Notificar App Mobile
    await manager.send_to_client(
        "pwa_admin",
        websocket_event("novo_pedido", {
            "pedido_id": pedido.id,
            "status": "PENDENTE",
        }),
    )

    # 2. Confirmar
    pedido.status = "CONFIRMADO"
    db.commit()
    db.refresh(pedido)
    passos.append({"passo": 2, "acao": "confirmar", "pedido_id": pedido.id, "status": "CONFIRMADO", "numero": None})

    await manager.send_to_clients(
        ["pwa_cliente", "pwa_admin"],
        websocket_event("status_atualizado", {
            "pedido_id": pedido.id,
            "status": "CONFIRMADO",
            "numero": None,
        }),
    )

    # 3. Pagar (gera número + senha de retirada)
    marcar_pago(db, pedido)
    numero = pedido.numero
    passos.append({
        "passo": 3,
        "acao": "pagar",
        "pedido_id": pedido.id,
        "status": "PAGO",
        "numero": numero,
        "senha_retirada": pedido.senha_retirada,
    })

    await manager.send_to_clients(
        ["pwa_cliente", "pwa_admin"],
        websocket_event("status_atualizado", {
            "pedido_id": pedido.id,
            "status": "PAGO",
            "numero": numero,
        }),
    )

    # 4. Pronto (notifica painel LCD)
    pedido.status = "PRONTO"
    db.commit()
    db.refresh(pedido)
    passos.append({"passo": 4, "acao": "pronto", "pedido_id": pedido.id, "status": "PRONTO", "numero": numero})

    await manager.send_to_clients(
        ["pwa_cliente", "pwa_admin"],
        websocket_event("status_atualizado", {
            "pedido_id": pedido.id,
            "status": "PRONTO",
            "numero": numero,
        }),
    )
    await manager.send_to_client("esp32", {
        "event": "pedido_pronto",
        "data": {"pedido_id": pedido.id, "numero": numero},
    })

    # 5. Entregue (notifica painel LCD: próximo da fila)
    pedido.status = "ENTREGUE"
    db.commit()
    db.refresh(pedido)
    passos.append({"passo": 5, "acao": "entregar", "pedido_id": pedido.id, "status": "ENTREGUE", "numero": numero})

    await manager.send_to_clients(
        ["pwa_cliente", "pwa_admin"],
        websocket_event("status_atualizado", {
            "pedido_id": pedido.id,
            "status": "ENTREGUE",
            "numero": numero,
        }),
    )
    await manager.send_to_client("esp32", {
        "event": "pedido_entregue",
        "data": {"pedido_id": pedido.id, "numero": numero},
    })

    return {
        "mensagem": "Fluxo completo simulado com sucesso!",
        "pedido_id": pedido.id,
        "numero_final": numero,
        "passos": passos,
    }


@router.post("/fluxo-rejeitado")
async def fluxo_rejeitado(db: Session = Depends(get_db)):
    """
    Simula um pedido que é rejeitado pela loja:
    PENDENTE → CANCELADO
    """
    item = db.query(Item).first()
    if not item:
        return {"erro": "Nenhum item no cardápio. Execute POST /test/seed primeiro."}

    # Criar pedido
    pedido = Pedido(horario_agendamento="15:00", status="PENDENTE", origem="PWA_CLIENTE", total=0.0)
    db.add(pedido)
    db.flush()
    db.add(PedidoItem(pedido_id=pedido.id, item_id=item.id, quantidade=1))
    pedido.total = item.preco
    db.commit()
    db.refresh(pedido)

    # Notificar App Mobile
    await manager.send_to_client(
        "pwa_admin",
        websocket_event("novo_pedido", {
            "pedido_id": pedido.id,
            "status": "PENDENTE",
        }),
    )

    # Rejeitar
    pedido.status = "CANCELADO"
    db.commit()
    db.refresh(pedido)

    # Notificar PWA
    await manager.send_to_clients(
        ["pwa_cliente", "pwa_admin"],
        websocket_event("status_atualizado", {
            "pedido_id": pedido.id,
            "status": "CANCELADO",
            "numero": None,
        }),
    )

    return {
        "mensagem": "Pedido rejeitado simulado!",
        "pedido_id": pedido.id,
        "status_final": "CANCELADO",
    }


@router.post("/fluxo-dois-pedidos")
async def fluxo_dois_pedidos(db: Session = Depends(get_db)):
    """
    Simula dois pedidos que chegam ao PRONTO e o primeiro é entregue.
    Para testar a fila do painel LCD:
    1. Pedido A fica PRONTO → painel exibe #A
    2. Pedido B fica PRONTO → painel continua exibindo #A
    3. Pedido A vira ENTREGUE → painel exibe #B
    """
    item = db.query(Item).first()
    if not item:
        return {"erro": "Nenhum item no cardápio. Execute POST /test/seed primeiro."}

    passos = []

    # ── Pedido A ──
    pedidoA = Pedido(horario_agendamento="16:00", status="PENDENTE", origem="PWA_CLIENTE", total=0.0)
    db.add(pedidoA)
    db.flush()
    db.add(PedidoItem(pedido_id=pedidoA.id, item_id=item.id, quantidade=1))
    pedidoA.total = item.preco
    db.commit()
    db.refresh(pedidoA)

    # Confirmar + Pagar
    pedidoA.status = "CONFIRMADO"
    db.commit()

    marcar_pago(db, pedidoA)
    numeroA = pedidoA.numero

    # Pronto → notifica painel
    pedidoA.status = "PRONTO"
    db.commit()
    db.refresh(pedidoA)
    await manager.send_to_client("esp32", {
        "event": "pedido_pronto",
        "data": {"pedido_id": pedidoA.id, "numero": numeroA},
    })
    passos.append({"pedido": "A", "numero": numeroA, "status": "PRONTO", "painel_exibe": f"#{numeroA:03d}"})

    # ── Pedido B ──
    pedidoB = Pedido(horario_agendamento="16:15", status="PENDENTE", origem="PWA_CLIENTE", total=0.0)
    db.add(pedidoB)
    db.flush()
    db.add(PedidoItem(pedido_id=pedidoB.id, item_id=item.id, quantidade=2))
    pedidoB.total = item.preco * 2
    db.commit()
    db.refresh(pedidoB)

    # Confirmar + Pagar
    pedidoB.status = "CONFIRMADO"
    db.commit()

    marcar_pago(db, pedidoB)
    numeroB = pedidoB.numero

    # Pronto → painel continua exibindo A
    pedidoB.status = "PRONTO"
    db.commit()
    db.refresh(pedidoB)
    await manager.send_to_client("esp32", {
        "event": "pedido_pronto",
        "data": {"pedido_id": pedidoB.id, "numero": numeroB},
    })
    passos.append({"pedido": "B", "numero": numeroB, "status": "PRONTO", "painel_exibe": f"#{numeroA:03d} (A ainda na fila)"})

    # ── Entregar A → painel exibe B ──
    pedidoA.status = "ENTREGUE"
    db.commit()
    db.refresh(pedidoA)
    await manager.send_to_client("esp32", {
        "event": "pedido_entregue",
        "data": {"pedido_id": pedidoA.id, "numero": numeroA},
    })
    passos.append({"pedido": "A", "numero": numeroA, "status": "ENTREGUE", "painel_exibe": f"#{numeroB:03d} (B é o próximo)"})

    return {
        "mensagem": "Fluxo de dois pedidos simulado!",
        "pedido_A": {"id": pedidoA.id, "numero": numeroA, "status": "ENTREGUE"},
        "pedido_B": {"id": pedidoB.id, "numero": numeroB, "status": "PRONTO"},
        "passos": passos,
    }


@router.delete("/limpar")
def limpar(db: Session = Depends(get_db)):
    """
    Limpa todos os pedidos e itens do banco.
    Útil para reiniciar os testes do zero.
    """
    db.query(PedidoItem).delete()
    db.query(Pedido).delete()
    db.query(Item).delete()
    db.commit()
    return {"mensagem": "Banco limpo! Todos os pedidos e itens foram removidos."}
