const DATABASE = "cortes-gta-vi";
const STORE = "clips";

function openLibrary() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new DOMException("IndexedDB indisponível.", "NotSupportedError"));
      return;
    }
    let blocked = false;
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onblocked = () => {
      blocked = true;
      reject(new DOMException("A biblioteca está aberta em outra versão do estúdio.", "InvalidStateError"));
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) {
        database.close();
        return;
      }
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

function libraryError(error) {
  if (error?.name === "QuotaExceededError") {
    return new Error("O navegador ficou sem espaço para salvar este corte. Libere espaço ou exclua um corte antigo.", { cause: error });
  }
  if (error?.name === "InvalidStateError") {
    return new Error("Feche outras abas do estúdio e tente acessar a biblioteca novamente.", { cause: error });
  }
  if (["SecurityError", "NotAllowedError", "NotSupportedError"].includes(error?.name)) {
    return new Error("O armazenamento da biblioteca está indisponível neste navegador. Verifique as permissões do site.", { cause: error });
  }
  return new Error("Não foi possível concluir a operação na biblioteca deste navegador. Tente novamente.", { cause: error });
}

async function useLibrary(mode, action) {
  let database;
  try {
    database = await openLibrary();
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || request.error);
    });
  } catch (error) {
    throw libraryError(error);
  } finally {
    database?.close();
  }
}

export async function listClips() {
  const entries = await useLibrary("readonly", store => store.getAll());
  return entries.sort((left, right) => right.createdAt - left.createdAt);
}

export async function saveClip(entry) {
  if (typeof entry?.id !== "string" || !entry.id.trim() || !Number.isFinite(entry.createdAt)
      || !(entry.video instanceof Blob) || (entry.cover != null && !(entry.cover instanceof Blob))) {
    throw new Error("O corte precisa de um identificador, uma data e um vídeo válidos.");
  }
  const {
    id, createdAt, order, video, cover = null, title, description, hook, cta, tags,
    start, end, filename, cueTime, coverFrameTime, videoText,
  } = entry;
  const record = {
    id, createdAt, order, video, cover, title, description, hook, cta, tags,
    start, end, filename, cueTime, coverFrameTime, videoText,
  };
  await useLibrary("readwrite", store => store.put(record));
  return record;
}

export async function deleteClip(id) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Selecione um corte válido para excluir.");
  }
  await useLibrary("readwrite", store => store.delete(id));
}
