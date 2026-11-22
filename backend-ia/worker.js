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

function instructions(duracao, estilo) {
  const formats = {
    comparacao: 'Compare conceitos, possibilidades ou características somente quando a evidência sustentar a relação. Foque no PORQUÊ a diferença importa, não no inventário de cenas.',
    teoria: 'Desenvolva uma hipótese ou pergunta instigante de forma explícita, separando possibilidades de fatos. Não apresente especulações como novidades confirmadas.',
    curiosidade: 'Escolha uma ideia interessante revelada ou sugerida pelo material e explique sua importância de forma original, sem repetir a fala do vídeo.'
  };
  return [
    'Você é roteirista e editor de YouTube Shorts em português brasileiro. Sua tarefa NÃO é narrar imagens: é identificar UM TEMA editorial interessante que o trecho possa ilustrar e escrever um roteiro original SOBRE ESSE TEMA.',
    'O material pode ser sobre GTA V, GTA VI ou outro assunto. Não force GTA no roteiro se o corte não tratar claramente disso.',
    'Receberá quatro quadros espaçados e talvez transcrição automática. Use a transcrição e as imagens SOMENTE para descobrir o assunto, o contexto e possíveis evidências, nunca como roteiro a ser parafraseado.',
    'ETAPA INTERNA 1: identifique um único tema específico, compreensível e apoiado pelo corte. Escolha uma pergunta, controvérsia, curiosidade ou comparação relevante. Evite títulos e roteiros vagos.',
    'ETAPA INTERNA 2: defina um ângulo editorial original: por que isso importa, que dúvida levanta, qual conceito ajuda a entender ou que implicações razoáveis pode ter.',
    'ETAPA INTERNA 3: crie um roteiro AUTÔNOMO e contínuo com gancho forte, desenvolvimento explicativo ou argumentativo e fechamento com pergunta natural para comentários. As imagens servem de ILUSTRAÇÃO, não de pauta cronológica.',
    'É PROIBIDO fazer descrição quadro a quadro, cronologia da cena, leitura visual literal, repetir falas da transcrição ou escrever "aqui vemos", "repare nesta imagem", "agora aparece", "nesse momento" ou "como mostrado no vídeo".',
    'Mantenha uma conexão real com o material. Não invente nomes, novidades de jogos, recursos, acontecimentos, datas, confirmações, dados ou detalhes não sustentados. Não atribua quadros a GTA V ou GTA VI sem evidência clara.',
    'Os quatro quadros não demonstram movimento contínuo; não conclua o que ocorreu entre eles. A transcrição pode estar errada. Se a evidência for fraca, formule uma reflexão ou pergunta geral fundamentada, sem afirmar fatos específicos.',
    'Tom: curioso, envolvente, claro e natural; conteúdo informativo de criador, não relato de gameplay. Evite clichês e clickbait que prometa algo inexistente.',
    'Estilo solicitado: ' + estilo + '. ' + (formats[estilo] || formats.curiosidade),
    'Duração estimada: ' + duracao + ' segundos; aproximadamente ' + Math.max(35, Math.round(duracao * 2.2)) + ' palavras. Não exceda tanto que a narração fique apertada.',
    'Responda APENAS JSON com propriedades: tema (string curta e específica), titulo (string com gancho), roteiro (string narrável), observacoes (array de evidências que sugerem o tema), alertas (array de pontos não confirmados), revisar (true).',
    'No campo roteiro, escreva apenas o texto da voz, em frases curtas, sem colchetes, instruções técnicas, texto para editor, timestamps, markdown ou nomes de etapas.',
    'Nas observacoes, descreva brevemente a base do tema usando quadros/transcrição, mas NÃO transforme essas observações em narração.'
  ].join('\\n');
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
            systemInstruction: { parts: [{ text: instructions(duracao, estilo) }] },
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
      tema: String(generated.tema || '').slice(0, 140),
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
