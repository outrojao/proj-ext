# Projeto de Extensão

Sistema integrado para gerenciamento de pedidos, pagamentos e comunicação com dispositivos físicos.

## Componentes

- **App Mobile:** Responsável pela comunicação com a maquininha de cartão, site PWA, impressora e painel LED.
- **Site PWA:** permite agendamento de pedidos, pagamento antecipado ou pagamento no local.
- **Painel LED:** desenvolvido com ESP32 para exibição dos números dos pedidos.

## Escopo
- **App Mobile:**
  - Recebe pagamentos concluídos pela máquininha e processa o pedido para impressora e painel Led;
  - Confirma ou rejeita os pedidos vindos do site PWA;
  - Atualiza os itens disponíveis no site PWA.
 
- **Site PWA:**
  - Permite que o cliente selecione os itens desejados e um horário para agendamento do pedido;
  - Caso confirmado o pagamento é liberado e se não é cancelado;
  - Com pagamento feito o cliente recebe o número do seu pedido.
 
- **Painel Led:**
  - Recebe o número dos pedidos agendados prontos e exibe na tela;
  - Assim que o pedido é marcado como entregue o próximo pedido é exibido na tela.

## Como iniciar o desenvolvimento

### 1. Instale o Git

Baixe e instale o [Git](https://git-scm.com/install/windows).

### 2. Clone o repositório

Crie uma pasta para o projeto e execute:

```bash
git clone <link-do-repositorio>
```

Entre na pasta do projeto:
```bash
cd <nome-do-repositorio>
```

### 3. Atualize o projeto

Antes de começar a trabalhar:
```bash
git pull
```

## Branches
|Branch|Uso|
|----------|-------|
|main|Versão estável do projeto|
|dev|Desenvolvimento e testes|
|feature/* |Desenvolvimento de novas funcionalidades|
|hotfix/* |Correções urgentes na main|

### Fluxo
feature/* → dev → main


### Para correções urgentes:

hotfix/* → main

OU

hotfix/* → dev

### Criando uma Feature

As features devem ser criadas a partir da dev:
```bash
git checkout dev
```
```bash
git pull
```
```bash
git checkout -b feature/nome-da-feature
```

### Exemplos:

feature/pagamento

feature/painel-led

feature/impressora


Após finalizar o desenvolvimento, faça um Pull Request da feature para a dev.

## Commits

Utilizamos o padrão Conventional Commits.

### Formato
tipo: descrição

### Tipos principais
feat — nova funcionalidade

fix — correção

docs — documentação

refactor — refatoração

test — testes

chore — manutenção

### Exemplos
```bash
git commit -m "feat: adicionar pagamento"
```
```bash
git commit -m "fix: corrigir comunicação com painel"
```
```bash
git commit -m "docs: atualizar README"
```

### Enviando alterações
```bash
git add .
```
```bash
git commit -m "tipo: descrição"
```
```bash
git push
```

Após o desenvolvimento e os testes na dev, as alterações podem ser integradas à main.
