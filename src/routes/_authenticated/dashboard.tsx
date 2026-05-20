import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { CreditCard, Wallet, TrendingUp, Receipt } from "lucide-react";
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

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [accounts, accTx, cards, cardTx, inv] = await Promise.all([
        supabase.from("accounts").select("*").eq("archived", false),
        supabase.from("account_transactions").select("*"),
        supabase.from("credit_cards").select("*").eq("archived", false),
        supabase.from("card_transactions").select("*"),
        supabase.from("investments").select("*"),
      ]);
      return {
        accounts: accounts.data ?? [],
        accTx: accTx.data ?? [],
        cards: cards.data ?? [],
        cardTx: cardTx.data ?? [],
        inv: inv.data ?? [],
      };
    },
  });

  if (isLoading || !data) return <div className="text-muted-foreground">Carregando...</div>;

  const accBalance = data.accounts.reduce((acc, a) => {
    const txSum = data.accTx
      .filter((t) => t.account_id === a.id)
      .reduce((s, t) => s + (t.kind === "income" ? Number(t.amount) : -Number(t.amount)), 0);
    return acc + Number(a.initial_balance) + txSum;
  }, 0);

  const thisMonth = new Date();
  const ym = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const openInvoice = data.cardTx
    .filter((t) => t.invoice_month === ym)
    .reduce((s, t) => s + Number(t.amount), 0);

  const monthSpend = data.accTx
    .filter((t) => t.occurred_on >= startOfMonth() && t.occurred_on <= endOfMonth() && t.kind === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);

  const investTotal = data.inv.reduce((s, i) => s + Number(i.quantity) * Number(i.current_price || i.average_price), 0);
  const patrimonio = accBalance + investTotal - openInvoice;

  // Build last 6 months expense chart
  const chart: { mes: string; gasto: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const s = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
    const e = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    const accs = data.accTx.filter((t) => t.occurred_on >= s && t.occurred_on <= e && t.kind === "expense").reduce((s, t) => s + Number(t.amount), 0);
    const im = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const cards = data.cardTx.filter((t) => t.invoice_month === im).reduce((s, t) => s + Number(t.amount), 0);
    chart.push({ mes: d.toLocaleDateString("pt-BR", { month: "short" }), gasto: accs + cards });
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold">Visão geral</h1>
      <p className="mt-1 text-sm text-muted-foreground">Seu panorama financeiro de hoje.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={TrendingUp} label="Patrimônio" value={brl(patrimonio)} accent />
        <Kpi icon={Wallet} label="Saldo em contas" value={brl(accBalance)} />
        <Kpi icon={CreditCard} label="Fatura aberta" value={brl(openInvoice)} />
        <Kpi icon={Receipt} label="Gastos do mês" value={brl(monthSpend)} />
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Evolução de gastos</h2>
        <p className="text-xs text-muted-foreground">Últimos 6 meses (contas + cartões)</p>
        <div className="mt-4 h-64">
          <ResponsiveContainer>
            <LineChart data={chart}>
              <CartesianGrid stroke="oklch(0.28 0.03 265)" strokeDasharray="3 3" />
              <XAxis dataKey="mes" stroke="oklch(0.68 0.02 260)" fontSize={12} />
              <YAxis stroke="oklch(0.68 0.02 260)" fontSize={12} tickFormatter={(v) => brl(v).replace("R$", "")} />
              <Tooltip
                contentStyle={{ background: "oklch(0.21 0.025 265)", border: "1px solid oklch(0.28 0.03 265)", borderRadius: 8 }}
                formatter={(v: number) => brl(v)}
              />
              <Line type="monotone" dataKey="gasto" stroke="oklch(0.78 0.18 155)" strokeWidth={2.5} dot={{ r: 4 }} />
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
