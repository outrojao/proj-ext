# Backend — Sistema de Pedidos (FastAPI)

API central para gerenciamento de pedidos, pagamentos e comunicação em tempo real com o painel LCD (ESP32).

## Stack

- **FastAPI** — Framework web
- **PostgreSQL** — Banco de dados relacional
- **SQLAlchemy** — ORM
- **WebSockets** — Comunicação em tempo real
- **API Keys** — Autenticação simples por cliente

## Instalação

```bash
# Criar ambiente virtual
python -m venv venv

# Ativar (Windows)
venv\Scripts\activate

# Ativar (Linux/Mac)
source venv/bin/activate

# Instalar dependências
pip install -r requirements.txt

# Configurar API keys
cp .env.example .env
# Edite DATABASE_URL e as chaves

# Aplicar o schema PostgreSQL
alembic upgrade head
```

## Execução

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Acesse a documentação interativa em `http://localhost:8000/docs`.

## Segurança

Todas as rotas (exceto `/health` e `/docs`) exigem o header `X-API-Key` com uma chave válida. Cada cliente tem sua própria chave:

| Cliente              | Variável no .env |
| -------------------- | ---------------- |
| PWA (site)           | `API_KEY_PWA`    |
| App Mobile (Android) | `API_KEY_APP`    |
| ESP32 (painel LCD)   | `API_KEY_ESP32`  |

Para WebSocket, a API key é passada via query param: `ws://host:8000/ws/esp32?api_key=sua-chave`

## Endpoints REST

| Método | Endpoint               | Descrição                               |
| ------ | ---------------------- | --------------------------------------- |
| GET    | `/health`              | Health check                            |
| GET    | `/itens`               | Lista itens do cardápio                 |
| POST   | `/itens`               | Cria item                               |
| GET    | `/itens/{id}`          | Obtém item                              |
| PUT    | `/itens/{id}`          | Atualiza item                           |
| DELETE | `/itens/{id}`          | Remove item                             |
| POST   | `/pedidos`             | Cria pedido (PWA)                       |
| GET    | `/pedidos`             | Lista pedidos                           |
| GET    | `/pedidos/pendentes`   | Pedidos pendentes                       |
| GET    | `/pedidos/fila-painel` | Pedidos PRONTO (para ESP32 sincronizar) |
| GET    | `/pedidos/{id}`        | Obtém pedido                            |
| GET    | `/pedidos/{id}/numero` | Número do pedido                        |
| PATCH  | `/pedidos/{id}/status` | Atualiza status                         |

## WebSocket Events

| Event               | Quem recebe        | Quando                     |
| ------------------- | ------------------ | -------------------------- |
| `novo_pedido`       | App Mobile         | Pedido criado no PWA       |
| `status_atualizado` | PWA + App Mobile   | Qualquer mudança de status |
| `pedido_pronto`     | ESP32 (painel LCD) | Status vira PRONTO         |
| `pedido_entregue`   | ESP32 (painel LCD) | Status vira ENTREGUE       |

## Fluxo de Status

```text
PENDENTE → CONFIRMADO → PAGO → PRONTO → ENTREGUE
                ↓                ↓
            CANCELADO        CANCELADO
```

- **PENDENTE:** Pedido criado pelo PWA, aguardando confirmação
- **CONFIRMADO:** App Mobile aceitou o pedido
- **PAGO:** Pagamento confirmado (número gerado, cozinha imprime)
- **PRONTO:** Lanchonete finalizou o pedido (painel LCD exibe o número)
- **ENTREGUE:** Cliente retirou (painel LCD exibe próximo da fila)
- **CANCELADO:** Pedido rejeitado ou cancelado

## Estrutura de Arquivos

```text
backend/
├── main.py                 # Entry point + CORS + middleware + WebSocket
├── database.py             # SQLAlchemy + PostgreSQL
├── migrations/             # Migrações Alembic
├── models.py               # Item, Pedido, PedidoItem
├── schemas.py              # Pydantic schemas
├── websocket_manager.py    # Gerenciador de conexões WS
├── routers/
│   ├── __init__.py
│   ├── itens.py            # CRUD de itens
│   ├── pedidos.py          # CRUD + status + numeração + WS
│   └── test_mock.py        # Rotas de teste com dados mockados
├── tests/                  # Testes automatizados (pytest)
│   ├── __init__.py
│   ├── conftest.py         # Fixtures (banco em memória, client, seed)
│   ├── test_itens.py       # Testes do CRUD de itens
│   ├── test_pedidos.py     # Testes do CRUD + status + fluxos
│   └── test_websocket.py   # Testes de WebSocket
├── requirements.txt        # Dependências de produção
├── requirements-dev.txt    # Dependências de teste
├── Makefile                # Comandos: install, run, dev, clean
├── .env.example
└── README.md
```

