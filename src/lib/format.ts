export const brl = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(n) ? n : 0,
  );
};

export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", timeZone: "UTC",
  });
};

export const monthLabel = (iso: string) => {
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long", year: "numeric", timeZone: "UTC",
  });
};

/**
 * Regra de fatura:
 * - Toda compra entra na fatura do MÊS SEGUINTE ao da compra.
 * - Se a compra ocorrer APÓS o dia de VENCIMENTO, entra no mês seguinte ao seguinte (+2).
 * Ex.: venc. dia 25. Compra 10/maio → fatura de junho. Compra 28/maio → fatura de julho.
 */
export function invoiceMonth(purchasedOnIso: string, closingDay: number, dueDay?: number): string {
  const [y, m, d] = purchasedOnIso.slice(0, 10).split("-").map(Number);
  const ref = typeof dueDay === "number" ? dueDay : closingDay;
  let year = y;
  let monthIdx = (m || 1) - 1 + 1; // sempre mês seguinte
  if ((d || 1) > ref) monthIdx += 1; // após vencimento → +1 adicional
  while (monthIdx > 11) { monthIdx -= 12; year += 1; }
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}-01`;
}

export function addMonths(iso: string, n: number): string {
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  let monthIdx = (m || 1) - 1 + n;
  const year = y + Math.floor(monthIdx / 12);
  monthIdx = ((monthIdx % 12) + 12) % 12;
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}-01`;
}
