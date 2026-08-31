# Correção de navegação de mês + limite de lançamentos em Contas

## 1. Mês errado ao avançar no dia 31

Ao navegar entre meses, a data de referência é calculada a partir de hoje somando meses.
No dia 31/08, somar 1 mês cai em 31/09, que não existe, e o navegador "transborda" para 01/10 —
por isso aparece outubro em vez de setembro.

Correção: fixar o dia 1 antes de somar o mês, para que a referência seja sempre o
primeiro dia do mês desejado. Aplicar nos três pontos onde isso acontece:

- Cartões: cálculo do mês da fatura exibida
- Painel principal: mês selecionado e a série dos últimos 6 meses do gráfico

Efeito: em qualquer dia do mês (inclusive 29, 30 e 31), avançar/voltar mostra o mês correto.

## 2. Limite de lançamentos exibidos em Contas

Na lista de lançamentos, mostrar apenas os primeiros 50 resultados do filtro, com:

- Contador atualizado: "mostrando 50 de N lançamentos"
- Botão "Mostrar mais 50" para expandir gradualmente (e "Mostrar todos")
- O total/saldo do filtro continua somando **todos** os lançamentos filtrados, não só os visíveis
- Saldos das contas permanecem calculados sobre a base completa (nada é perdido)
- Ao mudar qualquer filtro, a exibição volta para 50

## Detalhes técnicos

- `src/routes/_authenticated/cartoes.tsx` (~linha 96) e `src/routes/_authenticated/dashboard.tsx`
  (linhas 28 e 123): usar `new Date(ano, mês + offset, 1)` em vez de `setMonth` sobre a data atual.
- `src/routes/_authenticated/contas.tsx`: novo estado `visibleCount` (padrão 50), `filtered.slice(0, visibleCount)`
  na renderização, reset via `useEffect` nas dependências de filtro; `filteredTotal` segue usando `filtered` inteiro.
