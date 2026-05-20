import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Header, Dialog, Field, EmptyState } from "./contas";

export const Route = createFileRoute("/_authenticated/investimentos")({ component: InvestimentosPage });

type Inv = { id: string; asset_class: string; ticker: string | null; name: string; quantity: number; average_price: number; current_price: number };

const CLASSES: Record<string, string> = {
  stock: "Ação", fii: "FII", etf: "ETF", crypto: "Cripto", fixed_income: "Renda fixa", fund: "Fundo", other: "Outro",
};

function InvestimentosPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<Inv | null>(null);

  const { data: inv = [] } = useQuery({
    queryKey: ["inv"],
    queryFn: async () => {
      const { data, error } = await supabase.from("investments").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Inv[];
    },
  });

  const valueOf = (i: Inv) => Number(i.quantity) * Number(i.current_price || i.average_price);
  const costOf = (i: Inv) => Number(i.quantity) * Number(i.average_price);
  const total = inv.reduce((s, i) => s + valueOf(i), 0);
  const cost = inv.reduce((s, i) => s + costOf(i), 0);
  const pnl = total - cost;

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("investments").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inv"] }); toast.success("Removido"); },
  });

  // alocação por classe
  const allocation = Object.entries(
    inv.reduce<Record<string, number>>((acc, i) => { const v = valueOf(i); acc[i.asset_class] = (acc[i.asset_class] || 0) + v; return acc; }, {})
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <Header title="Investimentos" subtitle={`Patrimônio investido: ${brl(total)} · Resultado: ${brl(pnl)}`}>
        <button onClick={() => { setEditing(null); setShow(true); }} className="btn-primary"><Plus className="h-4 w-4" /> Novo ativo</button>
      </Header>

      {allocation.length > 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">Alocação</h2>
          <div className="mt-4 space-y-2">
            {allocation.map(([cls, v]) => (
              <div key={cls}>
                <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">{CLASSES[cls] || cls}</span><span>{brl(v)} · {((v / total) * 100).toFixed(1)}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary" style={{ width: `${(v / total) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
        {inv.length === 0 ? (
          <EmptyState text="Adicione seus ativos para acompanhar a carteira." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-5 py-3 text-left">Ativo</th><th className="px-3 py-3 text-right">Qtd</th><th className="px-3 py-3 text-right">Preço médio</th><th className="px-3 py-3 text-right">Preço atual</th><th className="px-3 py-3 text-right">Valor</th><th className="px-3 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {inv.map((i) => (
                <tr key={i.id} className="hover:bg-accent/30">
                  <td className="px-5 py-3">
                    <button onClick={() => { setEditing(i); setShow(true); }} className="text-left">
                      <div className="font-medium">{i.ticker || i.name}</div>
                      <div className="text-xs text-muted-foreground">{CLASSES[i.asset_class]}{i.ticker && i.name ? ` · ${i.name}` : ""}</div>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{Number(i.quantity).toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{brl(i.average_price)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{brl(i.current_price || i.average_price)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium">{brl(valueOf(i))}</td>
                  <td className="px-3 py-3 text-right"><button onClick={() => confirm("Remover ativo?") && del.mutate(i.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {show && <InvDialog onClose={() => setShow(false)} userId={user!.id} editing={editing} />}
    </div>
  );
}

function InvDialog({ onClose, userId, editing }: { onClose: () => void; userId: string; editing: Inv | null }) {
  const qc = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [ticker, setTicker] = useState(editing?.ticker ?? "");
  const [cls, setCls] = useState(editing?.asset_class ?? "stock");
  const [qty, setQty] = useState(String(editing?.quantity ?? ""));
  const [avg, setAvg] = useState(String(editing?.average_price ?? ""));
  const [cur, setCur] = useState(String(editing?.current_price ?? ""));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: userId, name, ticker: ticker || null, asset_class: cls,
        quantity: Number(qty) || 0, average_price: Number(avg) || 0, current_price: Number(cur) || Number(avg) || 0,
        updated_at: new Date().toISOString(),
      };
      const q = editing
        ? supabase.from("investments").update(payload).eq("id", editing.id)
        : supabase.from("investments").insert(payload);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inv"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success("Salvo"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog title={editing ? "Editar ativo" : "Novo ativo"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <Field label="Nome"><input required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Ex: Petrobras PN" /></Field>
        <Field label="Ticker"><input value={ticker} onChange={(e) => setTicker(e.target.value)} className="input" placeholder="Ex: PETR4" /></Field>
        <Field label="Classe">
          <select value={cls} onChange={(e) => setCls(e.target.value)} className="input">
            {Object.entries(CLASSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Quantidade"><input type="number" step="0.00000001" required value={qty} onChange={(e) => setQty(e.target.value)} className="input" /></Field>
          <Field label="Preço médio"><input type="number" step="0.01" required value={avg} onChange={(e) => setAvg(e.target.value)} className="input" /></Field>
          <Field label="Preço atual"><input type="number" step="0.01" value={cur} onChange={(e) => setCur(e.target.value)} className="input" /></Field>
        </div>
        <button disabled={save.isPending} className="btn-primary w-full justify-center">{save.isPending ? "Salvando..." : "Salvar"}</button>
      </form>
    </Dialog>
  );
}
