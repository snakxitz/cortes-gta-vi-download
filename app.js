import { formatTime, selectClips } from "./clip-local.js";
import { generatePublication } from "./publication-local.js";
import { mountLibrary } from "./studio-library.js";
const input = document.querySelector("#entrada");
const video = document.querySelector("#video");
const downloadOriginal = document.querySelector("#baixar-original");
const maxBytes = 2 * 1024 * 1024 * 1024;
const status = document.querySelector("#arquivo");
const generate = document.querySelector("#gerar-local");
const language = document.querySelector("#idioma-local");
const cancel = document.querySelector("#cancelar-local");
const progress = document.querySelector("#progresso-local");
const localStatus = document.querySelector("#estado-local");
const loadedStatus = document.querySelector("#video-carregado");
const cutCounts = [...document.querySelectorAll('input[name="quantidade"]')];
const cutLengths = [...document.querySelectorAll('input[name="duracao-corte"]')];
const library = mountLibrary();
let activeJob;
let loadedFile;
let preview;

function loadVideo(file) {
  video.pause();
  if (preview) URL.revokeObjectURL(preview);
  loadedFile = file;
  preview = URL.createObjectURL(file);
  video.src = preview;
  video.hidden = false;
  downloadOriginal.href = preview;
  downloadOriginal.download = file.name;
  downloadOriginal.hidden = false;
  loadedStatus.textContent = "Vídeo carregado · " + file.name;
  loadedStatus.hidden = false;
  generate.disabled = Boolean(activeJob);
}

input.addEventListener("change", () => {
  const file = input.files[0];
  if (!file) {
    status.textContent = "MP4 ou MOV de 30 segundos a 2 horas, com até 2 GB.";
    return;
  }
  if (!/\.(mp4|mov)$/i.test(file.name)) {
    status.textContent = "Escolha um arquivo MP4 ou MOV.";
    return;
  }
  if (file.size === 0 || file.size > maxBytes) {
    status.textContent = "Escolha um arquivo com conteúdo e até 2 GB.";
    return;
  }
  progress.hidden = true;
  localStatus.textContent = "";
  status.textContent = file.name;
  loadVideo(file);
});
video.addEventListener("error", () => {
  if (loadedFile) loadedStatus.textContent = "Vídeo carregado · " + loadedFile.name
    + ". A prévia está indisponível para este formato. Você ainda pode gerar os cortes.";
  video.hidden = true;
});

for (const choice of cutCounts) {
  choice.addEventListener("change", () => {
    const count = Number(choice.value);
    generate.textContent = "Gerar " + count + " " + (count === 1 ? "corte" : "cortes");
  });
}
if (window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches) {
  const hero = document.querySelector(".hero");
  hero.addEventListener("pointermove", event => {
    const rect = hero.getBoundingClientRect();
    hero.style.setProperty("--art-x", ((event.clientX - rect.left) / rect.width - .5) * -14 + "px");
    hero.style.setProperty("--art-y", ((event.clientY - rect.top) / rect.height - .5) * -14 + "px");
  });
  hero.addEventListener("pointerleave", () => {
    hero.style.removeProperty("--art-x");
    hero.style.removeProperty("--art-y");
  });
}

function updateProgress(amount, message) {
  const bounded = Math.max(0, Math.min(100, Math.round(amount)));
  progress.value = Math.max(progress.value, bounded);
  if (localStatus.textContent !== message) localStatus.textContent = message;
}

cancel.addEventListener("click", () => {
  if (!activeJob || activeJob.signal.aborted) return;
  cancel.disabled = true;
  localStatus.textContent = "Cancelando…";
  activeJob.abort();
});

generate.addEventListener("click", () => {
  if (loadedFile && !activeJob) void runJob(loadedFile);
});

function startJob(message) {
  activeJob = new AbortController();
  input.disabled = language.disabled = generate.disabled = true;
  for (const choice of cutCounts) choice.disabled = true;
  for (const choice of cutLengths) choice.disabled = true;
  cancel.disabled = false;
  cancel.hidden = false;
  video.pause();
  progress.hidden = false;
  progress.value = 0;
  updateProgress(0, message);
  return activeJob.signal;
}

function finishJob() {
  activeJob = undefined;
  cancel.hidden = true;
  input.disabled = language.disabled = false;
  generate.disabled = !loadedFile;
  for (const choice of cutCounts) choice.disabled = false;
  for (const choice of cutLengths) choice.disabled = false;
}

