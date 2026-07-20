## Objetivo
Aplicar um fundo levemente destacado e translúcido no cabeçalho das páginas (título + ações), de modo que ao rolar a lista abaixo o conteúdo passe por trás sem "estranheza visual".

## Escopo
Alterar apenas o componente `Header` em `src/routes/_authenticated/contas.tsx` (linha 310). Como esse mesmo componente é reutilizado por Cartões, Investimentos e demais páginas do layout autenticado, a mudança se propaga para todas.

## Mudança visual
- Fundo: `bg-background/60` (cor de fundo do tema com ~60% opacidade — sutil, mantém transparência).
- Desfoque: `backdrop-blur-md` para suavizar o conteúdo que passa por trás ao rolar.
- Borda inferior sutil: `border-b border-border/60` para separar do conteúdo.
- Espaçamento interno: `px-4 py-3 -mx-4` (compensa o padding do `<main>` para o fundo alcançar as bordas laterais).
- Sticky: `sticky top-0 z-30` para o cabeçalho permanecer visível durante a rolagem — é isso que dá utilidade à transparência.

Sem alterações em cores de marca, tipografia ou layout dos botões.

## Detalhes técnicos
Substituir em `src/routes/_authenticated/contas.tsx`:

```tsx
<div className="flex flex-wrap items-end justify-between gap-3">
```

por:

```tsx
<div className="sticky top-0 z-30 -mx-5 md:-mx-10 flex flex-wrap items-end justify-between gap-3 border-b border-border/60 bg-background/60 px-5 py-3 backdrop-blur-md md:px-10">
```

Os offsets `-mx-5 md:-mx-10` / `px-5 md:px-10` casam com o padding do `<main>` em `_authenticated.tsx` (`px-5 md:px-10`), garantindo que o fundo translúcido cubra toda a largura ao rolar.

## Fora de escopo
- Não mexer no header interno da fatura em `cartoes.tsx` (linhas 311–316), que é outra barra de navegação de mês.
- Sem mudanças de comportamento, dados ou outras páginas além do estilo do `Header`.
