import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useFiscalStore } from "@/store/fiscal-store";
import { fmtBRL, fmtNum, fmtDur } from "@/lib/format";
import { FileText, Receipt, TrendingUp, AlertTriangle, ShieldAlert, ShieldCheck, Download, Clock, Loader2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { exportDashboardPdf } from "@/lib/export-pdf";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Extrator Fiscal" },
      { name: "description", content: "Painel consolidado: receita, tributos e risco fiscal." },
    ],
  }),
  component: DashboardPage,
});

const RISK_COLORS = {
  ALTA: "var(--destructive)",
  MEDIA: "var(--warning)",
  BAIXA: "var(--success)",
};

function StatCard({ icon: Icon, label, value, sub }: any) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary p-5 shadow-elegant text-primary-foreground">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-primary-foreground/80">{label}</div>
        <div className="size-8 rounded-md grid place-items-center bg-white/15 text-primary-foreground">
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-3 text-2xl font-semibold num">{value}</div>
      {sub && <div className="text-xs text-primary-foreground/80 mt-1">{sub}</div>}
    </div>
  );
}

function DashboardPage() {
  const { dashboard, duracaoMs, notas } = useFiscalStore();
  const [exporting, setExporting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [estimated, setEstimated] = useState(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => () => { if (tickRef.current) window.clearInterval(tickRef.current); }, []);

  if (!dashboard) return <Navigate to="/upload" replace />;

  const { stats, taxCards, riskSummary } = dashboard;
  const riskData = [
    { name: "Alta", value: riskSummary.alta, key: "ALTA" },
    { name: "Média", value: riskSummary.media, key: "MEDIA" },
    { name: "Baixa", value: riskSummary.baixa, key: "BAIXA" },
  ].filter((r) => r.value > 0);

  const estimateMs = (n: number) => Math.max(400, 120 + n * 8);

  const handleExport = () => {
    if (exporting) return;
    const total = estimateMs(notas.length);
    setEstimated(total);
    setElapsed(0);
    setExporting(true);
    const start = performance.now();
    tickRef.current = window.setInterval(() => {
      setElapsed(performance.now() - start);
    }, 100);

    setTimeout(() => {
      try {
        exportDashboardPdf(dashboard, notas, duracaoMs);
        toast.success("Relatório PDF gerado com sucesso.");
      } catch (e: any) {
        toast.error("Falha ao gerar PDF: " + (e?.message ?? "erro desconhecido"));
      } finally {
        if (tickRef.current) {
          window.clearInterval(tickRef.current);
          tickRef.current = null;
        }
        setExporting(false);
        setElapsed(0);
      }
    }, 50);
  };

  const remaining = Math.max(0, estimated - elapsed);
  const fmtClock = (ms: number) => {
    const s = Math.ceil(ms / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  return (
    <div className="px-10 py-10 max-w-7xl space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1.5">Consolidado da sessão ativa</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">Processado em {fmtDur(duracaoMs)}</div>
          {exporting && (
            <div
              className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary num"
              aria-live="polite"
              title="Tempo restante estimado"
            >
              <Clock className="size-4 animate-pulse" />
              <span className="tabular-nums">{fmtClock(remaining)}</span>
              <span className="text-xs text-muted-foreground">restante</span>
            </div>
          )}
          <Button onClick={handleExport} className="gap-2" disabled={exporting}>
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {exporting ? "Gerando..." : "Exportar PDF"}
          </Button>
        </div>
      </header>

      <div className="grid md:grid-cols-4 gap-4">
        <StatCard icon={FileText} label="Total de notas" value={fmtNum(stats.totalNotas)} />
        <StatCard icon={Receipt} label="📄 NF-e (mod. 55)" value={fmtNum(stats.modelo55)} />
        <StatCard icon={Receipt} label="🧾 NFC-e (mod. 65)" value={fmtNum(stats.modelo65)} />
        <StatCard icon={TrendingUp} label="Receita total" value={fmtBRL(stats.totalRevenue)} />
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Tributos consolidados</h2>
        {taxCards.length === 0 ? (
          <div className="text-sm text-muted-foreground rounded-lg border bg-card p-6">Nenhum tributo identificado nas notas.</div>
        ) : (
          <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4">
            {taxCards.map((t) => (
              <div key={t.title} className="rounded-xl border border-primary/20 bg-primary text-primary-foreground p-4 shadow-elegant">
                <div className="text-xs uppercase tracking-wider text-primary-foreground/80">{t.title}</div>
                <div className="mt-2 text-xl font-semibold num">{fmtBRL(t.totalValue)}</div>
                <div className="text-xs text-primary-foreground/75 mt-1 num">Base: {fmtBRL(t.totalBase)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Risco fiscal</h2>
            <ShieldAlert className="size-4 text-muted-foreground" />
          </div>
          {riskData.length === 0 ? (
            <div className="flex items-center gap-3 text-success py-10 justify-center">
              <ShieldCheck className="size-5" /> Nenhuma divergência detectada.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={riskData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {riskData.map((d) => <Cell key={d.key} fill={RISK_COLORS[d.key as keyof typeof RISK_COLORS]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 mt-2 text-center text-sm">
            <div><div className="text-destructive font-semibold num">{fmtNum(riskSummary.alta)}</div><div className="text-xs text-muted-foreground">Alta</div></div>
            <div><div className="text-warning font-semibold num">{fmtNum(riskSummary.media)}</div><div className="text-xs text-muted-foreground">Média</div></div>
            <div><div className="text-success font-semibold num">{fmtNum(riskSummary.baixa)}</div><div className="text-xs text-muted-foreground">Baixa</div></div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning" /> Top 5 emitentes por receita
          </h2>
          <TopEmitentes notas={notas} />
        </div>
      </section>
    </div>
  );
}

function TopEmitentes({ notas }: { notas: any[] }) {
  const map = new Map<string, number>();
  for (const n of notas) {
    const k = n.emitente || n.cnpjEmit || "—";
    map.set(k, (map.get(k) ?? 0) + n.valorOficial);
  }
  const data = [...map.entries()]
    .map(([name, value]) => ({ name: name.length > 22 ? name.slice(0, 22) + "…" : name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <div className="h-64">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} stroke="var(--muted-foreground)" />
          <Tooltip
            formatter={(v: any) => fmtBRL(v as number)}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
          />
          <Bar dataKey="value" fill="var(--primary)" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
