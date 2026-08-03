# Remover o fundo sólido atrás do título

## O problema

Nas páginas Contas e Investimentos o cabeçalho está dentro de um wrapper fixo com fundo sólido (`bg-card/95`). Como o próprio título já tem fundo translúcido com desfoque, aparece uma segunda camada opaca atrás dele ao rolar a página.

## O que muda

Remover esse wrapper de fundo em Contas e Investimentos, deixando apenas o cabeçalho translúcido (o mesmo comportamento já usado em Cartões, Dashboard e Fatura PDF). Nenhum botão ou texto do cabeçalho é alterado.

## Detalhes técnicos

- `src/routes/_authenticated/contas.tsx` (linha 107) e `src/routes/_authenticated/investimentos.tsx` (linha 102): remover o `<div className="sticky top-0 z-10 bg-card/95 backdrop-blur-md p-2">` que envolve `<Header>`, mantendo o `<Header>` como filho direto.
- O `Header` compartilhado já é `sticky top-0 z-30` com `bg-background/60 backdrop-blur-md`.
