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

/** Status protocolar derivado de protNFe.infProt.cStat (com fallback para tpEmis) */
export type SitNota =
  | "AUTORIZADA"
  | "CANCELADA"
  | "DENEGADA"
  | "CONTINGENCIA"
  | "REJEITADA"
  | "INUTILIZADA"
  | "DESCONHECIDA";

/** 0 = Entrada, 1 = Saída (NFe) */
export type TipoOperacao = "ENTRADA" | "SAIDA";

export interface Endereco {
  xLgr?: string;
  nro?: string;
  xCpl?: string;
  xBairro?: string;
  cMun?: string;
  xMun?: string;
  UF?: string;
  CEP?: string;
  cPais?: string;
  xPais?: string;
  fone?: string;
}

export interface Emitente {
  CNPJ?: string;
  CPF?: string;
  xNome?: string;
  xFant?: string;
  IE?: string;
  IEST?: string;
  IM?: string;
  CNAE?: string;
  CRT?: string;
  endereco?: Endereco;
}

export interface Destinatario {
  CNPJ?: string;
  CPF?: string;
  idEstrangeiro?: string;
  xNome?: string;
  IE?: string;
  ISUF?: string;
  IM?: string;
  email?: string;
  indIEDest?: string;
  endereco?: Endereco;
}

export interface ImpostosItem {
  ICMS_CST?: string; ICMS_orig?: string; ICMS_modBC?: string; ICMS_pRedBC?: string;
  ICMS_vBC?: number; ICMS_pICMS?: number; ICMS_vICMS?: number; ICMS_vICMSDeson?: number; ICMS_motDesICMS?: string;
  FCP_vBCFCP?: number; FCP_pFCP?: number; FCP_vFCP?: number;
  ICMSST_modBCST?: string; ICMSST_pMVAST?: number; ICMSST_pRedBCST?: number;
  ICMSST_vBCST?: number; ICMSST_pICMSST?: number; ICMSST_vICMSST?: number;
  ICMSST_vICMSSTDeson?: number; ICMSST_motDesICMSST?: string;
  FCPST_vBCFCPST?: number; FCPST_pFCPST?: number; FCPST_vFCPST?: number;
  IPI_CST?: string; IPI_vBC?: number; IPI_pIPI?: number; IPI_vIPI?: number;
  PIS_CST?: string; PIS_vBC?: number; PIS_pPIS?: number; PIS_vPIS?: number;
  PIS_qBCProd?: number; PIS_vAliqProd?: number;
  COFINS_CST?: string; COFINS_vBC?: number; COFINS_pCOFINS?: number; COFINS_vCOFINS?: number;
  COFINS_qBCProd?: number; COFINS_vAliqProd?: number;
  ISSQN_vBC?: number; ISSQN_vAliq?: number; ISSQN_vISSQN?: number;
  IBSCBS_CST?: string; IBSCBS_cClassTrib?: string; IBSCBS_vBC?: number;
  IBSCBS_pIBSUF?: number; IBSCBS_vIBSUF?: number;
  IBSCBS_pIBSMun?: number; IBSCBS_vIBSMun?: number;
  IBSCBS_vIBS?: number; IBSCBS_pCBS?: number; IBSCBS_vCBS?: number;
}

export interface ItemNota {
  nItem: string;
  cProd?: string;
  cEAN?: string;
  xProd?: string;
  NCM?: string;
  CEST?: string;
  CFOP?: string;
  uCom?: string;
  qCom?: number;
  vUnCom?: number;
  vProd?: number;
  cEANTrib?: string;
  uTrib?: string;
  qTrib?: number;
  vUnTrib?: number;
  indTot?: string;
  vFrete?: number;
  vSeg?: number;
  vDesc?: number;
  vOutro?: number;
  impostos?: ImpostosItem;
  infAdProd?: string;
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

  // Campos protocolares / operação
  tpNF: TipoOperacao;          // 0=Entrada, 1=Saída
  tpEmis: string;              // Tipo de emissão (1=Normal, 9=Contingência off-line, etc.)
  cStat?: string;              // protNFe.infProt.cStat
  xMotivo?: string;            // protNFe.infProt.xMotivo
  nProt?: string;              // protNFe.infProt.nProt
  situacao: SitNota;           // Categorização derivada
  ufEmit?: string;
  ufDest?: string;
  natOp?: string;
  cfopPrincipal?: string;      // CFOP do primeiro item

  vICMS: number;
  vST: number;
  vFCP: number;
  vFCPST: number;
  vIPI: number;
  vPIS: number;
  vCOFINS: number;
  vIBS: number;
  vCBS: number;
  vISSQN: number;

  // Dados estendidos (paridade com nfe_extractor_v3.py)
  emitenteFull?: Emitente;
  destinatarioFull?: Destinatario;
  itens?: ItemNota[];
  transporte?: Record<string, any>;
  cobranca?: Record<string, any>;
  pagamento?: Record<string, any>;
  infAdic?: Record<string, any>;
  respTec?: Record<string, any>;
  protocolo?: Record<string, any>;
  totais?: Record<string, any>;
  identificacao?: Record<string, any>;
}

export interface TaxAggregate {
  totalValue: number;
  totalBase: number;
}

export interface CfopAgg {
  cfop: string;
  descricao: string;
  count: number;
  valor: number;
}

export interface TimeSeriesPoint {
  date: string;       // YYYY-MM-DD
  entrada: number;
  saida: number;
  canceladas: number;
}

export interface DashboardData {
  stats: {
    totalNotas: number;
    modelo55: number;
    modelo65: number;
    totalRevenue: number;
    notasEntrada: number;
    notasSaida: number;
    valorMedio: number;
    autorizadas: number;
    contingencia: number;
    canceladas: number;
    pendencias: number;
    chaveInvalida: number;
  };
  taxCards: { title: string; totalValue: number; totalBase: number }[];
  riskSummary: { alta: number; media: number; baixa: number };
  situacao: {
    autorizadas: number;
    contingencia: number;
    canceladas: number;
    total: number;
  };
  serieTemporal: TimeSeriesPoint[];
  topCfopSaidas: CfopAgg[];
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
