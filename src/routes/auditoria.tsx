import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useFiscalStore } from "@/store/fiscal-store";
import { fmtBRL, fmtNum, fmtDur } from "@/lib/format";
import { CheckCircle2, AlertTriangle, ShieldCheck, FileText } from "lucide-react";

export const Route = createFileRoute("/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoria — Extrator Fiscal" },
      { name: "description", content: "Regras determinísticas aplicadas aos XMLs processados." },
    ],
  }),
  component: AuditoriaPage,
});

function AuditoriaPage() {
  const { dashboard, divergencias, duracaoMs, notas, fileName, fileSize } = useFiscalStore();
  if (!dashboard) return <Navigate to="/upload" replace />;

  const corrigidas = divergencias.filter((d) => d.status === "CORRIGIDO").length;
  const criticas = divergencias.filter((d) => d.status === "CRITICO").length;
  const ausentes = divergencias.filter((d) => d.tipo === "TOTAL_AUSENTE").length;

  const rules = [
    { t: "Regra 1 — <ICMSTot> presente", d: "Valor oficial = total declarado. Soma dos itens é apenas informativa.", icon: ShieldCheck, color: "text-success" },
    { t: "Regra 2 — Total ausente", d: `Valor oficial = soma dos itens. Classificadas como TOTAL_AUSENTE: ${fmtNum(ausentes)}`, icon: FileText, color: "text-warning" },
    { t: "Regra 3 — Classificação por diferença", d: "≤ 0,01 BAIXA · ≤ 5,00 MÉDIA · > 5,00 ALTA. Auto-correção: BAIXA silenciosa, MÉDIA registrada, ALTA crítica.", icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <div className="px-10 py-10 max-w-6xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Auditoria</h1>
        <p className="text-sm text-muted-foreground mt-1.5">Regras determinísticas aplicadas a {fmtNum(notas.length)} XMLs</p>
      </header>

      <div className="grid md:grid-cols-4 gap-4">
        <Card label="Notas válidas" value={fmtNum(notas.length)} icon={CheckCircle2} accent="text-success" />
        <Card label="Divergências corrigidas" value={fmtNum(corrigidas)} icon={ShieldCheck} accent="text-primary" />
        <Card label="Alertas críticos" value={fmtNum(criticas)} icon={AlertTriangle} accent="text-destructive" />
        <Card label="Total auditado" value={fmtBRL(dashboard.stats.totalRevenue)} icon={FileText} accent="text-foreground" />
      </div>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold mb-4">Regras aplicadas</h2>
        <div className="space-y-4">
          {rules.map((r) => (
            <div key={r.t} className="flex gap-4 items-start">
              <r.icon className={`size-5 mt-0.5 ${r.color}`} />
              <div>
                <div className="font-medium">{r.t}</div>
                <div className="text-sm text-muted-foreground">{r.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold mb-4">Metadados do processamento</h2>
        <dl className="grid md:grid-cols-2 gap-4 text-sm">
          <Meta k="Arquivo" v={fileName ?? "—"} />
          <Meta k="Tamanho" v={`${(fileSize / 1024 / 1024).toFixed(1)} MB`} />
          <Meta k="Duração" v={fmtDur(duracaoMs)} />
          <Meta k="Throughput" v={`${(notas.length / Math.max(1, duracaoMs / 1000)).toFixed(0)} notas/s`} />
        </dl>
      </section>
    </div>
  );
}

function Card({ icon: Icon, label, value, accent }: any) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <Icon className={`size-4 ${accent}`} />
      </div>
      <div className="mt-3 text-2xl font-semibold num">{value}</div>
    </div>
  );
}
function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b pb-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium num">{v}</dd>
    </div>
  );
}
