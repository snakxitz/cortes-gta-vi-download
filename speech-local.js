const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";
const MODEL = "Xenova/whisper-tiny";
const SAMPLE_RATE = 16_000;
const CHUNK_SECONDS = 24;
const STRIDE_SECONDS = 4;
const MAX_WAV_BYTES = (120 + 6) * SAMPLE_RATE * 2 + 1_024;
const MODEL_TIMEOUT_MS = 300_000;
const BLOCK_TIMEOUT_MS = 480_000;
const CLOSE_TIMEOUT_MS = 3_000;

function pcmSamples(buffer) {
  const view = new DataView(buffer);
  const idAt = (offset) => String.fromCharCode(
    view.getUint8(offset), view.getUint8(offset + 1),
    view.getUint8(offset + 2), view.getUint8(offset + 3),
  );

  if (view.byteLength < 12 || idAt(0) !== "RIFF" || idAt(8) !== "WAVE") {
    throw new Error("Não consegui ler o áudio WAV do vídeo.");
  }

  let format;
  for (let offset = 12; offset + 8 <= view.byteLength;) {
    const id = idAt(offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > view.byteLength) break;

    if (id === "fmt " && size >= 16) {
      format = {
        codec: view.getUint16(start, true),
        channels: view.getUint16(start + 2, true),
        rate: view.getUint32(start + 4, true),
        bits: view.getUint16(start + 14, true),
      };
    } else if (id === "data" && format) {
      if (format.codec !== 1 || format.channels !== 1 || format.rate !== SAMPLE_RATE || format.bits !== 16) {
        throw new Error("O áudio precisa ser PCM mono de 16 kHz.");
      }
      const samples = new Float32Array(Math.floor(size / 2));
      if (!samples.length) break;
      for (let i = 0; i < samples.length; i++) {
        samples[i] = view.getInt16(start + i * 2, true) / 32_768;
      }
      return samples;
    }

    offset = start + size + (size % 2);
  }
  throw new Error("O vídeo não forneceu áudio para transcrever.");
}

function segmentsFrom(chunks, duration) {
  return (chunks ?? []).flatMap(({ timestamp, text }, index) => {
    const start = timestamp?.[0];
    const end = Math.min(timestamp?.[1] ?? chunks[index + 1]?.timestamp?.[0] ?? duration, duration);
    const phrase = text?.trim();
    return Number.isFinite(start) && end > start && phrase ? [{ start, end, text: phrase }] : [];
  });
}

async function loadRecognizer(report) {
  const { env, pipeline, WhisperTextStreamer } = await import(TRANSFORMERS_URL);
  env.allowLocalModels = false;
  env.backends.onnx.wasm.numThreads = 1;

  const downloads = new Map();
  const recognizer = await pipeline("automatic-speech-recognition", MODEL, {
    device: "wasm",
    dtype: "q8",
    progress_callback: ({ status, file, progress }) => {
      if (!file?.endsWith("_quantized.onnx") || (status !== "progress" && status !== "done")) return;
      const fraction = status === "done" ? 1 : Number(progress) / 100;
      if (!Number.isFinite(fraction)) return;
      downloads.set(file, Math.min(1, Math.max(0, fraction)));
      const total = [...downloads.values()].reduce((sum, value) => sum + value, 0);
      report(0.05 + 0.9 * Math.min(total / 2, 1));
    },
  });

  return { recognizer, WhisperTextStreamer };
}

async function recognize({ recognizer, WhisperTextStreamer }, buffer, language, report) {
  const samples = pcmSamples(buffer);
  if (!samples.some((sample) => sample !== 0)) return [];
  const duration = samples.length / SAMPLE_RATE;
  const expectedChunks = 1 + Math.ceil(
    Math.max(0, duration - CHUNK_SECONDS) / (CHUNK_SECONDS - 2 * STRIDE_SECONDS),
  );
  let completedChunks = 0;
  const result = await recognizer(samples, {
    language,
    task: "transcribe",
    return_timestamps: true,
    chunk_length_s: CHUNK_SECONDS,
    stride_length_s: STRIDE_SECONDS,
    streamer: new WhisperTextStreamer(recognizer.tokenizer, {
      on_finalize: () => {
        completedChunks += 1;
        report(Math.min(completedChunks / expectedChunks, 0.99));
      },
    }),
  });
  return segmentsFrom(result.chunks, duration);
}

