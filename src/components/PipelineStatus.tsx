import { useFiscalStore } from "@/store/fiscal-store";
import { Progress } from "@/components/ui/progress";
import { Check, Loader2, Circle } from "lucide-react";
import { fmtBytes, fmtNum } from "@/lib/format";
import type { PipelinePhase } from "@/lib/fiscal-types";

const PHASES: { key: PipelinePhase; label: string; unit: "bytes" | "count" }[] = [
  { key: "upload", label: "1. Upload", unit: "bytes" },
  { key: "extract", label: "2. Descompactação", unit: "bytes" },
  { key: "process", label: "3. Processamento em lotes", unit: "count" },
  { key: "consolidate", label: "4. Consolidação", unit: "count" },
];

export default function PipelineStatus() {
  const { state, message, phase, progress } = useFiscalStore();
  if (state === "idle") return null;

  return (
    <div className="rounded-xl border bg-card p-5 shadow-elegant space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Pipeline</div>
          <div className="font-medium">{message || state}</div>
        </div>
        <div className="text-xs font-mono px-2 py-1 rounded bg-secondary text-secondary-foreground">
          {state}
        </div>
      </div>

      <div className="space-y-3">
        {PHASES.map((p) => {
          const pr = progress[p.key];
          const pct = pr.total > 0 ? Math.min(100, (pr.current / pr.total) * 100) : 0;
          const done = pr.total > 0 && pr.current >= pr.total &&
            (PHASES.findIndex((x) => x.key === phase) > PHASES.findIndex((x) => x.key === p.key) ||
              state === "finished");
          const active = phase === p.key && state !== "finished" && state !== "error";
          const fmt = (n: number) => p.unit === "bytes" ? fmtBytes(n) : fmtNum(n);

          return (
            <div key={p.key}>
              <div className="flex items-center justify-between text-sm mb-1">
                <div className="flex items-center gap-2">
                  {done ? (
                    <Check className="size-4 text-success" />
                  ) : active ? (
                    <Loader2 className="size-4 text-primary animate-spin" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground/40" />
                  )}
                  <span className={done ? "text-foreground" : active ? "font-medium" : "text-muted-foreground"}>
                    {p.label}
                    {p.key === "process" && pr.batch ? (
                      <span className="ml-2 text-xs text-muted-foreground">· lote {pr.batch}</span>
                    ) : null}
                  </span>
                </div>
                <div className="text-xs num text-muted-foreground">
                  {pr.total > 0 ? `${fmt(pr.current)} / ${fmt(pr.total)} · ${pct.toFixed(0)}%` : "—"}
                </div>
              </div>
              <Progress value={done ? 100 : pct} className="h-1.5" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
