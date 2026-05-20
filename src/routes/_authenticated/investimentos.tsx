import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { Header, Dialog, Field, EmptyState } from "./contas";

export const Route = createFileRoute("/_authenticated/investimentos")({ component: InvestimentosPage });

type Inv = { id: string; asset_class: string; ticker: string | null; name: string; quantity: number; average_price: number; current_price: number; funding_account_id: string | null };
type Account = { id: string; name: string };

const CLASSES: Record<string, string> = {
  stock: "Ação",
  fii: "FII",
  etf: "ETF",
  crypto: "Cripto",
  fixed_income: "Renda fixa",
  caixinha: "Caixinha / Cofrinho",
  fund: "Fundo",
  previdencia: "Previdência privada",
  other: "Outro",
};

// Classes que usam modo "saldo único" (sem preço x quantidade)
const BALANCE_MODE = new Set(["fixed_income", "caixinha", "previdencia"]);
// Classes que NÃO descontam saldo da conta (apenas somam ao patrimônio)
const NO_FUNDING = new Set(["previdencia"]);

function InvestimentosPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<Inv | null>(null);

  const { data } = useQuery({
    queryKey: ["inv"],
    queryFn: async () => {
      const [i, a] = await Promise.all([
        supabase.from("investments").select("*").order("name"),
        supabase.from("accounts").select("id, name").eq("archived", false),
      ]);
      return { inv: (i.data ?? []) as Inv[], accounts: (a.data ?? []) as Account[] };
    },
  });

  const inv = data?.inv ?? [];
  const accounts = data?.accounts ?? [];

  const valueOf = (i: Inv) => Number(i.quantity) * Number(i.current_price || i.average_price);
  const costOf = (i: Inv) => Number(i.quantity) * Number(i.average_price);
  const total = inv.reduce((s, i) => s + valueOf(i), 0);
  const cost = inv.reduce((s, i) => s + costOf(i), 0);
  const pnl = total - cost;

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("investments").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inv"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success("Removido"); },
  });

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
              <tr><th className="px-5 py-3 text-left">Ativo</th><th className="px-3 py-3 text-right">Detalhes</th><th className="px-3 py-3 text-right">Saldo / Valor</th><th className="px-3 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {inv.map((i) => {
                const isBalance = BALANCE_MODE.has(i.asset_class);
                const bank = accounts.find((a) => a.id === i.funding_account_id)?.name;
                return (
                  <tr key={i.id} className="hover:bg-accent/30">
                    <td className="px-5 py-3">
                      <button onClick={() => { setEditing(i); setShow(true); }} className="text-left">
                        <div className="font-medium">{i.ticker || i.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {CLASSES[i.asset_class]}{i.ticker && i.name ? ` · ${i.name}` : ""}
                          {bank && <span> · <span className="text-foreground/70">{bank}</span></span>}
                        </div>
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right text-xs text-muted-foreground">
                      {isBalance ? (
                        <span>Aporte: {brl(costOf(i))}</span>
                      ) : (
                        <span>{Number(i.quantity).toLocaleString("pt-BR")} × {brl(i.current_price || i.average_price)}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium">{brl(valueOf(i))}</td>
                    <td className="px-3 py-3 text-right">
                      <button onClick={() => { setEditing(i); setShow(true); }} className="text-muted-foreground hover:text-primary" title="Atualizar saldo"><RefreshCw className="h-4 w-4" /></button>
                      <button onClick={() => confirm("Remover ativo?") && del.mutate(i.id)} className="ml-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {show && <InvDialog onClose={() => setShow(false)} userId={user!.id} editing={editing} accounts={accounts} />}
    </div>
  );
}

function InvDialog({ onClose, userId, editing, accounts }: { onClose: () => void; userId: string; editing: Inv | null; accounts: Account[] }) {
  const qc = useQueryClient();
  const [cls, setCls] = useState(editing?.asset_class ?? "caixinha");
  const [name, setName] = useState(editing?.name ?? "");
  const [ticker, setTicker] = useState(editing?.ticker ?? "");
  const [qty, setQty] = useState(String(editing?.quantity ?? ""));
  const [avg, setAvg] = useState(String(editing?.average_price ?? ""));
  const [cur, setCur] = useState(String(editing?.current_price ?? ""));

  // Modo saldo: balance = saldo atual; aporte = total investido (avg_price)
  const [balance, setBalance] = useState(
    editing && BALANCE_MODE.has(editing.asset_class)
      ? String(Number(editing.quantity) * Number(editing.current_price || editing.average_price))
      : ""
  );
  const [aporte, setAporte] = useState(
    editing && BALANCE_MODE.has(editing.asset_class)
      ? String(Number(editing.quantity) * Number(editing.average_price))
      : ""
  );

  const [fundingAccountId, setFundingAccountId] = useState<string>(editing?.funding_account_id ?? (accounts[0]?.id ?? ""));
  const [debitAccount, setDebitAccount] = useState<boolean>(!editing); // por padrão debita ao criar

  const isBalanceMode = BALANCE_MODE.has(cls);
  const canFund = !NO_FUNDING.has(cls) && accounts.length > 0;

  const save = useMutation({
    mutationFn: async () => {
      let payload: any;
      let newAporte = 0; // valor a ser debitado da conta na criação
      let oldAporte = 0;

      if (editing) {
        oldAporte = Number(editing.quantity) * Number(editing.average_price);
      }

      if (isBalanceMode) {
        const bal = Number(balance) || 0;
        const ap = Number(aporte) || bal;
        payload = {
          user_id: userId, name: name || CLASSES[cls], ticker: ticker || null, asset_class: cls,
          quantity: 1, average_price: ap, current_price: bal,
          funding_account_id: canFund ? (fundingAccountId || null) : null,
          updated_at: new Date().toISOString(),
        };
        newAporte = ap;
      } else {
        payload = {
          user_id: userId, name, ticker: ticker || null, asset_class: cls,
          quantity: Number(qty) || 0, average_price: Number(avg) || 0, current_price: Number(cur) || Number(avg) || 0,
          funding_account_id: canFund ? (fundingAccountId || null) : null,
          updated_at: new Date().toISOString(),
        };
        newAporte = (Number(qty) || 0) * (Number(avg) || 0);
      }

      const q = editing
        ? supabase.from("investments").update(payload).eq("id", editing.id)
        : supabase.from("investments").insert(payload);
      const { error } = await q;
      if (error) throw error;

      // Cria lançamento de saída na conta (apenas na CRIAÇÃO e quando aplicável)
      if (!editing && canFund && debitAccount && fundingAccountId && newAporte > 0) {
        const { error: txErr } = await supabase.from("account_transactions").insert({
          user_id: userId,
          account_id: fundingAccountId,
          kind: "expense",
          amount: newAporte,
          description: `Aporte: ${payload.name}`,
          occurred_on: new Date().toISOString().slice(0, 10),
        });
        if (txErr) throw txErr;
      }

      void oldAporte;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inv"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["contas"] });
      toast.success("Salvo"); onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog title={editing ? "Editar ativo" : "Novo ativo"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <Field label="Tipo">
          <select value={cls} onChange={(e) => setCls(e.target.value)} className="input">
            {Object.entries(CLASSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Nome / apelido"><input required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder={isBalanceMode ? "Ex: Caixinha viagem" : "Ex: Petrobras PN"} /></Field>

        {isBalanceMode ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Saldo atual (R$)"><input type="number" step="0.01" required value={balance} onChange={(e) => setBalance(e.target.value)} className="input" /></Field>
              <Field label="Total aportado (R$)"><input type="number" step="0.01" value={aporte} onChange={(e) => setAporte(e.target.value)} className="input" placeholder="Opcional" /></Field>
            </div>
            <p className="text-xs text-muted-foreground">A diferença entre saldo atual e aportado é considerada como rendimento.</p>
          </>
        ) : (
          <>
            <Field label="Ticker"><input value={ticker} onChange={(e) => setTicker(e.target.value)} className="input" placeholder="Ex: PETR4" /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Quantidade"><input type="number" step="0.00000001" required value={qty} onChange={(e) => setQty(e.target.value)} className="input" /></Field>
              <Field label="Preço médio"><input type="number" step="0.01" required value={avg} onChange={(e) => setAvg(e.target.value)} className="input" /></Field>
              <Field label="Preço atual"><input type="number" step="0.01" value={cur} onChange={(e) => setCur(e.target.value)} className="input" /></Field>
            </div>
          </>
        )}

        {canFund && (
          <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
            <Field label="Conta de origem do aporte">
              <select value={fundingAccountId} onChange={(e) => setFundingAccountId(e.target.value)} className="input">
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            {!editing && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={debitAccount} onChange={(e) => setDebitAccount(e.target.checked)} />
                Debitar este valor do saldo da conta agora
              </label>
            )}
          </div>
        )}

        {NO_FUNDING.has(cls) && (
          <p className="text-xs text-muted-foreground">Previdência privada soma ao patrimônio, mas não é debitada do saldo das contas.</p>
        )}

        <button disabled={save.isPending} className="btn-primary w-full justify-center">{save.isPending ? "Salvando..." : "Salvar"}</button>
      </form>
    </Dialog>
  );
}
