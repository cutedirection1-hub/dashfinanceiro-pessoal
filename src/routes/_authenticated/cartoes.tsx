import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { brl, fmtDate, invoiceMonth, addMonths, monthLabel } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2, ChevronLeft, ChevronRight, Pencil, User, Repeat, Eye, ArchiveRestore } from "lucide-react";
import { Header, Dialog, Field, EmptyState } from "./contas";

export const Route = createFileRoute("/_authenticated/cartoes")({ component: CartoesPage });

type Card = { id: string; name: string; brand: string | null; credit_limit: number; closing_day: number; due_day: number };
type CTx = {
  id: string; card_id: string; group_id: string; amount: number; description: string | null;
  purchased_on: string; installment_no: number; installment_total: number; invoice_month: string;
  payer_name: string | null; recurrence?: string | null; recurrence_group_id?: string | null;
};

function CartoesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showCard, setShowCard] = useState(false);
  const [editCard, setEditCard] = useState<Card | null>(null);
  const [showTx, setShowTx] = useState(false);
  const [editTx, setEditTx] = useState<CTx | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [payerFilter, setPayerFilter] = useState<string>("all");

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
  const allCardTx = tx.filter((t) => t.card_id === activeCard && t.invoice_month === ymRef);
  const cardTx = payerFilter === "all"
    ? allCardTx
    : allCardTx.filter((t) => (t.payer_name?.trim() || "Eu") === payerFilter);
  const invoiceTotal = cardTx.reduce((s, t) => s + Number(t.amount), 0);

  const byPayer = allCardTx.reduce<Record<string, number>>((acc, t) => {
    const k = t.payer_name?.trim() || "Eu";
    acc[k] = (acc[k] || 0) + Number(t.amount);
    return acc;
  }, {});
  const payersList = Object.entries(byPayer).sort((a, b) => b[1] - a[1]);

  const delCard = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("credit_cards").update({ archived: true }).eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cartoes"] }); toast.success("Cartão arquivado"); },
  });

  const delTx = useMutation({
    mutationFn: async ({ tx, scope }: { tx: CTx; scope: "single" | "series_future" | "series_all" }) => {
      if (scope === "single") {
        // parcelamento: remove o grupo de parcelas. assinatura: remove só esta ocorrência
        if (tx.installment_total > 1) {
          const { error } = await supabase.from("card_transactions").delete().eq("group_id", tx.group_id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("card_transactions").delete().eq("id", tx.id);
          if (error) throw error;
        }
      } else if (scope === "series_future" && tx.recurrence_group_id) {
        const { error } = await supabase.from("card_transactions").delete()
          .eq("recurrence_group_id", tx.recurrence_group_id)
          .gte("invoice_month", tx.invoice_month);
        if (error) throw error;
      } else if (scope === "series_all" && tx.recurrence_group_id) {
        const { error } = await supabase.from("card_transactions").delete()
          .eq("recurrence_group_id", tx.recurrence_group_id);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cartoes"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success("Removido"); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleDelete = (t: CTx) => {
    if (t.recurrence_group_id && (t.recurrence === "monthly" || t.recurrence === "yearly")) {
      const choice = prompt("Remover assinatura?\n1 = somente esta ocorrência\n2 = esta e futuras\n3 = todas (passadas e futuras)", "2");
      if (!choice) return;
      if (choice === "1") delTx.mutate({ tx: t, scope: "single" });
      else if (choice === "2") delTx.mutate({ tx: t, scope: "series_future" });
      else if (choice === "3") delTx.mutate({ tx: t, scope: "series_all" });
    } else {
      if (confirm("Remover esta compra" + (t.installment_total > 1 ? " (e parcelas futuras)" : "") + "?"))
        delTx.mutate({ tx: t, scope: "single" });
    }
  };

  return (
    <div>
      <Header title="Cartões de crédito">
        <button onClick={() => { setEditTx(null); setShowTx(true); }} disabled={!cards.length} className="btn-secondary"><Plus className="h-4 w-4" /> Lançar compra</button>
        <button onClick={() => { setEditCard(null); setShowCard(true); }} className="btn-primary"><Plus className="h-4 w-4" /> Novo cartão</button>
      </Header>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const monthSpend = tx.filter((t) => t.card_id === c.id && t.invoice_month === ymRef).reduce((s, t) => s + Number(t.amount), 0);
          const used = tx.filter((t) => t.card_id === c.id && t.invoice_month >= ymRef).reduce((s, t) => s + Number(t.amount), 0);
          const usedPct = Math.min(100, (used / Math.max(Number(c.credit_limit), 1)) * 100);
          const active = activeCard === c.id;
          return (
            <div key={c.id} onClick={() => setSelectedCard(c.id)} role="button" tabIndex={0}
              className={`cursor-pointer text-left rounded-2xl border p-5 transition ${active ? "border-primary/60 bg-primary/5" : "border-border bg-card"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{c.name}</h3>
                  <p className="text-xs text-muted-foreground">{c.brand || "—"} · fech. {c.closing_day} · venc. {c.due_day}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); setEditCard(c); setShowCard(true); }} className="text-muted-foreground hover:text-primary"><Pencil className="h-4 w-4" /></button>
                  <button onClick={(e) => { e.stopPropagation(); if (confirm("Arquivar cartão?")) delCard.mutate(c.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
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
            </div>
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

          {payersList.length > 0 && (
            <div className="border-b border-border bg-secondary/30 px-5 py-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground">Divisão por responsável</div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Filtrar:</label>
                  <select value={payerFilter} onChange={(e) => setPayerFilter(e.target.value)} className="input h-8 py-0 text-xs">
                    <option value="all">Todos</option>
                    {payersList.map(([name]) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {payersList.map(([name, val]) => (
                  <button
                    key={name}
                    onClick={() => setPayerFilter(payerFilter === name ? "all" : name)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${payerFilter === name ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"}`}>
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{name}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="tabular-nums">{brl(val)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {cardTx.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma compra nesta fatura.</div>
          ) : (
            <ul className="divide-y divide-border">
              {cardTx.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {t.description || "Compra"}
                      {t.installment_total > 1 && <span className="text-xs text-muted-foreground">({t.installment_no}/{t.installment_total})</span>}
                      {t.recurrence && t.recurrence !== "none" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                          <Repeat className="h-3 w-3" /> {t.recurrence === "monthly" ? "Mensal" : "Anual"}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{fmtDate(t.purchased_on)} · {t.payer_name?.trim() || "Eu"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">{brl(t.amount)}</span>
                    <button onClick={() => { setEditTx(t); setShowTx(true); }} className="text-muted-foreground hover:text-primary"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(t)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showCard && <CardDialog onClose={() => { setShowCard(false); setEditCard(null); }} userId={user!.id} editing={editCard} />}
      {showTx && <CardTxDialog cards={cards} onClose={() => { setShowTx(false); setEditTx(null); }} userId={user!.id} editing={editTx} />}
    </div>
  );
}

function CardDialog({ onClose, userId, editing }: { onClose: () => void; userId: string; editing: Card | null }) {
  const qc = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [brand, setBrand] = useState(editing?.brand ?? "");
  const [limit, setLimit] = useState(String(editing?.credit_limit ?? ""));
  const [closing, setClosing] = useState(String(editing?.closing_day ?? "1"));
  const [due, setDue] = useState(String(editing?.due_day ?? "10"));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: userId, name, brand: brand || null, credit_limit: Number(limit) || 0,
        closing_day: Math.max(1, Math.min(31, Number(closing))), due_day: Math.max(1, Math.min(31, Number(due))),
      };
      const q = editing ? supabase.from("credit_cards").update(payload).eq("id", editing.id) : supabase.from("credit_cards").insert(payload);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cartoes"] }); toast.success(editing ? "Cartão atualizado" : "Cartão criado"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog title={editing ? "Editar cartão" : "Novo cartão"} onClose={onClose}>
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

function CardTxDialog({ cards, onClose, userId, editing }: { cards: Card[]; onClose: () => void; userId: string; editing: CTx | null }) {
  const qc = useQueryClient();
  const [cardId, setCardId] = useState(editing?.card_id ?? cards[0]?.id ?? "");
  const [amount, setAmount] = useState(editing ? String(Number(editing.amount) * Number(editing.installment_total)) : "");
  const [desc, setDesc] = useState(editing?.description ?? "");
  const [date, setDate] = useState(editing?.purchased_on ?? new Date().toISOString().slice(0, 10));
  const [installments, setInstallments] = useState(String(editing?.installment_total ?? "1"));
  const [payer, setPayer] = useState(editing?.payer_name ?? "Eu");

  const isSub = editing?.recurrence && editing.recurrence !== "none";
  const [isSubscription, setIsSubscription] = useState<boolean>(!!isSub);
  const [recurrence, setRecurrence] = useState<"monthly" | "yearly">((editing?.recurrence as any) === "yearly" ? "yearly" : "monthly");
  const [repeatCount, setRepeatCount] = useState("12");
  const [applyToFuture, setApplyToFuture] = useState(true);

  const save = useMutation({
    mutationFn: async () => {
      const card = cards.find((c) => c.id === cardId)!;
      const totalAmount = Number(amount);

      // Edição de assinatura
      if (editing && isSub) {
        const payload: any = {
          card_id: cardId, amount: totalAmount, description: desc || null,
          payer_name: payer.trim() || null, purchased_on: date,
        };
        if (applyToFuture && editing.recurrence_group_id) {
          const { error } = await supabase.from("card_transactions").update(payload)
            .eq("recurrence_group_id", editing.recurrence_group_id)
            .gte("invoice_month", editing.invoice_month);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("card_transactions").update(payload).eq("id", editing.id);
          if (error) throw error;
        }
        return;
      }

      // Edição de compra normal/parcelada: apaga grupo e recria
      if (editing) {
        const { error: delErr } = await supabase.from("card_transactions").delete().eq("group_id", editing.group_id);
        if (delErr) throw delErr;
      }

      // Criação (ou recriação) de assinatura
      if (isSubscription) {
        const count = Math.max(1, Number(repeatCount));
        const step = recurrence === "monthly" ? 1 : 12;
        const firstInvoice = invoiceMonth(date, card.closing_day, card.due_day);
        const recurrence_group_id = crypto.randomUUID();
        const rows = Array.from({ length: count }, (_, i) => ({
          user_id: userId, card_id: cardId, group_id: crypto.randomUUID(),
          amount: totalAmount, description: desc || null,
          purchased_on: date, installment_no: 1, installment_total: 1,
          invoice_month: addMonths(firstInvoice, i * step),
          payer_name: payer.trim() || null,
          recurrence, recurrence_group_id,
        }));
        const { error } = await supabase.from("card_transactions").insert(rows);
        if (error) throw error;
        return;
      }

      // Criação de compra (à vista ou parcelada)
      const total = Math.max(1, Number(installments));
      const parcel = +(totalAmount / total).toFixed(2);
      const firstInvoice = invoiceMonth(date, card.closing_day, card.due_day);
      const group_id = crypto.randomUUID();
      const rows = Array.from({ length: total }, (_, i) => ({
        user_id: userId, card_id: cardId, group_id,
        amount: parcel, description: desc || null,
        purchased_on: date,
        installment_no: i + 1, installment_total: total,
        invoice_month: addMonths(firstInvoice, i),
        payer_name: payer.trim() || null,
        recurrence: "none",
      }));
      const { error } = await supabase.from("card_transactions").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cartoes"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success(editing ? "Compra atualizada" : "Compra registrada"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog title={editing ? "Editar compra" : "Nova compra no cartão"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <Field label="Cartão">
          <select required value={cardId} onChange={(e) => setCardId(e.target.value)} className="input">
            {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Responsável pela compra">
          <input value={payer} onChange={(e) => setPayer(e.target.value)} className="input" placeholder="Ex: Eu, João, Maria" />
        </Field>
        <Field label={isSubscription ? "Valor por cobrança (R$)" : "Valor total (R$)"}>
          <input type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
        </Field>
        <Field label="Descrição"><input value={desc} onChange={(e) => setDesc(e.target.value)} className="input" placeholder="Ex: Netflix" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data da compra"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="input" /></Field>
          {!isSubscription && (
            <Field label="Parcelas"><input type="number" min={1} max={36} required value={installments} onChange={(e) => setInstallments(e.target.value)} className="input" /></Field>
          )}
        </div>

        {!editing && (
          <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isSubscription} onChange={(e) => setIsSubscription(e.target.checked)} />
              <Repeat className="h-3.5 w-3.5" /> É uma assinatura recorrente
            </label>
            {isSubscription && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Field label="Periodicidade">
                  <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as any)} className="input">
                    <option value="monthly">Mensal</option>
                    <option value="yearly">Anual</option>
                  </select>
                </Field>
                <Field label={recurrence === "monthly" ? "Repetir por (meses)" : "Repetir por (anos)"}>
                  <input type="number" min={1} max={120} value={repeatCount} onChange={(e) => setRepeatCount(e.target.value)} className="input" />
                </Field>
              </div>
            )}
          </div>
        )}

        {editing && isSub && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={applyToFuture} onChange={(e) => setApplyToFuture(e.target.checked)} />
            Aplicar a esta e às futuras ocorrências da assinatura
          </label>
        )}

        <button disabled={save.isPending} className="btn-primary w-full justify-center">{save.isPending ? "Salvando..." : "Salvar"}</button>
      </form>
    </Dialog>
  );
}
