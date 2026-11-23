// Transcreve a fala escolhida no navegador e envia somente texto ao Worker privado.
import { analyzeVideoSpeech } from './aprimorado-analisar.js';

const MAX_TRANSCRIPT_LENGTH = 3000;

function cleanTranscript(text) {
  return String(text || '').replace(/\[[^\]]*\]|\((?:música|music|aplausos|applause|silêncio|silence)\)/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

export async function gerarRoteiroIA({
  source, cut, preset, endpoint, accessCode, language = 'pt', signal,
  progress = () => {}, onTranscript = () => {}
}) {
  const base = String(endpoint || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(base)) {
    throw new Error('Informe uma URL HTTPS válida do seu Worker de IA.');
  }
  if (!accessCode || accessCode.length < 16) throw new Error('Informe o código privado de pelo menos 16 caracteres.');
  if (!(source instanceof Blob) || !Number.isFinite(cut?.start) || !Number.isFinite(cut?.end)
    || cut.end <= cut.start) {
    throw new Error('Selecione um trecho de vídeo antes de gerar o roteiro.');
  }

  signal?.throwIfAborted();
  let transcript = cut.transcriptLanguage === language ? cleanTranscript(cut.excerpt) : '';
  if (!/[\p{L}\p{N}]/u.test(transcript)) {
    const segments = await analyzeVideoSpeech(source, cut.start, cut.end,
      (fraction, message) => progress(fraction * .8, message), signal, language);
    transcript = cleanTranscript(segments.map(segment => segment.text).join(' '));
  }
  signal?.throwIfAborted();
  if (!/[\p{L}\p{N}]/u.test(transcript)) {
    throw new Error('Nenhuma fala foi detectada nesse corte. Escolha um trecho com fala e confira o idioma do áudio original.');
  }
  onTranscript(transcript);
  progress(.85, 'Enviando a transcrição ao Gemini para criar o roteiro…');

  const response = await fetch(base + '/api/roteiro', {
    method: 'POST', mode: 'cors', cache: 'no-store', signal,
    headers: {'Content-Type': 'application/json', 'X-Editor-Code': accessCode},
    body: JSON.stringify({
      estilo: preset,
      duracao: Math.round(cut.end - cut.start),
      transcricao: transcript.slice(0, MAX_TRANSCRIPT_LENGTH)
    })
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 400 && json?.erro === 'Selecione um corte válido com até quatro quadros.') {
      throw new Error('Seu Worker ainda usa a análise por imagens. Publique a versão atualizada do Worker para gerar roteiros pela transcrição.');
    }
    throw new Error(json?.erro || 'Serviço de IA indisponível (' + response.status + ').');
  }
  if (typeof json?.roteiro !== 'string' || json.roteiro.trim().length < 30)
    throw new Error('A IA não retornou um roteiro válido.');

  progress(1, 'Roteiro recebido. Revise o texto antes de narrar.');
  return {
    roteiro: json.roteiro.trim(),
    tema: String(json.tema || ''),
    titulo: String(json.titulo || ''),
    observacoes: Array.isArray(json.observacoes) ? json.observacoes.map(String).slice(0, 6) : [],
    alertas: Array.isArray(json.alertas) ? json.alertas.map(String).slice(0, 6) : [],
    revisar: json.revisar !== false
  };
}
