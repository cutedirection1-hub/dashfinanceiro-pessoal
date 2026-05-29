// PDF → fatura parser (client-side, usando pdfjs-dist)
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

// Configurar worker uma única vez
(pdfjs as any).GlobalWorkerOptions.workerSrc = workerUrl;

export type ParsedTx = {
  date: string; // yyyy-mm-dd
  description: string;
  amount: number; // positivo = compra; negativo = estorno
  installment?: { n: number; total: number };
};

export type Issuer = "nubank" | "itau" | "bradesco" | "santander" | "bb" | "inter" | "c6" | "generic";

export const ISSUER_LABEL: Record<Issuer, string> = {
  nubank: "Nubank",
  itau: "Itaú",
  bradesco: "Bradesco",
  santander: "Santander",
  bb: "Banco do Brasil",
  inter: "Inter",
  c6: "C6 Bank",
  generic: "Genérico",
};

export class PasswordRequiredError extends Error {
  constructor(public wrong = false) {
    super(wrong ? "PASSWORD_WRONG" : "PASSWORD_REQUIRED");
  }
}

export async function extractPdfText(file: File, password?: string): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    const task = pdfjs.getDocument({ data: buf, password });
    const doc = await task.promise;
    const lines: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      // Agrupar itens por linha (mesmo y aprox.)
      const items = (content.items as any[]).filter((i) => "str" in i);
      const buckets = new Map<number, { x: number; str: string }[]>();
      for (const it of items) {
        const y = Math.round(it.transform?.[5] ?? 0);
        const x = it.transform?.[4] ?? 0;
        if (!buckets.has(y)) buckets.set(y, []);
        buckets.get(y)!.push({ x, str: it.str });
      }
      const sortedYs = [...buckets.keys()].sort((a, b) => b - a);
      for (const y of sortedYs) {
        const line = buckets.get(y)!.sort((a, b) => a.x - b.x).map((x) => x.str).join(" ").replace(/\s+/g, " ").trim();
        if (line) lines.push(line);
      }
    }
    return lines.join("\n");
  } catch (e: any) {
    const name = e?.name || "";
    const msg = String(e?.message || e);
    if (name === "PasswordException" || /password/i.test(msg)) {
      throw new PasswordRequiredError(/incorrect|invalid/i.test(msg) || (password ? true : false));
    }
    throw e;
  }
}

export function detectIssuer(text: string): Issuer {
  const t = text.toLowerCase();
  if (/nubank|nu pagamentos/.test(t)) return "nubank";
  if (/ita[uú]|banco itau/.test(t)) return "itau";
  if (/bradesco/.test(t)) return "bradesco";
  if (/santander/.test(t)) return "santander";
  if (/banco do brasil|\bbb\b.*ourocard/.test(t)) return "bb";
  if (/banco inter|\binter\b.*cart[ãa]o/.test(t)) return "inter";
  if (/c6 bank|\bc6\b/.test(t)) return "c6";
  return "generic";
}

const MONTHS_PT: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function inferYear(text: string): number {
  const m = text.match(/vencimento[^\d]{0,20}(\d{2})\/(\d{2})\/(\d{4})/i)
    || text.match(/data\s+do\s+vencimento[^\d]{0,20}(\d{2})\/(\d{2})\/(\d{4})/i)
    || text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (m) return Number(m[3]);
  return new Date().getFullYear();
}

