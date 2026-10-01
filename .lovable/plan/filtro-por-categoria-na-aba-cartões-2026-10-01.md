# Filtro por categoria na aba Cartões

## O que muda

Na aba Cartões, além do filtro por responsável que já existe, você poderá filtrar os lançamentos da fatura por categoria:

- **Novo filtro de categoria**: um seletor "Filtrar:" no bloco "Gastos por categoria", com as opções:
  - Todas (padrão)
  - Cada uma das suas categorias de despesa (Alimentação, Casa, Saúde, etc.)
  - "Sem categoria" (para lançamentos ainda não classificados)
- **Categorias clicáveis**: cada item da lista ao lado do gráfico (e o próprio nome da categoria) fica clicável — clicar aplica o filtro; clicar de novo remove.
- **Comportamento igual ao filtro de responsável**:
  - O total da fatura, o gráfico e a lista de lançamentos passam a mostrar apenas as linhas da categoria escolhida.
  - Os filtros se combinam: responsável + categoria ao mesmo tempo.
  - A visão "Todos os cartões" também respeita o filtro.
- **Indicação de filtro ativo**: quando uma categoria estiver selecionada, aparece um chip com o nome e a cor dela e um "×" para limpar o filtro rapidamente.

## Detalhes técnicos

- `src/routes/_authenticated/cartoes.tsx`:
  - Novo estado `catFilter: string` (`"all"` | category_id | `"__none__"`).
  - Encadear o filtro após `payerFilter`: `cardTx = allCardTx → payerFilter → catFilter`.
  - Novo `<select>` na linha "Filtrar:" do bloco de responsáveis (ou logo abaixo, no cabeçalho de "Gastos por categoria"), alimentado por `categories` + opção "Sem categoria".
  - Tornar os itens da legenda do gráfico botões que alternam `catFilter`.
  - Chip de filtro ativo com cor da categoria e botão de limpar.
- Nenhuma mudança de banco de dados.
