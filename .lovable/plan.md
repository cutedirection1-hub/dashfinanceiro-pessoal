## Escopo

Quatro melhorias independentes — uma em cada aba principal — mais uma nova aba para conversão de faturas PDF.

---

### 1. Investimentos — destaque quando estiver no negativo

Quando o valor atual de um ativo for menor que o aportado, mostrar visualmente que está no prejuízo.

- Por ativo: ao lado de "Aportado X / Valor Y", adicionar uma terceira linha com **Resultado** (`valor − aportado`), em vermelho se < 0 e verde se > 0, com a variação percentual entre parênteses.
- No `Header` do topo (subtitle): pintar o trecho "Resultado: …" em vermelho/verde conforme o sinal e prefixar com seta ↓/↑.
- Por classe de ativo (card "Alocação"): caso a classe inteira esteja negativa, marcar o nome em vermelho.
- Critério: comparar `Σ valueOf(i)` com `Σ aporteOf(i)` por ativo / classe / total.

---

### 2. Contas — filtros nos lançamentos

Adicionar uma faixa de filtros acima da lista "Últimos lançamentos":

- **Conta** — `select` com "Todas" + cada conta.
- **Tipo** — pílulas "Todos / Entrada / Saída".
- **Período** — dois inputs `type="date"` (inicial e final), opcionais.
- **Busca** — input de texto que faz `includes` case-insensitive em `description`.

Os filtros são aplicados em memória sobre o resultado já carregado, mas o `limit(100)` atual passa a ser:

- Se houver qualquer filtro ativo → buscar até **1000** registros (`limit(1000)`).
- Sem filtros → manter limit 100 e exibir aviso "Mostrando últimos 100 — use filtros para ver mais".

Total filtrado (somatório de entradas − saídas dos lançamentos visíveis) exibido no cabeçalho da lista.

---

### 3. Cartões — visão "Todos os cartões"

Permitir consolidar a fatura de todos os cartões mantendo os demais filtros (mês, pagador, categoria).

- Novo card "Todos os cartões" no início da grade de cartões, comportando-se como um cartão selecionável (`activeCard = "all"`).
- Quando `activeCard === "all"`:
  - Fatura do topo do card mostra soma de `monthSpend` de todos os cartões.
  - Bloco "Fatura — mês" agrega `card_transactions` de todos os cartões no `invoice_month` selecionado.
  - Coluna extra "Cartão" em cada linha da lista, e o gráfico de pizza por categoria considera tudo junto.
  - Botão "Lançar compra" continua exigindo escolha de cartão (sem mudança no dialog).
  - Data de vencimento da fatura no header é ocultada (cada cartão tem a sua).
- Mês, pagador, categoria continuam aplicáveis. Filtro por pagador agrega entre cartões.

---

### 4. Nova aba: Fatura PDF → CSV

Nova rota `src/routes/_authenticated/fatura-pdf.tsx`, adicionada ao `NAV` do `_authenticated.tsx` com ícone `FileText`.

Fluxo:

1. **Upload do PDF** (drag-and-drop + `<input type="file" accept="application/pdf">`).
2. **Senha** (opcional) — campo que aparece automaticamente se o PDF estiver criptografado (detectado via erro `PasswordException` do pdfjs).
3. **Detecção de emissor** por keywords no texto extraído: Nubank, Itaú, Bradesco, Santander, Banco do Brasil, Inter, C6 → fallback "Genérico". O usuário pode trocar manualmente via `select`.
4. **Parser por emissor** roda regex específicas para cada layout e devolve `{ date, description, amount, installment? }[]`.
5. **Prévia editável**: tabela com checkboxes (todos marcados por padrão), permitindo desmarcar linhas erradas e ajustar data/descrição/valor inline. Mostra contador "X de Y linhas detectadas".
6. **Ações finais**:
   - **Baixar CSV** (`data;descricao;valor` no mesmo formato aceito pelo importador atual).
   - **Importar direto na fatura**: `select` de cartão + `select` opcional de categoria padrão → reaproveita a mesma mutation do `ImportCsvDialog` existente em `cartoes.tsx`.

Tudo client-side (PDF não trafega para o servidor).

---

## Detalhes técnicos

### Dependência nova
- `pdfjs-dist` (apenas frontend). Carregar o worker via `import 'pdfjs-dist/build/pdf.worker.min.mjs?url'` para evitar problemas de bundle.

### Parsers de fatura (`src/lib/pdf-fatura.ts`)
Estrutura:
```ts
type ParsedTx = { date: string; description: string; amount: number; installment?: { n: number; total: number } };
type Issuer = 'nubank'|'itau'|'bradesco'|'santander'|'bb'|'inter'|'c6'|'generic';

export async function extractPdfText(file: File, password?: string): Promise<string>;
export function detectIssuer(text: string): Issuer;
export function parseInvoice(text: string, issuer: Issuer, year?: number): ParsedTx[];
```

Heurísticas por emissor (resumido):
- **Nubank**: linhas `DD MMM <descrição> R$ <valor>` ou `DD MMM <desc> - Parcela X/Y R$ valor`.
- **Itaú**: `DD/MM/YYYY <desc> <valor>` em colunas, ignorando "Total", "Subtotal", linhas com `R$` no início.
- **Bradesco / Santander / BB**: `DD/MM <desc> <valor>[D|C]`; `C` = crédito → ignora ou sinaliza estorno.
- **Inter / C6**: `DD/MM/YYYY <desc> R$ valor` com bloco "Compras nacionais"/"internacionais".
- **Genérico**: regex `(\d{2}[/\.\s-]\d{2}(?:[/\.\s-]\d{2,4})?)\s+(.+?)\s+(-?R?\$?\s*[\d\.\,]+)`; descarta linhas sem valor monetário ou cujo total seja > limites razoáveis.

Cada parser retorna também o ano inferido a partir de qualquer "Vencimento dd/mm/yyyy" detectado no PDF; se falhar, usa o ano corrente.

### Importação direta na fatura
Refatorar `ImportCsvDialog` em `cartoes.tsx` extraindo o passo de "linhas parseadas → insert no banco" para `src/lib/card-import.ts` (`importCardRows(rows, { cardId, userId, defaultCategoryId, cards, categories })`). Reaproveitado pela nova aba.

### Estrutura de arquivos
- `src/lib/pdf-fatura.ts` (novo) — extração + detecção + parsers.
- `src/lib/card-import.ts` (novo) — função compartilhada de importação.
- `src/routes/_authenticated/fatura-pdf.tsx` (novo).
- `src/routes/_authenticated/_authenticated.tsx` (`src/routes/_authenticated.tsx`) — adicionar item ao `NAV`.
- `src/routes/_authenticated/investimentos.tsx` — chip de resultado por ativo + cor no subtitle.
- `src/routes/_authenticated/contas.tsx` — barra de filtros + ajuste de limit.
- `src/routes/_authenticated/cartoes.tsx` — card "Todos os cartões", suporte a `activeCard === "all"`, coluna "Cartão" na lista, agregação do gráfico de pizza, refator do importador.

Nenhuma migração de schema é necessária.
