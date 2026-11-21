import { FFmpeg } from "./vendor/ffmpeg-0.12.15/index.js";
import { CLIP_LENGTHS, CLIP_SECONDS } from "./clip-local.js";

const CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
const MAX_INPUT_SIZE = 2 * 1024 * 1024 * 1024;
const MAX_MEMORY_COPY = 80 * 1024 * 1024;
const MAX_DURATION = 2 * 60 * 60;
const VIDEO_FILTER = [
  "[0:V:0]scale=ceil(iw*sar/2)*2:ih,setsar=1,split=2[b][f]",
  "[b]scale=270:480:force_original_aspect_ratio=increase:force_divisible_by=2," +
    "crop=270:480,boxblur=12:2,scale=1080:1920:flags=fast_bilinear,setsar=1[bg]",
  "[f]scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1[fg]",
  "[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p[v]",
].join(";");

function withDeadline(operation, milliseconds, message) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([operation, deadline]).finally(() => clearTimeout(timer));
}

function timelineProgress(callback, duration, from, to, label) {
  let previous = -1;
  return ({ time }) => {
    if (!Number.isFinite(time)) return;
    const fraction = Math.min(1, Math.max(0, time / 1_000_000 / duration));
    const percent = Math.floor(fraction * 100);
    if (percent <= previous) return;
    previous = percent;
    callback(from + (to - from) * fraction, label);
  };
}

