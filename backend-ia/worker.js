// Gateway pessoal para roteiros GTA VI. Chaves são segredos do Cloudflare Worker, nunca do GitHub Pages.
// Provedor: Gemini Developer API, modelo com modalidade gratuita: gemini-3.5-flash-lite.
const ALLOWED_ORIGIN = 'https://snakxitz.github.io';
const MODEL = 'gemini-3.5-flash-lite';
const MAX_REQUEST_CHARS = 2_300_000;
const MAX_FRAMES = 4;
const FRAME_BASE64_LIMIT = 440_000;

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function sameSecret(a, b) {
  const x = new TextEncoder().encode(String(a || ''));
  const y = new TextEncoder().encode(String(b || ''));
  let difference = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    difference |= (x[i] || 0) ^ (y[i] || 0);
  }
  return difference === 0 && x.length >= 16;
}

function checkFrame(frame) {
  if (!frame || !Number.isFinite(frame.tempo) || frame.tempo < 0) return false;
  const match = typeof frame.imagem === 'string'
    ? /^data:image\/jpeg;base64,([a-zA-Z0-9+/=]+)$/.exec(frame.imagem)
    : null;
  return Boolean(match && match[1].length <= FRAME_BASE64_LIMIT);
}

function instructions(duracao) {
  return [
    'Você é roteirista profissional para YouTube Shorts sobre GTA V e GTA VI, em português do Brasil.',
    'Você recebe até quatro quadros JPEG de um trecho e, às vezes, uma transcrição automática que pode conter erros.',
    'Os quadros são amostras estáticas, não demonstram o movimento entre eles, e não identificam necessariamente qual jogo aparece.',
    'Não atribua um quadro a GTA V ou GTA VI sem prova visual clara. Não invente comparações, animações, mecânicas, datas nem eventos.',
    'Se as imagens não sustentarem uma comparação, explique apenas o que é observável, destacando hipóteses como hipóteses.',
    'Escreva uma narração ORIGINAL com gancho específico, análise própria prudente e pergunta final envolvente.',
    'Não copie ou reescreva fielmente a narração original. Evite roteiros genéricos, afirmações exageradas e clickbait enganoso.',
    'O roteiro deve ter aproximadamente ' + Math.max(35, Math.round(duracao * 2.2)) + ' palavras para um vídeo de ' + duracao + ' segundos.',
    'Retorne JSON com as propriedades: titulo (string), roteiro (string), observacoes (array de strings), alertas (array de strings), revisar (true).',
    'No campo roteiro, use apenas texto a ser narrado, separado em frases. Não use colchetes, instruções de edição, etiquetas ou markdown.',
    'Em observacoes, cite instantes dos quadros quando possível. Em alertas, liste o que não pôde ser confirmado.'
  ].join('\n');
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Editor-Code',
        'Access-Control-Max-Age': '600',
        'Vary': 'Origin'
      }});
    }
    if (path === '/health' && request.method === 'GET') {
      return respond({ ok: true, provider: 'gemini', model: MODEL });
    }
    if (path !== '/api/roteiro') return respond({ erro: 'Rota não encontrada.' }, 404);
    if (request.method !== 'POST') return respond({ erro: 'Método não permitido.' }, 405);
    if (origin !== ALLOWED_ORIGIN) return respond({ erro: 'Origem não autorizada.' }, 403);
    if (!env.GEMINI_API_KEY || !env.EDITOR_ACCESS_CODE) {
      return respond({ erro: 'Configure GEMINI_API_KEY e EDITOR_ACCESS_CODE no Worker.' }, 503);
    }
    if (!sameSecret(request.headers.get('X-Editor-Code'), env.EDITOR_ACCESS_CODE)) {
      return respond({ erro: 'Código pessoal inválido.' }, 401);
    }
    if (Number(request.headers.get('Content-Length') || 0) > MAX_REQUEST_CHARS) {
      return respond({ erro: 'Dados do vídeo grandes demais.' }, 413);
    }

    let raw;
    try { raw = await request.text(); } catch {
      return respond({ erro: 'Não foi possível receber a análise.' }, 400);
    }
    if (raw.length > MAX_REQUEST_CHARS) return respond({ erro: 'Dados do vídeo grandes demais.' }, 413);
    let input;
    try { input = JSON.parse(raw); } catch {
      return respond({ erro: 'Dados inválidos.' }, 400);
    }

    const { estilo, duracao, transcricao, quadros } = input || {};
    const valid = ['comparacao', 'teoria', 'curiosidade'].includes(estilo)
      && Number.isInteger(duracao) && duracao >= 10 && duracao <= 120
      && typeof transcricao === 'string' && transcricao.length <= 3000
      && Array.isArray(quadros) && quadros.length >= 2 && quadros.length <= MAX_FRAMES
      && quadros.every(checkFrame);
    if (!valid) return respond({ erro: 'Selecione um corte válido com até quatro quadros.' }, 400);

    const parts = [{
      text: 'Estilo de vídeo: ' + estilo + '.\nDuração desejada: ' + duracao +
        ' segundos.\nTranscrição de referência (não confiar em fatos não verificados):\n' +
        (transcricao.trim() || '(indisponível)')
    }];
    for (const frame of quadros) {
      parts.push({ text: 'Quadro do vídeo de origem no instante ' + frame.tempo + ' segundos:' });
      parts.push({ inline_data: {
        mime_type: 'image/jpeg',
        data: frame.imagem.slice('data:image/jpeg;base64,'.length)
      }});
    }

    let provider;
    try {
      provider = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instructions(duracao) }] },
            contents: [{ role: 'user', parts }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.4,
              maxOutputTokens: 1600
            }
          })
        }
      );
    } catch {
      return respond({ erro: 'Não foi possível conectar ao Gemini.' }, 502);
    }

    if (!provider.ok) {
      if (provider.status === 429) return respond({
        erro: 'Cota gratuita do Gemini atingida. Aguarde a renovação da cota.'
      }, 429);
      if (provider.status === 400 || provider.status === 403) return respond({
        erro: 'Chave do Gemini inválida, sem permissão ou solicitação não aceita. Confira o Google AI Studio.'
      }, 502);
      if (provider.status === 404) return respond({
        erro: 'Modelo Gemini indisponível para esta chave ou região.'
      }, 502);
      return respond({ erro: 'O Gemini não conseguiu gerar o roteiro. Tente novamente depois.' }, 502);
    }

    let generated;
    try {
      const data = await provider.json();
      const text = (data.candidates?.[0]?.content?.parts || [])
        .filter(item => typeof item.text === 'string')
        .map(item => item.text)
        .join('\n');
      generated = JSON.parse(text.trim());
    } catch {
      return respond({ erro: 'O Gemini não retornou um roteiro válido. Tente novamente.' }, 502);
    }
    if (typeof generated.roteiro !== 'string'
      || generated.roteiro.trim().length < 30 || generated.roteiro.length > 4500) {
      return respond({ erro: 'O Gemini retornou um roteiro vazio ou incompleto.' }, 502);
    }
    return respond({
      titulo: String(generated.titulo || '').slice(0, 120),
      roteiro: generated.roteiro.trim(),
      observacoes: Array.isArray(generated.observacoes)
        ? generated.observacoes.map(value => String(value).slice(0, 250)).slice(0, 6) : [],
      alertas: Array.isArray(generated.alertas)
        ? generated.alertas.map(value => String(value).slice(0, 250)).slice(0, 6) : [],
      revisar: true
    });
  }
};