---

## Rotas de Teste com Dados Mockados

Estas rotas **não exigem API key** e servem para os colegas testarem o PWA, App Mobile e ESP32 sem precisar configurar nada manualmente.

| Método | Endpoint                   | Descrição                                                                |
| ------ | -------------------------- | ------------------------------------------------------------------------ |
| POST   | `/test/seed`               | Popula o banco: 5 itens no cardápio + 3 pedidos (PENDENTE, PAGO, PRONTO) |
| GET    | `/test/cenario`            | Retorna o estado atual do banco (itens e pedidos)                        |
| POST   | `/test/fluxo-completo`     | Simula pedido do início ao ENTREGUE (5 passos)                           |
| POST   | `/test/fluxo-rejeitado`    | Simula pedido rejeitado (PENDENTE → CANCELADO)                           |
| POST   | `/test/fluxo-dois-pedidos` | Simula fila do painel LCD (2 pedidos PRONTO, entrega o primeiro)         |
| DELETE | `/test/limpar`             | Limpa todos os pedidos e itens do banco                                  |

### Guia rápido para os colegas

```bash
# 1. Subir o backend
make install
make dev

# 2. Popular o banco com dados de exemplo
curl -X POST http://localhost:8000/test/seed

# 3. Ver o estado atual
curl http://localhost:8000/test/cenario

# 4. Simular um fluxo completo
curl -X POST http://localhost:8000/test/fluxo-completo

# 5. Simular fila do painel LCD
curl -X POST http://localhost:8000/test/fluxo-dois-pedidos

# 6. Limpar o banco (quando precisar recomeçar)
curl -X DELETE http://localhost:8000/test/limpar
```

### Cardápio mockado (criado pelo `/test/seed`)

| Item         | Preço    |
| ------------ | -------- |
| X-Burger     | R$ 15,00 |
| X-Salada     | R$ 16,00 |
| Refrigerante | R$ 6,00  |
| Batata Frita | R$ 10,00 |
| Milkshake    | R$ 12,00 |

---

## Testes Automatizados

### Instalação dos testes

```bash
pip install -r requirements-dev.txt
```

### Execução dos testes

```bash
pytest -v
```

### Cobertura dos testes

| Arquivo             | O que testa                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test_itens.py`     | CRUD de itens: criar, listar, obter, atualizar, deletar + validação de API key                                                                     |
| `test_pedidos.py`   | Criação de pedidos, listagem, fluxo de status, numeração sequencial, transições válidas/inválidas, fila do painel, fluxo completo, fluxo cancelado |
| `test_websocket.py` | Conexão com/sem API key, tipo de cliente inválido, notificação de novo_pedido, status_atualizado, pedido_pronto, pedido_entregue                   |

Os testes usam PostgreSQL. Defina `TEST_DATABASE_URL` (ou `DATABASE_URL`) apontando para um banco de teste dedicado; cada teste cria e remove suas tabelas.

---

## Limitações Conhecidas

- **Confiança no PWA:** O backend confia que o PWA confirma o pagamento corretamente. Não há validação de transação financeira no backend (aceitável para projeto de extensão).
- **WebSocket em memória:** As conexões são mantidas em memória. Se o processo reiniciar, todos os clientes precisam reconectar. O endpoint `GET /pedidos/fila-painel` permite que o ESP32 sincronize ao reconectar.
- **Banco de testes:** Nunca use o banco de produção em `TEST_DATABASE_URL`, pois os testes removem as tabelas a cada caso.
- **Rotas de teste sem auth:** Os endpoints `/test/*` não exigem API key. Em produção, remover o router `test_mock` do `main.py`.

## Deploy no Render

No Web Service, configure `DATABASE_URL` com a **Internal Database URL** do PostgreSQL do Render. Não coloque essa URL no código ou no repositório.

```text
Build Command: pip install -r requirements.txt
Start Command: alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port $PORT
```

O Web Service e o banco devem estar na mesma região. Antes do primeiro deploy, revogue qualquer senha PostgreSQL que tenha sido exposta no histórico ou em arquivos locais versionados.
