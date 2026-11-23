// Modo Aprimorado: captura quadros somente do trecho selecionado e solicita um roteiro original.
// Chaves da IA nunca devem ser usadas aqui: somente o Worker privado conhece GEMINI_API_KEY.
const FRAME_POINTS = [0.10, 0.36, 0.62, 0.88];
const MAX_IMAGE_WIDTH = 448;

function waitFor(video, event, ready, signal, timeout = 12000) {
  signal?.throwIfAborted();
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('A leitura das imagens demorou demais.')), timeout);
    const onReady = () => { if (ready()) done(); };
    const onError = () => done(new Error('O navegador não conseguiu ler os quadros deste vídeo.'));
    const onAbort = () => done(signal.reason || new DOMException('Cancelado.', 'AbortError'));
    function done(error) {
      clearTimeout(timer);
      video.removeEventListener(event, onReady);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      error ? reject(error) : resolve();
    }
    video.addEventListener(event, onReady);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, {once:true});
    onReady();
  });
}

export async function captureEvidenceFrames(source, cut, progress = () => {}, signal) {
  if (!(source instanceof Blob) || !Number.isFinite(cut?.start) || !Number.isFinite(cut?.end) || cut.end <= cut.start)
    throw new Error('Selecione um trecho de vídeo antes de analisar.');
  const player = document.createElement('video');
  const url = URL.createObjectURL(source);
  const canvas = document.createElement('canvas');
  try {
    player.preload = 'auto';
    player.muted = true;
    player.playsInline = true;
    player.src = url;
    await waitFor(player, 'loadedmetadata', () => player.readyState >= 1 && player.videoWidth > 0, signal);
    if (cut.end > player.duration + 0.5) throw new Error('O trecho selecionado ultrapassa a duração do vídeo.');
    const width = Math.min(MAX_IMAGE_WIDTH, player.videoWidth);
    canvas.width = width;
    canvas.height = Math.max(2, Math.round(width * player.videoHeight / player.videoWidth));
    const ctx = canvas.getContext('2d', {alpha:false});
    if (!ctx) throw new Error('Não foi possível abrir o canvas para analisar o vídeo.');
    const frames = [];
    for (const [index, fraction] of FRAME_POINTS.entries()) {
      signal?.throwIfAborted();
      const at = Math.min(player.duration - 0.10, cut.start + (cut.end - cut.start) * fraction);
      player.currentTime = Math.max(0, at);
      await waitFor(player, 'seeked', () => !player.seeking && player.readyState >= 2 &&
        Math.abs(player.currentTime - at) < 0.25, signal);
      ctx.drawImage(player, 0, 0, canvas.width, canvas.height);
      frames.push({tempo: Number(at.toFixed(2)), imagem: canvas.toDataURL('image/jpeg', 0.70)});
      progress((index+1)/FRAME_POINTS.length * 0.8, 'Analisando quadros ' + (index+1) + '/' + FRAME_POINTS.length + '…');
    }
    return frames;
  } finally {
    player.pause();
    player.removeAttribute('src');
    player.load();
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 1;
  }
}

export async function gerarRoteiroIA({source, cut, preset, endpoint, accessCode, signal, progress = () => {}}) {
  const base = String(endpoint || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(base)) {
    throw new Error('Informe uma URL HTTPS válida do seu Worker de IA.');
  }
  if (!accessCode || accessCode.length < 8) throw new Error('Informe o código de acesso ao Worker (mínimo de 8 caracteres).');
  const frames = await captureEvidenceFrames(source, cut, progress, signal);
  signal?.throwIfAborted();
  progress(0.85, 'Solicitando análise visual e roteiro original à IA…');
  const response = await fetch(base + '/api/roteiro', {
    method:'POST', mode:'cors', cache:'no-store', signal,
    headers:{'Content-Type':'application/json', 'X-Editor-Code':accessCode},
    body:JSON.stringify({
      estilo:preset,
      duracao:Math.round(cut.end-cut.start),
      transcricao:String(cut.excerpt || '').slice(0,3000),
      quadros:frames
    })
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.erro || 'Serviço de IA indisponível (' + response.status + ').');
  if (typeof json.roteiro !== 'string' || json.roteiro.trim().length < 30)
    throw new Error('A IA não retornou um roteiro válido.');
  progress(1, 'Roteiro recebido. Confira fatos e cenas antes de narrar.');
  return {
    roteiro:json.roteiro.trim(),
    tema:String(json.tema || ''),
    titulo:String(json.titulo || ''),
    observacoes:Array.isArray(json.observacoes) ? json.observacoes.map(String).slice(0,6) : [],
    alertas:Array.isArray(json.alertas) ? json.alertas.map(String).slice(0,6) : [],
    revisar:json.revisar !== false
  };
}