async function runJob(file) {
  const requested = Number(cutCounts.find(choice => choice.checked).value);
  const seconds = Number(cutLengths.find(choice => choice.checked).value);
  const signal = startJob("Preparando o editor de vídeo…");

  let videoSession;
  let speechSession;
  let completed = 0;
  let saved = 0;
  let phase = "preparar o vídeo";
  const report = (amount, message) => {
    if (!signal.aborted) updateProgress(amount, message);
  };
  try {
    const [{ createVideoSession }, { createTranscriptionSession }] = await Promise.all([
      import("./video-local.js"), import("./speech-local.js"),
    ]);
    signal.throwIfAborted();
    videoSession = await createVideoSession(file, (fraction, message) => {
      report(fraction * 16, message || "Lendo o vídeo…");
    }, { signal });
    if (videoSession.duration < seconds) {
      throw new Error("Escolha um vídeo de pelo menos " + seconds + " segundos ou reduza a duração do corte.");
    }
    phase = "carregar o modelo de transcrição";
    report(16, "Carregando o modelo de transcrição…");
    speechSession = await createTranscriptionSession(fraction => {
      report(16 + fraction * 7, "Carregando o modelo de transcrição…");
    }, { language: language.value, signal });

    phase = "transcrever o áudio";
    const transcript = [];
    const { duration } = videoSession;
    const blockDuration = 120;
    const overlap = 3;
    for (let start = 0; start < duration; start += blockDuration) {
      signal.throwIfAborted();
      const end = Math.min(start + blockDuration, duration);
      const from = Math.max(0, start - overlap);
      const to = Math.min(end + overlap, duration);
      const interval = formatTime(start) + " a " + formatTime(end) + " de " + formatTime(duration);
      const blockProgress = (fraction, message) => {
        report(23 + (start + (end - start) * fraction) / duration * 42, message + " · " + interval);
      };
      blockProgress(0, "Extraindo áudio");
      const audio = await videoSession.extractAudio(from, to - from, fraction => {
        blockProgress(fraction * .15, "Extraindo áudio");
      });
      blockProgress(.15, "Transcrevendo áudio");
      const parts = await speechSession.transcribe(audio, fraction => {
        blockProgress(.15 + fraction * .85, "Transcrevendo áudio");
      });
      for (const part of parts) {
        const absoluteStart = from + part.start;
        const absoluteEnd = Math.min(duration, from + part.end);
        const midpoint = (absoluteStart + absoluteEnd) / 2;
        if (midpoint >= start && midpoint < end) {
          transcript.push({ start: absoluteStart, end: absoluteEnd, text: part.text });
        }
      }
    }
    speechSession.close();
    speechSession = undefined;

    phase = "selecionar os trechos";
    signal.throwIfAborted();
    report(65, "Selecionando trechos de " + seconds + " s…");
    const clips = selectClips(transcript, duration, file.name, requested, seconds);
    if (!clips.length) throw new Error("Nenhum trecho de " + seconds + " segundos disponível.");
    const createdAt = Date.now();
    const span = 35 / clips.length;
    for (const [order, clip] of clips.entries()) {
      signal.throwIfAborted();
      const step = 65 + order * span;
      const label = (order + 1) + " de " + clips.length;
      const publication = generatePublication({ ...clip, filename: file.name });
      const cueTime = publication.cueTime ?? (clip.hook ? clip.hook.start - clip.start : undefined);
      phase = "exportar o corte " + label;
      const exporting = "Exportando corte " + label + " em 9:16…";
      report(step, exporting);
      const output = await videoSession.render(clip.start, fraction => {
        report(step + span * .84 * fraction, exporting);
      }, { seconds });
      signal.throwIfAborted();
      if (order === clips.length - 1) {
        videoSession.close();
        videoSession = undefined;
      }
      phase = "montar o corte " + label;
      report(step + span * .84, "Criando a capa do corte " + label + "…");
      const stored = await library.addGenerated({
        filename: file.name, start: clip.start, end: clip.end, video: output,
        publication, createdAt, order, cueTime,
      }, signal);
      completed++;
      if (stored) saved++;
    }
    signal.throwIfAborted();
    const ready = batchResult(completed, saved);
    const limited = completed < requested
      ? " O vídeo rendeu " + completed + " de " + requested + " cortes de " + seconds + " s sem sobreposição."
      : "";
    report(100, ready + limited);
    library.reveal(ready + limited);
  } catch (error) {
    progress.hidden = true;
    if (signal.aborted) {
      localStatus.textContent = "Geração cancelada.";
    } else {
      const detail = error instanceof Error && error.message ? " " + error.message : "";
      localStatus.textContent = "Não foi possível " + phase + "." + detail;
    }
    if (completed) {
      const ready = batchResult(completed, saved);
      localStatus.textContent += " " + ready;
      library.reveal(localStatus.textContent);
    }
  } finally {
    try {
      speechSession?.close();
    } finally {
      try {
        videoSession?.close();
      } finally {
        finishJob();
      }
    }
  }
}

function batchResult(completed, saved) {
  const count = amount => amount === 1 ? "1 corte" : amount + " cortes";
  const stored = saved === 1 ? count(saved) + " salvo na biblioteca." : count(saved) + " salvos na biblioteca.";
  if (saved === completed) return stored;
  const temporary = completed - saved;
  const inTab = count(temporary) + (temporary === 1 ? " disponível só nesta aba." : " disponíveis só nesta aba.");
  return saved ? stored + " " + inTab : inTab;
}
