import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Upload, Download, FileText, Lock, Send } from "lucide-react";
import { Header, Field, EmptyState } from "./contas";
import {
  extractPdfText, detectIssuer, parseInvoice, toCSV,
  PasswordRequiredError, ISSUER_LABEL, type Issuer, type ParsedTx,
} from "@/lib/pdf-fatura";
import { importCardRows } from "@/lib/card-import";
import { brl, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/fatura-pdf")({ component: FaturaPdfPage });

type Card = { id: string; name: string; closing_day: number; due_day: number };
type Category = { id: string; name: string; color: string };

function FaturaPdfPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [wrongPassword, setWrongPassword] = useState(false);
  const [issuer, setIssuer] = useState<Issuer>("generic");
  const [rows, setRows] = useState<ParsedTx[]>([]);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [busy, setBusy] = useState(false);
  const [targetCard, setTargetCard] = useState<string>("");
  const [defaultCat, setDefaultCat] = useState<string>("");

  const { data: cards = [] } = useQuery({
    queryKey: ["cartoes-pdf-cards", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("credit_cards").select("id, name, closing_day, due_day").eq("archived", false).order("name");
      return (data ?? []) as Card[];
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories", user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name, color").eq("kind", "expense").order("name");
      return (data ?? []) as Category[];
    },
  });

  const handleFile = async (f: File, pwd?: string) => {
    setFile(f); setBusy(true); setWrongPassword(false);
    try {
      const text = await extractPdfText(f, pwd);
      const iss = detectIssuer(text);
      setIssuer(iss);
      const parsed = parseInvoice(text, iss);
      setRows(parsed);
      setSelected(parsed.map(() => true));
      setNeedsPassword(false);
      console.log("TEXTO EXTRAÍDO DO PDF:\n", text); // Para ajudar no debug se não achar linhas
      if (parsed.length === 0) toast.warning("Nenhuma linha detectada. Tente trocar o emissor manualmente.");
      else toast.success(`${parsed.length} linha(s) detectada(s) (${ISSUER_LABEL[iss]})`);
    } catch (e: any) {
      if (e instanceof PasswordRequiredError) {
        setNeedsPassword(true);
        setWrongPassword(e.message === "PASSWORD_WRONG");
      } else {
        toast.error("Falha ao ler PDF: " + (e?.message || e));
      }
    } finally {
      setBusy(false);
    }
  };

  const reparseWith = (iss: Issuer) => {
    setIssuer(iss);
    if (!file) return;
    (async () => {
      try {
        const text = await extractPdfText(file, password || undefined);
        const parsed = parseInvoice(text, iss);
        setRows(parsed);
        setSelected(parsed.map(() => true));
        toast.success(`Reanalisado: ${parsed.length} linha(s)`);
      } catch (e: any) { toast.error(e?.message || "Erro"); }
    })();
  };

  const visibleRows = rows.filter((_, i) => selected[i]);
  const total = visibleRows.reduce((s, r) => s + r.amount, 0);

  const updateRow = (i: number, patch: Partial<ParsedTx>) => {
    setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  };

  const downloadCsv = () => {
    const csv = toCSV(visibleRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `fatura-${ISSUER_LABEL[issuer]}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const importMut = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Sessão expirada");
      const card = cards.find((c) => c.id === targetCard);
      if (!card) throw new Error("Selecione um cartão");
      if (!visibleRows.length) throw new Error("Nenhuma linha selecionada");
      return importCardRows(visibleRows.map((r) => ({
        date: r.date, description: r.description, amount: r.amount,
      })), {
        userId: user.id, cardId: card.id,
        closingDay: card.closing_day, dueDay: card.due_day,
        defaultCategoryId: defaultCat || null,
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["cartoes"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`${r.imported} importado(s)${r.skipped ? `, ${r.skipped} ignorado(s)` : ""}`);
      setFile(null); setRows([]); setSelected([]); setPassword(""); setNeedsPassword(false);
    },
    onError: (e: any) => toast.error(e?.message || "Erro"),
  });

  return (
    <div>
      <Header title="Fatura PDF → CSV">
        <span className="text-xs text-muted-foreground">Conversão 100% no navegador — o PDF não é enviado para o servidor.</span>
      </Header>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_2fr]">
        <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">1. Upload do PDF</h2>
          <Field label="Arquivo PDF da fatura">
            <input type="file" accept="application/pdf" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setRows([]); setSelected([]); setPassword(""); setNeedsPassword(false); handleFile(f); }
            }} className="input" />
          </Field>
          {needsPassword && (
            <Field label={wrongPassword ? "Senha incorreta — tente novamente" : "Este PDF é protegido — informe a senha"}>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Lock className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha do PDF" className="input pl-7" />
                </div>
                <button onClick={() => file && handleFile(file, password)} disabled={busy || !password} className="btn-primary">Abrir</button>
              </div>
            </Field>
          )}
          {file && !needsPassword && (
            <Field label="Emissor detectado">
              <select value={issuer} onChange={(e) => reparseWith(e.target.value as Issuer)} className="input">
                {(Object.keys(ISSUER_LABEL) as Issuer[]).map((k) => (
                  <option key={k} value={k}>{ISSUER_LABEL[k]}</option>
                ))}
              </select>
            </Field>
          )}
          {busy && <p className="text-xs text-muted-foreground">Lendo PDF...</p>}
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">2. Conferir lançamentos</h2>
          {!rows.length ? (
            <EmptyState text={file ? "Nenhuma linha detectada — troque o emissor ou tente outro PDF." : "Selecione um PDF de fatura para começar."} />
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{visibleRows.length} de {rows.length} marcados · Total: <span className="font-medium text-foreground tabular-nums">{brl(total)}</span></p>
              <div className="max-h-80 overflow-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-secondary/60 text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left"><input type="checkbox" checked={selected.every(Boolean)} onChange={(e) => setSelected(rows.map(() => e.target.checked))} /></th>
                      <th className="p-2 text-left">Data</th>
                      <th className="p-2 text-left">Descrição</th>
                      <th className="p-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={`border-t border-border/50 ${!selected[i] ? "opacity-40" : ""}`}>
                        <td className="p-1.5"><input type="checkbox" checked={selected[i]} onChange={(e) => setSelected((s) => s.map((v, idx) => idx === i ? e.target.checked : v))} /></td>
                        <td className="p-1.5"><input type="date" value={r.date} onChange={(e) => updateRow(i, { date: e.target.value })} className="bg-transparent w-32 text-xs" /></td>
                        <td className="p-1.5"><input value={r.description} onChange={(e) => updateRow(i, { description: e.target.value })} className="bg-transparent w-full text-xs" /></td>
                        <td className="p-1.5 text-right"><input type="number" step="0.01" value={r.amount} onChange={(e) => updateRow(i, { amount: Number(e.target.value) })} className="bg-transparent w-24 text-right text-xs tabular-nums" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">3. Exportar / Importar</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Field label="Cartão de destino (para importar)">
              <select value={targetCard} onChange={(e) => setTargetCard(e.target.value)} className="input">
                <option value="">—</option>
                {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Categoria padrão (opcional)">
              <select value={defaultCat} onChange={(e) => setDefaultCat(e.target.value)} className="input">
                <option value="">Sem categoria</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <div className="flex items-end gap-2">
              <button onClick={downloadCsv} disabled={!visibleRows.length} className="btn-secondary flex-1 justify-center"><Download className="h-4 w-4" /> Baixar CSV</button>
              <button onClick={() => importMut.mutate()} disabled={!targetCard || !visibleRows.length || importMut.isPending} className="btn-primary flex-1 justify-center"><Send className="h-4 w-4" /> {importMut.isPending ? "Importando..." : "Importar na fatura"}</button>
            </div>
          </div>
          {targetCard && (() => {
            const c = cards.find((x) => x.id === targetCard);
            if (!c || !visibleRows.length) return null;
            const first = visibleRows[0];
            return <p className="mt-3 text-xs text-muted-foreground"><FileText className="inline h-3 w-3" /> Exemplo: compra de {fmtDate(first.date)} entrará na fatura conforme regra do cartão {c.name} (fech. {c.closing_day}, venc. {c.due_day}).</p>;
          })()}
        </div>
      )}
    </div>
  );
}
