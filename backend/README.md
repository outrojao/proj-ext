# Backend — Sistema de Pedidos (FastAPI)

API central para gerenciamento de pedidos, pagamentos e comunicação em tempo real com o painel LCD (ESP32).

Arquitetura: **2 PWAs + ESP32** — a PWA do cliente agenda e paga (Pix manual, sem gateway);
a PWA/App Mobile do atendente confirma pedidos e pagamentos; o ESP32 exibe os números no painel.

## Stack

- **FastAPI** — Framework web
- **PostgreSQL** — Banco de dados relacional
- **SQLAlchemy** — ORM
- **WebSockets** — Comunicação em tempo real
- **API Keys** — Autenticação simples por cliente
- **Pix** — Pagamento manual via payload EMV "copia e cola" + QR Code (sem gateway)

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

# Configurar API keys e dados do Pix
cp .env.example .env
# Edite DATABASE_URL, as chaves e PIX_CHAVE / PIX_NOME / PIX_CIDADE

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

> **Guard de PAGO:** o status `PAGO` só é aceito com a chave do **App Mobile** (`API_KEY_APP`).
> A PWA do cliente recebe `403` — quem confirma o pagamento é o atendente, manualmente.

### Variáveis do Pix

O QR Code é montado com os dados do recebedor lidos do ambiente no request:

| Variável     | Descrição                          |
| ------------ | ---------------------------------- |
| `PIX_CHAVE`  | Chave Pix do recebedor             |
| `PIX_NOME`   | Nome do recebedor (máx. 25 chars)  |
| `PIX_CIDADE` | Cidade do recebedor (máx. 15 chars)|

## Endpoints REST

| Método | Endpoint               | Descrição                               |
| ------ | ---------------------- | --------------------------------------- |
| GET    | `/health`              | Health check                            |
| GET    | `/itens`               | Lista itens do cardápio                 |
| POST   | `/itens`               | Cria item (aceita `imagem` e `categoria`) |
| GET    | `/itens/{id}`          | Obtém item                              |
| PUT    | `/itens/{id}`          | Atualiza item (inclui `imagem`/`categoria`) |
| DELETE | `/itens/{id}`          | Remove item                             |
| POST   | `/pedidos`             | Cria pedido (PWA; aceita `nome_cliente` opcional) |
| GET    | `/pedidos`             | Lista pedidos                           |
| GET    | `/pedidos/pendentes`   | Pedidos pendentes                       |
| GET    | `/pedidos/fila-painel` | Pedidos PRONTO (para ESP32 sincronizar) |
| GET    | `/pedidos/{id}`        | Obtém pedido                            |
| GET    | `/pedidos/{id}/numero` | Número do pedido                        |
| PATCH  | `/pedidos/{id}/status` | Atualiza status (PAGO só com chave APP) |
| POST   | `/pedidos/{id}/pagamento` | Gera payload + QR Code Pix (apenas `CONFIRMADO`) |
| GET    | `/pedidos/{id}/pagamento` | Status do pagamento (`PENDENTE`/`APROVADO`) |
| POST   | `/pedidos/{id}/declarar-pagamento` | Botão "Já paguei" — notifica App Mobile, persiste `pagamento_declarado_em`, não muda status |

## WebSocket Events

| Event                 | Quem recebe        | Quando                     |
| --------------------- | ------------------ | -------------------------- |
| `novo_pedido`         | App Mobile         | Pedido criado no PWA       |
| `status_atualizado`   | PWA + App Mobile   | Qualquer mudança de status |
| `pagamento_declarado` | App Mobile         | Cliente clica em "Já paguei" |
| `pedido_pronto`       | ESP32 (painel LCD) | Status vira PRONTO ou rotação de fila por timeout |
| `pedido_entregue`     | ESP32 (painel LCD) | Status vira ENTREGUE       |

Todos os eventos WebSocket usam o mesmo envelope:

```json
{
  "event": "nome_do_evento",
  "data": {}
}
```

Exemplo de `novo_pedido`:

```json
{
  "event": "novo_pedido",
  "data": {
    "pedido_id": 10,
    "status": "PENDENTE"
  }
}
```

## Fluxo de Status

