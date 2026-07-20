## Ajustes no Dashboard (src/routes/_authenticated/dashboard.tsx)

### 1. Patrimônio = contas + investimentos (sem subtrair fatura)

Atualmente:
- KPI "Patrimônio": `accBalance + investTotal - openInvoice`
- Gráfico (série `patrimonio`): `accBalAtEnd + investAtEnd - cards`
- Legenda: "contas + investimentos − fatura"

Mudar para:
- KPI: `accBalance + investTotal`
- Gráfico: `accBalAtEnd + investAtEnd`
- Legenda: "contas + investimentos"

### 2. Gastos = somente fatura do cartão com responsável "Eu"

Atualmente:
- KPI "Gastos do mês": todas as saídas de contas do mês (`accTx` kind=expense).
- Gráfico (série `gasto`): saídas de contas + total da fatura do mês (todos os responsáveis). Legenda: "contas + cartões".

Mudar para (aplicar a mesma regra em KPI e gráfico):
- Somar apenas `cardTx` cujo `invoice_month` seja o mês em questão E cujo `payer_name` normalizado seja "Eu" (mesma normalização usada em `byPayer`: trim; vazio/null conta como "Eu").
- Atualizar legenda para: "fatura do mês (responsável: Eu)".

Sem outras mudanças de UI ou lógica.
