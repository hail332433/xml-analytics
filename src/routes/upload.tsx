import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { Upload as UploadIcon, FileArchive, Zap, Database, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFiscalStore } from "@/store/fiscal-store";
import { startPipeline } from "@/lib/run-pipeline";
import { fmtBytes, fmtDur } from "@/lib/format";
import PipelineStatus from "@/components/PipelineStatus";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Upload XML — Extrator Fiscal" },
      { name: "description", content: "Envie ZIPs com XMLs de NF-e / NFC-e para extração e auditoria." },
    ],
  }),
  component: UploadPage,
});

function UploadPage() {
  const navigate = useNavigate();
  const { state, fileName, fileSize, error, duracaoMs, dashboard } = useFiscalStore();
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      alert("Envie um arquivo .zip contendo os XMLs.");
      return;
    }
    startPipeline(file);
  }, []);

  const busy = !["idle", "finished", "error"].includes(state);

  return (
    <div className="px-10 py-10 max-w-5xl mx-auto space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Upload de Arquivos XML</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Suporta múltiplos .xml ou .zip até 500 MB. Processamento em lotes de 5.000 arquivos.
        </p>
      </header>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed transition p-14 text-center cursor-pointer bg-card
          ${drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}
          ${busy ? "opacity-60 pointer-events-none" : ""}`}
      >
        <div className="size-14 mx-auto rounded-full bg-primary/10 grid place-items-center">
          <UploadIcon className="size-6 text-primary" />
        </div>
        <h2 className="mt-5 text-base font-semibold text-foreground">Arraste ou clique para selecionar</h2>
        <p className="text-sm text-muted-foreground mt-1.5">
          <span className="text-primary font-medium">.xml</span> individuais ou{" "}
          <span className="text-primary font-medium">.zip</span> com múltiplos XMLs (max 500 MB)
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        {fileName && (
          <div className="mt-6 inline-flex items-center gap-3 rounded-lg border bg-secondary px-4 py-2 text-sm">
            <FileArchive className="size-4 text-primary" />
            <span className="font-medium">{fileName}</span>
            <span className="text-muted-foreground num">· {fmtBytes(fileSize)}</span>
          </div>
        )}
      </div>

      <PipelineStatus />

      {state === "error" && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Falha: {error}
        </div>
      )}

      {state === "finished" && dashboard && (
        <div className="rounded-xl border bg-card p-6 shadow-elegant flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-success font-semibold">Concluído</div>
            <div className="text-lg font-medium mt-1">
              {dashboard.stats.totalNotas.toLocaleString("pt-BR")} notas processadas em {fmtDur(duracaoMs)}
            </div>
          </div>
          <Button onClick={() => navigate({ to: "/dashboard" })}>Abrir Dashboard →</Button>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4 pt-4">
        {[
          { i: Zap, t: "Streaming ZIP", d: "Sem extractall — leitura entry-by-entry via fflate." },
          { i: Cpu, t: "Web Worker", d: "Pipeline isolado em thread dedicada, UI nunca trava." },
          { i: Database, t: "Lotes de 5.000", d: "GC entre lotes mantém memória constante." },
        ].map((c) => (
          <div key={c.t} className="rounded-xl border bg-card p-5">
            <c.i className="size-5 text-primary" />
            <div className="font-medium mt-3">{c.t}</div>
            <div className="text-sm text-muted-foreground mt-1">{c.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
