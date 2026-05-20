export const brl = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(n) ? n : 0,
  );
};

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

export const monthLabel = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

/**
 * Calcula o mês da fatura para uma compra, dado o dia de fechamento.
 * Se compra ocorre no dia >= fechamento, vai para o mês seguinte.
 * Retorna string YYYY-MM-01.
 */
export function invoiceMonth(purchasedOn: Date, closingDay: number): string {
  const d = new Date(purchasedOn);
  let y = d.getFullYear();
  let m = d.getMonth(); // 0-based
  if (d.getDate() >= closingDay) m += 1;
  if (m > 11) { m = 0; y += 1; }
  const mm = String(m + 1).padStart(2, "0");
  return `${y}-${mm}-01`;
}

export function addMonths(iso: string, n: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + n);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-01`;
}
