"""
Entry point do backend FastAPI.

Configura:
- App FastAPI com CORS
- Middleware de API key (X-API-Key)
- WebSocket endpoint /ws/{client_type}
- Routers de itens e pedidos
- Health check
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from auth import API_KEYS, tipo_cliente
from websocket_manager import manager, CLIENT_TYPES, websocket_event
from routers import itens, pedidos, pagamentos, test_mock
from database import SessionLocal
from painel_service import (
    evento_pedido,
    expirar_exibicao,
    iniciar_proximo_pedido,
    pedido_exibindo,
)

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
    if request.method == "OPTIONS":
        return await call_next(request)
    path = request.url.path

    # WebSocket connections são validadas no próprio endpoint
    if path.startswith("/ws/"):
        return await call_next(request)

    if any(path == p or path.startswith(p) for p in public_paths):
        return await call_next(request)

    api_key = request.headers.get("X-API-Key")
    if tipo_cliente(api_key) is None:
        return JSONResponse(status_code=401, content={"detail": "API key inválida ou ausente"})

    return await call_next(request)


# ── Health Check ──
@app.get("/health", tags=["sistema"])
def health_check():
    return {"status": "ok"}


# ── Routers ──
app.include_router(itens.router)
app.include_router(pedidos.router)
app.include_router(pagamentos.router)  # Pagamento Pix + declaração de pagamento
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
        # O ESP32 é um consumidor simples: o backend manda o que exibir.
        db = SessionLocal()
        try:
            exibindo = pedido_exibindo(db)
            if exibindo is not None:
                # Rede de segurança no reconectar: se a exibição atual
                # expirou e há pedidos na fila, rotaciona antes de sincronizar
                # (ex.: o backend reiniciou e a tarefa de timeout se perdeu).
                exibindo = expirar_exibicao(db, exibindo.id) or exibindo
            if exibindo is None:
                exibindo = iniciar_proximo_pedido(db)

            if exibindo:
                await manager.send_to_client("esp32", evento_pedido("pedido_pronto", exibindo))
            else:
                await manager.send_to_client("esp32", websocket_event("fila_vazia"))
        finally:
            db.close()

    try:
        # O ESP32 não envia mensagens de controle (timeout é do backend).
        # O loop apenas mantém a conexão viva e detecta desconexão.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(client_type, websocket)


