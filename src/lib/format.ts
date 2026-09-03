export const brl = (v: number | string | null | undefined) => {
  const raw = typeof v === "string" ? Number(v) : (v ?? 0);
  let n = Number.isFinite(raw) ? Math.round(raw * 100) / 100 : 0;
  if (n === 0) n = 0; // normaliza -0 para 0 (evita "-R$ 0,00")
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
};


/** Formata como BRL ou, quando `hidden`, retorna uma máscara `R$ ••••`. */
export const maskBrl = (v: number | string | null | undefined, hidden: boolean) =>
  hidden ? "R$ ••••" : brl(v);

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
 * - Compra com dia ≤ dia de fechamento → fatura do mês vigente.
 * - Compra com dia > dia de fechamento → fatura do mês seguinte.
 * - Se o vencimento for em dia ANTERIOR ao fechamento (ex.: fech. 25, venc. 05),
 *   o vencimento ocorre no mês seguinte ao ciclo de fechamento.
 *
 * Ex. fech. 10 / venc. 17: compra 08/05 → vence 17/05 · compra 11/05 → vence 17/06.
 * Ex. fech. 20 / venc. 27: compra 22/05/2026 → vence 27/06/2026.
 *
 * Retorna o 1º dia do mês de VENCIMENTO da fatura (ISO yyyy-mm-01).
 */
export function invoiceMonth(purchasedOnIso: string, closingDay: number, dueDay: number = closingDay): string {
  const [y, m, d] = purchasedOnIso.slice(0, 10).split("-").map(Number);
  let year = y;
  let monthIdx = (m || 1) - 1;
  if ((d || 1) > closingDay) monthIdx += 1;
  if (dueDay < closingDay) monthIdx += 1;
  while (monthIdx > 11) { monthIdx -= 12; year += 1; }
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}-01`;
}

/** Data exata de vencimento da fatura (clamp ao último dia do mês). */
export function invoiceDueDate(invoiceMonthIso: string, dueDay: number): string {
  const [y, m] = invoiceMonthIso.slice(0, 10).split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Math.max(1, dueDay), lastDay);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Retorna true quando hoje está a 0, 1 ou 2 dias do próximo vencimento do cartão. */
export function isCardNearDue(dueDay: number): boolean {
  const local = new Date();
  const today = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;
  const currentMonthIso = `${y}-${String(m).padStart(2, "0")}-01`;
  const parseIso = (iso: string) => {
    const [py, pm, pd] = iso.slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(py, pm - 1, pd));
  };
  let due = parseIso(invoiceDueDate(currentMonthIso, dueDay));
  if (due < today) {
    due = parseIso(invoiceDueDate(addMonths(currentMonthIso, 1), dueDay));
  }
  const diff = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 2;
}

export function addMonths(iso: string, n: number): string {
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  let monthIdx = (m || 1) - 1 + n;
  const year = y + Math.floor(monthIdx / 12);
  monthIdx = ((monthIdx % 12) + 12) % 12;
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}-01`;
}
