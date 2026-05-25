## Categorização de gastos do cartão

### 1. Seed automático de categorias padrão
- Ao abrir a aba **Cartões** (ou no primeiro carregamento autenticado), verificar se o usuário possui categorias com `kind='expense'`. Se não, inserir as 15 padrão: Alimentação, Assinaturas, Casa, Educação, Lazer, Objetivos, Pet, Saúde, Selfcare, Transporte, Vestuário, Viagem, Taxas, Outros - Pessoais, Outros.
- Cada categoria recebe cor e ícone (lucide) padrão fixo para diferenciação visual no gráfico.
- Flag em `localStorage` (`categories-seeded:${user.id}`) para não repetir consulta.

### 2. Selecionar categoria ao lançar/editar compra (`CardTxDialog`)
- Adicionar `<Select>` "Categoria" listando categorias `kind='expense'` do usuário, ordenadas por nome.
- Persistir em `card_transactions.category_id` (coluna já existe).
- Ao parcelar, todas as parcelas herdam a categoria.
- Ao importar CSV, adicionar coluna opcional de mapeamento "Categoria" (nome → id; cria "Outros" como fallback).

### 3. Exibir categoria nas linhas da fatura
- Na listagem de transações da fatura mostrar um chip pequeno com a cor/ícone da categoria ao lado da descrição.
- Transações sem categoria mostram chip "Sem categoria" (cinza).

### 4. Gráfico de categorias da fatura
- Acima da listagem de transações da fatura selecionada, adicionar card **"Gastos por categoria"** com:
  - Gráfico de **pizza** (recharts `PieChart`) com fatias por categoria, cor da categoria.
  - Legenda lateral com nome, valor (`brl`) e % do total da fatura.
  - Tooltip com valor formatado.
- Recalcula sempre que muda mês/fatura.

### 5. Gerenciar categorias
- Novo botão "Categorias" no header da aba Cartões → abre `Dialog` com:
  - Lista de categorias do usuário (nome, cor, contador de uso).
  - Botão "Nova categoria" (nome obrigatório, color picker simples com 12 presets).
  - Botão excluir por categoria:
    - Se houver transações vinculadas, exibe alerta com a quantidade impactada e ao confirmar faz `UPDATE card_transactions SET category_id=NULL` antes do `DELETE`.
    - Sem transações: exclui direto.
- Nenhuma migração de schema: tudo via `categories` (já existe).

### 6. Arquivos a editar
- `src/routes/_authenticated/cartoes.tsx` — seed, select de categoria, chip nas linhas, gráfico de pizza, dialog de gerenciamento, integração com importador CSV.

### Detalhes técnicos
- Query única `useQuery(['categories', user.id])` reaproveitada por dialog de transação, gráfico, importador e gerenciador.
- Cores default fixas em array de 15 tons distintos (oklch) seguindo paleta do tema.
- Gráfico usa `ResponsiveContainer` + `PieChart` do `recharts` (já em uso no dashboard).