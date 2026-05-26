import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { brl, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2, ArrowDownLeft, ArrowUpRight, Pencil, Archive, ArchiveRestore, Eye, Search, X as XIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/contas")({ component: ContasPage });

type Account = { id: string; name: string; bank: string | null; type: string; initial_balance: number };
type Tx = { id: string; account_id: string; amount: number; kind: string; description: string | null; occurred_on: string };

function ContasPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAcct, setShowAcct] = useState(false);
  const [showTx, setShowTx] = useState(false);
  const [editTx, setEditTx] = useState<Tx | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Filtros de lançamentos
  const [fAccount, setFAccount] = useState<string>("all");
  const [fKind, setFKind] = useState<"all" | "income" | "expense">("all");
  const [fFrom, setFFrom] = useState<string>("");
  const [fTo, setFTo] = useState<string>("");
  const [fSearch, setFSearch] = useState<string>("");
  const hasFilter = fAccount !== "all" || fKind !== "all" || !!fFrom || !!fTo || !!fSearch.trim();
  const txLimit = hasFilter ? 1000 : 100;

  const { data } = useQuery({
    queryKey: ["contas", showArchived, txLimit],
    queryFn: async () => {
      const [a, t] = await Promise.all([
        supabase.from("accounts").select("*").eq("archived", showArchived).order("created_at"),
        supabase.from("account_transactions").select("*").order("occurred_on", { ascending: false }).limit(txLimit),
      ]);
      return { accounts: (a.data ?? []) as Account[], tx: (t.data ?? []) as Tx[] };
    },
  });

  const accounts = data?.accounts ?? [];
  const tx = data?.tx ?? [];

  const balanceOf = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    if (!a) return 0;
    const sum = tx.filter((t) => t.account_id === id).reduce((s, t) => s + (t.kind === "income" ? Number(t.amount) : -Number(t.amount)), 0);
    return Number(a.initial_balance) + sum;
  };

  const total = accounts.reduce((s, a) => s + balanceOf(a.id), 0);

  const archive = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from("accounts").update({ archived }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ["contas"] }); toast.success(v.archived ? "Conta arquivada" : "Conta restaurada"); },
  });

  const delAccount = useMutation({
    mutationFn: async (id: string) => {
      const { error: txErr } = await supabase.from("account_transactions").delete().eq("account_id", id);
      if (txErr) throw txErr;
      const { error } = await supabase.from("accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contas"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Conta excluída");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delTx = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("account_transactions").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contas"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success("Lançamento removido"); },
  });

  return (
    <div>
      <Header title="Contas bancárias" subtitle={`Saldo total: ${brl(total)}`}>
        <button onClick={() => setShowArchived((v) => !v)} className="btn-secondary"><Eye className="h-4 w-4" /> {showArchived ? "Ver ativas" : "Ver arquivadas"}</button>
        <button onClick={() => { setEditTx(null); setShowTx(true); }} disabled={!accounts.length} className="btn-secondary"><Plus className="h-4 w-4" /> Lançamento</button>
        <button onClick={() => setShowAcct(true)} className="btn-primary"><Plus className="h-4 w-4" /> Nova conta</button>
      </Header>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <div key={a.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{a.name}</h3>
                <p className="text-xs text-muted-foreground">{a.bank || a.type}</p>
              </div>
              <div className="flex gap-1">
                {showArchived ? (
                  <button title="Restaurar" onClick={() => archive.mutate({ id: a.id, archived: false })} className="text-muted-foreground hover:text-primary"><ArchiveRestore className="h-4 w-4" /></button>
                ) : (
                  <button title="Arquivar" onClick={() => confirm("Arquivar essa conta? Os lançamentos serão mantidos.") && archive.mutate({ id: a.id, archived: true })} className="text-muted-foreground hover:text-primary"><Archive className="h-4 w-4" /></button>
                )}
                <button title="Excluir conta e lançamentos" onClick={() => confirm("EXCLUIR essa conta e TODOS os seus lançamentos? Esta ação não pode ser desfeita.") && delAccount.mutate(a.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="mt-4 text-2xl font-semibold">{brl(balanceOf(a.id))}</div>
          </div>
        ))}
        {!accounts.length && <EmptyState text={showArchived ? "Nenhuma conta arquivada." : "Nenhuma conta cadastrada ainda."} />}
      </div>

      {tx.length > 0 && (() => {
        const filtered = tx.filter((t) => {
          if (fAccount !== "all" && t.account_id !== fAccount) return false;
          if (fKind !== "all" && t.kind !== fKind) return false;
          if (fFrom && t.occurred_on < fFrom) return false;
          if (fTo && t.occurred_on > fTo) return false;
          if (fSearch.trim()) {
            const q = fSearch.trim().toLowerCase();
            if (!(t.description || "").toLowerCase().includes(q)) return false;
          }
          return true;
        });
        const filteredTotal = filtered.reduce((s, t) => s + (t.kind === "income" ? Number(t.amount) : -Number(t.amount)), 0);
        const clearAll = () => { setFAccount("all"); setFKind("all"); setFFrom(""); setFTo(""); setFSearch(""); };
        return (
        <div className="mt-8 rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold">Lançamentos</h2>
              <p className="text-xs text-muted-foreground">
                {filtered.length} de {tx.length}{!hasFilter && tx.length >= txLimit && <> · mostrando últimos {txLimit} — use filtros para ver mais</>}
                {" · "}Saldo: <span className={`tabular-nums font-medium ${filteredTotal < 0 ? "text-destructive" : "text-primary"}`}>{brl(filteredTotal)}</span>
              </p>
            </div>
            {hasFilter && (
              <button onClick={clearAll} className="btn-secondary text-xs"><XIcon className="h-3.5 w-3.5" /> Limpar filtros</button>
            )}
          </div>

          <div className="grid gap-3 border-b border-border bg-secondary/20 px-5 py-3 md:grid-cols-5">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Conta</span>
              <select value={fAccount} onChange={(e) => setFAccount(e.target.value)} className="input h-9 py-0 text-sm">
                <option value="all">Todas</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Tipo</span>
              <div className="flex gap-1">
                {(["all", "income", "expense"] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setFKind(k)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs transition ${fKind === k ? (k === "expense" ? "bg-destructive/20 text-destructive ring-1 ring-destructive/40" : k === "income" ? "bg-primary/20 text-primary ring-1 ring-primary/40" : "bg-foreground/10 ring-1 ring-foreground/20") : "bg-card text-muted-foreground hover:bg-accent"}`}>
                    {k === "all" ? "Todos" : k === "income" ? "Entrada" : "Saída"}
                  </button>
                ))}
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">De</span>
              <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="input h-9 py-0 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Até</span>
              <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="input h-9 py-0 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Buscar descrição</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input value={fSearch} onChange={(e) => setFSearch(e.target.value)} placeholder="Mercado, Uber..." className="input h-9 py-0 pl-7 text-sm" />
              </div>
            </label>
          </div>

          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhum lançamento corresponde aos filtros.</div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((t) => {
                const acct = accounts.find((a) => a.id === t.account_id);
                return (
                  <li key={t.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <div className="flex items-center gap-3">
                      {t.kind === "income" ? <ArrowDownLeft className="h-4 w-4 text-primary" /> : <ArrowUpRight className="h-4 w-4 text-destructive" />}
                      <div>
                        <div className="font-medium">{t.description || (t.kind === "income" ? "Entrada" : "Saída")}</div>
                        <div className="text-xs text-muted-foreground">{acct?.name} · {fmtDate(t.occurred_on)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`font-medium tabular-nums ${t.kind === "income" ? "text-primary" : ""}`}>
                        {t.kind === "income" ? "+" : "-"}{brl(t.amount)}
                      </div>
                      <button onClick={() => { setEditTx(t); setShowTx(true); }} className="text-muted-foreground hover:text-primary"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => confirm("Remover este lançamento?") && delTx.mutate(t.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        );
      })()}

      {showAcct && <NewAccountDialog onClose={() => setShowAcct(false)} userId={user!.id} />}
      {showTx && <TxDialog accounts={accounts} onClose={() => { setShowTx(false); setEditTx(null); }} userId={user!.id} editing={editTx} />}
    </div>
  );
}

function NewAccountDialog({ onClose, userId }: { onClose: () => void; userId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [type, setType] = useState("checking");
  const [initial, setInitial] = useState("0");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("accounts").insert({ user_id: userId, name, bank: bank || null, type, initial_balance: Number(initial) || 0 });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contas"] }); toast.success("Conta criada"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog title="Nova conta" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <Field label="Nome"><input required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Ex: Conta corrente" /></Field>
        <Field label="Banco"><input value={bank} onChange={(e) => setBank(e.target.value)} className="input" placeholder="Ex: Nubank" /></Field>
        <Field label="Tipo">
          <select value={type} onChange={(e) => setType(e.target.value)} className="input">
            <option value="checking">Conta corrente</option>
            <option value="savings">Poupança</option>
            <option value="wallet">Carteira</option>
            <option value="other">Outro</option>
          </select>
        </Field>
        <Field label="Saldo inicial (R$)"><input type="number" step="0.01" value={initial} onChange={(e) => setInitial(e.target.value)} className="input" /></Field>
        <button disabled={save.isPending} className="btn-primary w-full justify-center">{save.isPending ? "Salvando..." : "Salvar"}</button>
      </form>
    </Dialog>
  );
}

function TxDialog({ accounts, onClose, userId, editing }: { accounts: Account[]; onClose: () => void; userId: string; editing: Tx | null }) {
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState(editing?.account_id ?? accounts[0]?.id ?? "");
  const [kind, setKind] = useState<"income" | "expense">((editing?.kind as any) ?? "expense");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [desc, setDesc] = useState(editing?.description ?? "");
  const [date, setDate] = useState(editing?.occurred_on ?? new Date().toISOString().slice(0, 10));

  const save = useMutation({
    mutationFn: async () => {
      const payload = { user_id: userId, account_id: accountId, kind, amount: Number(amount), description: desc || null, occurred_on: date };
      const q = editing
        ? supabase.from("account_transactions").update(payload).eq("id", editing.id)
        : supabase.from("account_transactions").insert(payload);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contas"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success(editing ? "Lançamento atualizado" : "Lançamento salvo"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog title={editing ? "Editar lançamento" : "Novo lançamento"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setKind("expense")} className={`rounded-lg px-3 py-2 text-sm ${kind === "expense" ? "bg-destructive/20 text-destructive ring-1 ring-destructive/40" : "bg-secondary"}`}>Saída</button>
          <button type="button" onClick={() => setKind("income")} className={`rounded-lg px-3 py-2 text-sm ${kind === "income" ? "bg-primary/20 text-primary ring-1 ring-primary/40" : "bg-secondary"}`}>Entrada</button>
        </div>
        <Field label="Conta">
          <select required value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Valor (R$)"><input type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="input" /></Field>
        <Field label="Descrição"><input value={desc} onChange={(e) => setDesc(e.target.value)} className="input" placeholder="Ex: Mercado" /></Field>
        <Field label="Data"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="input" /></Field>
        <button disabled={save.isPending} className="btn-primary w-full justify-center">{save.isPending ? "Salvando..." : "Salvar"}</button>
      </form>
    </Dialog>
  );
}

// Shared UI helpers (used across pages)
export function Header({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="col-span-full rounded-2xl border border-dashed border-border bg-card/30 p-10 text-center text-sm text-muted-foreground">{text}</div>;
}