```text
PENDENTE → CONFIRMADO → PAGO → PRONTO → ENTREGUE
                ↓                ↓
            CANCELADO        CANCELADO
```

- **PENDENTE:** Pedido criado pelo PWA, aguardando confirmação
- **CONFIRMADO:** App Mobile aceitou o pedido
- **PAGO:** Pagamento Pix confirmado **manualmente pelo atendente** no App Mobile (a PWA recebe 403 se tentar). Gera `numero` sequencial + `senha_retirada` (4 caracteres)
- **PRONTO:** Lanchonete finalizou o pedido (painel LCD exibe o número)
- **ENTREGUE:** Cliente retirou (painel LCD exibe próximo da fila)
- **CANCELADO:** Pedido rejeitado ou cancelado

### Fluxo de pagamento (Pix manual)

1. PWA do cliente: cria o pedido (aceita `nome_cliente` opcional, máx. 40 chars) e, com o pedido `CONFIRMADO`, → `POST /pedidos/{id}/pagamento` → QR Code / copia e cola
2. Cliente paga no app do banco e clica em "Já paguei" → `POST /pedidos/{id}/declarar-pagamento` → App Mobile é notificado via WebSocket **e** `pagamento_declarado_em` é persistido no pedido (o pwa-admin faz sync no boot e vê declarações mesmo que estivesse offline)
3. Atendente confirma no App Mobile → `PATCH /pedidos/{id}/status` com `PAGO` (chave `API_KEY_APP`) — consome a declaração (`pagamento_declarado_em` volta a `null`)
4. PWA do cliente faz polling em `GET /pedidos/{id}/pagamento` → `APROVADO` (pedido ganha `numero` + `senha_retirada`)

O payload Pix é **determinístico por pedido** (`txid = PED{id}`): não há estado novo no banco,
regenerar o QR é recomputar. `expira_em` no response é apenas UX.

## Painel LCD (ESP32) — timeout de exibição

O ESP32 é um **consumidor simples**: o backend decide o que exibir e envia via
WebSocket (`pedido_pronto` / `pedido_entregue` / `fila_vazia`). O ESP32 não envia
mensagens de controle.

O timeout de exibição é todo do lado do backend:

- Quando um pedido passa a ser exibido, o backend agenda uma verificação após
  `PAINEL_TIMEOUT_MINUTOS` (padrão `10`).
- Se o tempo passou **e há outro pedido `PRONTO` aguardando na fila**, o pedido
  exibido vai para o **fim da fila** (posição `painel_fila_posicao = maior + 1`)
  e o backend envia `pedido_pronto` com o próximo da fila.
- Com **um único pedido** na fila não há rotação: o pedido continua exibido.
- Ao **reconectar**, o ESP32 recebe a sincronização atual e o backend refaz a
  verificação de timeout (rede de segurança, ex.: backend reiniciado).

```bash
# Configurar o timeout (em minutos) no .env
PAINEL_TIMEOUT_MINUTOS=10
```

## Estrutura de Arquivos

