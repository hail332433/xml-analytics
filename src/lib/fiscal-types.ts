export type PipelineState =
  | "idle"
  | "uploading"
  | "uploaded"
  | "extracting"
  | "processing"
  | "consolidating"
  | "finished"
  | "error";

export type Severity = "ALTA" | "MEDIA" | "BAIXA";
export type DivStatus = "CORRIGIDO" | "CRITICO";

export interface Divergencia {
  chave: string;
  tipo: string;
  campo: string;
  valorCalculado: number;
  valorDeclarado: number;
  diferenca: number;
  gravidade: Severity;
  status: DivStatus;
}

export interface NotaSimplificada {
  chave: string;
  modelo: 55 | 65;
  numero: string;
  serie: string;
  emissao: string;
  emitente: string;
  cnpjEmit: string;
  destinatario: string;
  valorOficial: number;
  valorDeclarado: number | null;
  valorItens: number;
  qtdItens: number;
  divergencia: Severity | null;
  status: DivStatus | null;
  fonte: "ICMSTot" | "TOTAL_AUSENTE";
  vICMS: number;
  vST: number;
  vFCP: number;
  vFCPST: number;
  vIPI: number;
  vPIS: number;
  vCOFINS: number;
  vIBS: number;
  vCBS: number;
}

export interface TaxAggregate {
  totalValue: number;
  totalBase: number;
}

export interface DashboardData {
  stats: {
    totalNotas: number;
    modelo55: number;
    modelo65: number;
    totalRevenue: number;
  };
  taxCards: { title: string; totalValue: number; totalBase: number }[];
  riskSummary: { alta: number; media: number; baixa: number };
  screensOrder: string[];
}

export type PipelinePhase = "upload" | "extract" | "process" | "consolidate";

export type WorkerInbound =
  | { type: "start"; file: File }
  | { type: "cancel" };

export type WorkerOutbound =
  | { type: "state"; state: PipelineState; message?: string }
  | {
      type: "progress";
      phase: PipelinePhase;
      current: number;
      total: number;
      batch?: number;
    }
  | {
      type: "done";
      dashboard: DashboardData;
      notas: NotaSimplificada[];
      divergencias: Divergencia[];
      duracaoMs: number;
    }
  | { type: "error"; message: string };
