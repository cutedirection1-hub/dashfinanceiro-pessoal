import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { brl, fmtDate, invoiceMonth, addMonths, monthLabel } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Header, Dialog, Field, EmptyState } from "./contas";

export const Route = createFileRoute("/_authenticated/cartoes")({ component: CartoesPage });

type Card = { id: string; name: string; brand: string | null; credit_limit: number; closing_day: number; due_day: number };
type CTx = { id: string; card_id: string; group_id: string; amount: number; description: string | null; purchased_on: string; installment_no: number; installment_total: number; invoice_month: string };

function CartoesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showCard, setShowCard] = useState(false);
  const [showTx, setShowTx] = useState(false);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);

  const { data } = useQuery({
    queryKey: ["cartoes"],
    queryFn: async () => {
      const [c, t] = await Promise.all([
        supabase.from("credit_cards").select("*").eq("archived", false).order("created_at"),
        supabase.from("card_transactions").select("*").order("purchased_on", { ascending: false }),
      ]);
      return { cards: (c.data ?? []) as Card[], tx: (t.data ?? []) as CTx[] };
    },
  });

  const cards = data?.cards ?? [];
  const tx = data?.tx ?? [];

  const ymRef = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() + monthOffset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }, [monthOffset]);

  const activeCard = selectedCard ?? cards[0]?.id;
  const cardTx = tx.filter((t) => t.card_id === activeCard && t.invoice_month === ymRef);
  const invoiceTotal = cardTx.reduce((s, t) => s + Number(t.amount), 0);

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("credit_cards").update({ archived: true }).eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cartoes"] }); toast.success("Cartão arquivado"); },
  });

  const delTx = useMutation({
    mutationFn: async (group_id: string) => { const { error } = await supabase.from("card_transactions").delete().eq("group_id", group_id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cartoes"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success("Compra removida"); },
  });

  return (
    <div>
      <Header title="Cartões de crédito">
        <button onClick={() => setShowTx(true)} disabled={!cards.length} className="btn-secondary"><Plus className="h-4 w-4" /> Lançar compra</button>
        <button onClick={() => setShowCard(true)} className="btn-primary"><Plus className="h-4 w-4" /> Novo cartão</button>
      </Header>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const monthSpend = tx.filter((t) => t.card_id === c.id && t.invoice_month === ymRef).reduce((s, t) => s + Number(t.amount), 0);
          const used = tx.filter((t) => t.card_id === c.id && t.invoice_month >= ymRef).reduce((s, t) => s + Number(t.amount), 0);
          const usedPct = Math.min(100, (used / Math.max(Number(c.credit_limit), 1)) * 100);
          const active = activeCard === c.id;
          return (
            <button key={c.id} onClick={() => setSelectedCard(c.id)}
              className={`text-left rounded-2xl border p-5 transition ${active ? "border-primary/60 bg-primary/5" : "border-border bg-card"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{c.name}</h3>
                  <p className="text-xs text-muted-foreground">{c.brand || "—"} · venc. dia {c.due_day}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); if (confirm("Arquivar cartão?")) del.mutate(c.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-4">
                <div className="text-xs text-muted-foreground">Fatura do mês</div>
                <div className="text-2xl font-semibold">{brl(monthSpend)}</div>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Limite usado (futuro)</span><span>{brl(used)} / {brl(c.credit_limit)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-primary" style={{ width: `${usedPct}%` }} />
                </div>
              </div>
            </button>
          );
        })}
        {!cards.length && <EmptyState text="Cadastre seu primeiro cartão para começar." />}
      </div>

      {activeCard && (
        <div className="mt-8 rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold">Fatura — {monthLabel(ymRef)}</h2>
              <p className="text-xs text-muted-foreground">Total: {brl(invoiceTotal)}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMonthOffset(monthOffset - 1)} className="rounded-md p-1.5 hover:bg-accent"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={() => setMonthOffset(0)} className="rounded-md px-2 py-1 text-xs hover:bg-accent">Hoje</button>
              <button onClick={() => setMonthOffset(monthOffset + 1)} className="rounded-md p-1.5 hover:bg-accent"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
          {cardTx.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma compra nesta fatura.</div>
          ) : (
            <ul className="divide-y divide-border">
              {cardTx.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <div className="font-medium">{t.description || "Compra"}{t.installment_total > 1 && <span className="ml-2 text-xs text-muted-foreground">({t.installment_no}/{t.installment_total})</span>}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(t.purchased_on)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{brl(t.amount)}</span>
                    <button onClick={() => confirm("Remover esta compra (e parcelas futuras)?") && delTx.mutate(t.group_id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showCard && <NewCardDialog onClose={() => setShowCard(false)} userId={user!.id} />}
      {showTx && <NewCardTxDialog cards={cards} onClose={() => setShowTx(false)} userId={user!.id} />}
    </div>
  );
}

function NewCardDialog({ onClose, userId }: { onClose: () => void; userId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [limit, setLimit] = useState("");
  const [closing, setClosing] = useState("1");
  const [due, setDue] = useState("10");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("credit_cards").insert({
        user_id: userId, name, brand: brand || null, credit_limit: Number(limit) || 0,
        closing_day: Math.max(1, Math.min(31, Number(closing))), due_day: Math.max(1, Math.min(31, Number(due))),
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cartoes"] }); toast.success("Cartão criado"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog title="Novo cartão" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <Field label="Apelido"><input required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Ex: Nubank Roxinho" /></Field>
        <Field label="Bandeira"><input value={brand} onChange={(e) => setBrand(e.target.value)} className="input" placeholder="Ex: Mastercard" /></Field>
        <Field label="Limite (R$)"><input type="number" step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)} className="input" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dia fechamento"><input type="number" min={1} max={31} required value={closing} onChange={(e) => setClosing(e.target.value)} className="input" /></Field>
          <Field label="Dia vencimento"><input type="number" min={1} max={31} required value={due} onChange={(e) => setDue(e.target.value)} className="input" /></Field>
        </div>
        <button disabled={save.isPending} className="btn-primary w-full justify-center">{save.isPending ? "Salvando..." : "Salvar"}</button>
      </form>
    </Dialog>
  );
}

function NewCardTxDialog({ cards, onClose, userId }: { cards: Card[]; onClose: () => void; userId: string }) {
  const qc = useQueryClient();
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [installments, setInstallments] = useState("1");

  const save = useMutation({
    mutationFn: async () => {
      const card = cards.find((c) => c.id === cardId)!;
      const total = Math.max(1, Number(installments));
      const totalAmount = Number(amount);
      const parcel = +(totalAmount / total).toFixed(2);
      const firstInvoice = invoiceMonth(new Date(date), card.closing_day);
      const group_id = crypto.randomUUID();
      const rows = Array.from({ length: total }, (_, i) => ({
        user_id: userId, card_id: cardId, group_id,
        amount: parcel, description: desc || null,
        purchased_on: date,
        installment_no: i + 1, installment_total: total,
        invoice_month: addMonths(firstInvoice, i),
      }));
      const { error } = await supabase.from("card_transactions").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cartoes"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success("Compra registrada"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog title="Nova compra no cartão" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <Field label="Cartão">
          <select required value={cardId} onChange={(e) => setCardId(e.target.value)} className="input">
            {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Valor total (R$)"><input type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="input" /></Field>
        <Field label="Descrição"><input value={desc} onChange={(e) => setDesc(e.target.value)} className="input" placeholder="Ex: Notebook" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data da compra"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="input" /></Field>
          <Field label="Parcelas"><input type="number" min={1} max={36} required value={installments} onChange={(e) => setInstallments(e.target.value)} className="input" /></Field>
        </div>
        <button disabled={save.isPending} className="btn-primary w-full justify-center">{save.isPending ? "Salvando..." : "Salvar"}</button>
      </form>
    </Dialog>
  );
}
