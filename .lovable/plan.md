## Reset da lógica de fatura do cartão

### Nova regra (substitui a anterior)
- Compra **≤ dia de fechamento** → fatura do **mês vigente** (vencimento neste mês).
- Compra **> dia de fechamento** → fatura do **mês seguinte**.
- Se `vencimento < fechamento` no mesmo cartão (ex.: fech. 25, venc. 05), o vencimento da fatura "do mês X" é em X+1.

Exemplo (fech. 10 / venc. 17): 08/05 → vence 17/05 · 11/05 → vence 17/06.
Exemplo (fech. 20 / venc. 27): 22/05/2026 → vence 27/06/2026.

### 1. `src/lib/format.ts` — reescrever `invoiceMonth`
```ts
// dia ≤ closingDay → mês atual; senão mês+1.
// invoice_month armazena o 1º dia do mês de VENCIMENTO da fatura.
export function invoiceMonth(purchasedOnIso, closingDay, dueDay) {
  const [y, m, d] = ...;
  let monthIdx = m - 1;
  if (d > closingDay) monthIdx += 1;
  // se vencimento cai antes do fechamento dentro do ciclo, soma +1
  if (dueDay < closingDay) monthIdx += 1;
  // normaliza ano
}
```
Adicionar helper `invoiceDueDate(invoiceMonthIso, dueDay)` para mostrar a data exata do vencimento (tratando fev/30/31 com clamp ao último dia do mês).

### 2. `src/routes/_authenticated/cartoes.tsx`
- **Recalcular faturas existentes**: o botão "Recalcular faturas" passa a usar a nova regra, percorrendo todas as `card_transactions` agrupadas por cartão e atualizando `invoice_month`. Rodar automaticamente na primeira renderização após o deploy (flag em localStorage `invoice-rule-v2-applied`) para corrigir o histórico sem o usuário precisar clicar.
- **Edição de compra**: ao alterar `purchased_on`, recalcular `invoice_month`.
- **Parcelamento**: garantir que a parcela 1/N usa a regra acima a partir da data da compra; parcelas 2..N somam meses ao `invoice_month` da primeira (já é assim, só validar). Exibir "Parcela X/N · R$ valor · resta R$ X" — já existe parcialmente, completar onde faltar.
- **Alerta na criação**: se a compra cair na próxima fatura (data > fechamento), exibir badge/aviso no diálogo "Esta compra entrará na fatura de {mês} (vence {dd/mm})".
- **Limite disponível em tempo real**: card do cartão mostra `limit - soma de parcelas ainda não pagas` (faturas atuais + futuras). Já existe utilização; revisar fórmula.
- **Importação CSV**: aplicar nova regra ao calcular `invoice_month` na pré-visualização e no insert.

### 3. Dashboard
Sem mudanças — apenas se beneficia do recálculo.

### 4. Sem migração de schema
Todas as colunas necessárias existem (`closing_day`, `due_day`, `invoice_month`, `installment_no`, `installment_total`). Apenas dados são atualizados via update em massa rodado no cliente após login.

### Itens fora deste plano (peço confirmação se quer incluir)
- "Calcular automaticamente o melhor dia de compra" (sugestão proativa) — pode ser um botão "Quando comprar?" no card do cartão que retorna o último dia antes do próximo fechamento para maximizar prazo. Incluir?
- "Antecipação de parcelas" — marcar parcelas futuras como pagas/antecipadas, descontando do limite. Requer coluna nova `prepaid_on date` em `card_transactions`. Incluir?
- "Impacto no orçamento mensal" — só faz sentido se houver orçamento configurado (não existe hoje). Pular.
