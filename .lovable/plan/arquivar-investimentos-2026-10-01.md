# Arquivar investimentos

## Objetivo
Permitir arquivar um investimento (sem apagar o histórico), como já acontece com contas e cartões. Investimentos arquivados saem dos totais e da lista principal, mas continuam salvos e podem ser reativados.

## Mudanças

1. **Banco de dados (migração)**
   - Adicionar coluna `archived boolean not null default false` em `public.investments`.

2. **Aba Investimentos** (`src/routes/_authenticated/investimentos.tsx`)
   - Botão de arquivar/desarquivar em cada ativo (ícone de arquivo, ao lado de editar/excluir).
   - Arquivados não entram nos totais (Patrimônio, Aportado, Resultado) nem no gráfico de Alocação.
   - Filtro "Mostrar arquivados" para visualizar e reativar ativos arquivados (exibidos com aparência esmaecida).
   - Lista padrão mostra apenas ativos ativos.

3. **Dashboard** (`src/routes/_authenticated/dashboard.tsx`)
   - Patrimônio passa a somar apenas investimentos não arquivados (consistência com contas/cartões arquivados).

## Detalhes técnicos
- Migração: `ALTER TABLE public.investments ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;`
- Mutação `archiveMut` faz `update({ archived })` e invalida as queries `["inv"]` e `["dashboard"]`.
- Filtro aplicado no cliente sobre a query existente (sem mudar RLS nem policies).
