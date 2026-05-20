# Plano: App de Organização Financeira Pessoal

App web em português do Brasil para gerenciar cartões de crédito, contas bancárias e investimentos, com dashboard, autenticação multiusuário (família) e backup automático no Google Drive.

## Stack

- **Frontend:** TanStack Start + React + Tailwind, idioma PT-BR, moeda BRL (`Intl.NumberFormat('pt-BR', { currency: 'BRL' })`)
- **Backend/Dados:** Lovable Cloud (Postgres + Auth + Storage)
- **Backup:** Conector Google Drive da Lovable (exporta JSON da sua conta para o seu Drive)

## Modelo de dados (Lovable Cloud)

- `profiles` — dados do usuário (nome, moeda padrão)
- `user_roles` — papéis (owner, member) para o cenário família
- `accounts` — contas bancárias (nome, banco, tipo, saldo inicial)
- `credit_cards` — cartões (nome, bandeira, limite, dia fechamento, dia vencimento)
- `card_transactions` — compras nos cartões (valor, data, categoria, parcelas, descrição)
- `account_transactions` — entradas/saídas nas contas (valor, data, categoria, descrição)
- `investments` — ativos da carteira (tipo, ticker/nome, quantidade, preço médio, valor atual manual)
- `categories` — categorias de gastos (com cor/ícone), pré-populadas em PT-BR
- `backup_log` — histórico de backups no Drive

Todas as tabelas com **RLS** escopado ao `auth.uid()` (ou ao grupo familiar via `user_roles`).

## Telas (rotas)

- `/login` e `/signup` — email/senha + Google
- `/` (dashboard) — patrimônio total, próximas faturas, gastos do mês, gráfico evolução
- `/cartoes` — lista de cartões, fatura aberta, lançar compra, parcelamento
- `/cartoes/$id` — detalhe + transações
- `/contas` — contas bancárias, saldo consolidado, lançar entrada/saída
- `/contas/$id` — extrato
- `/investimentos` — carteira, alocação por classe, atualização manual de cotação
- `/relatorios` — gastos por categoria, evolução mensal, comparativo
- `/configuracoes` — perfil, categorias, membros da família, **backup no Drive**

## Funcionalidades-chave

1. **Cartões de crédito** — cálculo automático da fatura por ciclo (fechamento/vencimento), parcelas distribuídas nos meses futuros, alerta de vencimento próximo
2. **Contas bancárias** — múltiplas contas, saldo calculado a partir das transações, transferências entre contas
3. **Investimentos** — entrada manual (Lovable AI Gateway pode ser adicionado depois para cotações automáticas)
4. **Dashboard** — KPIs (patrimônio líquido, saldo total, faturas em aberto, gasto do mês) + gráficos (Recharts)
5. **Compartilhamento familiar** — convite por email para um segundo usuário ver/editar os mesmos dados (escopo via `user_roles`)
6. **Backup automático no Drive** — botão manual + job server-fn que exporta JSON consolidado para uma pasta `Meu Financeiro/backups/` no seu Drive. Versões datadas.

## Backup no Google Drive — como funciona

- Conector Google Drive autentica **a conta do dono** (não cada usuário final), o que é adequado para uso pessoal/familiar
- Server function exporta todas as tabelas como JSON e faz upload via gateway
- Frequência: manual + opção de agendar (diário/semanal)
- Restauração: importar JSON de volta na tela de configurações

## Design

Tema escuro/claro, visual moderno e focado em dados (cards com números grandes, gráficos limpos). Posso gerar 3 direções de design para você escolher antes de construir, ou seguir direto com um visual clean tipo "fintech moderna" (Nubank/Mobills-inspired sem copiar).

## Entrega em fases

**Fase 1 (MVP):** Auth, contas bancárias, cartões + faturas, transações, dashboard básico
**Fase 2:** Investimentos, relatórios com gráficos, categorias customizáveis
**Fase 3:** Compartilhamento família, backup Google Drive, importação

Construir tudo de uma vez gera muita superfície para depurar. Recomendo começar pela Fase 1 e iterar.

## Próximo passo

Quer que eu gere 3 direções visuais para escolher, ou parto direto para implementar a Fase 1 com um visual moderno padrão?
