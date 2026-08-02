// Busca todas as linhas de uma tabela em páginas, evitando o teto padrão do PostgREST (1000).
import { supabase } from "@/integrations/supabase/client";

const PAGE = 1000;

export async function fetchAllRows<T = any>(
  table: string,
  columns = "*",
  apply?: (q: any) => any,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q: any = supabase.from(table as any).select(columns);
    if (apply) q = apply(q);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