function toIso(d: number, m: number, y: number): string | null {
  if (!d || !m || !y) return null;
  if (d > 31 || m > 12) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseMoneyBR(s: string): number | null {
  let t = s.replace(/[R$\s]/g, "").trim();
  if (!t) return null;
  let sign = 1;
  if (/[-−]$/.test(t)) { sign = -1; t = t.slice(0, -1); }
  if (/^-/.test(t)) { sign = -1; t = t.slice(1); }
  // remove pontos de milhar, troca vírgula por ponto
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(norm);
  return Number.isFinite(n) ? sign * n : null;
}

// Captura "Parcela 2/12" / "2 de 12" / "Parc 2/12" / "(2/12)"
function detectInstallment(desc: string): { n: number; total: number } | undefined {
  const m = desc.match(/(?:parc(?:ela)?\.?\s*|\()(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\)?/i)
    || desc.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/);
  if (!m) return undefined;
  const n = Number(m[1]), total = Number(m[2]);
  if (n > 0 && total >= n && total <= 48) return { n, total };
  return undefined;
}

const NOISE_WORDS = /(saldo anterior|pagamento recebido|pagamento efetuado|cr[ée]dito de pagamento|encargos|juros|iof|anuidade|multa|estorno de pagamento|total da fatura|subtotal|total|vencimento|data\s+de\s+vencimento|limite|melhor dia|fatura anterior|valor\s+m[íi]nimo|seguros?|tarifa|saldo restante)/i;

// Parser genérico: tenta achar "DD/MM[/YYYY] <desc> <valor>"
function parseGeneric(text: string, year: number): ParsedTx[] {
  const out: ParsedTx[] = [];
  const lines = text.split(/\n+/);
  const re = /^(\d{2})[\/.\-](\d{2})(?:[\/.\-](\d{2,4}))?\s+(.+?)\s+(-?R?\$?\s*[\d.]+,\d{2})(?:\s*[-−]\s*)?$/;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || NOISE_WORDS.test(line)) continue;
    const m = line.match(re);
    if (!m) continue;
    const d = Number(m[1]); const mo = Number(m[2]);
    let y = year; if (m[3]) { y = Number(m[3]); if (y < 100) y += 2000; }
    const iso = toIso(d, mo, y);
    if (!iso) continue;
    const amount = parseMoneyBR(m[5]);
    if (amount == null || amount === 0) continue;
    const desc = m[4].trim().replace(/\s+/g, " ");
    out.push({ date: iso, description: desc, amount, installment: detectInstallment(desc) });
  }
  return out;
}

// Parser Nubank: "DD MMM <desc> R$ valor"
function parseNubank(text: string, year: number): ParsedTx[] {
  const out: ParsedTx[] = [];
  const lines = text.split(/\n+/);
  const re = /^(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.?\s+(.+?)\s+(-?R?\$?\s*[\d.]+,\d{2})$/i;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || NOISE_WORDS.test(line)) continue;
    const m = line.match(re);
    if (!m) continue;
    const d = Number(m[1]); const mo = MONTHS_PT[m[2].toLowerCase().slice(0, 3)];
    const iso = toIso(d, mo, year);
    if (!iso) continue;
    const amount = parseMoneyBR(m[4]);
    if (amount == null || amount === 0) continue;
    const desc = m[3].trim().replace(/\s+/g, " ");
    out.push({ date: iso, description: desc, amount, installment: detectInstallment(desc) });
  }
  return out.length ? out : parseGeneric(text, year);
}

// Parsers bancários "DD/MM" ou "DD/MM/YYYY"
function parseBrBank(text: string, year: number): ParsedTx[] {
  const out: ParsedTx[] = [];
  const lines = text.split(/\n+/);
  // captura opcional D/C no final (débito/crédito)
  const re = /^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?\s+(.+?)\s+(-?R?\$?\s*[\d.]+,\d{2})\s*([DCdc])?\s*$/;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || NOISE_WORDS.test(line)) continue;
    const m = line.match(re);
    if (!m) continue;
    const d = Number(m[1]); const mo = Number(m[2]);
    let y = year; if (m[3]) { y = Number(m[3]); if (y < 100) y += 2000; }
    const iso = toIso(d, mo, y);
    if (!iso) continue;
    let amount = parseMoneyBR(m[5]);
    if (amount == null || amount === 0) continue;
    // C = crédito (estorno) → vira negativo
    if (m[6] && /c/i.test(m[6])) amount = -Math.abs(amount);
    const desc = m[4].trim().replace(/\s+/g, " ");
    out.push({ date: iso, description: desc, amount, installment: detectInstallment(desc) });
  }
  return out.length ? out : parseGeneric(text, year);
}

export function parseInvoice(text: string, issuer: Issuer, yearHint?: number): ParsedTx[] {
  const year = yearHint ?? inferYear(text);
  switch (issuer) {
    case "nubank":
    case "c6":
      return parseNubank(text, year);
    case "itau":
    case "bradesco":
    case "santander":
    case "bb":
    case "inter":
      return parseBrBank(text, year);
    default:
      return parseGeneric(text, year);
  }
}

// Serialização CSV no formato esperado pelo importador (data;descricao;valor)
export function toCSV(rows: ParsedTx[]): string {
  const head = "data;descricao;valor";
  const body = rows.map((r) => {
    const d = r.description.replace(/[;\n\r]/g, " ").trim();
    return `${r.date};${d};${r.amount.toFixed(2).replace(".", ",")}`;
  });
  return [head, ...body].join("\n");
}
