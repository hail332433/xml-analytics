import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useFiscalStore } from "@/store/fiscal-store";
import { fmtBRL, fmtNum, fmtDur } from "@/lib/format";
import {
  FileText, Receipt, TrendingUp, AlertTriangle, ShieldAlert, ShieldCheck,
  Download, Clock, Loader2, ArrowDownToLine, ArrowUpFromLine, DollarSign,
  Activity, ShieldCheck as ShieldOk, AlertOctagon, XCircle, FileWarning, KeyRound,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { exportDashboardPdf } from "@/lib/export-pdf";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Extrator Fiscal" },
      { name: "description", content: "Painel consolidado: receita, tributos, situação e risco fiscal." },
    ],
  }),
  component: DashboardPage,
});

const RISK_COLORS = {
  ALTA: "var(--destructive)",
  MEDIA: "var(--warning)",
  BAIXA: "var(--success)",
};

const SIT_COLORS = {
  AUT: "var(--success)",
  CON: "var(--warning)",
  CAN: "var(--destructive)",
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "primary",
}: {
  icon: any; label: string; value: string; sub?: string;
  tone?: "primary" | "success" | "warning" | "destructive" | "muted";
}) {
  const toneMap = {
    primary: "border-primary/20 bg-primary text-primary-foreground",
    success: "border-success/30 bg-card text-foreground",
    warning: "border-warning/40 bg-card text-foreground",
    destructive: "border-destructive/30 bg-card text-foreground",
    muted: "border-border bg-card text-foreground",
  } as const;
  const iconBg = {
    primary: "bg-white/15 text-primary-foreground",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning-foreground",
    destructive: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  } as const;
  const subColor = {
    primary: "text-primary-foreground/80",
    success: "text-success",
    warning: "text-warning-foreground",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
  } as const;

  return (
    <div className={`rounded-xl border p-5 shadow-elegant ${toneMap[tone]}`}>
      <div className="flex items-center justify-between">
        <div className={`text-xs uppercase tracking-wider ${tone === "primary" ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
          {label}
        </div>
        <div className={`size-8 rounded-md grid place-items-center ${iconBg[tone]}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-3 text-2xl font-semibold num">{value}</div>
      {sub && <div className={`text-xs mt-1 num ${subColor[tone]}`}>{sub}</div>}
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

  const { stats, taxCards, riskSummary, situacao, serieTemporal, topCfopSaidas } = dashboard;

  const riskData = [
    { name: "Alta", value: riskSummary.alta, key: "ALTA" },
    { name: "Média", value: riskSummary.media, key: "MEDIA" },
    { name: "Baixa", value: riskSummary.baixa, key: "BAIXA" },
  ].filter((r) => r.value > 0);

  const sitData = [
    { name: "Autorizadas", value: situacao.autorizadas, key: "AUT" },
    { name: "Em contingência", value: situacao.contingencia, key: "CON" },
    { name: "Canceladas", value: situacao.canceladas, key: "CAN" },
  ].filter((s) => s.value > 0);

  const pct = (n: number) =>
    situacao.total ? `${((n / situacao.total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : "0%";

  const topEmit = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notas) {
      const k = n.emitente || n.cnpjEmit || "—";
      map.set(k, (map.get(k) ?? 0) + n.valorOficial);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name: name.length > 22 ? name.slice(0, 22) + "…" : name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [notas]);

  const estimateMs = (n: number) => Math.max(400, 120 + n * 8);

  const handleExport = () => {
    if (exporting) return;
    const total = estimateMs(notas.length);
    setEstimated(total);
    setElapsed(0);
    setExporting(true);
    const start = performance.now();
    tickRef.current = window.setInterval(() => setElapsed(performance.now() - start), 100);
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

  const totalNotasFmt = fmtNum(stats.totalNotas);

  return (
    <div className="px-10 py-10 max-w-7xl space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1.5">Visão geral das notas fiscais</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">Processado em {fmtDur(duracaoMs)}</div>
          {exporting && (
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary num" aria-live="polite">
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

      {/* Linha 1 — KPIs principais */}
      <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={FileText} label="Total de notas" value={totalNotasFmt} tone="primary" />
        <StatCard icon={ArrowDownToLine} label="Notas de entrada" value={fmtNum(stats.notasEntrada)} tone="primary" />
        <StatCard icon={ArrowUpFromLine} label="Notas de saída" value={fmtNum(stats.notasSaida)} tone="primary" />
        <StatCard icon={DollarSign} label="Valor total das notas" value={fmtBRL(stats.totalRevenue)} tone="primary" />
        <StatCard icon={TrendingUp} label="Valor médio por nota" value={fmtBRL(stats.valorMedio)} tone="primary" />
      </div>

      {/* Linha 2 — Status protocolar */}
      <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          icon={ShieldOk} label="Notas autorizadas" tone="success"
          value={fmtNum(stats.autorizadas)}
          sub={`${pct(stats.autorizadas)} do total`}
        />
        <StatCard
          icon={AlertOctagon} label="Notas em contingência" tone="warning"
          value={fmtNum(stats.contingencia)}
          sub={`${pct(stats.contingencia)} do total`}
        />
        <StatCard
          icon={XCircle} label="Notas canceladas" tone="destructive"
          value={fmtNum(stats.canceladas)}
          sub={`${pct(stats.canceladas)} do total`}
        />
        <StatCard
          icon={FileWarning} label="Pendências fiscais" tone="warning"
          value={fmtNum(stats.pendencias)}
          sub="Notas com rejeição"
        />
        <StatCard
          icon={KeyRound} label="Chave de acesso inválida" tone="muted"
          value={fmtNum(stats.chaveInvalida)}
          sub={`${pct(stats.chaveInvalida)} do total`}
        />
      </div>

      {/* Linha 3 — 3 painéis: série temporal, situação, top emitentes */}
      <section className="grid lg:grid-cols-3 gap-6">
        <div className="rounded-xl border bg-card p-5 lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2"><Activity className="size-4 text-primary" /> Notas por período</h2>
            <span className="text-xs text-muted-foreground">Diário</span>
          </div>
          <div className="h-64">
            {serieTemporal.length === 0 ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">Sem datas válidas.</div>
            ) : (
              <ResponsiveContainer>
                <LineChart data={serieTemporal} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="entrada" name="Entrada" stroke="var(--primary)" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="saida" name="Saída" stroke="var(--primary-glow)" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="canceladas" name="Canceladas" stroke="var(--destructive)" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 lg:col-span-1">
          <h2 className="font-semibold mb-3">Situação das notas</h2>
          {sitData.length === 0 ? (
            <div className="h-64 grid place-items-center text-sm text-muted-foreground">Sem dados de protocolo.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 items-center">
              <div className="h-56 relative">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={sitData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                      {sitData.map((d) => <Cell key={d.key} fill={SIT_COLORS[d.key as keyof typeof SIT_COLORS]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="text-center">
                    <div className="text-xl font-semibold num">{totalNotasFmt}</div>
                    <div className="text-[11px] text-muted-foreground">Total</div>
                  </div>
                </div>
              </div>
              <ul className="space-y-3 text-sm">
                <li>
                  <div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: SIT_COLORS.AUT }} /> Autorizadas</div>
                  <div className="num text-foreground">{fmtNum(situacao.autorizadas)} ({pct(situacao.autorizadas)})</div>
                </li>
                <li>
                  <div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: SIT_COLORS.CON }} /> Em contingência</div>
                  <div className="num text-foreground">{fmtNum(situacao.contingencia)} ({pct(situacao.contingencia)})</div>
                </li>
                <li>
                  <div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: SIT_COLORS.CAN }} /> Canceladas</div>
                  <div className="num text-foreground">{fmtNum(situacao.canceladas)} ({pct(situacao.canceladas)})</div>
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5 lg:col-span-1">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning" /> Top 5 emitentes por receita
          </h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={topEmit} layout="vertical" margin={{ left: 10, right: 20 }}>
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
        </div>
      </section>

      {/* Linha 4 — Tributos consolidados */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Tributos consolidados</h2>
        {taxCards.length === 0 ? (
          <div className="text-sm text-muted-foreground rounded-lg border bg-card p-6">Nenhum tributo identificado nas notas.</div>
        ) : (
          <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4">
            {taxCards.map((t) => (
              <div key={t.title} className="rounded-xl border border-primary/20 bg-primary text-primary-foreground p-4 shadow-elegant">
                <div className="flex items-center gap-2">
                  <Receipt className="size-4 text-primary-foreground/80" />
                  <div className="text-xs uppercase tracking-wider text-primary-foreground/80">{t.title}</div>
                </div>
                <div className="mt-2 text-xl font-semibold num">{fmtBRL(t.totalValue)}</div>
                <div className="text-xs text-primary-foreground/75 mt-1 num">Base: {fmtBRL(t.totalBase)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Linha 5 — Risco fiscal + Top CFOP saídas */}
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
            <div className="h-56">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={riskData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
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
            <FileText className="size-4 text-primary" /> Top 5 CFOP mais utilizados (saídas)
          </h2>
          {topCfopSaidas.length === 0 ? (
            <div className="h-56 grid place-items-center text-sm text-muted-foreground">Sem CFOPs de saída.</div>
          ) : (
            <ul className="space-y-3">
              {topCfopSaidas.map((c) => {
                const max = topCfopSaidas[0].count || 1;
                const pctBar = (c.count / max) * 100;
                return (
                  <li key={c.cfop} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="truncate pr-3">
                        <span className="font-medium num">{c.cfop}</span>
                        <span className="text-muted-foreground"> – {c.descricao}</span>
                      </div>
                      <span className="num font-semibold">{fmtNum(c.count)}</span>
                    </div>
                    <div className="h-2 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pctBar}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
