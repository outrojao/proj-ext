# Projeto de Extensão

Sistema integrado para gerenciamento de pedidos, pagamentos e comunicação com dispositivos físicos.

## Componentes

- **App Mobile:** desenvolvido em Flutter, responsável pela comunicação com a maquininha de cartão, impressora e painel LED.
- **Painel LED:** desenvolvido com ESP32 para exibição dos números dos pedidos.
- **Site PWA:** permite agendamento de pedidos, pagamento antecipado ou pagamento no local.

## Como iniciar o desenvolvimento

### 1. Instale o Git

Baixe e instale o [Git](https://git-scm.com/install/windows).

### 2. Clone o repositório

Crie uma pasta para o projeto e execute:

```bash
git clone <link-do-repositorio>
```

Entre na pasta do projeto:

cd <nome-do-repositorio>

### 3. Atualize o projeto

Antes de começar a trabalhar:

git pull

## Branches
Branch	Uso
main	Versão estável do projeto
dev	Desenvolvimento e testes
feature/*	Desenvolvimento de novas funcionalidades
hotfix/*	Correções urgentes na main
### Fluxo
feature/* → dev → main


### Para correções urgentes:

hotfix/* → main
        ↘ dev

### Criando uma Feature

As features devem ser criadas a partir da dev:

git checkout dev
git pull
git checkout -b feature/nome-da-feature


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
git commit -m "feat: adicionar pagamento"
git commit -m "fix: corrigir comunicação com painel"
git commit -m "docs: atualizar README"

### Enviando alterações
git add .
git commit -m "tipo: descrição"
git push


Após o desenvolvimento e os testes na dev, as alterações podem ser integradas à main.
