// Helper compartilhado para importar linhas parseadas em card_transactions.
import { supabase } from "@/integrations/supabase/client";
import { invoiceMonth } from "@/lib/format";

export type ImportRow = {
  date: string; // yyyy-mm-dd
  description: string;
  amount: number; // positivo = compra
  payer?: string;
  category_id?: string | null;
};

export async function importCardRows(
  rows: ImportRow[],
  opts: {
    userId: string;
    cardId: string;
    closingDay: number;
    dueDay: number;
    defaultPayer?: string;
    defaultCategoryId?: string | null;
  },
): Promise<{ imported: number; skipped: number }> {
  const payload: any[] = [];
  let skipped = 0;
  for (const r of rows) {
    if (!r.date || r.amount == null || r.amount === 0) { skipped++; continue; }
    payload.push({
      user_id: opts.userId,
      card_id: opts.cardId,
      group_id: crypto.randomUUID(),
      amount: r.amount,
      description: (r.description || "Importado").slice(0, 200),
      purchased_on: r.date,
      installment_no: 1,
      installment_total: 1,
      invoice_month: invoiceMonth(r.date, opts.closingDay, opts.dueDay),
      payer_name: (r.payer ?? opts.defaultPayer ?? "Eu") || null,
      recurrence: "none",
      category_id: r.category_id ?? opts.defaultCategoryId ?? null,
    });
  }
  if (!payload.length) return { imported: 0, skipped };
  for (let i = 0; i < payload.length; i += 200) {
    const { error } = await supabase.from("card_transactions").insert(payload.slice(i, i + 200));
    if (error) throw error;
  }
  return { imported: payload.length, skipped };
}
