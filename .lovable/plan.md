# Plano

## 1. Dashboard — Evolução do patrimônio de investimentos
Adicionar um terceiro gráfico em `src/routes/_authenticated/dashboard.tsx` mostrando a evolução do **valor investido** nos últimos 6 meses até o mês selecionado.

- Linha: soma de `quantity * current_price` (ou `average_price` quando não houver preço atual) de todos os ativos, considerando o histórico de aportes/resgates em `investment_contributions` para reconstruir a posição em cada fim de mês.
- Para meses passados: usar a quantidade acumulada até aquele mês × preço médio histórico (aproximação, já que não armazenamos preço por data).
- Reaproveitar o estilo do gráfico já existente (Recharts, mesmas cores do tema).

## 2. Cartões — Validar lógica de fatura
Você confirmou a regra **B**: fechamento 20, vencimento 25 → compra 10/mai cai em **fatura de junho**, compra 22/mai cai em **fatura de julho**.

Essa é exatamente a regra hoje implementada em `src/lib/format.ts` (`invoiceMonth`: sempre M+1; se dia > fechamento, M+2). Como você diz que ainda está errado na tela, vou:

- Adicionar um log/diagnóstico para listar `purchased_on → invoice_month` das transações existentes e confirmar onde diverge.
- Se as transações antigas foram salvas com a lógica anterior (errada), criar um botão "Recalcular faturas" na aba Cartões que reprocessa o `invoice_month` de todas as transações usando a regra atual.
- Garantir que ao editar uma compra o `invoice_month` seja recalculado (hoje pode estar preservando o valor antigo).

## 3. Cartões — Excluir cartão arquivado
Na lista de arquivados, adicionar botão "Excluir permanentemente" que:

- Antes de excluir, conta transações vinculadas e mostra um `AlertDialog` informando: *"Este cartão possui X compras lançadas (R$ Y,YY em histórico de faturas). Excluir removerá permanentemente o cartão e todas as compras vinculadas. Esta ação não pode ser desfeita."*
- Ao confirmar, deleta `card_transactions` do cartão e depois o `credit_cards`.

## 4. Cartões — Importar CSV
Adicionar botão "Importar CSV" na aba Cartões abrindo um diálogo:

1. Selecionar **cartão de destino** e **responsável** padrão.
2. Upload do arquivo `.csv`.
3. Parse local (sem backend) detectando cabeçalho. Tela de **mapeamento de colunas**: usuário associa colunas do CSV aos campos `Data`, `Descrição`, `Valor` (categoria/responsável opcionais).
4. Pré-visualização das primeiras 10 linhas já com `invoice_month` calculado pela regra do cartão.
5. Botão "Importar N lançamentos" → insert em lote em `card_transactions`.

Tratamentos: datas em `dd/mm/aaaa` ou `aaaa-mm-dd`; valores com vírgula decimal e `R$`; valores negativos tratados como estorno (sinal invertido); linhas em branco ignoradas.

## Detalhes técnicos
- **Arquivos editados:** `src/routes/_authenticated/dashboard.tsx`, `src/routes/_authenticated/cartoes.tsx`, possivelmente `src/lib/format.ts` (helper de parse CSV) ou novo `src/lib/csv.ts`.
- **Sem migração** de schema — todas as colunas necessárias já existem.
- Parse CSV via implementação manual leve (split por linha + vírgula/ponto-e-vírgula com suporte a aspas), sem adicionar dependência.
- Recálculo em massa de `invoice_month`: feito via `supabase.from('card_transactions').update(...)` iterando por cartão (closing_day próprio).
