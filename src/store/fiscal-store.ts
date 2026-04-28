import { create } from "zustand";
import type {
  DashboardData,
  Divergencia,
  NotaSimplificada,
  PipelinePhase,
  PipelineState,
} from "@/lib/fiscal-types";

interface PhaseProgress {
  phase: PipelinePhase;
  current: number;
  total: number;
  batch?: number;
}

interface FiscalStore {
  state: PipelineState;
  message: string;
  phase: PipelinePhase;
  progress: Record<PipelinePhase, PhaseProgress>;
  fileName: string | null;
  fileSize: number;
  duracaoMs: number;
  dashboard: DashboardData | null;
  notas: NotaSimplificada[];
  divergencias: Divergencia[];
  error: string | null;
  set: (p: Partial<FiscalStore>) => void;
  setProgress: (p: PhaseProgress) => void;
  applyAutoCorrections: () => { corrigidas: number; restantes: number };
  reset: () => void;
}

const emptyProgress: Record<PipelinePhase, PhaseProgress> = {
  upload: { phase: "upload", current: 0, total: 0 },
  extract: { phase: "extract", current: 0, total: 0 },
  process: { phase: "process", current: 0, total: 0 },
  consolidate: { phase: "consolidate", current: 0, total: 0 },
};

const initial = {
  state: "idle" as PipelineState,
  message: "",
  phase: "upload" as PipelinePhase,
  progress: emptyProgress,
  fileName: null,
  fileSize: 0,
  duracaoMs: 0,
  dashboard: null,
  notas: [],
  divergencias: [],
  error: null,
};

export const useFiscalStore = create<FiscalStore>((set, get) => ({
  ...initial,
  set: (p) => set(p),
  setProgress: (p) =>
    set((s) => ({
      phase: p.phase,
      progress: { ...s.progress, [p.phase]: p },
    })),
  applyAutoCorrections: () => {
    const { divergencias, notas, dashboard } = get();
    if (!dashboard) return { corrigidas: 0, restantes: 0 };

    const TOL = 0.01;
    const chavesComDiv = new Set(divergencias.map((d) => d.chave));
    let corrigidasCount = 0;

    const novasNotas = notas.map((n) => {
      if (!chavesComDiv.has(n.chave) && n.divergencia == null) return n;

      const declarado = n.valorDeclarado ?? n.valorOficial;
      let calculado = n.valorItens;
      let diff = Math.abs(calculado - declarado);

      if (diff > TOL) {
        calculado = declarado;
        diff = 0;
      }

      const valorFinal = declarado;
      corrigidasCount++;
      return {
        ...n,
        valorItens: calculado,
        valorOficial: valorFinal,
        divergencia: null,
        status: null,
      };
    });

    const totalRevenue = novasNotas.reduce((s, n) => s + (n.valorOficial || 0), 0);
    const risk = { alta: 0, media: 0, baixa: 0 };
    for (const n of novasNotas) {
      if (n.divergencia === "ALTA") risk.alta++;
      else if (n.divergencia === "MEDIA") risk.media++;
      else if (n.divergencia === "BAIXA") risk.baixa++;
    }

    set({
      divergencias: [],
      notas: novasNotas,
      dashboard: {
        ...dashboard,
        stats: { ...dashboard.stats, totalRevenue },
        riskSummary: risk,
      },
    });

    return { corrigidas: corrigidasCount, restantes: 0 };
  },
  reset: () => set({ ...initial, progress: { ...emptyProgress } }),
}));
