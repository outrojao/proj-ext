"""
Entry point do backend FastAPI.

Configura:
- App FastAPI com CORS
- Middleware de API key (X-API-Key)
- WebSocket endpoint /ws/{client_type}
- Routers de itens e pedidos
- Health check
"""

import json
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from websocket_manager import manager, CLIENT_TYPES, websocket_event
from routers import itens, pedidos, test_mock
from database import SessionLocal
from painel_service import (
    evento_pedido,
    expirar_pedido,
    iniciar_proximo_pedido,
    pedido_exibindo,
)

# Carregar variáveis de ambiente (.env)
load_dotenv()

# API keys por cliente (lidas do .env)
API_KEYS = {
    "pwa": os.getenv("API_KEY_PWA", ""),
    "app_mobile": os.getenv("API_KEY_APP", ""),
    "esp32": os.getenv("API_KEY_ESP32", ""),
}

app = FastAPI(
    title="Sistema de Pedidos — Backend",
    description="API central para pedidos, pagamentos e painel LCD",
    version="1.0.0",
)

# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Em produção, restringir aos domínios do PWA
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Middleware de API Key ──
@app.middleware("http")
async def verify_api_key(request: Request, call_next):
    """
    Valida o header X-API-Key em todas as rotas exceto /health e /docs.
    """
    # Rotas públicas (não exigem API key)
    public_paths = ["/health", "/docs", "/openapi.json", "/redoc", "/test"]
    path = request.url.path

    # WebSocket connections são validadas no próprio endpoint
    if path.startswith("/ws/"):
        return await call_next(request)

    if any(path == p or path.startswith(p) for p in public_paths):
        return await call_next(request)

    api_key = request.headers.get("X-API-Key")
    if not api_key or api_key not in API_KEYS.values():
        raise HTTPException(status_code=401, detail="API key inválida ou ausente")

    return await call_next(request)


# ── Health Check ──
@app.get("/health", tags=["sistema"])
def health_check():
    return {"status": "ok"}


# ── Routers ──
app.include_router(itens.router)
app.include_router(pedidos.router)
app.include_router(test_mock.router)  # Rotas de teste com dados mockados


# ── WebSocket Endpoint ──
@app.websocket("/ws/{client_type}")
async def websocket_endpoint(websocket: WebSocket, client_type: str):
    """
    Endpoint WebSocket para conexões de clientes.

    Tipos válidos: app_mobile, pwa, esp32

    O ESP32 (painel LCD) conecta aqui para receber:
    - pedido_pronto: exibir número no painel
    - pedido_entregue: exibir próximo da fila
    """
    if client_type not in CLIENT_TYPES:
        await websocket.close(code=4000, reason="Tipo de cliente inválido")
        return

    # Validar API key via query param para WebSocket
    api_key = websocket.query_params.get("api_key")
    if not api_key or api_key != API_KEYS.get(client_type, ""):
        await websocket.close(code=4001, reason="API key inválida")
        return

    await manager.connect(client_type, websocket)

    if client_type == "esp32":
        db = SessionLocal()
        try:
            pedido = pedido_exibindo(db) or iniciar_proximo_pedido(db)
            if pedido:
                await manager.send_to_client("esp32", evento_pedido("pedido_pronto", pedido))
            else:
                await manager.send_to_client("esp32", websocket_event("fila_vazia"))
        finally:
            db.close()

    try:
        while True:
            raw_message = await websocket.receive_text()
            if client_type != "esp32":
                continue

            try:
                message = json.loads(raw_message)
            except json.JSONDecodeError:
                continue

            if message.get("event") != "tempo_excedido":
                continue

            data = message.get("data") or message
            pedido_id = data.get("pedido_id")
            if not isinstance(pedido_id, int):
                continue

            db = SessionLocal()
            try:
                next_order = expirar_pedido(db, pedido_id)
                if next_order:
                    await manager.send_to_client("esp32", evento_pedido("pedido_pronto", next_order))
                else:
                    await manager.send_to_client("esp32", websocket_event("fila_vazia"))
            finally:
                db.close()
    except WebSocketDisconnect:
        manager.disconnect(client_type, websocket)


