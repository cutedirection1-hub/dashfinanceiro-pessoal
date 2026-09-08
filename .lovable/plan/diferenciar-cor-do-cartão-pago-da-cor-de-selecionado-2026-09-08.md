# Diferenciar cor do cartão pago da cor de selecionado

Atualmente o estado "pago" usa verde-esmeralda, que fica muito parecido com o verde do estado "selecionado" (primary do tema). Trocar a cor do cartão pago para um tom distinto, mantendo os outros destaques intactos.

## Como vai funcionar

- Cartão pago: borda e fundo em tom azul (`border-blue-500/60 bg-blue-500/5`) em vez de verde esmeralda.
- Texto "Pago" e valor riscado acompanham o azul (`text-blue-500`).
- Cartão selecionado continua com o verde primary (`border-primary/60 bg-primary/5`).
- Cartão próximo do vencimento continua com laranja (`border-warning/60 bg-warning/5`), e some quando pago.
- Ordem de prioridade visual permanece: pago > próximo do vencimento > selecionado > padrão.

## Detalhes técnicos

- Em `src/routes/_authenticated/cartoes.tsx`, alterar as classes do estado `paid`:
  - `cardClasses` de `border-emerald-500/60 bg-emerald-500/5` para `border-blue-500/60 bg-blue-500/5`.
  - Texto do valor riscado de `text-muted-foreground` mantido, mas o risco permanece.
  - Texto "Pago" de `text-emerald-500` para `text-blue-500`.
- No bloco "Todos os cartões", o texto "Pago: X / Total" mantém `text-emerald-500` (resumo de valores pagos), pois ali a cor verde indica positivo financeiro, não estado de seleção.
