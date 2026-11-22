import { formatTime, selectClips } from "./clip-local.js";
import { classifyVideoLink, fetchLinkedVideo, fetchYoutubeVideo } from "./link-local.js";
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
const linkField = document.querySelector("#link");
const importButton = document.querySelector("#importar-link");
const linkFeedback = document.querySelector("#retorno-link");
const loadedStatus = document.querySelector("#video-carregado");
const youtubeActions = document.querySelector("#acoes-youtube");
const socialKitPanel = document.querySelector("#teste-socialkit");
const socialKitInput = document.querySelector("#chave-socialkit");
const sourceModes = [...document.querySelectorAll('input[name="origem"]')];
const cutCounts = [...document.querySelectorAll('input[name="quantidade"]')];
const cutLengths = [...document.querySelectorAll('input[name="duracao-corte"]')];
const library = mountLibrary();
let activeJob;
let loadedFile;
let preview;
let backend;
let youtubeImport;
let socialKitTest = false;
let linkBlocked = false;

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
fetch("config.json").then(response => response.ok ? response.json() : null).then(config => {
  const params = new URLSearchParams(location.search);
  const testingImport = !config?.youtubeImport && params.get("teste-youtube") === "1";
  const importAddress = testingImport ? config?.youtubeImportTest : config?.youtubeImport;
  if (typeof importAddress === "string" && importAddress) {
    const endpoint = new URL(importAddress);
    const local = ["localhost", "127.0.0.1"].includes(location.hostname)
      && ["localhost", "127.0.0.1"].includes(endpoint.hostname);
    if ((endpoint.protocol === "https:" || (local && endpoint.protocol === "http:"))
        && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash) {
      youtubeImport = endpoint;
      document.querySelector('label[for="link"]').textContent = "Link do YouTube, MP4 ou MOV";
      linkField.placeholder = "https://www.youtube.com/watch?v=…";
      document.querySelector("#limite-link").textContent = "Use um vídeo próprio ou autorizado. Links aceitam arquivos de até 250 MB.";
      if (testingImport) {
        socialKitTest = params.get("provedor") === "socialkit";
        document.querySelector("#estado").textContent =
          socialKitTest ? "Teste de importação do YouTube pelo SocialKit."
            : "Teste do importador do YouTube. O primeiro pedido pode demorar enquanto o servidor liga.";
        sourceModes.find(choice => choice.value === "link").click();
        const videoId = params.get("video");
        if (/^[A-Za-z0-9_-]{11}$/.test(videoId ?? "")) {
          linkField.value = "https://www.youtube.com/watch?v=" + videoId;
        }
      }
      refreshLinkStatus();
    }
  }
  if (typeof config?.motor !== "string" || !config.motor) return;
  const endpoint = new URL(config.motor);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) return;

  backend = endpoint;
  refreshLinkStatus();
  const generation = document.querySelector("#geracao");
  const button = document.querySelector("#motor");
  const external = document.querySelector("#motor-externo");
  const frame = document.querySelector("#janela-motor");
  const state = document.querySelector("#estado");
  external.href = endpoint.href;
  generation.hidden = false;
  state.textContent = "Inicie a geração para enviar seu vídeo e acessar os cortes dentro do estúdio.";
  button.addEventListener("click", () => {
    if (activeJob) return;
    if (!frame.hasAttribute("src")) frame.src = endpoint.href;
    frame.hidden = false;
    document.querySelector("#editor-previa").hidden = true;
    button.setAttribute("aria-expanded", "true");
    state.textContent = "Envie seu vídeo no gerador abaixo. Se o login não carregar, abra o gerador em outra aba.";
    frame.focus();
  });
}).catch(() => {});