function readIntoMemory(file, signal) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(signal?.reason ?? new DOMException("Operação cancelada.", "AbortError"));
    reader.onloadend = () => signal?.removeEventListener("abort", abort);
    signal?.throwIfAborted();
    reader.readAsArrayBuffer(file);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function createVideoSession(file, onProgress = () => {}, { signal } = {}) {
  signal?.throwIfAborted();
  if (!(file instanceof Blob) || !file.size || file.size > MAX_INPUT_SIZE) {
    throw new Error("Selecione um vídeo de até 2 GB.");
  }
  if (typeof Worker !== "function" || typeof WebAssembly !== "object") {
    throw new Error("Este navegador não oferece suporte ao processamento de vídeo.");
  }

  const ffmpeg = new FFmpeg();
  const recentLogs = [];
  let closed = false;
  let busy = false;
  let source;
  let duration;

  function close() {
    if (closed) return;
    closed = true;
    signal?.removeEventListener("abort", close);
    ffmpeg.terminate();
  }

  function checkOpen() {
    signal?.throwIfAborted();
    if (closed) throw new Error("O vídeo foi fechado. Abra o arquivo novamente.");
  }

  function requireSuccess(code, message) {
    if (code !== 0) {
      throw new Error(message, { cause: recentLogs.join("\n") });
    }
  }

  ffmpeg.on("log", ({ message }) => {
    if (recentLogs.length === 8) recentLogs.shift();
    recentLogs.push(message);
  });
  signal?.addEventListener("abort", close, { once: true });

  try {
    onProgress(0, "Carregando o editor de vídeo");
    checkOpen();
    await withDeadline(ffmpeg.load({
      coreURL: CORE_BASE + "/ffmpeg-core.js",
      wasmURL: CORE_BASE + "/ffmpeg-core.wasm",
    }), 120_000, "O editor de vídeo demorou a carregar. Verifique a conexão e tente de novo.");
    onProgress(0.15, "Lendo o vídeo");
    await ffmpeg.createDir("/input");
    const mounted = await ffmpeg.mount("WORKERFS", {
      blobs: [{ name: "origem", data: file }],
    }, "/input").catch(() => false);
    checkOpen();
    if (mounted) {
      source = "/input/origem";
    } else {
      if (file.size > MAX_MEMORY_COPY) {
        throw new Error("Este navegador não consegue abrir arquivos maiores que 80 MB sem copiá-los para a memória.");
      }
      source = "/origem";
      const bytes = await readIntoMemory(file, signal);
      checkOpen();
      await ffmpeg.writeFile(source, bytes);
    }

    await withDeadline(ffmpeg.ffprobe([
      "-v", "error", "-show_entries",
      "stream=codec_type,duration:stream_disposition=attached_pic:format=duration",
      "-of", "json", "-o", "/video.json", source,
    ]), 30_000, "O navegador demorou a ler o vídeo.");
    let metadata;
    try {
      // This WASM build can return -1 from ffprobe even after writing valid JSON.
      metadata = JSON.parse(await ffmpeg.readFile("/video.json", "utf8"));
    } catch (error) {
      throw new Error("Não foi possível abrir este arquivo de vídeo.", { cause: error });
    }
    const video = metadata.streams?.find(stream =>
      stream.codec_type === "video" && !stream.disposition?.attached_pic);
    const hasAudio = metadata.streams?.some(stream => stream.codec_type === "audio");
    if (!video || !hasAudio) {
      throw new Error("Escolha um vídeo com imagem e uma faixa de áudio.");
    }
    const lengths = [video.duration, metadata.format?.duration].map(Number)
      .filter(value => Number.isFinite(value) && value > 0);
    duration = Math.min(...lengths);
    if (!Number.isFinite(duration) || duration < CLIP_LENGTHS[0] || duration > MAX_DURATION) {
      throw new Error("Escolha um vídeo com duração entre 30 segundos e 2 horas.");
    }
    await ffmpeg.deleteFile("/video.json");
    onProgress(1, "Vídeo pronto");
    checkOpen();
  } catch (error) {
    close();
    signal?.throwIfAborted();
    throw error instanceof Error ? error : new Error("Não foi possível carregar o editor de vídeo.", { cause: error });
  }

  async function exportMedia(args, {
    output, type, seconds, onUpdate, label, done, timeout, timeoutMessage, failure,
  }) {
    checkOpen();
    if (busy) throw new Error("Já há um trecho em processamento.");
    const update = timelineProgress(onUpdate, seconds, 0, 0.98, label);
    busy = true;
    recentLogs.length = 0;
    ffmpeg.on("progress", update);
    try {
      onUpdate(0, label);
      checkOpen();
      requireSuccess(await withDeadline(ffmpeg.exec([...args, output]), timeout, timeoutMessage), failure);
      const blob = new Blob([await ffmpeg.readFile(output)], { type });
      await ffmpeg.deleteFile(output);
      onUpdate(1, done);
      checkOpen();
      return blob;
    } catch (error) {
      close();
      signal?.throwIfAborted();
      throw error instanceof Error ? error : new Error(failure, { cause: error });
    } finally {
      ffmpeg.off("progress", update);
      busy = false;
    }
  }

  async function extractAudio(start, length, onAudioProgress = () => {}) {
    checkOpen();
    if (!Number.isFinite(start) || !Number.isFinite(length) || start < 0
        || length <= 0 || start >= duration || start + length > duration + 0.000001) {
      throw new Error("O intervalo de áudio precisa estar dentro da duração do vídeo.");
    }
    const seconds = Math.min(length, duration - start);
    return exportMedia([
      "-threads", "1", "-ss", start.toFixed(6), "-i", source, "-t", seconds.toFixed(6),
      "-map", "0:a:0", "-vn", "-af", "apad", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
    ], {
      output: "/audio.wav", type: "audio/wav", seconds, onUpdate: onAudioProgress,
      label: "Extraindo áudio", done: "Áudio pronto",
      timeout: 120_000, timeoutMessage: "A extração do áudio excedeu o tempo disponível.",
      failure: "Não foi possível extrair o áudio deste vídeo.",
    });
  }

  async function render(startSeconds, onRenderProgress = () => {}, { seconds = CLIP_SECONDS } = {}) {
    checkOpen();
    if (!CLIP_LENGTHS.includes(seconds)) throw new Error("Escolha cortes de 30 ou 65 segundos.");
    if (!Number.isFinite(startSeconds) || startSeconds < 0
        || startSeconds + seconds > duration + 0.000001) {
      throw new Error("O trecho escolhido precisa conter " + seconds + " segundos de vídeo.");
    }
    const start = Math.min(startSeconds, duration - seconds);
    return exportMedia([
      "-threads", "1", "-ss", start.toFixed(6), "-i", source, "-t", String(seconds),
      "-filter_complex_threads", "1", "-filter_complex", VIDEO_FILTER, "-map", "[v]", "-map", "0:a:0",
      "-c:v", "libx264", "-threads", "1", "-preset", "ultrafast", "-crf", "23",
      "-fpsmax", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
    ], {
      output: "/corte.mp4", type: "video/mp4", seconds, onUpdate: onRenderProgress,
      label: "Exportando MP4", done: "MP4 pronto",
      timeout: 600_000, timeoutMessage: "A exportação excedeu o tempo disponível neste dispositivo.",
      failure: "Não foi possível exportar o corte deste vídeo.",
    });
  }

  return { duration, extractAudio, render, close };
}
