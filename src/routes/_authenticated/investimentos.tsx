import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { brl, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2, RefreshCw, Pencil, ChevronDown, ChevronRight } from "lucide-react";
import { Header, Dialog, Field, EmptyState } from "./contas";

export const Route = createFileRoute("/_authenticated/investimentos")({ component: InvestimentosPage });

type Inv = { id: string; asset_class: string; ticker: string | null; name: string; quantity: number; average_price: number; current_price: number; funding_account_id: string | null };
type Account = { id: string; name: string };
type Contrib = { id: string; investment_id: string; kind: string; amount: number; quantity: number | null; unit_price: number | null; occurred_on: string; funding_account_id: string | null; account_tx_id: string | null; notes: string | null };

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

const BALANCE_MODE = new Set(["fixed_income", "caixinha", "previdencia", "fund", "other"]);
const NO_FUNDING = new Set(["previdencia"]);

function InvestimentosPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<Inv | null>(null);
  const [contribFor, setContribFor] = useState<Inv | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data } = useQuery({
    queryKey: ["inv"],
    queryFn: async () => {
      const [i, a, c] = await Promise.all([
        supabase.from("investments").select("*").order("name"),
        supabase.from("accounts").select("id, name").eq("archived", false),
        supabase.from("investment_contributions" as any).select("*").order("occurred_on", { ascending: false }),
      ]);
      return {
        inv: (i.data ?? []) as Inv[],
        accounts: (a.data ?? []) as Account[],
        contribs: ((c.data ?? []) as any[]) as Contrib[],
      };
    },
  });

  const inv = data?.inv ?? [];
  const accounts = data?.accounts ?? [];
  const contribs = data?.contribs ?? [];

  const valueOf = (i: Inv) => Number(i.quantity) * Number(i.current_price || i.average_price);
  const aporteOf = (i: Inv) => contribs.filter((c) => c.investment_id === i.id).reduce((s, c) => s + (c.kind === "resgate" ? -1 : 1) * Number(c.amount), 0);
  const total = inv.reduce((s, i) => s + valueOf(i), 0);
  const totalAporte = inv.reduce((s, i) => s + aporteOf(i), 0);
  const pnl = total - totalAporte;

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("investment_contributions" as any).delete().eq("investment_id", id);
      const { error } = await supabase.from("investments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inv"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success("Removido"); },
  });

  const allocation = Object.entries(
    inv.reduce<Record<string, number>>((acc, i) => { const v = valueOf(i); acc[i.asset_class] = (acc[i.asset_class] || 0) + v; return acc; }, {})
  ).sort((a, b) => b[1] - a[1]);

  const pnlPct = totalAporte > 0 ? (pnl / totalAporte) * 100 : 0;
  const pnlColor = pnl < 0 ? "text-destructive" : pnl > 0 ? "text-emerald-500" : "text-muted-foreground";
  const pnlArrow = pnl < 0 ? "↓" : pnl > 0 ? "↑" : "·";

  return (
    <div>
      <Header title="Investimentos">
        <button onClick={() => { setEditing(null); setShow(true); }} className="btn-primary"><Plus className="h-4 w-4" /> Novo ativo</button>
      </Header>
      <div className="mt-1 text-sm text-muted-foreground">
        Patrimônio: <span className="font-medium text-foreground">{brl(total)}</span> · Aportado: {brl(totalAporte)} ·{" "}
        <span className={`font-medium ${pnlColor}`}>{pnlArrow} Resultado: {brl(pnl)}{totalAporte > 0 && <span className="text-xs"> ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)</span>}</span>
      </div>

      {allocation.length > 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">Alocação</h2>
          <div className="mt-4 space-y-2">
            {allocation.map(([cls, v]) => {
              const aportadoCls = inv.filter((i) => i.asset_class === cls).reduce((s, i) => s + aporteOf(i), 0);
              const clsNeg = v < aportadoCls;
              return (
                <div key={cls}>
                  <div className="mb-1 flex justify-between text-xs"><span className={clsNeg ? "text-destructive" : "text-muted-foreground"}>{CLASSES[cls] || cls}{clsNeg && " ↓"}</span><span>{brl(v)} · {((v / total) * 100).toFixed(1)}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full ${clsNeg ? "bg-destructive" : "bg-primary"}`} style={{ width: `${(v / total) * 100}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
        {inv.length === 0 ? (
          <EmptyState text="Adicione seus ativos para acompanhar a carteira." />
        ) : (
          <ul className="divide-y divide-border">
            {inv.map((i) => {
              const bank = accounts.find((a) => a.id === i.funding_account_id)?.name;
              const myContribs = contribs.filter((c) => c.investment_id === i.id);
              const aportado = aporteOf(i);
              const valor = valueOf(i);
              const open = expanded[i.id];
              return (
                <li key={i.id}>
                  <div className="flex items-center gap-2 px-5 py-3 text-sm">
                    <button onClick={() => setExpanded({ ...expanded, [i.id]: !open })} className="text-muted-foreground hover:text-foreground">
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="flex-1">
                      <div className="font-medium">{i.ticker || i.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {CLASSES[i.asset_class]}{i.ticker && i.name ? ` · ${i.name}` : ""}
                        {bank && <span> · <span className="text-foreground/70">{bank}</span></span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Aportado {brl(aportado)}</div>
                      <div className="tabular-nums font-medium">{brl(valor)}</div>
                    </div>
                    <button onClick={() => setContribFor(i)} className="ml-2 text-primary hover:underline text-xs whitespace-nowrap">+ Aporte</button>
                    <button onClick={() => { setEditing(i); setShow(true); }} className="text-muted-foreground hover:text-primary" title="Editar ativo / atualizar saldo"><RefreshCw className="h-4 w-4" /></button>
                    <button onClick={() => confirm("Remover ativo e todos os aportes?") && del.mutate(i.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  {open && (
                    <ContribList inv={i} contribs={myContribs} accounts={accounts} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {show && <InvDialog onClose={() => setShow(false)} userId={user!.id} editing={editing} accounts={accounts} />}
      {contribFor && <ContribDialog onClose={() => setContribFor(null)} userId={user!.id} inv={contribFor} accounts={accounts} editing={null} initialKind="aporte" />}
    </div>
  );
}

function ContribList({ inv, contribs, accounts }: { inv: Inv; contribs: Contrib[]; accounts: Account[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Contrib | null>(null);
  const [showNew, setShowNew] = useState<"aporte" | "resgate" | null>(null);

  const del = useMutation({
    mutationFn: async (c: Contrib) => {
      if (c.account_tx_id) {
        await supabase.from("account_transactions").delete().eq("id", c.account_tx_id);
      }
      const { error } = await supabase.from("investment_contributions" as any).delete().eq("id", c.id);
      if (error) throw error;
      await recomputeInvestment(inv);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inv"] }); qc.invalidateQueries({ queryKey: ["contas"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success("Removido"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="bg-secondary/20 border-t border-border px-12 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Histórico ({contribs.length})</span>
        <div className="flex gap-2">
          <button onClick={() => setShowNew("aporte")} className="text-xs text-primary hover:underline">+ Aporte</button>
          <button onClick={() => setShowNew("resgate")} className="text-xs text-destructive hover:underline">− Resgate</button>
        </div>
      </div>
      {contribs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum lançamento registrado.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {contribs.map((c) => {
            const acct = accounts.find((a) => a.id === c.funding_account_id)?.name;
            const isResg = c.kind === "resgate";
            return (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${isResg ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}>{isResg ? "Resgate" : "Aporte"}</span>
                    <span className={`tabular-nums font-medium ${isResg ? "text-destructive" : ""}`}>{isResg ? "−" : ""}{brl(c.amount)}</span>
                    {c.quantity != null && c.unit_price != null && (
                      <span className="text-xs text-muted-foreground">({Number(c.quantity)} × {brl(c.unit_price)})</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{fmtDate(c.occurred_on)}{acct && ` · ${acct}`}{c.notes && ` · ${c.notes}`}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setEdit(c)} className="text-muted-foreground hover:text-primary"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => confirm("Remover este lançamento?") && del.mutate(c)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {showNew && <ContribDialog onClose={() => setShowNew(null)} userId={user!.id} inv={inv} accounts={accounts} editing={null} initialKind={showNew} />}
      {edit && <ContribDialog onClose={() => setEdit(null)} userId={user!.id} inv={inv} accounts={accounts} editing={edit} initialKind={edit.kind as any} />}
    </div>
  );
}

async function recomputeInvestment(inv: Inv) {
  const { data: rows } = await supabase.from("investment_contributions" as any)
    .select("*").eq("investment_id", inv.id).order("occurred_on");
  const list = (rows ?? []) as any[];
  if (BALANCE_MODE.has(inv.asset_class)) {
    const net = list.reduce((s, r) => s + (r.kind === "resgate" ? -1 : 1) * Number(r.amount), 0);
    const totalPos = Math.max(net, 0);
    const newCurrent = Math.max(Number(inv.current_price) || 0, totalPos);
    await supabase.from("investments").update({
      quantity: 1, average_price: totalPos, current_price: newCurrent,
      updated_at: new Date().toISOString(),
    }).eq("id", inv.id);
  } else {
    // Stock-like: walk in order
    let qty = 0; let invested = 0; let avg = 0; let lastPrice = Number(inv.current_price) || 0;
    for (const r of list) {
      const q = Number(r.quantity || 0);
      const p = Number(r.unit_price || 0);
      if (p > 0) lastPrice = p;
      if (r.kind === "resgate") {
        const sellQty = Math.min(q, qty);
        invested -= sellQty * avg;
        qty -= sellQty;
        if (qty <= 0) { qty = 0; invested = 0; avg = 0; }
      } else {
        qty += q;
        invested += q * p;
        avg = qty > 0 ? invested / qty : 0;
      }
    }
    await supabase.from("investments").update({
      quantity: qty, average_price: avg, current_price: lastPrice || avg,
      updated_at: new Date().toISOString(),
    }).eq("id", inv.id);
  }
}

function ContribDialog({ onClose, userId, inv, accounts, editing, initialKind }: { onClose: () => void; userId: string; inv: Inv; accounts: Account[]; editing: Contrib | null; initialKind: "aporte" | "resgate" }) {
  const qc = useQueryClient();
  const noFunding = NO_FUNDING.has(inv.asset_class);
  const isStockMode = !BALANCE_MODE.has(inv.asset_class);
  const [kind, setKind] = useState<"aporte" | "resgate">(((editing?.kind as any) || initialKind) as any);
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [qty, setQty] = useState(editing?.quantity != null ? String(editing.quantity) : "");
  const [unitPrice, setUnitPrice] = useState(editing?.unit_price != null ? String(editing.unit_price) : "");
  const [date, setDate] = useState(editing?.occurred_on ?? new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState<string>(editing?.funding_account_id ?? (accounts[0]?.id ?? ""));
  const [notes, setNotes] = useState(editing?.notes ?? "");

  const isResg = kind === "resgate";
  // Previdência aceita aporte sem debitar, mas resgate deve creditar uma conta
  const requiresFunding = !noFunding || isResg;

  const computedAmount = isStockMode ? (Number(qty) * Number(unitPrice)) : Number(amount);

  const save = useMutation({
    mutationFn: async () => {
      const amt = computedAmount;
      if (!amt || amt <= 0) throw new Error("Valor inválido");
      if (isStockMode && (!Number(qty) || !Number(unitPrice))) throw new Error("Informe quantidade e preço");
      if (requiresFunding && !accountId) throw new Error("Selecione o banco");

      const txKind = isResg ? "income" : "expense";
      const desc = `${isResg ? "Resgate" : "Aporte"}: ${inv.name}`;
      let accountTxId: string | null = editing?.account_tx_id ?? null;

      if (editing) {
        if (requiresFunding && accountId) {
          if (accountTxId) {
            const { error } = await supabase.from("account_transactions").update({
              account_id: accountId, amount: amt, occurred_on: date, description: desc, kind: txKind,
            }).eq("id", accountTxId);
            if (error) throw error;
          } else {
            const { data, error } = await supabase.from("account_transactions").insert({
              user_id: userId, account_id: accountId, kind: txKind, amount: amt, description: desc, occurred_on: date,
            }).select("id").single();
            if (error) throw error;
            accountTxId = data.id;
          }
        } else if (accountTxId) {
          await supabase.from("account_transactions").delete().eq("id", accountTxId);
          accountTxId = null;
        }

        const { error } = await supabase.from("investment_contributions" as any).update({
          kind, amount: amt, quantity: isStockMode ? Number(qty) : null, unit_price: isStockMode ? Number(unitPrice) : null,
          occurred_on: date,
          funding_account_id: requiresFunding ? accountId : null,
          account_tx_id: accountTxId, notes: notes || null,
        }).eq("id", editing.id);
        if (error) throw error;
      } else {
        if (requiresFunding && accountId) {
          const { data, error } = await supabase.from("account_transactions").insert({
            user_id: userId, account_id: accountId, kind: txKind, amount: amt, description: desc, occurred_on: date,
          }).select("id").single();
          if (error) throw error;
          accountTxId = data.id;
        }

        const { error } = await supabase.from("investment_contributions" as any).insert({
          user_id: userId, investment_id: inv.id, kind, amount: amt,
          quantity: isStockMode ? Number(qty) : null, unit_price: isStockMode ? Number(unitPrice) : null,
          occurred_on: date, funding_account_id: requiresFunding ? accountId : null,
          account_tx_id: accountTxId, notes: notes || null,
        });
        if (error) throw error;
      }

      await recomputeInvestment(inv);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inv"] });
      qc.invalidateQueries({ queryKey: ["contas"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Salvo");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog title={`${editing ? "Editar" : "Novo"} ${isResg ? "resgate" : "aporte"} — ${inv.name}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setKind("aporte")} className={`rounded-lg px-3 py-2 text-sm ${!isResg ? "bg-primary/20 text-primary ring-1 ring-primary/40" : "bg-secondary"}`}>Aporte</button>
          <button type="button" onClick={() => setKind("resgate")} className={`rounded-lg px-3 py-2 text-sm ${isResg ? "bg-destructive/20 text-destructive ring-1 ring-destructive/40" : "bg-secondary"}`}>Resgate</button>
        </div>

        {isStockMode ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantidade"><input type="number" step="0.00000001" required value={qty} onChange={(e) => setQty(e.target.value)} className="input" /></Field>
              <Field label="Preço unitário (R$)"><input type="number" step="0.01" required value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="input" /></Field>
            </div>
            <p className="text-xs text-muted-foreground">Valor total: {brl(computedAmount)}</p>
          </>
        ) : (
          <Field label="Valor (R$)"><input type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="input" /></Field>
        )}

        <Field label="Data"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="input" /></Field>

        {requiresFunding ? (
          <Field label={isResg ? "Banco de destino (será creditado)" : "Banco de origem (será debitado)"}>
            <select required value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input">
              <option value="">— Selecione —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        ) : (
          <p className="text-xs text-muted-foreground">Previdência privada: aporte registrado sem debitar contas.</p>
        )}

        <Field label="Observação"><input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="Opcional" /></Field>
        <button disabled={save.isPending} className="btn-primary w-full justify-center">{save.isPending ? "Salvando..." : "Salvar"}</button>
      </form>
    </Dialog>
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
  const [balance, setBalance] = useState(
    editing && BALANCE_MODE.has(editing.asset_class)
      ? String(Number(editing.quantity) * Number(editing.current_price || editing.average_price))
      : ""
  );
  const [fundingAccountId, setFundingAccountId] = useState<string>(editing?.funding_account_id ?? "");

  const isBalanceMode = BALANCE_MODE.has(cls);

  const save = useMutation({
    mutationFn: async () => {
      let payload: any;
      if (isBalanceMode) {
        const bal = Number(balance) || 0;
        payload = {
          user_id: userId, name: name || CLASSES[cls], ticker: ticker || null, asset_class: cls,
          quantity: 1,
          average_price: editing ? Number(editing.average_price) : bal,
          current_price: bal,
          funding_account_id: fundingAccountId || null,
          updated_at: new Date().toISOString(),
        };
      } else {
        payload = {
          user_id: userId, name, ticker: ticker || null, asset_class: cls,
          quantity: Number(qty) || 0, average_price: Number(avg) || 0, current_price: Number(cur) || Number(avg) || 0,
          funding_account_id: fundingAccountId || null,
          updated_at: new Date().toISOString(),
        };
      }

      const q = editing
        ? supabase.from("investments").update(payload).eq("id", editing.id)
        : supabase.from("investments").insert(payload);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inv"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
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
            <Field label="Saldo atual (R$)"><input type="number" step="0.01" required value={balance} onChange={(e) => setBalance(e.target.value)} className="input" /></Field>
            <p className="text-xs text-muted-foreground">Use o botão "+ Aporte" na lista para registrar aportes. O saldo aqui é o valor atual do investimento.</p>
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

        <Field label="Banco / corretora onde está o investimento">
          <select value={fundingAccountId} onChange={(e) => setFundingAccountId(e.target.value)} className="input">
            <option value="">— Não informar —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>

        <button disabled={save.isPending} className="btn-primary w-full justify-center">{save.isPending ? "Salvando..." : "Salvar"}</button>
      </form>
    </Dialog>
  );
}
