"""
Gerenciador de conexões WebSocket por tipo de cliente.
Mantém conexões separadas para: App Mobile, PWA e ESP32 (painel LCD).
"""

import json
from fastapi import WebSocket

# Tipos de cliente válidos
CLIENT_TYPES = {"pwa_admin", "pwa_cliente", "esp32"}


def websocket_event(event: str, data: dict | None = None) -> dict:
    """Cria o envelope único usado por todos os eventos WebSocket."""
    return {
        "event": event,
        "data": data or {},
    }


class ConnectionManager:
    def __init__(self):
        # Dict de listas de conexões por tipo de cliente
        self.connections: dict[str, list[WebSocket]] = {
            "pwa_admin": [],
            "pwa_cliente": [],
            "esp32": [],
        }

    async def connect(self, client_type: str, websocket: WebSocket):
        """Aceita e registra uma conexão WebSocket."""
        await websocket.accept()
        if client_type in self.connections:
            self.connections[client_type].append(websocket)

    def disconnect(self, client_type: str, websocket: WebSocket):
        """Remove uma conexão WebSocket."""
        if client_type in self.connections and websocket in self.connections[client_type]:
            self.connections[client_type].remove(websocket)

    async def send_to_client(self, client_type: str, message: dict):
        """Envia uma mensagem para todos os clientes de um tipo específico."""
        if client_type not in self.connections:
            return
        dead = []
        for ws in self.connections[client_type]:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append(ws)
        # Limpa conexões mortas
        for ws in dead:
            self.connections[client_type].remove(ws)

    async def send_to_clients(self, client_types: list[str], message: dict):
        """Envia uma mensagem para múltiplos tipos de cliente."""
        for ct in client_types:
            await self.send_to_client(ct, message)

    async def broadcast(self, message: dict):
        """Envia uma mensagem para todos os clientes conectados."""
        for ct in self.connections:
            await self.send_to_client(ct, message)


# Instância global
manager = ConnectionManager()