const filePanel = document.querySelector("#painel-arquivo");
const linkPanel = document.querySelector("#painel-link");
function showYouTubeNotice(youtube) {
  linkBlocked = youtube && !youtubeImport && !backend;
  youtubeActions.hidden = !linkBlocked;
  socialKitPanel.hidden = !socialKitTest || !youtube;
  socialKitInput.disabled = Boolean(activeJob) || socialKitPanel.hidden;
  importButton.disabled = Boolean(activeJob) || linkBlocked;
  importButton.textContent = youtube && youtubeImport ? "Baixar para o estúdio" : "Importar vídeo";
  if (linkBlocked) {
    linkFeedback.textContent = "A importação do YouTube ainda está indisponível no estúdio. Se o vídeo for seu, salve uma cópia e selecione o arquivo aqui.";
  }
}

function refreshLinkStatus() {
  linkFeedback.textContent = "";
  let youtube = false;
  if (linkField.value.trim()) {
    try {
      youtube = classifyVideoLink(linkField.value).kind === "youtube";
    } catch {
      // O envio do formulário mostra erros do endereço completo.
    }
  }
  showYouTubeNotice(youtube);
}

linkField.addEventListener("input", refreshLinkStatus);
refreshLinkStatus();
document.querySelector("#enviar-youtube").addEventListener("click", () => {
  sourceModes.find(item => item.value === "arquivo").click();
  input.focus();
  input.click();
});
sourceModes.forEach(item => {
  item.addEventListener("change", () => {
    const useLink = item.value === "link";
    filePanel.hidden = useLink;
    linkPanel.hidden = !useLink;
  });
});
for (const choice of cutCounts) {
  choice.addEventListener("change", () => {
    const count = Number(choice.value);
    generate.textContent = "Gerar " + count + " " + (count === 1 ? "corte" : "cortes");
  });
}
linkPanel.addEventListener("submit", event => {
  event.preventDefault();
  if (activeJob) return;
  let source;
  try {
    source = classifyVideoLink(linkField.value);
  } catch (error) {
    linkFeedback.textContent = error.message;
    return;
  }
  showYouTubeNotice(source.kind === "youtube");
  if (source.kind === "youtube") {
    linkField.value = source.url;
    if (!youtubeImport) {
      if (backend) linkFeedback.textContent = "Para este link, abra o gerador no servidor e cole o endereço lá.";
      return;
    }
  }
  linkFeedback.textContent = "";
  void importVideo(source);
});

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
  input.disabled = language.disabled = generate.disabled = linkField.disabled = importButton.disabled = true;
  socialKitInput.disabled = true;
  for (const choice of sourceModes) choice.disabled = true;
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
  input.disabled = language.disabled = linkField.disabled = false;
  importButton.disabled = linkBlocked;
  socialKitInput.disabled = socialKitPanel.hidden;
  generate.disabled = !loadedFile;
  for (const choice of sourceModes) choice.disabled = false;
  for (const choice of cutCounts) choice.disabled = false;
  for (const choice of cutLengths) choice.disabled = false;
}

async function importVideo(source) {
  const youtube = source.kind === "youtube";
  const accessKey = youtube && socialKitTest ? socialKitInput.value.trim() : "";
  socialKitInput.value = "";
  const message = youtube ? "Importando o vídeo do YouTube…" : "Baixando o vídeo do link…";
  const signal = startJob(message);
  progress.removeAttribute("value");
  const downloading = fraction => {
    if (fraction !== null && !signal.aborted) updateProgress(fraction * 100, message);
  };
  try {
    const file = youtube
      ? await fetchYoutubeVideo(youtubeImport, source, downloading, { signal, accessKey })
      : await fetchLinkedVideo(source.url, downloading, { signal });
    signal.throwIfAborted();
    loadVideo(file);
    localStatus.textContent = "Escolha a duração e gere os cortes.";
  } catch (error) {
    localStatus.textContent = signal.aborted ? "Importação cancelada." : "";
    if (!signal.aborted) {
      linkFeedback.textContent = "Não foi possível importar o vídeo. " + error.message;
      if (youtube) youtubeActions.hidden = false;
    }
  } finally {
    progress.hidden = true;
    finishJob();
  }
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
