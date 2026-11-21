const LIMIT_BYTES = 250 * 1024 * 1024;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIDEO_EXT = /\.(mp4|mov)$/i;
const MP4_MIME = "video/mp4";
const MOV_MIME = "video/quicktime";
const VIDEO_TYPES = new Map([
  [MP4_MIME, MP4_MIME],
  ["application/mp4", MP4_MIME],
  [MOV_MIME, MOV_MIME],
  ["video/x-quicktime", MOV_MIME],
]);
const GENERIC_TYPES = new Set(["", "application/octet-stream", "application/x-download"]);
const PREFIX_BYTES = 512;

function httpsUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Cole um link HTTPS completo.");
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new Error("Cole um link HTTPS completo, sem usuário ou senha no endereço.");
  }
  return url;
}

export function classifyVideoLink(input) {
  const url = httpsUrl(input);
  const host = url.hostname;
  const isYoutube = host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
  if (!isYoutube) return { kind: "direct", url: url.href };
  if (url.port) throw new Error("Use o endereço padrão do vídeo do YouTube.");

  let videoId;
  if (host === "youtu.be") {
    videoId = url.pathname.match(/^\/([^/]+)\/?$/)?.[1];
  } else if (url.pathname === "/watch") {
    videoId = url.searchParams.get("v");
  } else {
    videoId = url.pathname.match(/^\/(?:shorts|live)\/([^/]+)\/?$/)?.[1];
  }
  if (!YOUTUBE_ID.test(videoId ?? "")) {
    throw new Error("Cole o link de um vídeo, Short ou live do YouTube.");
  }
  return { kind: "youtube", url: "https://www.youtube.com/watch?v=" + videoId };
}

function decodeName(name) {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function safeBasename(name) {
  return name?.split(/[\\/]/).at(-1)?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function videoName(response, responseUrl) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const extended = disposition.match(/(?:^|;)\s*filename\*\s*=\s*utf-8'[^']*'([^;]+)/i);
  const plain = disposition.match(/(?:^|;)\s*filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
  return safeBasename(extended ? decodeName(extended[1].trim()) : plain?.[1] ?? plain?.[2])
    || safeBasename(decodeName(responseUrl.pathname.split("/").at(-1)));
}

function mediaType(prefix, declared, name) {
  const text = new TextDecoder().decode(prefix);
  if (/^\s*<(?:!--|!doctype\s+html\b|html\b|head\b|body\b|script\b|title\b|meta\b|\?xml\b)/i.test(text)) {
    throw new Error("Esse link abriu uma página. Cole o endereço direto do arquivo MP4 ou MOV.");
  }
  if (VIDEO_TYPES.has(declared)) return VIDEO_TYPES.get(declared);
  const atom = String.fromCharCode(...prefix.subarray(4, 8));
  if (atom === "ftyp") {
    const brand = String.fromCharCode(...prefix.subarray(8, 12));
    return brand === "qt  " ? MOV_MIME : MP4_MIME;
  }
  if (VIDEO_EXT.test(name ?? "")) return /\.mov$/i.test(name) ? MOV_MIME : MP4_MIME;
  if (/^(?:moov|mdat|wide)$/.test(atom)) return MOV_MIME;
  throw new Error("O link precisa apontar para um arquivo MP4 ou MOV.");
}

function overLimit() {
  return new Error("O limite para um vídeo por link é de 250 MiB.");
}

export async function fetchLinkedVideo(input, onProgress = () => {}, { signal } = {}) {
  const link = classifyVideoLink(input);
  if (link.kind === "youtube") {
    throw new Error("Para baixar pelo navegador, use o link direto de um MP4 ou MOV.");
  }

  signal?.throwIfAborted();
  let response;
  try {
    response = await fetch(link.url, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", signal });
  } catch (error) {
    signal?.throwIfAborted();
    if (error?.name === "AbortError") throw error;
    throw new Error("O navegador não conseguiu acessar o arquivo. Confira se o link está ativo e se o servidor permite acesso por este site (CORS).");
  }

  return readVideoResponse(response, link.url, onProgress, signal);
}

export async function fetchYoutubeVideo(endpoint, source, onProgress, { signal } = {}) {
  const videoId = new URL(source.url).searchParams.get("v");
  if (!YOUTUBE_ID.test(videoId ?? "")) throw new Error("Cole o link de um vídeo do YouTube.");
  const url = new URL(endpoint);
  url.pathname = url.pathname.replace(/\/$/, "") + "/importar/" + videoId;
  let response;
  try {
    response = await fetch(url, { method: "POST", credentials: "omit", redirect: "error", signal });
  } catch {
    signal?.throwIfAborted();
    throw new Error("O servidor de importação do YouTube está inacessível. Tente novamente ou envie o MP4.");
  }
  if (!response.ok) {
    const info = await response.json().catch(() => null);
    signal?.throwIfAborted();
    const message = typeof info?.detail === "string" && info.detail.length <= 300 ? info.detail : null;
    throw new Error(message ?? "O servidor não conseguiu importar este vídeo do YouTube.");
  }
  return readVideoResponse(response, url.href, onProgress, signal);
}

async function readVideoResponse(response, fallbackUrl, onProgress, signal) {
  let reader;
  let completed = false;
  try {
    if (!response.ok) {
      throw new Error("O servidor do arquivo respondeu com um erro (HTTP " + response.status + ").");
    }
    if (response.status === 206) throw new Error("O servidor enviou só uma parte do vídeo. Use um link para o arquivo completo.");

    const address = response.url || fallbackUrl;
    const responseUrl = fallbackUrl.startsWith("https:") ? httpsUrl(address) : new URL(address);
    const declared = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (/^text\/html$|^application\/xhtml\+xml$/.test(declared)) {
      throw new Error("Esse link abriu uma página. Cole o endereço direto do arquivo MP4 ou MOV.");
    }
    if (!VIDEO_TYPES.has(declared) && !GENERIC_TYPES.has(declared)) {
      throw new Error("O servidor não enviou um arquivo MP4 ou MOV.");
    }
    const length = Number(response.headers.get("content-length"));
    if (length > LIMIT_BYTES) throw overLimit();
    if (!response.body?.getReader) {
      throw new Error("O navegador não conseguiu ler o vídeo por partes. Envie o arquivo pelo seletor.");
    }

    reader = response.body.getReader();
    const name = videoName(response, responseUrl);
    const prefix = new Uint8Array(PREFIX_BYTES);
    const chunks = [];
    let received = 0;
    let type;
    onProgress(length > 0 ? 0 : null);
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      const size = value.byteLength;
      if (received + size > LIMIT_BYTES) throw overLimit();
      if (received < PREFIX_BYTES) prefix.set(value.subarray(0, PREFIX_BYTES - received), received);
      received += size;
      if (received >= PREFIX_BYTES && !type) type = mediaType(prefix, declared, name);
      chunks.push(value);
      if (length > 0) onProgress(Math.min(0.99, received / length));
    }

    signal?.throwIfAborted();
    if (!received) throw new Error("O servidor enviou um arquivo vazio.");
    type ??= mediaType(prefix.subarray(0, received), declared, name);
    const suffix = type === MOV_MIME ? ".mov" : ".mp4";
    const base = (name ?? "").replace(VIDEO_EXT, "") || "video";
    const file = new File(chunks, base + suffix, { type });
    onProgress(1);
    return file;
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  } finally {
    if (reader) {
      if (!completed) void reader.cancel().catch(() => {});
      reader.releaseLock();
    } else {
      void response.body?.cancel().catch(() => {});
    }
  }
}
