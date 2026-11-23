import { formatTime, selectClips, selectVisualClips } from "./clip-local.js";
import { generatePublication } from "./publication-local.js";
import { mountLibrary } from "./studio-library.js";
import { sampleVisualActivity } from "./cover-local.js";
const input = document.querySelector("#entrada");
const video = document.querySelector("#video");
const downloadOriginal = document.querySelector("#baixar-original");
const maxBytes = 2 * 1024 * 1024 * 1024;
const status = document.querySelector("#arquivo");
const generate = document.querySelector("#gerar-local");
const language = document.querySelector("#idioma-local");
const includeVideoText = document.querySelector("#texto-no-video");
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
const background = document.querySelector(".fundo-pagina");
const steps = document.querySelector("#como-funciona");
const librarySection = document.querySelector("#biblioteca");
let backgroundFrame = 0;

function updateBackground() {
  backgroundFrame = 0;
  const viewportHeight = document.documentElement.clientHeight;
  const trigger = viewportHeight * .58;
  const atEnd = window.scrollY > 0 && window.scrollY + viewportHeight >= document.documentElement.scrollHeight - 2;
  let scene = "neon";
  if (librarySection.getBoundingClientRect().top <= trigger || atEnd) {
    scene = "colagem";
  } else if (steps.getBoundingClientRect().top <= trigger) {
    scene = "personagens";
  }
  if (background.dataset.cena !== scene) background.dataset.cena = scene;
}

function scheduleBackgroundUpdate() {
  if (!backgroundFrame) backgroundFrame = requestAnimationFrame(updateBackground);
}

window.addEventListener("scroll", scheduleBackgroundUpdate, { passive: true });
window.addEventListener("resize", scheduleBackgroundUpdate);
window.addEventListener("pageshow", scheduleBackgroundUpdate);
scheduleBackgroundUpdate();

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
  input.disabled = language.disabled = includeVideoText.disabled = generate.disabled = true;
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
  input.disabled = language.disabled = includeVideoText.disabled = false;
  generate.disabled = !loadedFile;
  for (const choice of cutCounts) choice.disabled = false;
  for (const choice of cutLengths) choice.disabled = false;
}

async function runJob(file) {
  const requested = Number(cutCounts.find(choice => choice.checked).value);
  const seconds = Number(cutLengths.find(choice => choice.checked).value);
  const videoTextEnabled = includeVideoText.checked;
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
    const { createVideoSession } = await import("./video-local.js");
    signal.throwIfAborted();
    videoSession = await createVideoSession(file, (fraction, message) => {
      report(fraction * 16, message || "Lendo o vídeo…");
    }, { signal });
    if (videoSession.duration < seconds) {
      throw new Error("Escolha um vídeo de pelo menos " + seconds + " segundos ou reduza a duração do corte.");
    }
    const transcript = [];
    const { duration } = videoSession;
    if (videoSession.hasAudio && language.value !== "visual") {
      phase = "carregar o modelo de transcrição";
      report(16, "Carregando o modelo de transcrição…");
      const { createTranscriptionSession } = await import("./speech-local.js");
      speechSession = await createTranscriptionSession(fraction => {
        report(16 + fraction * 7, "Carregando o modelo de transcrição…");
      }, { language: language.value, signal });

      phase = "transcrever o áudio";
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
          const spoken = part.text.replace(/\[[^\]]*\]|\([^)]*\)/g, "");
          if (midpoint >= start && midpoint < end && /[\p{L}\p{N}]/u.test(spoken)) {
            transcript.push({ start: absoluteStart, end: absoluteEnd, text: part.text });
          }
        }
      }
      speechSession.close();
      speechSession = undefined;
    }

    phase = "selecionar os trechos";
    signal.throwIfAborted();
    const visual = transcript.length === 0;
    report(65, visual ? "Analisando as cenas do vídeo…" : "Selecionando trechos a partir da narração…");
    const clips = visual
      ? await selectVisualClips(duration, requested, seconds, times => sampleVisualActivity(video, times, signal))
      : selectClips(transcript, duration, file.name, requested, seconds);
    if (!clips.length) throw new Error("Nenhum trecho de " + seconds + " segundos disponível.");
    const createdAt = Date.now();
    const span = 35 / clips.length;
    for (const [order, clip] of clips.entries()) {
      signal.throwIfAborted();
      const step = 65 + order * span;
      const label = (order + 1) + " de " + clips.length;
      const publication = generatePublication({ ...clip, language: language.value });
      const cueTime = publication.cueTime ?? (clip.hook ? clip.hook.start - clip.start : undefined);
      const screenText = videoTextEnabled && !visual
        ? { opening: publication.hook, ending: publication.cta }
        : { opening: "", ending: "" };
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
        publication, createdAt, order, cueTime, screenText,
      }, signal);
      completed++;
      if (stored) saved++;
    }
    signal.throwIfAborted();
    const ready = batchResult(completed, saved);
    const limited = completed < requested
      ? " O vídeo rendeu " + completed + " de " + requested + " cortes de " + seconds + " s sem sobreposição."
      : "";
    const review = visual
      ? " Cortes sem narração. Revise o título, o gancho e a capa na biblioteca."
      : " Revise o gancho e a chamada para ação de cada corte na biblioteca.";
    const result = ready + limited + review;
    report(100, result);
    library.reveal(result);
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
