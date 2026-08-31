# Fatura PDF: responsável, categoria e correção de valores

## O que muda na aba "Fatura PDF"

Na tabela de conferência (etapa 2), cada linha ganha:

- **Responsável**: campo de texto com sugestões dos responsáveis já usados nos cartões (Eu, João, etc.). Vem preenchido com o responsável padrão escolhido na etapa 3.
- **Categoria**: seletor com as suas categorias de despesa. Vem preenchido com a categoria padrão.
- **Valor corrigível**: já é editável, mas ganha um botão de inverter sinal (+/−) por linha, para consertar valores que vieram negativos do PDF.

Na etapa 3, além dos padrões atuais:

- **Responsável padrão** (hoje só existe categoria padrão) — aplica-se às linhas que você não alterou.
- **Botão "Inverter todos os sinais"** e **"Tornar todos positivos"**, para faturas em que o banco exporta as compras como negativas.
- O total exibido continua somando apenas as linhas marcadas, já com os valores corrigidos.

A importação passa a gravar o responsável e a categoria escolhidos linha a linha; o CSV baixado passa a incluir as colunas de responsável e categoria.

## Detalhes técnicos

- `src/routes/_authenticated/fatura-pdf.tsx`: estender o estado das linhas com `payer` e `category_id`; novas colunas na tabela; ações em massa de sinal; passar `payer`/`category_id` por linha para `importCardRows` (o helper já aceita esses campos) e manter `defaultPayer`/`defaultCategoryId` como fallback.
- Lista de responsáveis: consulta a `card_transactions` (distinct `payer_name`) para popular um `<datalist>`.
- `src/lib/pdf-fatura.ts`: `toCSV` ganha colunas `responsavel` e `categoria` (nome), mantendo o separador `;`.
- Nenhuma mudança de banco de dados.
