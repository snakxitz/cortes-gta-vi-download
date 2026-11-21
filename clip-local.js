export const CLIP_SECONDS = 65;
export const CLIP_LENGTHS = Object.freeze([30, CLIP_SECONDS]);

const signals = [
  ["GTA VI", 2, /\b(?:gta\s*(?:6|vi|seis)|grand theft auto\s*(?:6|vi|seis)|vice city|leonida|lucia caminos|jason duval)\b/],
  ["Gancho", 4, /\b(?:voce sabia|olha isso|presta atencao|ninguem percebeu|voce nao vai acreditar|e se eu te disser|did you know|watch this|look at this|here.s why)\b|(?:^|[.!?]\s+)(?:como|por que|qual|quais|onde|sera que|what|why|how|which|where)\b[^?]{5,140}\?/],
  ["CTA", 1.4, /\b(?:se inscrev\w*|deixa o like|comenta\w*|segue o perfil|subscribe|drop a like|let me know|comment below)\b/],
  ["Curiosidade", 2.5, /\b(?:curios\w*|detalhe\w*|reparou|descobr\w*|detail\w*|notice\w*|found|hidden)\b/],
  ["Tensão", 3, /\b(?:persegu\w*|policia|fug\w*|tiroteio|perigo|tenso|chase|police|escape|shootout|danger)\b/],
  ["Mistério", 3, /\b(?:misterio\w*|segredo\w*|teoria\w*|ninguem sabe|pista\w*|secret\w*|mystery|theory|clue\w*)\b/],
];

const topics = [
  /\bvice city\b/,
  /\b(?:lucia(?: caminos)?|jason(?: duval)?)\b/,
  /\bleonida\b/,
  /\b(?:policia|persegu\w*|police|chase)\b/,
  /\b(?:trailer\w*|teaser\w*)\b/,
  /\b(?:mapa\w*|map|maps)\b/,
  /\b(?:misterio\w*|segredo\w*|teoria\w*|mystery|theory|secret\w*)\b/,
  /\b(?:jogabilidade|gameplay|missao|missoes|mission\w*)\b/,
];

const commonWords = new Set(
  "ainda agora aqui assim aquilo cada como coisa coisas desse dessa dizer eles essa esse esta este estava fazer isso muito mesmo nossa para pode pelo porque qual quando sobre tambem todo tudo voce voces then this that with first there these those have from what where just very your their would".split(" "),
);

