export const CLIP_SECONDS = 65;
export const CLIP_LENGTHS = Object.freeze([30, CLIP_SECONDS]);

const signals = [
  ["GTA VI", .75, /\b(?:gta\s*(?:6|vi|seis)|grand theft auto\s*(?:6|vi|seis)|vice city|leonida|lucia caminos|jason duval)\b/],
  ["Gancho", 3, /\b(?:voce sabia|olha isso|presta atencao|ninguem percebeu|voce nao vai acreditar|e se eu te disser|o que acontece se|did you know|watch this|look at this|here.s why|what happens if)\b|(?:^|[.!?]\s+)(?:como|por que|qual|quais|onde|sera que|what|why|how|which|where)\b[^?]{5,140}\?/],
  ["CTA", .65, /\b(?:se inscrev\w*|deixa o like|comenta (?:aqui|qual|como|o que|se)|comente|segue o perfil|subscribe|drop a like|let me know|comment below)\b/],
  ["Curiosidade", 1.8, /\b(?:curios\w*|detalhe\w*|reparou|descobr\w*|detail\w*|notice\w*|found|hidden|surpreend\w*|surpris\w*)\b/],
  ["Tensão", 2, /\b(?:persegu\w*|policia|fug\w*|tiroteio|perigo|tenso|por pouco|quase perd\w*|chase|police|escape|shootout|danger|almost lost)\b/],
  ["Mistério", 2, /\b(?:misterio\w*|segredo\w*|teoria\w*|ninguem sabe|pista\w*|secret\w*|mystery|theory|clue\w*)\b/],
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
const sentenceEnd = /[.!?。！？][)"'”’」』»\]}]*$/u;
const ellipsisEnd = /(?:\.{3}|…)[)"'”’」』»\]}]*$/u;
const questionEnd = /[?？][)"'”’」』»\]}]*$/u;
const continuationOpening = /^(?:e ai|e depois|e tambem|entao|mas|porque|por isso|ou seja|alem disso|isso|essa|esse|ela|ele|and then|and also|so then|but|because|therefore|after that|these|those|that was|it was|he|she)\b/;
const fillerOpening = /^(?:fala galera|oi gente|ola pessoal|sejam? bem vind\w*|antes de comecar|bem vind\w*|e ai (?:galera|pessoal)|hey guys|hello everyone|welcome back|before we start)\b/;
const payoffWords = /\b(?:por fim|no final|no fim|por isso|e assim que|a resposta (?:e|foi)|o resultado (?:e|foi)|funcionou|consegui\w*|isso explica|in the end|it worked|i managed to|we managed to|the answer (?:is|was)|the result (?:is|was)|that explains|that.s why)\b/;

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
  const contextTokens = new Set();
  const length = end - start;
  let firstSpoken;
  let lastSpoken;
  let hasCoreSpeech = false;
  let hook;
  let hookStrength = -Infinity;
  let speech = 0;
  let coveredUntil = start;
  let words = 0;
  let cutBeginning = 0;
  let cutEnding = 0;
  let payoff = 0;

  for (let index = first; index < last; index++) {
    const part = parts[index];
    const visibleStart = Math.max(start, part.start);
    const visibleEnd = Math.min(end, part.end);
    const visible = visibleEnd - visibleStart;
    if (visible <= 0) continue;
    const fraction = visible / (part.end - part.start);
    const repetitionWeight = 1 / Math.sqrt(repeats.get(part.normalized));
    const offset = visibleStart - start;
    if (fraction >= .66 || visible >= Math.min(length * .25, 12)) hasCoreSpeech = true;
    if (visible >= Math.min(.25, (part.end - part.start) / 2)) {
      firstSpoken ??= part;
      if (!lastSpoken || part.end >= lastSpoken.end) lastSpoken = part;
    }
    speech += Math.max(0, visibleEnd - Math.max(visibleStart, coveredUntil));
    coveredUntil = Math.max(coveredUntil, visibleEnd);
    cutBeginning = Math.max(cutBeginning, Math.min(1, (visibleStart - part.start) / .75, visible / .6));
    cutEnding = Math.max(cutEnding, Math.min(1, (part.end - visibleEnd) / .75, visible / .6));
    words += part.words * fraction * repetitionWeight;
    for (const token of part.tokens) tokens.add(token);
    for (const topic of part.topics) topicHits[topic] += fraction * repetitionWeight;
    for (const signal of part.signals) hits[signal] += fraction * repetitionWeight;
    if (firstSpoken && part !== firstSpoken && contextTokens.size < 4 && offset < length * .85 && fraction >= .6) {
      for (const token of firstSpoken.tokens) {
        if (part.tokens.includes(token)) contextTokens.add(token);
      }
    }

    const early = 1 - Math.min(1, Math.max(0, offset - .2) / 8);
    const strength = part.substance * fraction * repetitionWeight * (.65 + early * .35)
      + (part.independent ? early * 2 : 0) - (part.start < start ? 2 * (1 - fraction) : 0);
    if (strength > hookStrength) {
      hook = { text: part.text, start: visibleStart, end: visibleEnd };
      hookStrength = strength;
    }
    if (part.payoff && !part.question && offset >= length * .4) {
      payoff = Math.max(payoff, fraction * repetitionWeight);
    }
  }

  if (!hook || !hasCoreSpeech) return null;
  let opening = 0;
  let closing = 0;
  if (firstSpoken && lastSpoken) {
    const lead = Math.max(0, firstSpoken.start - start);
    const tail = Math.max(0, end - lastSpoken.end);
    const openingWeight = 1 / Math.sqrt(repeats.get(firstSpoken.normalized));
    opening = (firstSpoken.substance * .65 * openingWeight + Number(firstSpoken.independent) * 1.5
      + Number(firstSpoken.startsThought) * .95) * Math.max(0, 1 - Math.max(0, lead - .2) / 7)
      + Math.min(1.6, contextTokens.size * .5) - Math.min(6, Math.max(0, lead - .6) / 1.5)
      - (firstSpoken.independent || firstSpoken.startsThought ? 0 : 1.2);
    closing = Number(lastSpoken.finished) * 1.25 + Number(lastSpoken.endsThought) * .85
      - Number(lastSpoken.question) * 1.3 - Math.min(5, Math.max(0, tail - 1) / 2.8)
      + payoff * (firstSpoken.question ? 2.3 : 1.6);
  }
  const topicStrength = Math.max(...topicHits);
  const score = hits.reduce((sum, count, index) =>
    sum + signals[index][1] * Math.min(count, 1) * (1 + .12 * Math.max(0, Math.min(count - 1, 3))), 0)
    + opening + closing + Math.min(3, speech / (length * .22)) + Math.min(2, words / (length * .65))
    + Math.max(0, hookStrength) * .25 + Math.min(1, topicStrength * .45)
    - cutBeginning * 4.5 - cutEnding * 5;
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

export function selectClips(segments, duration, _filename, count = 1, seconds = CLIP_SECONDS) {
  if (!CLIP_LENGTHS.includes(seconds)) throw new Error("Escolha cortes de 30 ou 65 segundos.");
  if (!Number.isFinite(duration) || duration < seconds) {
    throw new Error("Envie um vídeo com pelo menos " + seconds + " segundos.");
  }
  const repeats = new Map();
  const parts = [];
  for (const part of segments || []) {
    if (!part || !Number.isFinite(part.start) || !Number.isFinite(part.end) || typeof part.text !== "string") continue;
    const start = Math.max(0, part.start);
    const end = Math.min(duration, part.end);
    const text = part.text.trim();
    if (end <= start || !text) continue;
    const normalized = normalize(text.replace(/\[[^\]]*\]|\([^)]*\)/g, " ").trim());
    const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
    if (!words.length) continue;
    const tokens = [...new Set(words.filter(word => word.length >= 4 && !commonWords.has(word)))];
    const matchedSignals = signals.flatMap(([, , pattern], index) => pattern.test(normalized) ? [index] : []);
    const matchedTopics = topics.flatMap((pattern, index) => pattern.test(normalized) ? [index] : []);
    const question = questionEnd.test(text);
    const finished = !ellipsisEnd.test(text) && sentenceEnd.test(text);
    const isHook = matchedSignals.includes(1);
    const isCTA = matchedSignals.includes(2);
    const hasStory = matchedSignals.some(signal => signal >= 3);
    const filler = fillerOpening.test(normalized);
    const independent = !filler && (isHook || !continuationOpening.test(normalized)) && (!isCTA || hasStory || isHook);
    const substance = Number(isHook) * 3.6 + Number(hasStory) * 1.5 + Number(question && independent) * 1.25
      + Math.min(2, tokens.length * .25) + Number(finished) * .4 - Number(!independent) * 1.5 - Number(filler) * 2;
    repeats.set(normalized, (repeats.get(normalized) ?? 0) + 1);
    parts.push({ start, end, text, normalized, words: words.length, tokens,
      signals: matchedSignals, topics: matchedTopics, question, finished, independent, substance,
      payoff: payoffWords.test(normalized) });
  }
  if (!parts.length) {
    throw new Error("Não encontrei fala para analisar.");
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
  for (let start = seconds; start <= latest; start += seconds) {
    starts.add(start);
    starts.add(latest - start);
  }
  // Add windows anchored at each side of the narration, with a short pause when available.
  const addStart = start => starts.add(Math.max(0, Math.min(start, latest)));
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    const previous = parts[index - 1];
    const next = parts[index + 1];
    const gapBefore = part.start - (partEnds[index - 1] ?? 0);
    const gapAfter = (next?.start ?? duration) - part.end;
    part.startsThought = !previous || gapBefore >= .45 || (gapBefore >= 0 && previous.finished);
    part.endsThought = !next || gapAfter >= .65 || (gapAfter >= 0 && part.finished && next.independent);
    addStart(part.start);
    if (gapBefore > .1) addStart(part.start - Math.min(.2, gapBefore / 2));
    addStart(part.end - seconds);
    if (gapAfter > .1) addStart(part.end + Math.min(.2, gapAfter / 2) - seconds);
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

export async function selectVisualClips(duration, count, seconds, rateActivity) {
  const limit = Math.min(count, Math.floor(duration / seconds));
  const sectionLength = duration / limit;
  const slack = sectionLength - seconds;
  const choices = Array.from({length: limit}, (_, index) =>
    [...new Set([.5, 0, 1].map(fraction => index * sectionLength + slack * fraction))]);
  const times = [];
  for (let option = 0; option < 3; option++) {
    for (const starts of choices) {
      if (starts[option] !== undefined) times.push(starts[option] + seconds / 3);
    }
  }
  const activity = times.length > limit ? await rateActivity(times) : new Map();
  return choices.map(starts => {
    const start = starts.reduce((best, next) =>
      (activity.get(next + seconds / 3) ?? 0) > (activity.get(best + seconds / 3) ?? 0) ? next : best);
    return { start, end: start + seconds, visual: true };
  });
}
