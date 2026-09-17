"""
Configuração de testes com pytest usando PostgreSQL.

O banco de testes deve ser definido em TEST_DATABASE_URL.
Sobrescreve a dependency get_db para usar o banco de teste.
"""

import os
import sys
from pathlib import Path

# Adicionar o diretório do backend ao path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from database import get_db, Base
from models import Item

# ── Configurar variáveis de ambiente para testes ──
os.environ["API_KEY_PWA"] = "test-key-pwa"
os.environ["API_KEY_APP"] = "test-key-app"
os.environ["API_KEY_ESP32"] = "test-key-esp32"

# Recarregar API_KEYS no app
from main import app as _app


# ── Banco PostgreSQL de teste ──
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
if not TEST_DATABASE_URL or not TEST_DATABASE_URL.startswith(("postgresql://", "postgres://")):
    raise RuntimeError("Defina TEST_DATABASE_URL com uma URL PostgreSQL para executar os testes")

test_engine = create_engine(
    TEST_DATABASE_URL,
    pool_pre_ping=True,
)

TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    """Dependency que usa o banco de teste em memória."""
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Sobrescrever a dependency no app
app.dependency_overrides[get_db] = override_get_db


# ── Fixtures ──

@pytest.fixture(scope="function")
def client():
    """
    Cliente de teste com banco limpo para cada teste.
    Cria as tabelas antes e dropa depois.
    """
    Base.metadata.create_all(bind=test_engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def db_session():
    """
    Sessão direta do banco de teste (para assertions nos testes).
    """
    Base.metadata.create_all(bind=test_engine)
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def seed_itens(client):
    """
    Cria itens de cardápio via API para testes que precisam de dados.
    Retorna a lista de itens criados.
    """
    itens_data = [
        {"nome": "X-Burger", "descricao": "Hambúrguer com queijo", "preco": 15.00, "disponivel": True},
        {"nome": "X-Salada", "descricao": "Hambúrguer com salada", "preco": 16.00, "disponivel": True},
        {"nome": "Refrigerante", "descricao": "Lata 350ml", "preco": 6.00, "disponivel": True},
        {"nome": "Batata Frita", "descricao": "Porção 300g", "preco": 10.00, "disponivel": True},
        {"nome": "Milkshake", "descricao": "500ml", "preco": 12.00, "disponivel": True},
    ]

    itens_criados = []
    for item in itens_data:
        # Usa rota de teste (não exige API key)
        response = client.post("/test/seed")
        if response.status_code == 200 and "cardapio" in response.json():
            return response.json()["cardapio"]
        # Se seed falhar (banco já tem dados), cria via API de itens
        break

    # Se seed não funcionou, cria itens individualmente via API
    for item in itens_data:
        response = client.post(
            "/itens",
            json=item,
            headers={"X-API-Key": "test-key-pwa"},
        )
        if response.status_code == 201:
            itens_criados.append(response.json())

    return itens_criados


@pytest.fixture(scope="function")
def api_headers():
    """Headers com API key para usar nas requisições de teste."""
    return {
        "pwa": {"X-API-Key": "test-key-pwa"},
        "app": {"X-API-Key": "test-key-app"},
        "esp32": {"X-API-Key": "test-key-esp32"},
    }