function normalize(text) {
  return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function lowerBound(values, target, strict = false) {
  let start = 0;
  let end = values.length;
  while (start < end) {
    const middle = (start + end) >>> 1;
    if (values[middle] < target || (strict && values[middle] === target)) start = middle + 1;
    else end = middle;
  }
  return start;
}

function scoreWindow(start, end, parts, first, last, repeats) {
  const hits = Array(signals.length).fill(0);
  const topicHits = Array(topics.length).fill(0);
  const tokens = new Set();
  let hook;
  let hookStrength = -Infinity;
  let speech = 0;
  let words = 0;
  let opening = 0;
  let closing = 0;
  let cueQuality = 0;

  for (let index = first; index < last; index++) {
    const part = parts[index];
    const visible = Math.min(end, part.end) - Math.max(start, part.start);
    if (visible <= 0) continue;
    const fraction = visible / (part.end - part.start);
    const repetitionWeight = 1 / Math.sqrt(repeats.get(part.normalized));
    const offset = Math.max(0, part.start - start);
    speech += visible;
    words += part.words * fraction * repetitionWeight;
    for (const token of part.tokens) tokens.add(token);
    for (const topic of part.topics) topicHits[topic] += fraction * repetitionWeight;
    for (const signal of part.signals) hits[signal] += fraction * repetitionWeight;

    const isHook = part.signals.includes(1);
    const isCTA = part.signals.includes(2);
    const hasStory = part.signals.some(signal => signal >= 3);
    const substance = Number(isHook) * 5 + Number(hasStory) * 3
      + Number(part.topics.length > 0) * 1.5 + Math.min(2, part.tokens.length * 0.25)
      + Number(part.text.includes("?")) * 0.8 - Number(isCTA && !hasStory && !isHook) * 2;
    const quality = substance * fraction * repetitionWeight;
    cueQuality = Math.max(cueQuality, quality);
    if (offset <= 7 && (isHook || hasStory)) {
      opening = Math.max(opening, (3 + Number(isHook) * 2) * (1 - offset / 10) * fraction);
    }
    if (offset >= (end - start) * 48 / CLIP_SECONDS && isCTA) closing = Math.max(closing, 2 * fraction);
    const strength = quality + (offset <= 7 ? 2 : 0) - offset * 0.05;
    if (strength > hookStrength) {
      hook = { text: part.text, start: Math.max(start, part.start), end: Math.min(end, part.end) };
      hookStrength = strength;
    }
  }

  const hasEditorialSignal = hits.slice(1).some(count => count > 0);
  if (!hook || (!hasEditorialSignal && (speech < 1.5 || words < 4))) return null;
  const topicStrength = Math.max(...topicHits);
  const score = hits.reduce((sum, count, index) =>
    sum + signals[index][1] * Math.min(count, 1) * (1 + 0.2 * Math.max(0, Math.min(count - 1, 3))), 0)
    + opening + closing + Math.min(2, speech / 14)
    + Math.min(2, words / 32) + cueQuality * 0.25 + Math.min(2, topicStrength * 0.9);
  return { start, end, score, first, last, hook, hits, tokens,
    topic: topicStrength > 0 ? topicHits.indexOf(topicStrength) : -1 };
}

function strongestSchedule(candidates, limit) {
  const starts = candidates.map(clip => clip.start);
  const next = candidates.map(clip => lowerBound(starts, clip.end));
  const size = candidates.length;
  const scores = [new Float64Array(size + 1)];
  for (let count = 1; count <= limit; count++) {
    const row = new Float64Array(size + 1);
    row[size] = -Infinity;
    for (let index = size - 1; index >= 0; index--) {
      row[index] = Math.max(row[index + 1], candidates[index].score + scores[count - 1][next[index]]);
    }
    scores.push(row);
  }
  let remaining = limit;
  while (remaining > 0 && !Number.isFinite(scores[remaining][0])) remaining--;
  const chosen = [];
  for (let index = 0; remaining > 0 && index < size;) {
    const take = candidates[index].score + scores[remaining - 1][next[index]];
    if (Number.isFinite(take) && take >= scores[remaining][index]) {
      chosen.push(candidates[index]);
      index = next[index];
      remaining--;
    } else {
      index++;
    }
  }
  return chosen;
}

function distinctScore(clip, others) {
  let score = clip.score;
  for (const other of others) {
    if (clip.start < other.end && other.start < clip.end) return -Infinity;
    if (clip.topic !== -1 && clip.topic === other.topic) score -= 1;
    const smaller = clip.tokens.size <= other.tokens.size ? clip.tokens : other.tokens;
    const larger = smaller === clip.tokens ? other.tokens : clip.tokens;
    if (smaller.size < 6) continue;
    let shared = 0;
    for (const word of smaller) shared += Number(larger.has(word));
    const similarity = shared / (smaller.size + larger.size - shared);
    score -= Math.max(0, similarity - 0.35) * 7;
  }
  return score;
}

export function selectClips(segments, duration, filename, count = 1, seconds = CLIP_SECONDS) {
  if (!CLIP_LENGTHS.includes(seconds)) throw new Error("Escolha cortes de 30 ou 65 segundos.");
  if (!Number.isFinite(duration) || duration < seconds) {
    throw new Error("Envie um vídeo com pelo menos " + seconds + " segundos.");
  }
  const repeats = new Map();
  const parts = [];
  for (const part of segments || []) {
    if (!Number.isFinite(part.start) || !Number.isFinite(part.end) || typeof part.text !== "string") continue;
    const start = Math.max(0, part.start);
    const end = Math.min(duration, part.end);
    const text = part.text.trim();
    if (end <= start || !text) continue;
    const normalized = normalize(text);
    const words = normalized.match(/[a-z0-9]+/g) ?? [];
    if (!words.length) continue;
    const tokens = [...new Set(words.filter(word => word.length >= 4 && !commonWords.has(word)))];
    const matchedSignals = signals.flatMap(([, , pattern], index) => pattern.test(normalized) ? [index] : []);
    const matchedTopics = topics.flatMap((pattern, index) => pattern.test(normalized) ? [index] : []);
    repeats.set(normalized, (repeats.get(normalized) ?? 0) + 1);
    parts.push({ start, end, text, normalized, words: words.length, tokens,
      signals: matchedSignals, topics: matchedTopics });
  }
  if (!parts.length) {
    throw new Error("Não encontrei fala. Envie um vídeo sobre GTA VI com narração.");
  }
  const context = normalize(String(filename ?? "").replace(/[-_]/g, " "))
    + " " + parts.map(part => part.normalized).join(" ");
  if (!signals[0][2].test(context)) {
    throw new Error("Não encontrei uma referência a GTA VI no nome do arquivo ou na fala.");
  }
  if (!parts.some(part => part.signals.some(signal => signal > 0))) {
    throw new Error("A fala não trouxe ganchos, curiosidades, tensão, mistério ou CTA suficientes para sugerir um corte.");
  }

  parts.sort((left, right) => left.start - right.start);
  const partStarts = parts.map(part => part.start);
  let maxEnd = 0;
  const partEnds = parts.map(part => (maxEnd = Math.max(maxEnd, part.end)));
  const latest = duration - seconds;
  const starts = new Set([0, latest]);
  for (let start = 0; start <= latest; start += 5) {
    starts.add(start);
    starts.add(latest - start);
  }
  for (const part of parts) {
    if (part.signals.length || part.topics.length) {
      starts.add(Math.max(0, Math.min(part.start - 0.5, latest)));
    }
  }
  const candidates = [];
  for (const start of [...starts].sort((left, right) => left - right)) {
    const end = start + seconds;
    const first = lowerBound(partEnds, start, true);
    const last = lowerBound(partStarts, end);
    const candidate = scoreWindow(start, end, parts, first, last, repeats);
    if (candidate) candidates.push(candidate);
  }
  const limit = Math.min(5, Math.max(1, Math.floor(Number(count)) || 1), Math.floor(duration / seconds));
  const chosen = strongestSchedule(candidates, limit);

  // Keep the count and non-overlap while preferring similarly strong, different subjects.
  if (chosen.length > 1) {
    for (let index = 0; index < chosen.length; index++) {
      const others = chosen.filter((_, position) => position !== index);
      let strength = distinctScore(chosen[index], others);
      for (const candidate of candidates) {
        if (candidate.score <= strength) continue;
        const adjusted = distinctScore(candidate, others);
        if (adjusted > strength) {
          chosen[index] = candidate;
          strength = adjusted;
        }
      }
    }
  }
  return chosen.sort((left, right) => right.score - left.score || left.start - right.start)
    .map(({ start, end, score, first, last, hook, hits }) => {
      const segments = parts.slice(first, last).filter(part => part.end > start)
        .map(({ start, end, text }) => ({ start, end, text }));
      return { start, end, score, segments, text: segments.map(part => part.text).join(" "), hook,
        signals: signals.filter((_, index) => hits[index] > 0).map(([name]) => name) };
    });
}

export function formatTime(seconds) {
  const whole = Math.floor(seconds);
  return Math.floor(whole / 60) + ":" + String(whole % 60).padStart(2, "0");
}
