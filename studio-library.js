import { formatTime } from "./clip-local.js";
import { CLIP_CTA_SECONDS, CLIP_HOOK_SECONDS, generateCover } from "./cover-local.js";
import { replacementForFilenameHook } from "./publication-local.js";
import { deleteClip, listClips, saveClip } from "./library-local.js";

export function mountLibrary() {
  const get = id => document.getElementById(id);
  const records = new Map();
  const stored = new Set();
  const list = get("lista-cortes");
  const form = get("publicacao-form");
  const screenForm = get("texto-video-form");
  const screenFields = { opening: get("texto-abertura"), ending: get("texto-encerramento") };
  const screenFeedback = get("estado-texto-video");
  const restoreInput = get("original-texto-video");
  const actions = [...form.querySelectorAll("button"), ...screenForm.querySelectorAll("button, input"), get("excluir-corte")];
  const useFrame = get("usar-quadro");
  const player = get("video-corte");
  const downloadVideo = get("baixar-local");
  const downloadStatus = get("estado-download-video");
  const coverImage = get("capa-corte");
  const libraryStatus = get("estado-biblioteca");
  const feedback = get("estado-publicacao");
  const fields = {
    title: get("titulo-corte"), description: get("descricao-corte"),
    tags: get("tags-corte"),
  };
  const coverFields = { hook: get("hook-corte"), cta: get("cta-corte") };
  let selectedId;
  let videoUrl;
  let coverUrl;
  let preparedUrl;
  let editing = false;

  function discardPreparedDownload() {
    if (!preparedUrl) return;
    URL.revokeObjectURL(preparedUrl);
    preparedUrl = undefined;
    if (videoUrl) downloadVideo.href = videoUrl;
  }

  function screenValues() {
    return {
      opening: screenFields.opening.value.trim(),
      ending: screenFields.ending.value.trim(),
    };
  }

  function showScreenText() {
    const entry = records.get(selectedId);
    const text = screenValues();
    const time = player.currentTime;
    const duration = Number.isFinite(player.duration) ? player.duration : entry?.end - entry?.start;
    const opening = get("previa-texto-abertura");
    const ending = get("previa-texto-encerramento");
    opening.textContent = text.opening;
    ending.textContent = text.ending;
    const editable = entry && !entry.videoText;
    opening.hidden = !(editable && text.opening && time < CLIP_HOOK_SECONDS);
    ending.hidden = !(editable && text.ending && time >= duration - CLIP_CTA_SECONDS);
  }

  function updateScreenControls() {
    const entry = records.get(selectedId);
    const locked = editing || !entry || entry.videoText;
    for (const control of [...Object.values(screenFields), get("ver-abertura"), get("ver-encerramento"), get("salvar-textos-video")]) {
      control.disabled = Boolean(locked);
    }
    get("restaurar-base-video").hidden = !entry?.videoText;
  }

  function sortedRecords() {
    return [...records.values()].sort((a, b) =>
      b.createdAt - a.createdAt || (a.order ?? 0) - (b.order ?? 0));
  }

  function renderList() {
    list.replaceChildren(...sortedRecords().map(entry => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-pressed", String(entry.id === selectedId));
      const title = document.createElement("strong");
      title.textContent = entry.title;
      const time = document.createElement("small");
      time.textContent = formatTime(entry.start) + "–" + formatTime(entry.end)
        + (entry.cover ? " · MP4" : " · Capa pendente");
      button.append(title, time);
      button.addEventListener("click", () => select(entry.id));
      item.append(button);
      return item;
    }));
  }

  function showCover(entry) {
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    coverUrl = entry.cover ? URL.createObjectURL(entry.cover) : undefined;
    const download = get("baixar-capa");
    coverImage.hidden = download.hidden = !coverUrl;
    get("capa-vazia").hidden = Boolean(coverUrl);
    if (coverUrl) {
      coverImage.src = download.href = coverUrl;
      download.download = mediaName(entry) + "-capa.jpg";
    } else {
      coverImage.removeAttribute("src");
      download.removeAttribute("href");
    }
  }

  function mediaName(entry) {
    return "gta-vi-" + formatTime(entry.start).replaceAll(":", "-");
  }

  function select(id) {
    const entry = records.get(id);
    selectedId = entry?.id;
    player.pause();
    discardPreparedDownload();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = undefined;
    get("detalhes-corte").hidden = !entry;
    feedback.textContent = "";
    screenFeedback.textContent = "";
    downloadStatus.textContent = "";
    restoreInput.value = "";
    screenFields.opening.value = entry?.screenText?.opening ?? "";
    screenFields.ending.value = entry?.screenText?.ending ?? "";
    updateScreenControls();
    if (!entry) {
      player.removeAttribute("src");
      player.load();
      showCover({});
      showScreenText();
      renderList();
      return;
    }
    videoUrl = URL.createObjectURL(entry.video);
    player.src = downloadVideo.href = videoUrl;
    downloadVideo.download = mediaName(entry) + ".mp4";
    get("nome-corte").textContent = entry.title;
    get("info-corte").textContent = formatTime(entry.start) + "–" + formatTime(entry.end)
      + " do original · " + Math.round(entry.end - entry.start) + " s · 9:16";
    for (const [key, input] of Object.entries(fields)) {
      input.value = key === "tags" ? entry.tags.join(", ") : entry[key];
    }
    coverFields.hook.value = entry.hook ?? "";
    coverFields.cta.value = entry.cta ?? "";
    const replacementHook = replacementForFilenameHook(entry);
    if (replacementHook) {
      coverFields.hook.value = replacementHook;
      feedback.textContent = "O gancho anterior veio do nome do arquivo. Edite a sugestão ou clique em Atualizar capa.";
    }
    showCover(entry);
    showScreenText();
    renderList();
  }

  function setEditing(value) {
    editing = value;
    for (const button of actions) button.disabled = value;
    downloadVideo.setAttribute("aria-disabled", String(value));
    updateScreenControls();
  }

  function fieldValues() {
    if (!form.reportValidity()) return;
    const text = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value.trim()]));
    const tags = new Map();
    for (const tag of text.tags.split(/[,\n]+/).map(value => value.trim()).filter(Boolean)) {
      const key = tag.toLocaleLowerCase("pt-BR");
      if (!tags.has(key)) tags.set(key, tag);
    }
    if (!text.title || !text.description || tags.size < 5) {
      feedback.textContent = "Preencha o título, a descrição e pelo menos 5 tags diferentes.";
      return;
    }
    return { ...text, tags: [...tags.values()] };
  }

  async function persist(entry) {
    try {
      await saveClip(entry);
      stored.add(entry.id);
      libraryStatus.textContent = "";
      return true;
    } catch (error) {
      const detail = error instanceof Error ? " " + error.message : "";
      libraryStatus.textContent = "A versão atual do corte está disponível nesta aba." + detail;
      return false;
    }
  }

  async function applyEdits(rebuildCover, frameTime) {
    const entry = records.get(selectedId);
    if (!entry || editing) return;
    const edits = rebuildCover
      ? { hook: coverFields.hook.value.trim(), cta: coverFields.cta.value.trim() }
      : fieldValues();
    if (!edits) return;
    setEditing(true);
    feedback.textContent = rebuildCover ? "Criando a capa…" : "Salvando o texto…";
    const updated = { ...entry, ...edits };
    try {
      if (rebuildCover) {
        updated.coverFrameTime = frameTime ?? entry.coverFrameTime;
        updated.cover = await generateCover(entry.video, {
          ...edits, cueTime: entry.cueTime, frameTime: updated.coverFrameTime, videoText: entry.videoText,
        });
      }
      records.set(updated.id, updated);
      const saved = await persist(updated);
      renderList();
      if (selectedId === updated.id) {
        get("nome-corte").textContent = updated.title;
        if (rebuildCover) showCover(updated);
        feedback.textContent = saved
          ? (rebuildCover ? "Capa atualizada." : "Publicação salva.")
          : "Alterações disponíveis nesta aba.";
      }
    } catch (error) {
      if (selectedId === entry.id) {
        feedback.textContent = error instanceof Error ? error.message : "Não foi possível atualizar a capa.";
      }
    } finally {
      setEditing(false);
    }
  }

  for (const event of ["loadedmetadata", "seeking", "seeked", "timeupdate"]) {
    player.addEventListener(event, showScreenText);
  }
  screenForm.addEventListener("input", event => {
    if (event.target !== screenFields.opening && event.target !== screenFields.ending) return;
    discardPreparedDownload();
    downloadStatus.textContent = "";
    showScreenText();
  });
  for (const [id, ending] of [["ver-abertura", false], ["ver-encerramento", true]]) {
    get(id).addEventListener("click", () => {
      if (!Number.isFinite(player.duration)) {
        screenFeedback.textContent = "Aguarde a prévia carregar.";
        return;
      }
      player.pause();
      player.currentTime = ending ? Math.max(0, player.duration - CLIP_CTA_SECONDS + .15) : 0;
      showScreenText();
      player.scrollIntoView({ block: "nearest" });
    });
  }

  async function saveScreenText(entry, screenText) {
    const updated = { ...entry, screenText };
    records.set(updated.id, updated);
    return persist(updated);
  }

  screenForm.addEventListener("submit", async event => {
    event.preventDefault();
    const entry = records.get(selectedId);
    if (!entry || editing || entry.videoText) return;
    setEditing(true);
    try {
      const saved = await saveScreenText(entry, screenValues());
      if (selectedId === entry.id) {
        screenFeedback.textContent = saved ? "Textos do vídeo salvos." : "Textos disponíveis nesta aba.";
      }
    } finally {
      setEditing(false);
    }
  });

  downloadVideo.addEventListener("click", async event => {
    const entry = records.get(selectedId);
    if (editing || !entry) {
      event.preventDefault();
      return;
    }
    if (entry.videoText || preparedUrl) return;
    const screenText = screenValues();
    const hasText = screenText.opening || screenText.ending;
    const changed = screenText.opening !== (entry.screenText?.opening ?? "")
      || screenText.ending !== (entry.screenText?.ending ?? "");
    if (!hasText && !changed) return;
    event.preventDefault();
    setEditing(true);
    downloadStatus.textContent = "Preparando o MP4…";
    try {
      let output = entry.video;
      if (hasText) {
        const { renderScreenText } = await import("./video-local.js");
        output = await renderScreenText(entry.video, {
          ...screenText,
          onProgress: fraction => {
            if (selectedId === entry.id) {
              downloadStatus.textContent = "Exportando o texto no MP4… " + Math.round(fraction * 100) + "%";
            }
          },
        });
      }
      const saved = !changed || await saveScreenText(entry, screenText);
      const url = URL.createObjectURL(output);
      if (selectedId === entry.id) {
        preparedUrl = url;
        downloadVideo.href = url;
        downloadStatus.textContent = saved ? "MP4 pronto para baixar." : "MP4 pronto. Os textos ficaram nesta aba.";
      } else {
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      const link = document.createElement("a");
      link.href = url;
      link.download = mediaName(entry) + ".mp4";
      document.body.append(link);
      link.click();
      link.remove();
    } catch (error) {
      if (selectedId === entry.id) downloadStatus.textContent = error.message || "Não foi possível exportar o MP4.";
    } finally {
      setEditing(false);
    }
  });

  get("recuperar-textos-video").addEventListener("click", async () => {
    const entry = records.get(selectedId);
    if (!entry?.videoText || editing) return;
    const original = restoreInput.files?.[0];
    if (!original || !/\.(mp4|mov)$/i.test(original.name)) {
      screenFeedback.textContent = "Selecione o MP4 ou MOV original usado nesse corte.";
      return;
    }
    setEditing(true);
    screenFeedback.textContent = "Abrindo o vídeo original…";
    let session;
    try {
      const { createVideoSession } = await import("./video-local.js");
      session = await createVideoSession(original);
      const video = await session.render(entry.start, fraction => {
        if (selectedId === entry.id) screenFeedback.textContent = "Recuperando o trecho… " + Math.round(fraction * 100) + "%";
      }, { seconds: Math.round(entry.end - entry.start) });
      const updated = { ...entry, video, videoText: false, screenText: { opening: "", ending: "" } };
      const saved = await persist(updated);
      records.set(entry.id, updated);
      if (selectedId === entry.id) {
        select(entry.id);
        screenFeedback.textContent = saved ? "Trecho recuperado. Agora você pode escrever na tela."
          : "Trecho recuperado nesta aba. Agora você pode escrever na tela.";
      }
    } catch (error) {
      if (selectedId === entry.id) screenFeedback.textContent = error.message || "Não foi possível recuperar o corte.";
    } finally {
      session?.close();
      setEditing(false);
    }
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    void applyEdits(false);
  });
  get("refazer-capa").addEventListener("click", () => void applyEdits(true));
  useFrame.addEventListener("click", () => {
    if (player.readyState < 2 || player.seeking) {
      feedback.textContent = "Aguarde a prévia carregar ou termine de navegar pelo vídeo.";
      return;
    }
    player.pause();
    void applyEdits(true, player.currentTime);
  });
  get("copiar-texto").addEventListener("click", async () => {
    const edits = fieldValues();
    if (!edits) return;
    const publication = [edits.title, edits.description, "Tags: " + edits.tags.join(", ")].join("\n\n");
    try {
      await navigator.clipboard.writeText(publication);
      feedback.textContent = "Publicação copiada.";
    } catch {
      fields.description.select();
      feedback.textContent = "Selecione o texto nos campos para copiar.";
    }
  });
  get("excluir-corte").addEventListener("click", async () => {
    const entry = records.get(selectedId);
    if (!entry || editing || !window.confirm("Excluir este corte da biblioteca deste navegador?")) return;
    setEditing(true);
    try {
      if (stored.has(entry.id)) await deleteClip(entry.id);
      stored.delete(entry.id);
      records.delete(entry.id);
      select(records.has(selectedId) ? selectedId : sortedRecords()[0]?.id);
      libraryStatus.textContent = records.size ? "Corte excluído." : "Sua biblioteca está vazia.";
    } catch (error) {
      feedback.textContent = error instanceof Error ? error.message : "Não foi possível excluir o corte.";
    } finally {
      setEditing(false);
    }
  });

  async function loadLibrary() {
    try {
      for (const entry of await listClips()) {
        records.set(entry.id, entry);
        stored.add(entry.id);
      }
      libraryStatus.textContent = records.size ? "" : "Os cortes que você gerar aparecerão aqui.";
      select(sortedRecords()[0]?.id);
    } catch (error) {
      const detail = error instanceof Error ? " " + error.message : "";
      libraryStatus.textContent = "A biblioteca salva não pôde ser aberta." + detail;
    }
  }
  const ready = loadLibrary();

  return {
    async addGenerated({ filename, start, end, video, publication, createdAt, order, cueTime, screenText }, signal) {
      await ready;
      signal.throwIfAborted();
      const entry = {
        id: crypto.randomUUID(), createdAt, order, filename, start, end, video,
        ...publication, cueTime, screenText, cover: null,
      };
      let coverError;
      try {
        entry.cover = await generateCover(video, { ...publication, cueTime, signal });
      } catch (error) {
        signal.throwIfAborted();
        coverError = error instanceof Error ? error.message : "Não foi possível gerar a capa.";
      }
      signal.throwIfAborted();
      const saved = await persist(entry);
      records.set(entry.id, entry);
      if (order === 0) {
        select(entry.id);
        if (coverError) feedback.textContent = coverError + " Você pode tentar em Atualizar capa.";
      } else {
        renderList();
      }
      return saved;
    },
    reveal(message) {
      libraryStatus.textContent = message;
      get("biblioteca").scrollIntoView({ block: "start" });
    },
  };
}