if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) {
  let model;
  let language;
  const report = (progress) => self.postMessage({ type: "progress", progress });

  async function disposeModel() {
    const previous = model;
    model = undefined;
    await previous?.recognizer.dispose().catch(() => {});
  }

  self.addEventListener("message", async ({ data }) => {
    try {
      if (data.type === "init") {
        language = data.language;
        model = await loadRecognizer(report);
        self.postMessage({ type: "result" });
      } else if (data.type === "transcribe") {
        const segments = await recognize(model, data.buffer, language, report);
        self.postMessage({ type: "result", segments });
      } else if (data.type === "close") {
        await disposeModel();
        self.postMessage({ type: "closed" });
        self.close();
      }
    } catch (error) {
      await disposeModel();
      self.postMessage({ type: "error", message: error?.message || String(error) });
      self.close();
    }
  });
}

// Model loading and each block report their own progress, from 0 to 1.
// Block timestamps start at zero; the caller can add the offset in the original video.
export async function createTranscriptionSession(onProgress = () => {}, { language = "pt", signal } = {}) {
  signal?.throwIfAborted();
  const worker = new Worker(import.meta.url, { type: "module" });
  let pending;
  let closingTimer;
  let closed = false;

  function stop(error) {
    closed = true;
    clearTimeout(closingTimer);
    worker.terminate();
    signal?.removeEventListener("abort", abort);
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    pending = undefined;
  }

  function abort() { stop(signal.reason); }
  signal?.addEventListener("abort", abort, { once: true });
  worker.onerror = () => stop(new Error("O navegador não conseguiu carregar a transcrição local."));
  worker.onmessage = ({ data }) => {
    if (data.type === "closed") {
      stop();
    } else if (data.type === "error") {
      stop(new Error(data.message));
    } else if (pending && data.type === "progress") {
      pending.progress(data.progress);
    } else if (pending && data.type === "result") {
      const { resolve, progress, timer } = pending;
      clearTimeout(timer);
      pending = undefined;
      resolve(data.segments);
      progress(1);
    }
  };

  function request(message, progress, transfer = []) {
    signal?.throwIfAborted();
    if (closed) throw new Error("A sessão de transcrição foi encerrada.");
    if (pending) throw new Error("Aguarde a transcrição do trecho atual.");
    return new Promise((resolve, reject) => {
      const loading = message.type === "init";
      const timer = setTimeout(() => {
        stop(new Error(loading
          ? "O carregamento do modelo de transcrição excedeu o limite de 5 minutos."
          : "A transcrição do bloco de áudio excedeu o limite de 8 minutos."));
      }, loading ? MODEL_TIMEOUT_MS : BLOCK_TIMEOUT_MS);
      pending = { resolve, reject, progress, timer };
      try {
        progress(0);
        if (!closed) worker.postMessage(message, transfer);
      } catch (error) {
        stop(error);
      }
    });
  }

  await request({ type: "init", language }, onProgress);
  return {
    async transcribe(wavBlob, onBlockProgress = () => {}) {
      if (wavBlob.size > MAX_WAV_BYTES) {
        throw new Error("O trecho de áudio excede o limite de 126 segundos com a sobreposição.");
      }
      signal?.throwIfAborted();
      if (closed) throw new Error("A sessão de transcrição foi encerrada.");
      const buffer = await wavBlob.arrayBuffer();
      return request({ type: "transcribe", buffer }, onBlockProgress, [buffer]);
    },
    close() {
      if (closed) return;
      if (pending) {
        stop(new DOMException("A sessão de transcrição foi encerrada.", "AbortError"));
        return;
      }
      closed = true;
      signal?.removeEventListener("abort", abort);
      closingTimer = setTimeout(() => stop(), CLOSE_TIMEOUT_MS);
      try {
        worker.postMessage({ type: "close" });
      } catch {
        stop();
      }
    },
  };
}
