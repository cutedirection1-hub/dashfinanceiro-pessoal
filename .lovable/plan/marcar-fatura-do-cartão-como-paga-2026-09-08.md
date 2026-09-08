# Marcar fatura do cartão como paga

Adicionar um checkbox em cada cartão da aba Cartões para indicar que a fatura daquele mês foi paga, funcionando igual ao checkbox da "Divisão da fatura" no painel.

## Como vai funcionar

- Cada card de cartão ganha um checkbox "Pago" ao lado do valor da fatura do mês.
- A marcação vale para o mês que está sendo visualizado: ao trocar de mês, cada mês guarda sua própria marcação.
- Ao marcar, o cartão fica com destaque verde e o valor da fatura aparece esmaecido/riscado, deixando claro que já foi quitado.
- Se o cartão estiver perto do vencimento (destaque laranja) e for marcado como pago, o alerta laranja some — já está pago.
- Um resumo no bloco "Todos os cartões" mostra quanto já foi pago do total do mês.
- A marcação fica salva no navegador, como já acontece na divisão da fatura do painel.

## Detalhes técnicos

- Em `src/routes/_authenticated/cartoes.tsx`: estado `paidCards: Record<string, boolean>` (chave = id do cartão), persistido em `localStorage` com chave `cardPaid_<ymRef>`, carregado/salvo via `useEffect` quando `ymRef` muda — mesmo padrão de `dashboardPaidBy_<ym>` em `dashboard.tsx`.
- O clique no checkbox usa `e.stopPropagation()` para não trocar o cartão selecionado.
- Ordem de estilo do card: pago (verde `border-emerald-500/60 bg-emerald-500/5`) > perto do vencimento (laranja) > selecionado (primary) > padrão.
- No bloco agregado, somar `monthSpend` dos cartões marcados para exibir "Pago: X / Total".
- Nenhuma mudança de banco de dados.
