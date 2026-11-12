"""
Autenticação por API key por cliente.

Lê as chaves do ambiente (.env) e expõe helpers para validar uma chave
e identificar o tipo de cliente que a usa.
"""

import os

from dotenv import load_dotenv

# Carregar variáveis de ambiente (.env)
load_dotenv()

# API keys por cliente (lidas do .env)
API_KEYS = {
    "pwa_cliente": os.getenv("API_KEY_PWA_CLIENTE", ""),
    "pwa_admin": os.getenv("API_KEY_PWA_ADMIN", ""),
    "esp32": os.getenv("API_KEY_ESP32", ""),
}


def tipo_cliente(chave: str | None) -> str | None:
    """
    Retorna o tipo de cliente para a chave informada.

    Retorna None se a chave for ausente, vazia ou não corresponder
    a nenhum cliente configurado.
    """
    if not chave:
        return None
    for tipo, valor in API_KEYS.items():
        if valor and valor == chave:
            return tipo
    return None
