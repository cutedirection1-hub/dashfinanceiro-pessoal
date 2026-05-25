import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { brl, fmtDate, invoiceMonth, invoiceDueDate, addMonths, monthLabel } from "@/lib/format";
import { parseCSV, parseDateBR, parseMoney } from "@/lib/csv";
import { toast } from "sonner";
import { Plus, Trash2, ChevronLeft, ChevronRight, Pencil, User, Repeat, Eye, ArchiveRestore, Upload, RefreshCw, Info, Tag } from "lucide-react";
import { Header, Dialog, Field, EmptyState } from "./contas";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip } from "recharts";

export const Route = createFileRoute("/_authenticated/cartoes")({ component: CartoesPage });

type Card = { id: string; name: string; brand: string | null; credit_limit: number; closing_day: number; due_day: number };
type Category = { id: string; name: string; color: string; kind: string; icon: string | null };
type CTx = {
  id: string; card_id: string; group_id: string; amount: number; description: string | null;
  purchased_on: string; installment_no: number; installment_total: number; invoice_month: string;
  payer_name: string | null; recurrence?: string | null; recurrence_group_id?: string | null;
  category_id?: string | null;
};

const DEFAULT_CATEGORIES: { name: string; color: string }[] = [
  { name: "Alimentação", color: "#ef4444" }, { name: "Assinaturas", color: "#8b5cf6" },
  { name: "Casa", color: "#f59e0b" }, { name: "Educação", color: "#3b82f6" },
  { name: "Lazer", color: "#ec4899" }, { name: "Objetivos", color: "#10b981" },
  { name: "Pet", color: "#a855f7" }, { name: "Saúde", color: "#06b6d4" },
  { name: "Selfcare", color: "#f472b6" }, { name: "Transporte", color: "#0ea5e9" },
  { name: "Vestuário", color: "#d946ef" }, { name: "Viagem", color: "#14b8a6" },
  { name: "Taxas", color: "#64748b" }, { name: "Outros - Pessoais", color: "#94a3b8" },
  { name: "Outros", color: "#6b7280" },
];
const COLOR_PRESETS = ["#ef4444","#f59e0b","#eab308","#10b981","#14b8a6","#06b6d4","#0ea5e9","#3b82f6","#6366f1","#8b5cf6","#a855f7","#d946ef","#ec4899","#f472b6","#64748b","#6b7280"];

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
  const [showArchived, setShowArchived] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deletePermCard, setDeletePermCard] = useState<Card | null>(null);

  const { data } = useQuery({
    queryKey: ["cartoes", showArchived],
    queryFn: async () => {
      const [c, t] = await Promise.all([
        supabase.from("credit_cards").select("*").eq("archived", showArchived).order("created_at"),
        supabase.from("card_transactions").select("*").order("purchased_on", { ascending: false }),
      ]);
      return { cards: (c.data ?? []) as Card[], tx: (t.data ?? []) as CTx[] };
    },
  });

  const [showCats, setShowCats] = useState(false);

  const { data: cats } = useQuery({
    queryKey: ["categories", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").eq("kind", "expense").order("name");
      return (data ?? []) as Category[];
    },
  });
  const categories = cats ?? [];
  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);

  // Seed default categories once per user when none exist
  useEffect(() => {
    if (!user?.id || cats === undefined) return;
    if (categories.length > 0) return;
    const flag = `categories-seeded:${user.id}`;
    if (localStorage.getItem(flag)) return;
    localStorage.setItem(flag, "1");
    (async () => {
      const payload = DEFAULT_CATEGORIES.map((c) => ({ user_id: user.id, name: c.name, color: c.color, kind: "expense" }));
      const { error } = await supabase.from("categories").insert(payload);
      if (!error) qc.invalidateQueries({ queryKey: ["categories", user.id] });
    })();
  }, [user?.id, cats, categories.length, qc]);

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
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from("credit_cards").update({ archived }).eq("id", id); if (error) throw error;
    },
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ["cartoes"] }); toast.success(v.archived ? "Cartão arquivado" : "Cartão restaurado"); },
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

  const deletePerm = useMutation({
    mutationFn: async (card: Card) => {
      const { error: e1 } = await supabase.from("card_transactions").delete().eq("card_id", card.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("credit_cards").delete().eq("id", card.id);
      if (e2) throw e2;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cartoes"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success("Cartão excluído"); setDeletePermCard(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const recalcInvoices = useMutation({
    mutationFn: async () => {
      // Para cada cartão, recalcula invoice_month das transações sem recorrência (assinaturas seguem cronograma próprio)
      const { data: allTx, error } = await supabase.from("card_transactions").select("*");
      if (error) throw error;
      let updated = 0;
      for (const t of (allTx ?? []) as CTx[]) {
        if (t.recurrence && t.recurrence !== "none") continue;
        const card = cards.find((c) => c.id === t.card_id);
        if (!card) continue;
        const firstInvoice = invoiceMonth(t.purchased_on, card.closing_day, card.due_day);
        const expected = addMonths(firstInvoice, (t.installment_no || 1) - 1);
        if (expected !== t.invoice_month) {
          const { error: uErr } = await supabase.from("card_transactions").update({ invoice_month: expected }).eq("id", t.id);
          if (uErr) throw uErr;
          updated++;
        }
      }
      return updated;
    },
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: ["cartoes"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); if (n > 0) toast.success(`${n} lançamento(s) recalculado(s)`); },
    onError: (e: any) => toast.error(e.message),
  });

  // Recalcula uma única vez por usuário após a mudança da regra de fatura (v3).
  useEffect(() => {
    if (!cards.length || !tx.length) return;
    const flag = `invoice-rule-v3-applied:${user?.id}`;
    if (localStorage.getItem(flag)) return;
    localStorage.setItem(flag, "1");
    recalcInvoices.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length, tx.length, user?.id]);

  return (
    <div>
      <Header title="Cartões de crédito">
        <button onClick={() => setShowArchived((v) => !v)} className="btn-secondary"><Eye className="h-4 w-4" /> {showArchived ? "Ver ativos" : "Ver arquivados"}</button>
        <button onClick={() => setShowCats(true)} className="btn-secondary"><Tag className="h-4 w-4" /> Categorias</button>
        <button onClick={() => recalcInvoices.mutate()} disabled={recalcInvoices.isPending || !cards.length} className="btn-secondary" title="Recalcular fatura de todas as compras com a regra atual"><RefreshCw className="h-4 w-4" /> Recalcular faturas</button>
        <button onClick={() => setShowImport(true)} disabled={!cards.length} className="btn-secondary"><Upload className="h-4 w-4" /> Importar CSV</button>
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
                  {showArchived ? (
                    <>
                      <button title="Restaurar" onClick={(e) => { e.stopPropagation(); delCard.mutate({ id: c.id, archived: false }); }} className="text-muted-foreground hover:text-primary"><ArchiveRestore className="h-4 w-4" /></button>
                      <button title="Excluir permanentemente" onClick={(e) => { e.stopPropagation(); setDeletePermCard(c); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </>
                  ) : (
                    <button title="Arquivar" onClick={(e) => { e.stopPropagation(); if (confirm("Arquivar cartão?")) delCard.mutate({ id: c.id, archived: true }); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  )}
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
        {!cards.length && <EmptyState text={showArchived ? "Nenhum cartão arquivado." : "Cadastre seu primeiro cartão para começar."} />}
      </div>

      {activeCard && (
        <div className="mt-8 rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold">Fatura — {monthLabel(ymRef)}</h2>
              <p className="text-xs text-muted-foreground">
                Total: {brl(invoiceTotal)}
                {cards.find((c) => c.id === activeCard) && (
                  <> · Vence em {fmtDate(invoiceDueDate(ymRef, cards.find((c) => c.id === activeCard)!.due_day))}</>
                )}
              </p>
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

          {cardTx.length > 0 && (() => {
            const byCat = cardTx.reduce<Record<string, number>>((acc, t) => {
              const k = t.category_id || "__none__";
              acc[k] = (acc[k] || 0) + Number(t.amount);
              return acc;
            }, {});
            const pieData = Object.entries(byCat)
              .map(([id, val]) => {
                const c = id === "__none__" ? null : catMap[id];
                return { name: c?.name || "Sem categoria", value: val, color: c?.color || "#475569" };
              })
              .sort((a, b) => b.value - a.value);
            return (
              <div className="border-b border-border px-5 py-4">
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">Gastos por categoria</h3>
                <div className="grid items-center gap-4 md:grid-cols-2">
                  <div className="h-56">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={88} paddingAngle={2}>
                          {pieData.map((d, i) => <Cell key={i} fill={d.color} stroke="transparent" />)}
                        </Pie>
                        <RTooltip contentStyle={{ background: "oklch(0.21 0.025 265)", border: "1px solid oklch(0.28 0.03 265)", borderRadius: 8 }} formatter={(v: number) => brl(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="space-y-1.5 text-sm">
                    {pieData.map((d) => {
                      const pct = (d.value / Math.max(invoiceTotal, 1)) * 100;
                      return (
                        <li key={d.name} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 truncate"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} /> {d.name}</span>
                          <span className="tabular-nums text-muted-foreground">{brl(d.value)} · {pct.toFixed(0)}%</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          })()}

          {cardTx.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma compra nesta fatura.</div>
          ) : (
            <ul className="divide-y divide-border">
              {cardTx.map((t) => {
                const cat = t.category_id ? catMap[t.category_id] : null;
                return (
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
                      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground" style={cat ? { borderColor: cat.color + "66", color: cat.color } : undefined}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: cat?.color || "#64748b" }} />
                        {cat?.name || "Sem categoria"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{fmtDate(t.purchased_on)} · {t.payer_name?.trim() || "Eu"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">{brl(t.amount)}</span>
                    <button onClick={() => { setEditTx(t); setShowTx(true); }} className="text-muted-foreground hover:text-primary"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(t)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              );})}
            </ul>
          )}
        </div>
      )}

      {showCard && <CardDialog onClose={() => { setShowCard(false); setEditCard(null); }} userId={user!.id} editing={editCard} />}
      {showTx && <CardTxDialog cards={cards} onClose={() => { setShowTx(false); setEditTx(null); }} userId={user!.id} editing={editTx} />}
      {showImport && <ImportCsvDialog allCards={cards} onClose={() => setShowImport(false)} userId={user!.id} />}
      {deletePermCard && (
        <DeletePermDialog
          card={deletePermCard}
          txCount={tx.filter((t) => t.card_id === deletePermCard.id).length}
          txTotal={tx.filter((t) => t.card_id === deletePermCard.id).reduce((s, t) => s + Number(t.amount), 0)}
          onClose={() => setDeletePermCard(null)}
          onConfirm={() => deletePerm.mutate(deletePermCard)}
          pending={deletePerm.isPending}
        />
      )}
    </div>
  );
}

function DeletePermDialog({ card, txCount, txTotal, onClose, onConfirm, pending }: { card: Card; txCount: number; txTotal: number; onClose: () => void; onConfirm: () => void; pending: boolean }) {
  return (
    <Dialog title="Excluir cartão permanentemente" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p>Você está prestes a excluir <span className="font-semibold">{card.name}</span>.</p>
        {txCount > 0 ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">
            ⚠️ Este cartão possui <span className="font-semibold">{txCount}</span> lançamento(s) no histórico de faturas, totalizando <span className="font-semibold">{brl(txTotal)}</span>.
            <div className="mt-1 text-xs">Todas essas compras serão excluídas permanentemente e não aparecerão mais em nenhum relatório.</div>
          </div>
        ) : (
          <p className="text-muted-foreground">Nenhuma compra vinculada — exclusão é segura.</p>
        )}
        <p className="text-xs text-muted-foreground">Esta ação não pode ser desfeita.</p>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button type="button" onClick={onConfirm} disabled={pending} className="btn-primary flex-1 justify-center bg-destructive hover:bg-destructive/90">{pending ? "Excluindo..." : "Excluir tudo"}</button>
        </div>
      </div>
    </Dialog>
  );
}

function ImportCsvDialog({ allCards, onClose, userId }: { allCards: Card[]; onClose: () => void; userId: string }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"upload" | "map">("upload");
  const [cardId, setCardId] = useState(allCards[0]?.id ?? "");
  const [defaultPayer, setDefaultPayer] = useState("Eu");
  const [rows, setRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dateCol, setDateCol] = useState<number>(-1);
  const [descCol, setDescCol] = useState<number>(-1);
  const [amtCol, setAmtCol] = useState<number>(-1);
  const [payerCol, setPayerCol] = useState<number>(-1);
  const [invertSign, setInvertSign] = useState(false);

  const onFile = async (f: File) => {
    const text = await f.text();
    const all = parseCSV(text);
    if (!all.length) { toast.error("CSV vazio"); return; }
    const head = all[0].map((h) => h.trim());
    setHeaders(head);
    setRows(all.slice(1));
    // auto-detectar colunas
    const find = (kw: string[]) => head.findIndex((h) => kw.some((k) => h.toLowerCase().includes(k)));
    setDateCol(find(["data", "date"]));
    setDescCol(find(["desc", "histor", "estabel", "merchant", "lançamento", "lancamento"]));
    setAmtCol(find(["valor", "amount", "montante", "r$"]));
    setPayerCol(find(["resp", "titular", "portador"]));
    setStep("map");
  };

  const card = allCards.find((c) => c.id === cardId);
  const preview = useMemo(() => {
    if (!card || dateCol < 0 || amtCol < 0) return [];
    return rows.slice(0, 10).map((r) => {
      const date = parseDateBR(r[dateCol] || "");
      let amt = parseMoney(r[amtCol] || "");
      if (amt != null && invertSign) amt = -amt;
      return {
        date, desc: r[descCol] || "", amount: amt,
        payer: payerCol >= 0 ? (r[payerCol] || defaultPayer) : defaultPayer,
        invoice: date ? invoiceMonth(date, card.closing_day, card.due_day) : null,
      };
    });
  }, [rows, card, dateCol, descCol, amtCol, payerCol, defaultPayer, invertSign]);

  const importAll = useMutation({
    mutationFn: async () => {
      if (!card) throw new Error("Selecione um cartão");
      if (dateCol < 0 || amtCol < 0) throw new Error("Mapeie ao menos Data e Valor");
      const payload: any[] = [];
      let skipped = 0;
      for (const r of rows) {
        const date = parseDateBR(r[dateCol] || "");
        let amt = parseMoney(r[amtCol] || "");
        if (!date || amt == null || amt === 0) { skipped++; continue; }
        if (invertSign) amt = -amt;
        // só compras positivas; estornos (negativos) viram lançamentos negativos (são considerados na fatura)
        payload.push({
          user_id: userId, card_id: card.id, group_id: crypto.randomUUID(),
          amount: amt, description: (r[descCol] || "Importado").slice(0, 200),
          purchased_on: date, installment_no: 1, installment_total: 1,
          invoice_month: invoiceMonth(date, card.closing_day, card.due_day),
          payer_name: (payerCol >= 0 ? r[payerCol] : defaultPayer)?.trim() || null,
          recurrence: "none",
        });
      }
      if (!payload.length) throw new Error("Nenhuma linha válida encontrada");
      // insert em lotes de 200
      for (let i = 0; i < payload.length; i += 200) {
        const { error } = await supabase.from("card_transactions").insert(payload.slice(i, i + 200));
        if (error) throw error;
      }
      return { imported: payload.length, skipped };
    },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["cartoes"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success(`${r.imported} importado(s)${r.skipped ? `, ${r.skipped} ignorado(s)` : ""}`); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog title="Importar compras de CSV" onClose={onClose}>
      {step === "upload" ? (
        <div className="space-y-3">
          <Field label="Cartão de destino">
            <select value={cardId} onChange={(e) => setCardId(e.target.value)} className="input">
              {allCards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Responsável padrão">
            <input value={defaultPayer} onChange={(e) => setDefaultPayer(e.target.value)} className="input" />
          </Field>
          <Field label="Arquivo CSV">
            <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="input" />
          </Field>
          <p className="text-xs text-muted-foreground">Suporta colunas separadas por vírgula ou ponto-e-vírgula, datas em dd/mm/aaaa ou aaaa-mm-dd, valores no formato brasileiro (R$ 1.234,56) ou ponto.</p>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Coluna Data">
              <select value={dateCol} onChange={(e) => setDateCol(Number(e.target.value))} className="input">
                <option value={-1}>—</option>
                {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </Field>
            <Field label="Coluna Valor">
              <select value={amtCol} onChange={(e) => setAmtCol(Number(e.target.value))} className="input">
                <option value={-1}>—</option>
                {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </Field>
            <Field label="Coluna Descrição">
              <select value={descCol} onChange={(e) => setDescCol(Number(e.target.value))} className="input">
                <option value={-1}>—</option>
                {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </Field>
            <Field label="Coluna Responsável (opcional)">
              <select value={payerCol} onChange={(e) => setPayerCol(Number(e.target.value))} className="input">
                <option value={-1}>—</option>
                {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={invertSign} onChange={(e) => setInvertSign(e.target.checked)} />
            Inverter sinal (use se seu CSV traz despesas como negativas)
          </label>
          <div className="rounded-lg border border-border bg-secondary/30 p-2">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Pré-visualização ({Math.min(10, rows.length)} de {rows.length})</div>
            <div className="max-h-48 overflow-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground"><tr><th className="text-left p-1">Data</th><th className="text-left p-1">Descrição</th><th className="text-right p-1">Valor</th><th className="text-left p-1">Fatura</th></tr></thead>
                <tbody>
                  {preview.map((p, i) => (
                    <tr key={i} className={!p.date || p.amount == null ? "text-destructive" : ""}>
                      <td className="p-1">{p.date || "?"}</td>
                      <td className="p-1 truncate max-w-[140px]">{p.desc}</td>
                      <td className="p-1 text-right tabular-nums">{p.amount != null ? brl(p.amount) : "?"}</td>
                      <td className="p-1">{p.invoice ? monthLabel(p.invoice) : "?"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep("upload")} className="btn-secondary flex-1 justify-center">Voltar</button>
            <button type="button" onClick={() => importAll.mutate()} disabled={importAll.isPending || dateCol < 0 || amtCol < 0} className="btn-primary flex-1 justify-center">{importAll.isPending ? "Importando..." : `Importar ${rows.length} linha(s)`}</button>
          </div>
        </div>
      )}
    </Dialog>
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

        {(() => {
          const c = cards.find((x) => x.id === cardId);
          const a = Number(amount);
          if (!c || !date || !a) return null;
          const total = isSubscription ? 1 : Math.max(1, Number(installments) || 1);
          const parcel = +(a / total).toFixed(2);
          const first = invoiceMonth(date, c.closing_day, c.due_day);
          const due = invoiceDueDate(first, c.due_day);
          const purchasedDay = Number(date.slice(8, 10));
          const afterClose = purchasedDay > c.closing_day;
          return (
            <div className={`rounded-lg border p-3 text-xs space-y-1 ${afterClose ? "border-amber-500/40 bg-amber-500/10" : "border-primary/30 bg-primary/5"}`}>
              <div className="flex items-center gap-1.5 font-medium">
                <Info className="h-3.5 w-3.5" />
                {isSubscription ? "Primeira cobrança" : (total > 1 ? `Parcela 1/${total}` : "Esta compra")} entra na fatura de <span className="underline">{monthLabel(first)}</span> (vence {fmtDate(due)})
              </div>
              {afterClose && <div className="text-amber-700 dark:text-amber-400">⚠ Compra após o fechamento (dia {c.closing_day}) — cai na próxima fatura.</div>}
              {!isSubscription && total > 1 && (
                <div className="text-muted-foreground">
                  {total}× de {brl(parcel)} · última parcela: {monthLabel(addMonths(first, total - 1))}
                </div>
              )}
            </div>
          );
        })()}

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
