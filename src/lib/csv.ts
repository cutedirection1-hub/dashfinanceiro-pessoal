// Parser CSV simples com suporte a aspas e separadores , ou ;
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let val = "";
  let inQuotes = false;
  // detectar separador na primeira linha
  const firstNl = text.indexOf("\n");
  const head = firstNl === -1 ? text : text.slice(0, firstNl);
  const sep = (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ";" : ",";

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { val += '"'; i++; } else { inQuotes = false; }
      } else { val += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === sep) { cur.push(val); val = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        cur.push(val); val = "";
        if (cur.some((c) => c.trim() !== "")) rows.push(cur);
        cur = [];
      } else { val += ch; }
    }
  }
  if (val !== "" || cur.length) { cur.push(val); if (cur.some((c) => c.trim() !== "")) rows.push(cur); }
  return rows;
}

// Converte "10/05/2025" ou "2025-05-10" ou "10-05-2025" para ISO yyyy-mm-dd
export function parseDateBR(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const d = m[1].padStart(2, "0"), mo = m[2].padStart(2, "0");
    let y = m[3]; if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${mo}-${d}`;
  }
  return null;
}

// Converte "R$ 1.234,56" / "1234.56" / "-89,90" para number
export function parseMoney(s: string): number | null {
  const t = s.replace(/[R$\s]/g, "").trim();
  if (!t) return null;
  // se tem vírgula, assume formato brasileiro
  let num: number;
  if (t.includes(",")) {
    num = Number(t.replace(/\./g, "").replace(",", "."));
  } else {
    num = Number(t);
  }
  return Number.isFinite(num) ? num : null;
}
