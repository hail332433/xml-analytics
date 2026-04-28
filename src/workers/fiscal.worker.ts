/// <reference lib="webworker" />
import { Unzip, UnzipInflate } from "fflate";
import { XMLParser } from "fast-xml-parser";
import type {
  DashboardData,
  Divergencia,
  NotaSimplificada,
  Severity,
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

const taxKeys = ["ICMS", "ICMS_ST", "FCP", "FCP_ST", "IPI", "PIS", "COFINS", "IBS", "CBS", "ISSQN"] as const;
type TaxKey = typeof taxKeys[number];

interface Aggregates {
  totalNotas: number;
  modelo55: number;
  modelo65: number;
  totalRevenue: number;
  taxes: Record<TaxKey, { totalValue: number; totalBase: number }>;
  risk: { alta: number; media: number; baixa: number };
}

function newAgg(): Aggregates {
  const taxes = {} as Aggregates["taxes"];
  taxKeys.forEach((k) => (taxes[k] = { totalValue: 0, totalBase: 0 }));
  return {
    totalNotas: 0,
    modelo55: 0,
    modelo65: 0,
    totalRevenue: 0,
    taxes,
    risk: { alta: 0, media: 0, baixa: 0 },
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

interface Processed {
  nota: NotaSimplificada;
  divergencias: Divergencia[];
  taxes: Partial<Record<TaxKey, { v: number; b: number }>>;
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

function processXml(xmlText: string): Processed | null {
  let doc: any;
  try {
    doc = parser.parse(xmlText);
  } catch {
    return null;
  }
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

  const dets = asArray<any>(inf.det);
  let somaItens = 0;
  const itemAcc: Record<TaxKey, { v: number; b: number }> = {
    ICMS: { v: 0, b: 0 }, ICMS_ST: { v: 0, b: 0 },
    FCP: { v: 0, b: 0 }, FCP_ST: { v: 0, b: 0 },
    IPI: { v: 0, b: 0 }, PIS: { v: 0, b: 0 }, COFINS: { v: 0, b: 0 },
    IBS: { v: 0, b: 0 }, CBS: { v: 0, b: 0 }, ISSQN: { v: 0, b: 0 },
  };

  for (const det of dets) {
    const prod = det.prod ?? {};
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
    ICMS:    { v: 0, b: 0 }, ICMS_ST: { v: 0, b: 0 },
    FCP:     { v: 0, b: 0 }, FCP_ST:  { v: 0, b: 0 },
    IPI:     { v: 0, b: 0 }, PIS:     { v: 0, b: 0 }, COFINS: { v: 0, b: 0 },
    IBS:     { v: 0, b: 0 }, CBS:     { v: 0, b: 0 }, ISSQN:  { v: 0, b: 0 },
  };

  if (temICMSTot) {
    oficial.ICMS    = { v: num(ICMSTot.vICMS),   b: num(ICMSTot.vBC) };
    oficial.ICMS_ST = { v: num(ICMSTot.vST),     b: num(ICMSTot.vBCST) };
    oficial.FCP     = { v: num(ICMSTot.vFCP),    b: 0 };
    oficial.FCP_ST  = { v: num(ICMSTot.vFCPST),  b: 0 };
    oficial.IPI     = { v: num(ICMSTot.vIPI),    b: itemAcc.IPI.b };
    oficial.PIS     = { v: num(ICMSTot.vPIS),    b: itemAcc.PIS.b };
    oficial.COFINS  = { v: num(ICMSTot.vCOFINS), b: itemAcc.COFINS.b };
    oficial.ISSQN   = { v: itemAcc.ISSQN.v,      b: itemAcc.ISSQN.b };
  } else {
    Object.assign(oficial, itemAcc);
  }

  if (IBSCBSTot) {
    const vIBS = num(findDeep(IBSCBSTot, "vIBS"));
    const vCBS = num(findDeep(IBSCBSTot, "vCBS"));
    const bcIBSCBS = num(findDeep(IBSCBSTot, "vBCIBSCBS"));
    oficial.IBS = { v: vIBS, b: bcIBSCBS };
    oficial.CBS = { v: vCBS, b: bcIBSCBS };
  } else if (!temICMSTot) {
    // já preenchido pelo Object.assign acima
  } else {
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
    vICMS: oficial.ICMS.v,
    vST: oficial.ICMS_ST.v,
    vFCP: oficial.FCP.v,
    vFCPST: oficial.FCP_ST.v,
    vIPI: oficial.IPI.v,
    vPIS: oficial.PIS.v,
    vCOFINS: oficial.COFINS.v,
    vIBS: oficial.IBS.v,
    vCBS: oficial.CBS.v,
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
      if (!r) continue;
      agg.totalNotas++;
      if (r.nota.modelo === 55) agg.modelo55++;
      else agg.modelo65++;
      agg.totalRevenue += r.nota.valorOficial;
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

  const dashboard: DashboardData = {
    stats: {
      totalNotas: agg.totalNotas,
      modelo55: agg.modelo55,
      modelo65: agg.modelo65,
      totalRevenue: agg.totalRevenue,
    },
    taxCards: taxKeys
      .map((k) => ({ title: k, totalValue: agg.taxes[k].totalValue, totalBase: agg.taxes[k].totalBase }))
      .filter((c) => c.totalValue > 0 || c.totalBase > 0),
    riskSummary: agg.risk,
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
