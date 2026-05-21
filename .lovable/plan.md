# Plano de melhorias

## 1. Contas (`src/routes/_authenticated/contas.tsx`)
- Tornar o card de cada lançamento clicável → abre `EditTxDialog` (mesmo formulário do novo lançamento, mas com `update`).
- Botão de lixeira em cada linha → `delete` direto com confirmação.
- Adicionar **botão excluir conta** no card da conta (além de arquivar). Confirmação dupla: "Excluir conta e todos os seus lançamentos?" → apaga `account_transactions` da conta e depois a conta.

## 2. Cartões — nova regra de fatura (`src/lib/format.ts`)
Reescrever `invoiceMonth(purchasedOnIso, closingDay, dueDay)`:
- Toda compra entra **na fatura do mês seguinte** ao da compra.
- Se a compra ocorrer **após o dia do vencimento** (`day > dueDay`), entra no mês **subsequente** (mês+2).
- Atualizar chamadas em `cartoes.tsx` para passar `dueDay`.

Exemplo (venc. 25): compra dia 10/maio → fatura de junho; compra dia 28/maio → fatura de julho.

## 3. Cartões — assinaturas recorrentes (`cartoes.tsx` + migration)
- Nova coluna em `card_transactions`: `recurrence` (text: `none|monthly|yearly`) e `recurrence_group_id` (uuid, opcional) para identificar a série.
- No diálogo de nova compra: checkbox **"É uma assinatura"** → mostra select de periodicidade (mensal/anual) e campo "Repetir por X meses/anos" (default 12).
- Ao salvar, gera N lançamentos futuros (um por período), cada um na sua fatura conforme regra nova.
- Na edição de uma assinatura: opção "Aplicar a esta + futuras" vs "Somente esta".
- Badge "Assinatura" na linha da fatura.

## 4. Investimentos — histórico de aportes (migration + `investimentos.tsx`)
Nova tabela `investment_contributions`:
- `id`, `user_id`, `investment_id`, `amount`, `occurred_on`, `funding_account_id` (nullable), `account_tx_id` (nullable — referência ao lançamento gerado), `notes`, `created_at`.
- RLS própria por `auth.uid() = user_id`.

UI:
- Lista de ativos ganha botão **"+ Aporte"** por linha, abrindo diálogo:
  - Valor, data, **banco de origem** (obrigatório se classe ≠ `previdencia`), descrição.
  - Ao salvar: insere em `investment_contributions`; se houver banco e classe ≠ previdência, cria `account_transactions` (`kind: expense`) e guarda `account_tx_id` para vínculo.
  - Atualiza `investments.average_price`/`quantity` de forma consistente (modo saldo: soma ao aportado; modo ações: ajusta preço médio ponderado).
- Painel "Aportes" no detalhe do ativo (clicar no nome abre drawer/seção): lista cronológica com **editar** e **excluir**.
  - Excluir/editar → também ajusta o `account_transactions` vinculado (deleta ou atualiza valor/conta).
- Manter campo "Banco/corretora" no cadastro do ativo (já existe) como informação de custódia.
- Previdência: aporte é registrado, mas **não** gera saída de conta (campo de banco fica opcional/informativo).

## 5. Cartões — pequena consistência
- Filtro por responsável e edição de cartão/compra já existem (mantidos).

## Detalhes técnicos

### Migration SQL
```sql
-- 1. Assinaturas no cartão
alter table public.card_transactions
  add column if not exists recurrence text not null default 'none',
  add column if not exists recurrence_group_id uuid;

alter table public.card_transactions
  add constraint card_transactions_recurrence_check
  check (recurrence in ('none','monthly','yearly'));

create index if not exists idx_card_tx_recur on public.card_transactions(recurrence_group_id);

-- 2. Aportes
create table public.investment_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  investment_id uuid not null,
  amount numeric not null,
  occurred_on date not null default current_date,
  funding_account_id uuid,
  account_tx_id uuid,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.investment_contributions enable row level security;
create policy contrib_all_own on public.investment_contributions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.investment_contributions(investment_id);
```

### Arquivos a editar
- `src/lib/format.ts` — nova `invoiceMonth(date, closingDay, dueDay)`.
- `src/routes/_authenticated/contas.tsx` — edição/exclusão de lançamentos e exclusão de conta.
- `src/routes/_authenticated/cartoes.tsx` — assinaturas + uso da nova `invoiceMonth`.
- `src/routes/_authenticated/investimentos.tsx` — aportes com histórico, edição e exclusão, débito automático na conta.
- `src/routes/_authenticated/dashboard.tsx` — ajustes se a nova lógica de fatura mudar resultados (sem mudança estrutural).

Pronto para implementar?
