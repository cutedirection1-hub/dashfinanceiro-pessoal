import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { AuthShell, Field } from "./login";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + "/dashboard",
        data: { full_name: name },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada!");
    navigate({ to: "/dashboard" });
  };

  const onGoogle = async () => {
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" });
    if (res.error) return toast.error(res.error.message || "Falha ao entrar com Google");
    if (res.redirected) return;
    navigate({ to: "/dashboard" });
  };

  return (
    <AuthShell title="Criar conta" subtitle="Comece a organizar suas finanças">
      <button onClick={onGoogle} className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-medium hover:bg-accent">
        Continuar com Google
      </button>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> ou <div className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Nome"><input required value={name} onChange={(e) => setName(e.target.value)} className="input" /></Field>
        <Field label="Email"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" /></Field>
        <Field label="Senha (mín. 6 caracteres)"><input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="input" /></Field>
        <button disabled={loading} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? "Criando..." : "Criar conta"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Já tem conta? <Link to="/login" className="text-primary hover:underline">Entrar</Link>
      </p>
    </AuthShell>
  );
}
