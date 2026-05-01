/// <reference lib="webworker" />
import { Unzip, UnzipInflate } from "fflate";
import { XMLParser } from "fast-xml-parser";
import type {
  CfopAgg,
  DashboardData,
  Destinatario,
  Divergencia,
  Emitente,
  Endereco,
  ImpostosItem,
  ItemNota,
  NotaSimplificada,
  Severity,
  SitNota,
  TimeSeriesPoint,
  TipoOperacao,
  WorkerInbound,
  WorkerOutbound,
} from "@/lib/fiscal-types";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: WorkerOutbound) => ctx.postMessage(m);

const BATCH_SIZE = 5000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = parseFloat(String(v));
  return isFinite(n) ? n : 0;
};
const str = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
};

const taxKeys = ["ICMS", "ICMS_ST", "FCP", "FCP_ST", "IPI", "PIS", "COFINS", "IBS", "CBS", "ISSQN"] as const;
type TaxKey = typeof taxKeys[number];

interface Aggregates {
  totalNotas: number;
  modelo55: number;
  modelo65: number;
  totalRevenue: number;
  notasEntrada: number;
  notasSaida: number;
  autorizadas: number;
  contingencia: number;
  canceladas: number;
  pendencias: number;
  chaveInvalida: number;
  taxes: Record<TaxKey, { totalValue: number; totalBase: number }>;
  risk: { alta: number; media: number; baixa: number };
  serie: Map<string, { entrada: number; saida: number; canceladas: number }>;
  cfopSaida: Map<string, { count: number; valor: number }>;
}

function newAgg(): Aggregates {
  const taxes = {} as Aggregates["taxes"];
  taxKeys.forEach((k) => (taxes[k] = { totalValue: 0, totalBase: 0 }));
  return {
    totalNotas: 0, modelo55: 0, modelo65: 0, totalRevenue: 0,
    notasEntrada: 0, notasSaida: 0,
    autorizadas: 0, contingencia: 0, canceladas: 0, pendencias: 0, chaveInvalida: 0,
    taxes,
    risk: { alta: 0, media: 0, baixa: 0 },
    serie: new Map(),
    cfopSaida: new Map(),
  };
}

function classify(diff: number): Severity {
  const d = Math.abs(diff);
  if (d <= 0.01) return "BAIXA";
  if (d <= 5.0) return "MEDIA";
  return "ALTA";
}

