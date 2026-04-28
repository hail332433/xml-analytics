import { useFiscalStore } from "@/store/fiscal-store";
import type { WorkerOutbound } from "./fiscal-types";

let worker: Worker | null = null;

export function startPipeline(file: File) {
  const store = useFiscalStore.getState();
  store.reset();
  store.set({
    state: "uploading",
    fileName: file.name,
    fileSize: file.size,
    message: "Carregando arquivo…",
    phase: "upload",
  });
  store.setProgress({ phase: "upload", current: file.size, total: file.size });

  if (worker) worker.terminate();
  worker = new Worker(new URL("../workers/fiscal.worker.ts", import.meta.url), {
    type: "module",
  });

  worker.onmessage = (e: MessageEvent<WorkerOutbound>) => {
    const msg = e.data;
    const s = useFiscalStore.getState();
    if (msg.type === "state") {
      s.set({ state: msg.state, message: msg.message ?? s.message });
    } else if (msg.type === "progress") {
      s.setProgress({
        phase: msg.phase,
        current: msg.current,
        total: msg.total,
        batch: msg.batch,
      });
    } else if (msg.type === "done") {
      s.set({
        dashboard: msg.dashboard,
        notas: msg.notas,
        divergencias: msg.divergencias,
        duracaoMs: msg.duracaoMs,
        state: "finished",
        message: "Concluído",
      });
    } else if (msg.type === "error") {
      s.set({ state: "error", error: msg.message });
    }
  };

  worker.postMessage({ type: "start", file });
}
