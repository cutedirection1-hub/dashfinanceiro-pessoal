import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brl, monthLabel, maskBrl } from "@/lib/format";
import { CreditCard, Wallet, TrendingUp, Receipt, ChevronLeft, ChevronRight, User } from "lucide-react";
import { useHiddenValues, HideValuesToggle } from "@/hooks/use-hidden-values";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const [monthOffset, setMonthOffset] = useState(0);
  const [activeChart, setActiveChart] = useState<"patrimonio" | "gasto" | "investimentos">("patrimonio");
  const { hidden } = useHiddenValues();
  const m = (v: number | string | null | undefined) => maskBrl(v, hidden);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [accounts, accTx, cards, cardTx, inv, contrib] = await Promise.all([
        supabase.from("accounts").select("*").eq("archived", false),
        supabase.from("account_transactions").select("*"),
        supabase.from("credit_cards").select("*").eq("archived", false),
        supabase.from("card_transactions").select("*"),
        supabase.from("investments").select("*"),
        supabase.from("investment_contributions").select("*"),
      ]);
      return {
        accounts: accounts.data ?? [],
        accTx: accTx.data ?? [],
        cards: cards.data ?? [],
        cardTx: cardTx.data ?? [],
        inv: inv.data ?? [],
        contrib: contrib.data ?? [],
      };
    },
  });

  const ref = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() + monthOffset);
    const y = d.getFullYear(), m = d.getMonth();
    return {
      ym: `${y}-${String(m + 1).padStart(2, "0")}-01`,
      start: new Date(y, m, 1).toISOString().slice(0, 10),
      end: new Date(y, m + 1, 0).toISOString().slice(0, 10),
      isCurrent: monthOffset === 0,
    };
  }, [monthOffset]);

  if (isLoading || !data) return <div className="text-muted-foreground">Carregando...</div>;

  // Saldo em conta: "atual" se mês corrente, senão saldo no fim daquele mês
  const cutoff = ref.isCurrent ? null : ref.end;
  const accBalance = data.accounts.reduce((acc, a) => {
    const txSum = data.accTx
      .filter((t) => t.account_id === a.id && (!cutoff || t.occurred_on <= cutoff))
      .reduce((s, t) => s + (t.kind === "income" ? Number(t.amount) : -Number(t.amount)), 0);
    return acc + Number(a.initial_balance) + txSum;
  }, 0);

  const invoiceTx = data.cardTx.filter((t) => t.invoice_month === ref.ym);
  const openInvoice = invoiceTx.reduce((s, t) => s + Number(t.amount), 0);

  const monthSpend = data.accTx
    .filter((t) => t.occurred_on >= ref.start && t.occurred_on <= ref.end && t.kind === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);

  const investTotal = data.inv.reduce((s, i) => s + Number(i.quantity) * Number(i.current_price || i.average_price), 0);
  const patrimonio = accBalance + investTotal - openInvoice;

  // Divisão por responsável da fatura do mês selecionado
  const byPayer = invoiceTx.reduce<Record<string, number>>((acc, t) => {
    const k = (t.payer_name as string | null)?.trim() || "Eu";
    acc[k] = (acc[k] || 0) + Number(t.amount);
    return acc;
  }, {});
  const payerEntries = Object.entries(byPayer).sort((a, b) => b[1] - a[1]);
  const owedByOthers = payerEntries.filter(([k]) => k.toLowerCase() !== "eu").reduce((s, [, v]) => s + v, 0);

  // Evolução: últimos 6 meses a partir do mês selecionado
  const chart: { mes: string; gasto: number; patrimonio: number; investimentos: number }[] = [];
  void investTotal;
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() + monthOffset - i);
    const s = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
    const e = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    const accs = data.accTx.filter((t) => t.occurred_on >= s && t.occurred_on <= e && t.kind === "expense").reduce((s, t) => s + Number(t.amount), 0);
    const im = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const cards = data.cardTx.filter((t) => t.invoice_month === im).reduce((s, t) => s + Number(t.amount), 0);

    // Patrimônio no fim do mês: saldo das contas (com tx até o fim) + investimentos atuais - fatura em aberto
    const accBalAtEnd = data.accounts.reduce((acc, a) => {
      const txSum = data.accTx
        .filter((t) => t.account_id === a.id && t.occurred_on <= e)
        .reduce((s, t) => s + (t.kind === "income" ? Number(t.amount) : -Number(t.amount)), 0);
      return acc + Number(a.initial_balance) + txSum;
    }, 0);

    // Reconstrução do valor investido no fim do mês a partir dos aportes/resgates
    const investAtEnd = data.inv.reduce((tot, asset) => {
      const cs = data.contrib.filter((c: any) => c.investment_id === asset.id && c.occurred_on <= e);
      let qty = 0;
      let amountNet = 0; // soma líquida (aporte - resgate)
      for (const c of cs) {
        const sign = c.kind === "resgate" ? -1 : 1;
        amountNet += sign * Number(c.amount || 0);
        if (c.quantity != null) qty += sign * Number(c.quantity);
      }
      const price = Number(asset.current_price || asset.average_price || 0);
      // Se há quantidade rastreada (ações/variável), usar qty * preço atual; senão, usar valor líquido aportado
      const val = qty > 0 ? qty * price : Math.max(0, amountNet);
      return tot + val;
    }, 0);

    const patAtEnd = accBalAtEnd + investAtEnd - cards;

    chart.push({
      mes: d.toLocaleDateString("pt-BR", { month: "short" }),
      gasto: accs + cards,
      patrimonio: patAtEnd,
      investimentos: investAtEnd,
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Visão geral</h1>
          <p className="mt-1 text-sm text-muted-foreground capitalize">{monthLabel(ref.ym)}{ref.isCurrent && " (atual)"}</p>
        </div>
        <div className="flex items-center gap-2">
          <HideValuesToggle />
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            <button onClick={() => setMonthOffset(monthOffset - 1)} className="rounded-md p-1.5 hover:bg-accent"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setMonthOffset(0)} className="rounded-md px-3 py-1 text-xs hover:bg-accent">Hoje</button>
            <button onClick={() => setMonthOffset(monthOffset + 1)} className="rounded-md p-1.5 hover:bg-accent"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={TrendingUp} label="Patrimônio" value={m(patrimonio)} accent />
        <Kpi icon={Wallet} label={ref.isCurrent ? "Saldo em contas" : "Saldo no fim do mês"} value={m(accBalance)} />
        <Kpi icon={CreditCard} label="Fatura do mês" value={m(openInvoice)} />
        <Kpi icon={Receipt} label="Gastos do mês" value={m(monthSpend)} />
      </div>

      {payerEntries.length > 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Divisão da fatura</h2>
            {owedByOthers > 0 && <span className="text-sm text-muted-foreground">A receber: <span className="font-semibold text-primary">{m(owedByOthers)}</span></span>}
          </div>
          <p className="text-xs text-muted-foreground">Quanto cada responsável gastou no cartão neste mês</p>
          <div className="mt-4 space-y-2">
            {payerEntries.map(([name, val]) => {
              const pct = (val / Math.max(openInvoice, 1)) * 100;
              const isMe = name.toLowerCase() === "eu";
              return (
                <div key={name}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground"><User className="h-3 w-3" />{name}{!isMe && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">a receber</span>}</span>
                    <span className="tabular-nums">{m(val)} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div className={`h-full ${isMe ? "bg-primary" : "bg-accent-foreground/60"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <select value={activeChart} onChange={(e) => setActiveChart(e.target.value as any)} className="input py-0 h-8 text-sm w-auto font-semibold bg-secondary/50">
                <option value="patrimonio">Evolução do patrimônio</option>
                <option value="gasto">Evolução de gastos</option>
                <option value="investimentos">Evolução dos investimentos</option>
              </select>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {activeChart === "patrimonio" && `6 meses até ${monthLabel(ref.ym)} (contas + investimentos − fatura)`}
              {activeChart === "gasto" && `6 meses até ${monthLabel(ref.ym)} (contas + cartões)`}
              {activeChart === "investimentos" && `6 meses até ${monthLabel(ref.ym)} (posição reconstruída por aportes e resgates)`}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            <button onClick={() => {
              const ids = ["patrimonio", "gasto", "investimentos"] as const;
              setActiveChart(ids[(ids.indexOf(activeChart) - 1 + ids.length) % ids.length]);
            }} className="rounded-md p-1 hover:bg-accent"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => {
              const ids = ["patrimonio", "gasto", "investimentos"] as const;
              setActiveChart(ids[(ids.indexOf(activeChart) + 1) % ids.length]);
            }} className="rounded-md p-1 hover:bg-accent"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="mt-4 h-64">
          <ResponsiveContainer>
            <LineChart data={chart}>
              <CartesianGrid stroke="oklch(0.28 0.03 265)" strokeDasharray="3 3" />
              <XAxis dataKey="mes" stroke="oklch(0.68 0.02 260)" fontSize={12} />
              <YAxis stroke="oklch(0.68 0.02 260)" fontSize={12} tickFormatter={(v) => m(v).replace("R$", "")} width={80} />
              <Tooltip
                contentStyle={{ background: "oklch(0.21 0.025 265)", border: "1px solid oklch(0.28 0.03 265)", borderRadius: 8 }}
                formatter={(v: number) => m(v)}
              />
              {activeChart === "patrimonio" && <Line type="monotone" dataKey="patrimonio" stroke="oklch(0.72 0.18 265)" strokeWidth={2.5} dot={{ r: 4 }} />}
              {activeChart === "gasto" && <Line type="monotone" dataKey="gasto" stroke="oklch(0.78 0.18 155)" strokeWidth={2.5} dot={{ r: 4 }} />}
              {activeChart === "investimentos" && <Line type="monotone" dataKey="investimentos" stroke="oklch(0.75 0.16 50)" strokeWidth={2.5} dot={{ r: 4 }} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