function asArray<T>(x: T | T[] | undefined): T[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

function findDeep(obj: any, key: string): any {
  if (!obj || typeof obj !== "object") return undefined;
  if (key in obj) return obj[key];
  for (const k of Object.keys(obj)) {
    const r = findDeep(obj[k], key);
    if (r !== undefined) return r;
  }
  return undefined;
}

function recursiveDict(el: any): Record<string, any> {
  if (el === null || el === undefined) return {};
  if (typeof el !== "object") return { value: String(el) };
  const out: Record<string, any> = {};
  for (const k of Object.keys(el)) {
    const v = (el as any)[k];
    if (v === null || v === undefined) continue;
    if (typeof v === "object") {
      if (Array.isArray(v)) out[k] = v.map((x) => (typeof x === "object" ? recursiveDict(x) : x));
      else out[k] = recursiveDict(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function parseEndereco(e: any): Endereco | undefined {
  if (!e) return undefined;
  return {
    xLgr: str(e.xLgr), nro: str(e.nro), xCpl: str(e.xCpl),
    xBairro: str(e.xBairro), cMun: str(e.cMun), xMun: str(e.xMun),
    UF: str(e.UF), CEP: str(e.CEP), cPais: str(e.cPais),
    xPais: str(e.xPais), fone: str(e.fone),
  };
}

function parseEmit(emit: any): Emitente | undefined {
  if (!emit) return undefined;
  return {
    CNPJ: str(emit.CNPJ), CPF: str(emit.CPF),
    xNome: str(emit.xNome), xFant: str(emit.xFant),
    IE: str(emit.IE), IEST: str(emit.IEST), IM: str(emit.IM),
    CNAE: str(emit.CNAE), CRT: str(emit.CRT),
    endereco: parseEndereco(emit.enderEmit),
  };
}

function parseDest(dest: any): Destinatario | undefined {
  if (!dest) return undefined;
  return {
    CNPJ: str(dest.CNPJ), CPF: str(dest.CPF),
    idEstrangeiro: str(dest.idEstrangeiro),
    xNome: str(dest.xNome),
    IE: str(dest.IE), ISUF: str(dest.ISUF), IM: str(dest.IM),
    email: str(dest.email), indIEDest: str(dest.indIEDest),
    endereco: parseEndereco(dest.enderDest),
  };
}

function parseImpostos(imposto: any): ImpostosItem {
  const out: ImpostosItem = {};
  if (!imposto) return out;

  // ICMS
  const icmsBlock = imposto.ICMS;
  if (icmsBlock && typeof icmsBlock === "object") {
    for (const k of Object.keys(icmsBlock)) {
      if (!k.startsWith("ICMS")) continue;
      const node = icmsBlock[k];
      if (!node || typeof node !== "object") continue;
      out.ICMS_CST = str(node.CST) ?? str(node.CSOSN);
      out.ICMS_orig = str(node.orig);
      out.ICMS_modBC = str(node.modBC);
      out.ICMS_pRedBC = str(node.pRedBC);
      out.ICMS_vBC = num(node.vBC);
      out.ICMS_pICMS = num(node.pICMS);
      out.ICMS_vICMS = num(node.vICMS);
      out.ICMS_vICMSDeson = num(node.vICMSDeson);
      out.ICMS_motDesICMS = str(node.motDesICMS);

      out.FCP_vBCFCP = num(node.vBCFCP);
      out.FCP_pFCP = num(node.pFCP);
      out.FCP_vFCP = num(node.vFCP);

      out.ICMSST_modBCST = str(node.modBCST);
      out.ICMSST_pMVAST = num(node.pMVAST);
      out.ICMSST_pRedBCST = num(node.pRedBCST);
      out.ICMSST_vBCST = num(node.vBCST);
      out.ICMSST_pICMSST = num(node.pICMSST);
      out.ICMSST_vICMSST = num(node.vICMSST);
      out.ICMSST_vICMSSTDeson = num(node.vICMSSTDeson);
      out.ICMSST_motDesICMSST = str(node.motDesICMSST);

      out.FCPST_vBCFCPST = num(node.vBCFCPST);
      out.FCPST_pFCPST = num(node.pFCPST);
      out.FCPST_vFCPST = num(node.vFCPST);
      break;
    }
  }

  // IPI
  const ipi = imposto.IPI;
  if (ipi) {
    if (ipi.IPITrib) {
      out.IPI_CST = str(ipi.IPITrib.CST);
      out.IPI_vBC = num(ipi.IPITrib.vBC);
      out.IPI_pIPI = num(ipi.IPITrib.pIPI);
      out.IPI_vIPI = num(ipi.IPITrib.vIPI);
    } else if (ipi.IPINT) {
      out.IPI_CST = str(ipi.IPINT.CST);
    }
  }

  // PIS
  const pis = imposto.PIS;
  if (pis) {
    const aliq = pis.PISAliq, qtde = pis.PISQtde, nt = pis.PISNT, outr = pis.PISOutr;
    if (aliq) {
      out.PIS_CST = str(aliq.CST); out.PIS_vBC = num(aliq.vBC);
      out.PIS_pPIS = num(aliq.pPIS); out.PIS_vPIS = num(aliq.vPIS);
    } else if (qtde) {
      out.PIS_CST = str(qtde.CST);
      out.PIS_qBCProd = num(qtde.qBCProd);
      out.PIS_vAliqProd = num(qtde.vAliqProd);
      out.PIS_vPIS = num(qtde.vPIS);
    } else if (nt) {
      out.PIS_CST = str(nt.CST);
    } else if (outr) {
      out.PIS_CST = str(outr.CST); out.PIS_vBC = num(outr.vBC);
      out.PIS_pPIS = num(outr.pPIS);
      out.PIS_qBCProd = num(outr.qBCProd);
      out.PIS_vAliqProd = num(outr.vAliqProd);
      out.PIS_vPIS = num(outr.vPIS);
    }
  }

  // COFINS
  const cof = imposto.COFINS;
  if (cof) {
    const aliq = cof.COFINSAliq, qtde = cof.COFINSQtde, nt = cof.COFINSNT, outr = cof.COFINSOutr;
    if (aliq) {
      out.COFINS_CST = str(aliq.CST); out.COFINS_vBC = num(aliq.vBC);
      out.COFINS_pCOFINS = num(aliq.pCOFINS); out.COFINS_vCOFINS = num(aliq.vCOFINS);
    } else if (qtde) {
      out.COFINS_CST = str(qtde.CST); out.COFINS_vBC = num(qtde.vBC);
      out.COFINS_qBCProd = num(qtde.qBCProd);
      out.COFINS_vAliqProd = num(qtde.vAliqProd);
      out.COFINS_vCOFINS = num(qtde.vCOFINS);
    } else if (nt) {
      out.COFINS_CST = str(nt.CST);
    } else if (outr) {
      out.COFINS_CST = str(outr.CST); out.COFINS_vBC = num(outr.vBC);
      out.COFINS_pCOFINS = num(outr.pCOFINS);
      out.COFINS_qBCProd = num(outr.qBCProd);
      out.COFINS_vAliqProd = num(outr.vAliqProd);
      out.COFINS_vCOFINS = num(outr.vCOFINS);
    }
  }

  // ISSQN
  const iss = imposto.ISSQN;
  if (iss) {
    out.ISSQN_vBC = num(iss.vBC);
    out.ISSQN_vAliq = num(iss.vAliq);
    out.ISSQN_vISSQN = num(iss.vISSQN);
  }

  // IBSCBS (reforma tributária)
  const ibsg = imposto.IBSCBS;
  if (ibsg) {
    out.IBSCBS_CST = str(ibsg.CST);
    out.IBSCBS_cClassTrib = str(ibsg.cClassTrib);
    const g = ibsg.gIBSCBS;
    if (g) {
      out.IBSCBS_vBC = num(g.vBC);
      if (g.gIBSUF) {
        out.IBSCBS_pIBSUF = num(g.gIBSUF.pIBSUF);
        out.IBSCBS_vIBSUF = num(g.gIBSUF.vIBSUF);
      }
      if (g.gIBSMun) {
        out.IBSCBS_pIBSMun = num(g.gIBSMun.pIBSMun);
        out.IBSCBS_vIBSMun = num(g.gIBSMun.vIBSMun);
      }
      out.IBSCBS_vIBS = num(g.vIBS);
      if (g.gCBS) {
        out.IBSCBS_pCBS = num(g.gCBS.pCBS);
        out.IBSCBS_vCBS = num(g.gCBS.vCBS);
      }
    }
  }

  return out;
}

function parseItens(dets: any[]): ItemNota[] {
  return dets.map((det) => {
    const prod = det.prod ?? {};
    const item: ItemNota = {
      nItem: String(det.nItem ?? ""),
      cProd: str(prod.cProd), cEAN: str(prod.cEAN), xProd: str(prod.xProd),
      NCM: str(prod.NCM), CEST: str(prod.CEST), CFOP: str(prod.CFOP),
      uCom: str(prod.uCom), qCom: num(prod.qCom),
      vUnCom: num(prod.vUnCom), vProd: num(prod.vProd),
      cEANTrib: str(prod.cEANTrib), uTrib: str(prod.uTrib),
      qTrib: num(prod.qTrib), vUnTrib: num(prod.vUnTrib),
      indTot: str(prod.indTot),
      vFrete: num(prod.vFrete), vSeg: num(prod.vSeg),
      vDesc: num(prod.vDesc), vOutro: num(prod.vOutro),
      impostos: parseImpostos(det.imposto),
      infAdProd: str(det.infAdProd),
    };
    return item;
  });
}

/** Mapeia cStat (e fallback tpEmis) para situação categórica.
 *  100=Autorizada · 101/151/155=Cancelada/EvCancel · 110/301/302=Denegada
 *  150=Autorizada fora prazo · tpEmis≠1 ⇒ Contingência · demais ⇒ Rejeitada/Pendência */
function classifySituacao(cStat: string | undefined, tpEmis: string): SitNota {
  const c = (cStat ?? "").trim();
  if (c === "100" || c === "150") {
    return tpEmis && tpEmis !== "1" ? "CONTINGENCIA" : "AUTORIZADA";
  }
  if (c === "101" || c === "151" || c === "135" /* evento cancel homologado */) return "CANCELADA";
  if (c === "155") return "CANCELADA";
  if (c === "110" || c === "301" || c === "302") return "DENEGADA";
  if (c === "102") return "INUTILIZADA";
  if (c) return "REJEITADA";
  if (tpEmis && tpEmis !== "1") return "CONTINGENCIA";
  return "DESCONHECIDA";
}

function emissionDate(emissao: string): string | null {
  if (!emissao) return null;
  // dhEmi: 2024-05-12T10:23:55-03:00 ; dEmi: 2024-05-12
  const m = emissao.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

interface Processed {
  nota: NotaSimplificada;
  divergencias: Divergencia[];
  taxes: Partial<Record<TaxKey, { v: number; b: number }>>;
}

function processXml(xmlText: string): Processed | null {
  let doc: any;
  try { doc = parser.parse(xmlText); } catch { return null; }
  const nfeProc = doc?.nfeProc ?? doc;
  const NFe = nfeProc?.NFe ?? nfeProc?.nfe;
  if (!NFe) return null;
  const inf = NFe.infNFe ?? NFe.infnfe;
  if (!inf) return null;

  const ide = inf.ide ?? {};
  const emit = inf.emit ?? {};
  const dest = inf.dest ?? {};
  const total = inf.total ?? {};
  const ICMSTot = total.ICMSTot;
  const IBSCBSTot = total.IBSCBSTot;

  const chave = String(inf.Id ?? "").replace(/^NFe/i, "") || "";
  const mod = parseInt(String(ide.mod ?? "55"), 10) === 65 ? 65 : 55;
  const tpNFraw = String(ide.tpNF ?? "1");
  const tpNF: TipoOperacao = tpNFraw === "0" ? "ENTRADA" : "SAIDA";
  const tpEmis = String(ide.tpEmis ?? "1");

  // Protocolo
  const prot = nfeProc?.protNFe?.infProt ?? findDeep(doc, "infProt") ?? {};
  const cStat = str(prot.cStat);
  const xMotivo = str(prot.xMotivo);
  const nProt = str(prot.nProt);
  const situacao = classifySituacao(cStat, tpEmis);

  const dets = asArray<any>(inf.det);
  let somaItens = 0;
  const itemAcc: Record<TaxKey, { v: number; b: number }> = {
    ICMS: { v: 0, b: 0 }, ICMS_ST: { v: 0, b: 0 },
    FCP: { v: 0, b: 0 }, FCP_ST: { v: 0, b: 0 },
    IPI: { v: 0, b: 0 }, PIS: { v: 0, b: 0 }, COFINS: { v: 0, b: 0 },
    IBS: { v: 0, b: 0 }, CBS: { v: 0, b: 0 }, ISSQN: { v: 0, b: 0 },
  };

  let cfopPrincipal: string | undefined;

  for (const det of dets) {
    const prod = det.prod ?? {};
    if (!cfopPrincipal && prod.CFOP) cfopPrincipal = String(prod.CFOP);
    somaItens += num(prod.vProd);
    const imposto = det.imposto ?? {};

    const icmsBlock = imposto.ICMS;
    if (icmsBlock && typeof icmsBlock === "object") {
      for (const k of Object.keys(icmsBlock)) {
        const node = icmsBlock[k];
        if (!node || typeof node !== "object") continue;
        itemAcc.ICMS.v += num(node.vICMS);
        itemAcc.ICMS.b += num(node.vBC);
        itemAcc.ICMS_ST.v += num(node.vICMSST);
        itemAcc.ICMS_ST.b += num(node.vBCST);
        itemAcc.FCP.v += num(node.vFCP);
        itemAcc.FCP_ST.v += num(node.vFCPST);
      }
    }
    const pisNode = imposto.PIS;
    if (pisNode && typeof pisNode === "object") {
      for (const k of Object.keys(pisNode)) {
        const node = pisNode[k];
        if (!node || typeof node !== "object") continue;
        itemAcc.PIS.v += num(node.vPIS);
        itemAcc.PIS.b += num(node.vBC);
      }
    }
    const cofinsNode = imposto.COFINS;
    if (cofinsNode && typeof cofinsNode === "object") {
      for (const k of Object.keys(cofinsNode)) {
        const node = cofinsNode[k];
        if (!node || typeof node !== "object") continue;
        itemAcc.COFINS.v += num(node.vCOFINS);
        itemAcc.COFINS.b += num(node.vBC);
      }
    }
    if (imposto.IPI?.IPITrib) {
      itemAcc.IPI.v += num(imposto.IPI.IPITrib.vIPI);
      itemAcc.IPI.b += num(imposto.IPI.IPITrib.vBC);
    }
    if (imposto.ISSQN) {
      itemAcc.ISSQN.v += num(imposto.ISSQN.vISSQN);
      itemAcc.ISSQN.b += num(imposto.ISSQN.vBC);
    }
    const vIBSItem = num(findDeep(imposto, "vIBS"));
    const vCBSItem = num(findDeep(imposto, "vCBS"));
    const bcIBSCBSItem = num(findDeep(imposto, "vBCIBSCBS"));
    if (vIBSItem) itemAcc.IBS.v += vIBSItem;
    if (vCBSItem) itemAcc.CBS.v += vCBSItem;
    if (bcIBSCBSItem) {
      itemAcc.IBS.b += bcIBSCBSItem;
      itemAcc.CBS.b += bcIBSCBSItem;
    }
  }

  const temICMSTot = !!ICMSTot;
  const valorDeclarado = temICMSTot ? num(ICMSTot.vNF) : null;
  const valorOficial = temICMSTot ? (valorDeclarado as number) : somaItens;
  const fonte = temICMSTot ? "ICMSTot" : "TOTAL_AUSENTE";

  const oficial: Record<TaxKey, { v: number; b: number }> = {
    ICMS: { v: 0, b: 0 }, ICMS_ST: { v: 0, b: 0 },
    FCP: { v: 0, b: 0 }, FCP_ST: { v: 0, b: 0 },
    IPI: { v: 0, b: 0 }, PIS: { v: 0, b: 0 }, COFINS: { v: 0, b: 0 },
    IBS: { v: 0, b: 0 }, CBS: { v: 0, b: 0 }, ISSQN: { v: 0, b: 0 },
  };

  if (temICMSTot) {
    oficial.ICMS = { v: num(ICMSTot.vICMS), b: num(ICMSTot.vBC) };
    oficial.ICMS_ST = { v: num(ICMSTot.vST), b: num(ICMSTot.vBCST) };
    oficial.FCP = { v: num(ICMSTot.vFCP), b: 0 };
    oficial.FCP_ST = { v: num(ICMSTot.vFCPST), b: 0 };
    oficial.IPI = { v: num(ICMSTot.vIPI), b: itemAcc.IPI.b };
    oficial.PIS = { v: num(ICMSTot.vPIS), b: itemAcc.PIS.b };
    oficial.COFINS = { v: num(ICMSTot.vCOFINS), b: itemAcc.COFINS.b };
    oficial.ISSQN = { v: itemAcc.ISSQN.v, b: itemAcc.ISSQN.b };
  } else {
    Object.assign(oficial, itemAcc);
  }

  if (IBSCBSTot) {
    const vIBS = num(findDeep(IBSCBSTot, "vIBS"));
    const vCBS = num(findDeep(IBSCBSTot, "vCBS"));
    const bcIBSCBS = num(findDeep(IBSCBSTot, "vBCIBSCBS"));
    oficial.IBS = { v: vIBS, b: bcIBSCBS };
    oficial.CBS = { v: vCBS, b: bcIBSCBS };
  } else if (temICMSTot) {
    oficial.IBS = itemAcc.IBS;
    oficial.CBS = itemAcc.CBS;
  }

  const divergencias: Divergencia[] = [];
  let gravidadeNota: Severity | null = null;
  let statusNota: NotaSimplificada["status"] = null;

  if (temICMSTot) {
    const diff = somaItens - (valorDeclarado as number);
    if (Math.abs(diff) > 0.001) {
      const grav = classify(diff);
      const status = grav === "ALTA" ? "CRITICO" : "CORRIGIDO";
      gravidadeNota = grav;
      statusNota = status;
      divergencias.push({
        chave, tipo: "TOTAL_DIVERGENTE", campo: "vNF",
        valorCalculado: somaItens,
        valorDeclarado: valorDeclarado as number,
        diferenca: diff, gravidade: grav, status,
      });
    }
  } else {
    gravidadeNota = "MEDIA";
    statusNota = "CORRIGIDO";
    divergencias.push({
      chave, tipo: "TOTAL_AUSENTE", campo: "ICMSTot",
      valorCalculado: somaItens, valorDeclarado: 0,
      diferenca: somaItens, gravidade: "MEDIA", status: "CORRIGIDO",
    });
  }

  const emitFull = parseEmit(emit);
  const destFull = parseDest(dest);
  const itens = parseItens(dets);

  const nota: NotaSimplificada = {
    chave,
    modelo: mod as 55 | 65,
    numero: String(ide.nNF ?? ""),
    serie: String(ide.serie ?? ""),
    emissao: String(ide.dhEmi ?? ide.dEmi ?? ""),
    emitente: String(emit.xNome ?? ""),
    cnpjEmit: String(emit.CNPJ ?? emit.CPF ?? ""),
    destinatario: String(dest.xNome ?? ""),
    valorOficial,
    valorDeclarado,
    valorItens: somaItens,
    qtdItens: dets.length,
    divergencia: gravidadeNota,
    status: statusNota,
    fonte,

    tpNF, tpEmis, cStat, xMotivo, nProt, situacao,
    ufEmit: str(emit.enderEmit?.UF),
    ufDest: str(dest.enderDest?.UF),
    natOp: str(ide.natOp),
    cfopPrincipal,

    vICMS: oficial.ICMS.v,
    vST: oficial.ICMS_ST.v,
    vFCP: oficial.FCP.v,
    vFCPST: oficial.FCP_ST.v,
    vIPI: oficial.IPI.v,
    vPIS: oficial.PIS.v,
    vCOFINS: oficial.COFINS.v,
    vIBS: oficial.IBS.v,
    vCBS: oficial.CBS.v,
    vISSQN: oficial.ISSQN.v,

    emitenteFull: emitFull,
    destinatarioFull: destFull,
    itens,
    transporte: inf.transp ? recursiveDict(inf.transp) : undefined,
    cobranca: inf.cobr ? recursiveDict(inf.cobr) : undefined,
    pagamento: inf.pag ? recursiveDict(inf.pag) : undefined,
    infAdic: inf.infAdic ? recursiveDict(inf.infAdic) : undefined,
    respTec: inf.infRespTec ? recursiveDict(inf.infRespTec) : undefined,
    protocolo: prot && Object.keys(prot).length ? recursiveDict(prot) : undefined,
    totais: total ? recursiveDict(total) : undefined,
    identificacao: ide ? recursiveDict(ide) : undefined,
  };

  const taxesOut: Processed["taxes"] = {};
  for (const k of taxKeys) {
    const t = oficial[k];
    if (t.v || t.b) taxesOut[k] = { v: t.v, b: t.b };
  }

  return { nota, divergencias, taxes: taxesOut };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const buf = await crypto.subtle.digest("SHA-256", ab);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const decoder = new TextDecoder("utf-8", { fatal: false });

// Descrições resumidas de CFOPs comuns (fallback "—" para os ausentes)
const CFOP_DESC: Record<string, string> = {
  "5101": "Venda de produção do estabelecimento",
  "5102": "Venda de mercadoria adquirida ou recebida de terceiros",
  "5103": "Venda de produção, efetuada fora do estabelecimento",
  "5104": "Venda de mercadoria adquirida, efetuada fora do estabelecimento",
  "5111": "Venda de produção do estabelecimento",
  "5113": "Venda de produção remetida anteriormente em consignação",
  "5118": "Venda de produção entregue ao destinatário por conta de terceiros",
  "5401": "Venda de produção - sujeita a ST",
  "5403": "Venda de mercadoria adquirida - sujeita a ST",
  "5405": "Venda de mercadoria adquirida - ST retida anteriormente",
  "5667": "Venda de combustível ou lubrificante - consumidor",
  "5910": "Remessa em bonificação, doação ou brinde",
  "5949": "Outra saída de mercadoria não especificada",
  "5102_": "",
  "6101": "Venda de produção - outro Estado",
  "6102": "Venda de mercadoria adquirida - outro Estado",
  "6108": "Venda de mercadoria - não contribuinte - outro Estado",
  "6404": "Venda de mercadoria - ST - outro Estado",
};

async function run(file: File) {
  const start = performance.now();

  post({ type: "state", state: "uploaded", message: "Arquivo recebido" });
  post({ type: "progress", phase: "upload", current: file.size, total: file.size });

  post({ type: "state", state: "extracting", message: "Descompactando ZIP…" });
  const xmls: Uint8Array[] = [];
  const totalBytes = file.size;
  let bytesRead = 0;

  await new Promise<void>((resolve, reject) => {
    const unzip = new Unzip((stream) => {
      if (!stream.name.toLowerCase().endsWith(".xml")) {
        stream.ondata = () => {};
        stream.start();
        return;
      }
      const chunks: Uint8Array[] = [];
      stream.ondata = (err, data, final) => {
        if (err) return reject(err);
        if (data && data.length) chunks.push(data);
        if (final) {
          let total = 0;
          for (const c of chunks) total += c.length;
          const merged = new Uint8Array(total);
          let o = 0;
          for (const c of chunks) {
            merged.set(c, o);
            o += c.length;
          }
          xmls.push(merged);
        }
      };
      stream.start();
    });
    unzip.register(UnzipInflate);

    const reader = file.stream().getReader();
    const pump = (): Promise<void> =>
      reader.read().then(({ done, value }) => {
        if (done) {
          unzip.push(new Uint8Array(0), true);
          post({ type: "progress", phase: "extract", current: totalBytes, total: totalBytes });
          return;
        }
        bytesRead += value!.length;
        unzip.push(value!, false);
        post({ type: "progress", phase: "extract", current: bytesRead, total: totalBytes });
        return pump();
      });
    pump().then(resolve).catch(reject);
  });

  const totalXmls = xmls.length;
  post({
    type: "state",
    state: "processing",
    message: `${totalXmls.toLocaleString("pt-BR")} XMLs extraídos. Processando em lotes de ${BATCH_SIZE}…`,
  });

  const agg = newAgg();
  const notas: NotaSimplificada[] = [];
  const divergencias: Divergencia[] = [];
  const seen = new Set<string>();
  let processed = 0;
  let batchIndex = 0;

  for (let offset = 0; offset < totalXmls; offset += BATCH_SIZE) {
    batchIndex += 1;
    const end = Math.min(offset + BATCH_SIZE, totalXmls);
    for (let i = offset; i < end; i++) {
      const bytes = xmls[i];
      const hash = await sha256Hex(bytes);
      processed++;
      if (seen.has(hash)) continue;
      seen.add(hash);
      const text = decoder.decode(bytes);
      const r = processXml(text);
      if (!r) { agg.chaveInvalida++; continue; }

      agg.totalNotas++;
      if (r.nota.modelo === 55) agg.modelo55++; else agg.modelo65++;
      agg.totalRevenue += r.nota.valorOficial;

      if (r.nota.tpNF === "ENTRADA") agg.notasEntrada++;
      else agg.notasSaida++;

      switch (r.nota.situacao) {
        case "AUTORIZADA": agg.autorizadas++; break;
        case "CONTINGENCIA": agg.contingencia++; break;
        case "CANCELADA": agg.canceladas++; break;
        case "DENEGADA":
        case "REJEITADA":
        case "INUTILIZADA": agg.pendencias++; break;
        case "DESCONHECIDA": agg.chaveInvalida++; break;
      }

      // Série temporal por dia
      const day = emissionDate(r.nota.emissao);
      if (day) {
        const cur = agg.serie.get(day) ?? { entrada: 0, saida: 0, canceladas: 0 };
        if (r.nota.situacao === "CANCELADA") cur.canceladas++;
        else if (r.nota.tpNF === "ENTRADA") cur.entrada++;
        else cur.saida++;
        agg.serie.set(day, cur);
      }

      // Top CFOPs (saídas)
      if (r.nota.tpNF === "SAIDA" && r.nota.cfopPrincipal) {
        const c = r.nota.cfopPrincipal;
        const cur = agg.cfopSaida.get(c) ?? { count: 0, valor: 0 };
        cur.count++;
        cur.valor += r.nota.valorOficial;
        agg.cfopSaida.set(c, cur);
      }

      for (const k of Object.keys(r.taxes) as (keyof typeof r.taxes)[]) {
        const t = r.taxes[k]!;
        agg.taxes[k].totalValue += t.v;
        agg.taxes[k].totalBase += t.b;
      }
      if (r.nota.divergencia === "ALTA") agg.risk.alta++;
      else if (r.nota.divergencia === "MEDIA") agg.risk.media++;
      else if (r.nota.divergencia === "BAIXA") agg.risk.baixa++;
      notas.push(r.nota);
      for (const d of r.divergencias) divergencias.push(d);
    }
    for (let i = offset; i < end; i++) (xmls as any)[i] = null;
    post({ type: "progress", phase: "process", current: processed, total: totalXmls, batch: batchIndex });
    await new Promise((r) => setTimeout(r, 0));
  }

  post({ type: "state", state: "consolidating", message: "Consolidando indicadores…" });
  post({ type: "progress", phase: "consolidate", current: 0, total: 1 });

  const serieTemporal: TimeSeriesPoint[] = [...agg.serie.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  const topCfopSaidas: CfopAgg[] = [...agg.cfopSaida.entries()]
    .map(([cfop, v]) => ({
      cfop,
      descricao: CFOP_DESC[cfop] ?? "Operação fiscal",
      count: v.count,
      valor: v.valor,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const valorMedio = agg.totalNotas ? agg.totalRevenue / agg.totalNotas : 0;
  const totalSit = agg.autorizadas + agg.contingencia + agg.canceladas;

  const dashboard: DashboardData = {
    stats: {
      totalNotas: agg.totalNotas,
      modelo55: agg.modelo55,
      modelo65: agg.modelo65,
      totalRevenue: agg.totalRevenue,
      notasEntrada: agg.notasEntrada,
      notasSaida: agg.notasSaida,
      valorMedio,
      autorizadas: agg.autorizadas,
      contingencia: agg.contingencia,
      canceladas: agg.canceladas,
      pendencias: agg.pendencias,
      chaveInvalida: agg.chaveInvalida,
    },
    taxCards: taxKeys
      .map((k) => ({ title: k, totalValue: agg.taxes[k].totalValue, totalBase: agg.taxes[k].totalBase }))
      .filter((c) => c.totalValue > 0 || c.totalBase > 0),
    riskSummary: agg.risk,
    situacao: {
      autorizadas: agg.autorizadas,
      contingencia: agg.contingencia,
      canceladas: agg.canceladas,
      total: totalSit || agg.totalNotas,
    },
    serieTemporal,
    topCfopSaidas,
    screensOrder: ["Upload", "Dashboard", "Notas", "Auditoria", "Divergências"],
  };

  post({ type: "progress", phase: "consolidate", current: 1, total: 1 });
  post({ type: "state", state: "finished" });
  post({
    type: "done",
    dashboard,
    notas,
    divergencias,
    duracaoMs: performance.now() - start,
  });
}

ctx.onmessage = (e: MessageEvent<WorkerInbound>) => {
  const msg = e.data;
  if (msg.type === "start") {
    run(msg.file).catch((err) => post({ type: "error", message: String(err?.message ?? err) }));
  }
};
