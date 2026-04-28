import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useFiscalStore } from "@/store/fiscal-store";
import { fmtBRL, fmtNum } from "@/lib/format";
import type { Severity } from "@/lib/fiscal-types";
import { Button } from "@/components/ui/button";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/divergencias")({
  head: () => ({
    meta: [
      { title: "Divergências — Extrator Fiscal" },
      { name: "description", content: "Detecção e auto-correção de divergências entre soma dos itens e total declarado." },
    ],
  }),
  component: DivergenciasPage,
});

const PAGE = 50;

function DivergenciasPage() {
  const { divergencias, dashboard, applyAutoCorrections } = useFiscalStore();
  const [grav, setGrav] = useState<"all" | Severity>("all");
  const [page, setPage] = useState(0);

  const totalCorrigiveis = divergencias.length;

  const handleCorrigir = () => {
    const { corrigidas } = applyAutoCorrections();
    if (corrigidas === 0) {
      toast.info("Nenhuma divergência para corrigir.");
      return;
    }
    toast.success(
      `${corrigidas.toLocaleString("pt-BR")} divergência(s) corrigidas — extração agora fiel ao XML.`,
      { description: "Dashboard e notas atualizados com os valores declarados." },
    );
    setPage(0);
  };

  const filtered = useMemo(
    () => (grav === "all" ? divergencias : divergencias.filter((d) => d.gravidade === grav)),
    [divergencias, grav],
  );

  if (!dashboard) return <Navigate to="/upload" replace />;

  const slice = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));

  const counts = {
    ALTA: divergencias.filter((d) => d.gravidade === "ALTA").length,
    MEDIA: divergencias.filter((d) => d.gravidade === "MEDIA").length,
    BAIXA: divergencias.filter((d) => d.gravidade === "BAIXA").length,
  };

  return (
    <div className="px-10 py-10 max-w-[1400px] space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Divergências</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {fmtNum(divergencias.length)} divergência(s) detectada(s).{" "}
            {totalCorrigiveis > 0 && (
              <span className="text-foreground">
                <strong>{fmtNum(totalCorrigiveis)}</strong> podem ser auto-corrigidas pela regra do XML.
              </span>
            )}
          </p>
        </div>
        <Button
          size="lg"
          onClick={handleCorrigir}
          disabled={totalCorrigiveis === 0}
          className="bg-gradient-primary shadow-elegant"
        >
          <Wand2 className="size-4 mr-2" />
          Corrigir divergências ({fmtNum(totalCorrigiveis)})
        </Button>
      </header>

      <div className="flex gap-3">
        {(["all", "ALTA", "MEDIA", "BAIXA"] as const).map((g) => (
          <button
            key={g}
            onClick={() => { setGrav(g); setPage(0); }}
            className={`px-4 py-2 rounded-lg border text-sm transition
              ${grav === g ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-secondary"}`}
          >
            {g === "all" ? `Todas (${fmtNum(divergencias.length)})` : `${g} (${fmtNum(counts[g])})`}
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary">
              <tr>
                <th className="text-left p-3 font-medium">Tipo</th>
                <th className="text-left p-3 font-medium">Chave</th>
                <th className="text-left p-3 font-medium">Campo</th>
                <th className="text-right p-3 font-medium">Calculado</th>
                <th className="text-right p-3 font-medium">Declarado</th>
                <th className="text-right p-3 font-medium">Diferença</th>
                <th className="text-left p-3 font-medium">Gravidade</th>
                <th className="text-left p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((d, i) => (
                <tr key={i} className="border-t hover:bg-secondary/40">
                  <td className="p-3 font-mono text-xs">{d.tipo}</td>
                  <td className="p-3 font-mono text-xs truncate max-w-[14rem]">{d.chave || "—"}</td>
                  <td className="p-3">{d.campo}</td>
                  <td className="p-3 text-right num">{fmtBRL(d.valorCalculado)}</td>
                  <td className="p-3 text-right num">{fmtBRL(d.valorDeclarado)}</td>
                  <td className={`p-3 text-right num font-medium ${d.diferenca < 0 ? "text-destructive" : "text-warning"}`}>
                    {fmtBRL(d.diferenca)}
                  </td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-1 rounded font-medium
                      ${d.gravidade === "ALTA" ? "bg-destructive/15 text-destructive" :
                        d.gravidade === "MEDIA" ? "bg-warning/20 text-warning-foreground" :
                        "bg-success/15 text-success"}`}>{d.gravidade}</span>
                  </td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-1 rounded font-medium
                      ${d.status === "CRITICO" ? "bg-destructive text-destructive-foreground" : "bg-primary/10 text-primary"}`}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
              {slice.length === 0 && (
                <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">Nenhuma divergência neste filtro.</td></tr>
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