```text
backend/
├── main.py                 # Entry point + CORS + middleware + WebSocket
├── auth.py                 # API keys por cliente + identificação do caller
├── database.py             # SQLAlchemy + PostgreSQL
├── migrations/             # Migrações Alembic (0001 schema, 0002 painel, 0003 senha_retirada, 0004 fila posicao, 0005 nome_cliente + pagamento_declarado_em)
├── models.py               # Item, Pedido, PedidoItem
├── schemas.py              # Pydantic schemas (validação de HH:MM)
├── painel_service.py       # Fila, timeout de exibição e eventos do painel LCD
├── pedidos_service.py      # marcar_pago: numeração + senha de retirada
├── pix.py                  # Payload EMV "copia e cola" + CRC16 + QR Code
├── websocket_manager.py    # Gerenciador de conexões WS
├── routers/
│   ├── __init__.py
│   ├── itens.py            # CRUD de itens
│   ├── pedidos.py          # CRUD + status (guard de PAGO) + WS
│   ├── pagamentos.py       # Pix: gerar QR, status, declarar-pagamento
│   └── test_mock.py        # Rotas de teste com dados mockados
├── tests/                  # Testes automatizados (pytest)
│   ├── __init__.py
│   ├── conftest.py         # Fixtures (PostgreSQL de teste, client, seed)
│   ├── test_itens.py       # Testes do CRUD de itens
│   ├── test_pedidos.py     # Testes do CRUD + status + fluxos
│   ├── test_pix.py         # Payload EMV: CRC16, campos, truncamento, QR
│   ├── test_pagamento.py   # Endpoints de pagamento Pix
│   ├── test_status_guard.py# Guard de PAGO (403 pwa / 200 app)
│   ├── test_senha.py       # Senha de retirada + idempotência do marcar_pago
│   ├── test_painel_rotacao.py # Timeout de exibição + rotação para o fim da fila
│   └── test_websocket.py   # Testes de WebSocket
├── requirements.txt        # Dependências de produção
├── requirements-dev.txt    # Dependências de teste
├── Makefile                # Comandos: install, run, dev, migrate, test, clean
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

| Arquivo              | O que testa                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test_itens.py`      | CRUD de itens: criar, listar, obter, atualizar, deletar + persistência de `imagem`/`categoria` + validação de API key                              |
| `test_pedidos.py`    | Criação de pedidos (com/sem `nome_cliente`), listagem, fluxo de status, numeração sequencial, transições válidas/inválidas, fila do painel, fluxo completo, fluxo cancelado |
| `test_pix.py`        | Payload EMV: check value do CRC16, prefixo `000201`, campos `53`/`54`, truncamento nome/cidade, valor com 2 decimais, QR em PNG base64             |
| `test_pagamento.py`  | `POST/GET /pedidos/{id}/pagamento` (409 fora de CONFIRMADO, contrato do response, determinismo, APROVADO após PAGO) + `declarar-pagamento` (persiste `pagamento_declarado_em`; limpa no PAGO) |
| `test_status_guard.py` | `PATCH PAGO` com chave PWA → 403; com chave APP → 200 com `numero` + `senha_retirada`; demais transições intactas                               |
| `test_senha.py`      | Senha: tamanho 4, alfabeto sem ambiguidade, gerações distintas, idempotência do `marcar_pago`, constraint unique                                    |
| `test_painel_rotacao.py` | Timeout de exibição: rotação para o fim da fila com pedido na fila, pedido único sem rotação, ordem da fila (`painel_fila_posicao`), `fila-painel` |
| `test_websocket.py`  | Conexão com/sem API key, tipo de cliente inválido, notificação de novo_pedido, status_atualizado, pedido_pronto, pedido_entregue                   |

Os testes usam PostgreSQL. Defina `TEST_DATABASE_URL` (ou `DATABASE_URL`) apontando para um banco de teste dedicado; cada teste cria e remove suas tabelas.

---

## Limitações Conhecidas

- **Pix manual (sem gateway):** Não há validação de transação financeira no backend. O QR é gerado com o total do pedido e o atendente confirma manualmente no App Mobile após o cliente declarar o pagamento (aceitável para projeto de extensão).
- **PWA não marca PAGO:** A chave da PWA recebe 403 em `PATCH /pedidos/{id}/status` com `PAGO`; apenas a chave do App Mobile confirma o pagamento.
- **WebSocket em memória:** As conexões são mantidas em memória. Se o processo reiniciar, todos os clientes precisam reconectar. O endpoint `GET /pedidos/fila-painel` permite que o ESP32 sincronize ao reconectar. A tarefa de timeout de exibição também é em memória: ao reconectar, o backend refaz a verificação de timeout (rede de segurança).
- **Banco de testes:** Nunca use o banco de produção em `TEST_DATABASE_URL`, pois os testes removem as tabelas a cada caso.
- **Rotas de teste sem auth:** Os endpoints `/test/*` não exigem API key. Em produção, remover o router `test_mock` do `main.py`.

## Deploy no Render

No Web Service, configure `DATABASE_URL` com a **Internal Database URL** do PostgreSQL do Render. Não coloque essa URL no código ou no repositório.

```text
Build Command: pip install -r requirements.txt
Start Command: alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port $PORT
```

O Web Service e o banco devem estar na mesma região. Antes do primeiro deploy, revogue qualquer senha PostgreSQL que tenha sido exposta no histórico ou em arquivos locais versionados.
