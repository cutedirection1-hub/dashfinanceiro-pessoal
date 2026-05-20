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
 * Calcula o mês da fatura para uma compra, dado o dia de fechamento.
 * Se a compra ocorre no dia >= fechamento, vai para o mês seguinte.
 * Recebe a data como YYYY-MM-DD e retorna YYYY-MM-01 (sem shift de timezone).
 */
export function invoiceMonth(purchasedOnIso: string, closingDay: number): string {
  const [y, m, d] = purchasedOnIso.slice(0, 10).split("-").map(Number);
  let year = y;
  let monthIdx = (m || 1) - 1;
  if ((d || 1) > closingDay) monthIdx += 1;
  if (monthIdx > 11) { monthIdx = 0; year += 1; }
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}-01`;
}

export function addMonths(iso: string, n: number): string {
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  let monthIdx = (m || 1) - 1 + n;
  const year = y + Math.floor(monthIdx / 12);
  monthIdx = ((monthIdx % 12) + 12) % 12;
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}-01`;
}
