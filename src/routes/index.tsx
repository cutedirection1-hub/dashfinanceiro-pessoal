import { useEffect } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Wallet, CreditCard, TrendingUp, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">M</div>
          <span className="font-display text-lg font-semibold">Meu Financeiro</span>
        </div>
        <div className="flex gap-3">
          <Link to="/login" className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Entrar</Link>
          <Link to="/signup" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Criar conta</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-12">
        <section className="text-center">
          <span className="inline-flex rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground">Sua vida financeira em um só lugar</span>
          <h1 className="mt-6 text-balance text-5xl font-bold tracking-tight md:text-6xl">
            Organize <span className="text-primary">cartões</span>, contas e <span className="text-primary">investimentos</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-muted-foreground">
            Acompanhe faturas, saldos e patrimônio com clareza. Tudo em português, em reais, e seguro.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/signup" className="rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20">Começar grátis</Link>
            <Link to="/login" className="rounded-lg border border-border bg-card px-5 py-3 text-sm font-medium">Já tenho conta</Link>
          </div>
        </section>

        <section className="mt-20 grid gap-4 md:grid-cols-3">
          {[
            { icon: CreditCard, title: "Cartões de crédito", desc: "Faturas calculadas automaticamente por ciclo, com parcelas distribuídas." },
            { icon: Wallet, title: "Contas bancárias", desc: "Múltiplas contas e saldo consolidado em tempo real." },
            { icon: TrendingUp, title: "Investimentos", desc: "Carteira manual com visão de alocação e patrimônio total." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-6">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </section>

        <section className="mt-16 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" /> Seus dados ficam criptografados e privados.
        </section>
      </main>
    </div>
  );
}
