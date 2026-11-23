import { formatTime } from "./clip-local.js";
import { generateCover } from "./cover-local.js";
import { deleteClip, listClips, saveClip } from "./library-local.js";

export function mountLibrary() {
  const get = id => document.getElementById(id);
  const records = new Map();
  const stored = new Set();
  const list = get("lista-cortes");
  const form = get("publicacao-form");
  const actions = [...form.querySelectorAll("button"), get("excluir-corte")];
  const useFrame = get("usar-quadro");
  const player = get("video-corte");
  const coverImage = get("capa-corte");
  const libraryStatus = get("estado-biblioteca");
  const feedback = get("estado-publicacao");
  const fields = {
    title: get("titulo-corte"), description: get("descricao-corte"),
    tags: get("tags-corte"), hook: get("hook-corte"), cta: get("cta-corte"),
  };
  let selectedId;
  let videoUrl;
  let coverUrl;
  let editing = false;

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
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = undefined;
    get("detalhes-corte").hidden = !entry;
    feedback.textContent = "";
    if (!entry) {
      player.removeAttribute("src");
      player.load();
      showCover({});
      renderList();
      return;
    }
    videoUrl = URL.createObjectURL(entry.video);
    const download = get("baixar-local");
    player.src = download.href = videoUrl;
    download.download = mediaName(entry) + ".mp4";
    get("nome-corte").textContent = entry.title;
    get("info-corte").textContent = formatTime(entry.start) + "–" + formatTime(entry.end)
      + " do original · 65 s · 9:16";
    for (const [key, input] of Object.entries(fields)) {
      input.value = key === "tags" ? entry.tags.join(", ") : entry[key];
    }
    showCover(entry);
    renderList();
  }

  function setEditing(value) {
    editing = value;
    for (const button of actions) button.disabled = value;
  }

  function fieldValues() {
    if (!form.reportValidity()) return;
    const text = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value.trim()]));
    const tags = new Map();
    for (const tag of text.tags.split(/[,\n]+/).map(value => value.trim()).filter(Boolean)) {
      const key = tag.toLocaleLowerCase("pt-BR");
      if (!tags.has(key)) tags.set(key, tag);
    }
    if (!text.title || !text.description || !text.hook || !text.cta || tags.size < 5) {
      feedback.textContent = "Preencha o título, a descrição, o gancho e o CTA, com pelo menos 5 tags diferentes.";
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
    const edits = fieldValues();
    if (!edits) return;
    setEditing(true);
    feedback.textContent = rebuildCover ? "Criando a capa…" : "Salvando o texto…";
    const updated = { ...entry, ...edits };
    try {
      if (rebuildCover) {
        updated.coverFrameTime = frameTime ?? entry.coverFrameTime;
        updated.cover = await generateCover(entry.video, {
          ...edits, cueTime: entry.cueTime, frameTime: updated.coverFrameTime,
        });
      }
      records.set(updated.id, updated);
      const saved = await persist(updated);
      renderList();
      if (selectedId === updated.id) {
        get("nome-corte").textContent = updated.title;
        if (rebuildCover) showCover(updated);
        feedback.textContent = saved
          ? (rebuildCover ? "Capa e texto atualizados." : "Texto salvo.")
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
    async addGenerated({ filename, start, end, video, publication, createdAt, order, cueTime }, signal) {
      await ready;
      signal.throwIfAborted();
      const entry = {
        id: crypto.randomUUID(), createdAt, order, filename, start, end, video,
        ...publication, cueTime, cover: null,
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
