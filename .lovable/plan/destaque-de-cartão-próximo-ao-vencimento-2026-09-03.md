# Destaque de cartão próximo ao vencimento

## Objetivo
Na aba **Cartões**, destacar sutilmente o card de cada cartão de crédito quando faltarem 2 dias ou menos para o vencimento da próxima fatura (incluindo o próprio dia do vencimento). O destaque deve trocar a cor verde atual por um tom laranja/amarelo sutil.

## O que será alterado

### 1. Helper de cálculo de proximidade do vencimento
- Arquivo: `src/lib/format.ts`
- Adicionar função `isCardNearDue(dueDay: number): boolean` que:
  - Pega a data atual (sem hora).
  - Calcula a data de vencimento do mês corrente usando `invoiceDueDate`.
  - Se essa data já passou, avança 1 mês.
  - Retorna `true` quando a diferença em dias for `0`, `1` ou `2`.

### 2. Aplicação do destaque visual nos cards
- Arquivo: `src/routes/_authenticated/cartoes.tsx`
- Para cada card individual (não aplica ao card "Todos os cartões"), calcular se está próximo do vencimento.
- Ajustar as classes condicionais do card:
  - **Próximo do vencimento:** `border-warning/60 bg-warning/5` (tom laranja/amarelo sutil).
  - **Selecionado e não próximo do vencimento:** manter `border-primary/60 bg-primary/5` (verde atual).
  - **Não selecionado e não próximo do vencimento:** manter `border-border bg-card`.
- A prioridade visual será: alerta de vencimento > estado selecionado.

### 3. Verificação visual
- Conferir no preview se o destaque aparece corretamente para cartões com vencimento em até 2 dias.
- Garantir que o efeito não quebre o layout responsivo e que o texto continue legível sobre o fundo sutil.

## Detalhes técnicos
- A cor de alerta usará o token semântico `--warning` já existente no tema (`oklch(0.82 0.16 75)`), aplicada com baixa opacidade (`bg-warning/5`, `border-warning/60`) para manter a transparência sutil solicitada.
- O cálculo levará em conta o `due_day` de cada cartão e a data real de hoje, independentemente do `monthOffset` selecionado na interface.
