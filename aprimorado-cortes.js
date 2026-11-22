// Seleção de cortes e criação de roteiro-base: lógica pura, sem acesso à rede.
// A análise de fala utiliza transcrição feita em outro módulo; não reconhece objetos em vídeo.
export const CUT_DURATIONS = Object.freeze([20, 30, 40, 60, 65]);

const HOOK = /\b(?:voce sabia|voce percebeu|olha isso|repara|repare|ninguem|segredo|por que|sera que|e se|did you know|look at|what if|hidden|compare|comparacao|diferen[cç]a|teoria|reveal|surprising)\b/i;
const SUBJECTS = [
  ['polícia', /pol[ií]cia|police|persegui[cç]/i],
  ['NPCs', /\bnpcs?\b|pedestres?|cidad[aã]os|personagens n[aã]o jog[aá]veis/i],
  ['iluminação', /ilumina[cç][aã]o|luzes?|sombras?|lighting|reflexos?/i],
  ['física', /f[ií]sica|colis[aã]o|batida|impacto|physics/i],
  ['trânsito', /tr[aâ]nsito|carros?|ve[ií]culos?|traffic|driving/i],
  ['cidade', /cidade|ruas?|pr[eé]dios?|mapa|vice city|city|streets/i],
  ['personagens', /jason|lucia|protagonist|personagens?/i],
  ['água', /[aá]gua|mar|oceano|ondas?|water|ocean/i],
  ['animações', /anima[cç][aã]o|movimento|express[aã]o|animations?/i],
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function timeLabel(seconds) {
  const n = Math.max(0, Math.floor(seconds));
  return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
}
export function sanitizeSpeech(segments, from, to) {
  if (!(to > from)) return [];
  return (segments || []).filter(s => s && typeof s.text === 'string'
    && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > from && s.start < to && s.end > s.start)
    .map(s => ({ start: clamp(s.start, from, to), end: clamp(s.end, from, to), text: s.text.trim() }))
    .filter(s => s.end > s.start && s.text)
    .sort((a, b) => a.start - b.start);
}

function windowScore(from, seconds, segments) {
  const end = from + seconds;
  let score = 0, coverage = 0, firstText = '', hook = 0;
  const excerpts = [];
  for (const segment of segments) {
    const visible = Math.min(end, segment.end) - Math.max(from, segment.start);
    if (visible <= 0) continue;
    const fraction = visible / Math.max(.05, segment.end - segment.start);
    coverage += visible;
    const position = Math.max(0, segment.start - from);
    const words = segment.text.split(/\s+/).filter(Boolean).length;
    score += Math.min(2, words / 8) * fraction;
    if (HOOK.test(segment.text)) {
      hook += 2 * fraction + (position < 7 ? 2.5 : 0);
    }
    if (segment.text.includes('?')) score += 1.5 * fraction;
    if (position <= 7 && !firstText) firstText = segment.text;
    excerpts.push(segment.text);
  }
  const topic = SUBJECTS.find(([, pattern]) => excerpts.some(t => pattern.test(t)))?.[0] || 'a comparação';
  const density = clamp(coverage / seconds, 0, 1);
  score += density * 9 + hook;
  // Evita apresentar um trecho vazio como se fosse um momento forte.
  score -= density < .05 ? 20 : density < .17 ? 5 : 0;
  return { score, excerpt: excerpts.join(' ').replace(/\s+/g, ' ').trim(), topic, firstText };
}

export function suggestSpeechCuts(segments, regionStart, regionEnd, seconds, requested = 3) {
  if (!CUT_DURATIONS.includes(seconds)) throw new Error('Escolha 20, 30, 40, 60 ou 65 segundos.');
  if (regionEnd - regionStart < seconds) throw new Error('Esse trecho é menor que a duração escolhida.');
  const source = sanitizeSpeech(segments, regionStart, regionEnd);
  if (!source.length) return [];
  const latest = regionEnd - seconds;
  const positions = new Set([regionStart, latest]);
  for (let start = regionStart; start <= latest; start += 5) positions.add(start);
  for (const seg of source) {
    positions.add(clamp(seg.start - 1, regionStart, latest));
    positions.add(clamp(seg.start - 4, regionStart, latest));
  }
  const ranked = [...positions].map(start => ({
    start, end: start + seconds, type: 'fala', ...windowScore(start, seconds, source)
  })).filter(x => x.excerpt.length > 3).sort((a, b) => b.score - a.score || a.start - b.start);
  const chosen = [];
  const limit = Math.min(Math.floor((regionEnd - regionStart) / seconds), Math.max(1, Math.floor(requested)));
  for (const option of ranked) {
    if (chosen.every(c => option.start >= c.end - .01 || c.start >= option.end - .01)) chosen.push(option);
    if (chosen.length === limit) break;
  }
  return chosen.sort((a, b) => b.score - a.score);
}

export function proposeVisualWindows(regionStart, regionEnd, seconds, requested = 3) {
  if (!CUT_DURATIONS.includes(seconds)) throw new Error('Duração de corte inválida.');
  if (regionEnd - regionStart < seconds) throw new Error('O vídeo é menor que a duração do corte.');
  const limit = Math.min(Math.max(1, Math.floor(requested)), Math.floor((regionEnd - regionStart) / seconds));
  const span = (regionEnd - regionStart) / limit;
  return Array.from({length: limit}, (_, index) => {
    const base = regionStart + index * span;
    const slack = Math.max(0, span - seconds);
    const starts = [...new Set([base, base + slack * .5, base + slack])];
    return starts.map(start => ({start, end: start + seconds, type: 'visual', score: 0, excerpt: '', topic: ''}));
  });
}

export function chooseVisualWindows(groups, activity = new Map()) {
  return groups.map(group => {
    const ranked = [...group].sort((a, b) =>
      (activity.get(b.start + (b.end - b.start) / 3) || 0) - (activity.get(a.start + (a.end - a.start) / 3) || 0));
    return ranked[0];
  });
}

export function topicFromExcerpt(text) {
  return SUBJECTS.find(([, re]) => re.test(text || ''))?.[0] || 'esse detalhe';
}

// Apenas um esqueleto editorial: não inventa acontecimentos nem declara o que há no quadro.
export function draftNarration(preset, clip) {
  const topic = clip?.topic || topicFromExcerpt(clip?.excerpt);
  if (preset === 'teoria') return [
    `Será que *${topic}* esconde uma pista sobre GTA VI?`,
    '[Descreva exatamente o detalhe que aparece no corte.]',
    '[Explique sua hipótese e diferencie fatos de especulação.]',
    '[Compare com algo verificável de GTA V, se houver.]',
    'Você acha essa teoria possível? *Comenta* sua opinião.'
  ].join('\n');
  if (preset === 'curiosidade') return [
    `Você já percebeu *${topic}* nos vídeos de GTA?`,
    '[Descreva o primeiro detalhe mostrado na imagem.]',
    '[Explique o que acontece e por que é interessante.]',
    '[Acrescente sua análise ou contexto original.]',
    'Você já tinha visto isso? *Comenta* aqui.'
  ].join('\n');
  return [
    `Você já reparou em *${topic}* ao comparar GTA V e GTA VI?`,
    '[Explique o que realmente aparece no trecho de GTA V.]',
    '[Mostre o detalhe equivalente de GTA VI, sem afirmar o que não estiver confirmado.]',
    '[Dê sua análise: o que mudou e por que isso importa?]',
    'E você, qual versão prefere? *Comenta* aqui.'
  ].join('\n');
}
