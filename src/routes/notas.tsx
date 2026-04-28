import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useFiscalStore } from "@/store/fiscal-store";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fmtBRL } from "@/lib/format";
import type { NotaSimplificada } from "@/lib/fiscal-types";

export const Route = createFileRoute("/notas")({
  head: () => ({
    meta: [
      { title: "Notas — Extrator Fiscal" },
      { name: "description", content: "Listagem detalhada das notas fiscais processadas." },
    ],
  }),
  component: NotasPage,
});

const PAGE = 50;

function NotasPage() {
  const { notas, dashboard } = useFiscalStore();
  const [q, setQ] = useState("");
  const [modelo, setModelo] = useState<"all" | "55" | "65">("all");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return notas.filter((n) => {
      if (modelo !== "all" && String(n.modelo) !== modelo) return false;
      if (!ql) return true;
      return (
        n.chave.toLowerCase().includes(ql) ||
        n.numero.toLowerCase().includes(ql) ||
        n.emitente.toLowerCase().includes(ql) ||
        n.cnpjEmit.toLowerCase().includes(ql)
      );
    });
  }, [notas, q, modelo]);

  if (!dashboard) return <Navigate to="/upload" replace />;

  const slice = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));

  return (
    <div className="px-10 py-10 max-w-[1400px] space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Notas</h1>
        <p className="text-sm text-muted-foreground mt-1.5">{filtered.length.toLocaleString("pt-BR")} notas (de {notas.length.toLocaleString("pt-BR")})</p>
      </header>

      <div className="flex gap-3 items-center">
        <Input placeholder="Buscar por chave, número, emitente ou CNPJ" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="max-w-md" />
        <div className="flex rounded-md border bg-card">
          {(["all", "55", "65"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setModelo(m); setPage(0); }}
              className={`px-3 py-2 text-sm ${modelo === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {m === "all" ? "Todas" : m === "55" ? "NF-e" : "NFC-e"}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-secondary-foreground">
              <tr>
                <th className="text-left p-3 font-medium">Mod.</th>
                <th className="text-left p-3 font-medium">Nº / Série</th>
                <th className="text-left p-3 font-medium">Emitente</th>
                <th className="text-left p-3 font-medium">Emissão</th>
                <th className="text-right p-3 font-medium">Itens</th>
                <th className="text-right p-3 font-medium">Valor oficial</th>
                <th className="text-left p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((n) => <Row key={n.chave + n.numero} n={n} />)}
              {slice.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhuma nota encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between p-3 border-t text-sm">
          <span className="text-muted-foreground">Página {page + 1} de {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 rounded border disabled:opacity-40">←</button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded border disabled:opacity-40">→</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ n }: { n: NotaSimplificada }) {
  return (
    <tr className="border-t hover:bg-secondary/40">
      <td className="p-3"><Badge variant={n.modelo === 55 ? "default" : "secondary"}>{n.modelo}</Badge></td>
      <td className="p-3 num">{n.numero}/{n.serie}</td>
      <td className="p-3">
        <div className="font-medium">{n.emitente || "—"}</div>
        <div className="text-xs text-muted-foreground num">{n.cnpjEmit}</div>
      </td>
      <td className="p-3 text-muted-foreground">{n.emissao?.slice(0, 10) || "—"}</td>
      <td className="p-3 text-right num">{n.qtdItens}</td>
      <td className="p-3 text-right num font-medium">{fmtBRL(n.valorOficial)}</td>
      <td className="p-3">
        {n.divergencia ? (
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded
            ${n.divergencia === "ALTA" ? "bg-destructive/15 text-destructive" :
              n.divergencia === "MEDIA" ? "bg-warning/20 text-warning-foreground" :
              "bg-success/15 text-success"}`}>
            {n.status} · {n.divergencia}
          </span>
        ) : (
          <span className="text-xs text-success">OK</span>
        )}
      </td>
    </tr>
  );
}
