const BASE_TAGS = ["GTA VI", "GTA 6", "Grand Theft Auto VI", "Cortes GTA VI", "Shorts GTA VI"];
const TOPICS = [
  {
    pattern: /\b(?:estrelas? de procurado|nivel de procurado|wanted level|wanted stars)\b/,
    subject: "as estrelas de procurado", hook: "Quantas estrelas você encararia?",
    cta: "Comenta até onde você iria", tag: "Nível de procurado GTA VI", weight: 5,
  },
  {
    pattern: /\b(?:interiores?|entrar (?:nos|em) predios|inside buildings|enter buildings)\b/,
    subject: "os interiores", hook: "Em qual prédio você entraria?",
    cta: "Escolhe um prédio nos comentários", tag: "Interiores GTA VI", weight: 4,
  },
  {
    pattern: /\b(?:personaliz\w*|customiz\w*|tuning|tunagem)\b/,
    subject: "a personalização", hook: "O que você personalizaria primeiro?",
    cta: "Que item você personalizaria?", tag: "Personalização GTA VI", weight: 4,
  },
  {
    pattern: /\b(?:assalt\w*|heist\w*)\b/,
    subject: "os assaltos", hook: "Qual abordagem você escolheria no jogo?",
    cta: "Comenta seu plano no jogo", tag: "Assaltos GTA VI", weight: 4,
  },
  {
    pattern: /\b(?:policia|viaturas?|persegu\w*|police|chase)\b/,
    subject: "as perseguições", hook: "Como você despistaria a polícia?",
    cta: "Qual rota você escolheria no jogo?", tag: "Perseguições GTA VI", weight: 3,
  },
  {
    pattern: /\b(?:fisica|physics|colis\w*|collision\w*)\b/,
    subject: "a física", hook: "Qual detalhe da física chamou sua atenção?",
    cta: "Qual detalhe você notou?", tag: "Física GTA VI", weight: 3,
  },
  {
    pattern: /\b(?:tempestade\w*|furac\w*|hurricane\w*|clima dinamico|dynamic weather|weather)\b/,
    subject: "o clima", hook: "Como o clima afetaria sua jogada?",
    cta: "Conta como você reagiria", tag: "Clima GTA VI", weight: 3,
  },
  {
    pattern: /\b(?:vazamento\w*|leak\w*|rumor\w*|supostamente)\b/,
    subject: "os rumores", hook: "Você acredita nesse rumor?",
    cta: "Comenta sua teoria", tag: "Rumores GTA VI", weight: 3,
  },
  {
    pattern: /\b(?:trailer\w*|teaser\w*)\b/,
    subject: "o trailer", hook: "Qual detalhe do trailer você reparou?",
    cta: "Conta qual cena chamou sua atenção", tag: "Trailer GTA VI", weight: 2,
  },
  {
    pattern: /\b(?:mapas?|maps?|tamanho do mapa|map size)\b/,
    subject: "o mapa", hook: "O que você quer descobrir no mapa?",
    cta: "Qual lugar você quer explorar primeiro?", tag: "Mapa GTA VI", weight: 2,
  },
  {
    pattern: /\b(?:lucia(?: caminos)?|jason(?: duval)?)\b/,
    subject: "os personagens", hook: "Quem você quer ver em ação?",
    cta: "Comenta qual personagem você escolheria", tag: "Personagens GTA VI", weight: 2,
  },
  {
    pattern: /\b(?:carros?|veiculos?|vehicles?|cars?)\b/,
    subject: "os veículos", hook: "Qual carro você testaria primeiro?",
    cta: "Comenta o modelo que você escolheria", tag: "Veículos GTA VI", weight: 1,
  },
  {
    pattern: /\bvice city\b/,
    subject: "Vice City", hook: "Qual lugar de Vice City você exploraria?",
    cta: "Comenta onde você iria primeiro", tag: "Vice City", weight: 1,
  },
  {
    pattern: /\bleonida\b/,
    subject: "Leonida", hook: "Por onde começar a explorar Leonida?",
    cta: "Escolhe uma região nos comentários", tag: "Leonida", weight: 1,
  },
  {
    pattern: /\b(?:mist[eé]rio\w*|segredo\w*|teoria\w*|mystery|theory|secret\w*|clue\w*)\b/,
    subject: "as teorias", hook: "Qual teoria faz mais sentido?",
    cta: "Defende sua teoria nos comentários", tag: "Teorias GTA VI", weight: 1,
  },
];

const PT_WORDS = /\b(?:voce|sabia|aquele|aquela|neste|nessa|olha|entao|reparou|porque|como|qual|isso|jogo|jogar|policia|mapa|carro|achei|talvez|acho|sera|fuga|perseguicao)\b/;
const GTA_NAME = /\b(?:gta\s*(?:6|vi|seis)|grand theft auto\s*(?:6|vi|seis))\b/;
const GAME_NAME = /\b(?:gta\s*(?:6|vi|seis)|grand theft auto\s*(?:6|vi|seis)|vice city|leonida|lucia caminos|jason duval)\b/;
const PROMO = /\b(?:se inscrev\w*|deixa o like|segue o perfil|subscribe|drop a like|comment below|let me know|comenta\w*)\b/;
const COMPARISON = /\b(?:vs|versus|compar\w*|diferent\w*|ao contrario|enquanto|unlike)\b/;
const THEORY = /\b(?:teoria\w*|rumor\w*|misterio\w*|pista\w*|secret\w*|mystery|theory|what if|maybe)\b/;
const REACTION = /\b(?:concord\w*|reac\w*|esperav\w*|surpreend\w*|react\w*|expect\w*)\b/;
const QUESTION_START = /^(?:(?:voce\s+)?(?:sabia|reparou|percebeu)|voce\s+(?:viu|tentaria|arriscaria|entraria|escolheria)|como|qual|quais|onde|que|o que|por que|pra que|para que|sera que)\b/;
const ESCAPE = /\b(?:fug\w*|foge\w*|escap\w*|despist\w*|persegu\w*|chase|flee\w*|getaway)\b/;
const ROUTE = /\b(?:pelo|pela|por|through|across|via|over)\s+(?:(?:o|a|the)\s+)?(\w+)/g;
const ACTOR_ENTERS = /\b(lucia|jason)(?: caminos| duval)? (?:entra|entrou) (?:no|num) carro (vermelho|azul|preto|branco|verde|amarelo)\b|\b(lucia|jason)(?: caminos| duval)? (?:gets?|got) (?:in|into|inside) (?:the|a) (red|blue|black|white|green|yellow) car\b/;
const LOCATIONS = [
  [/\b(?:pantano|swamp)\b/, "o pântano", "pelo pântano", "Pântano GTA VI"],
  [/\b(?:ponte|bridge)\b/, "a ponte", "pela ponte", "Pontes GTA VI"],
  [/\b(?:cais|pier|docks)\b/, "o cais", "pelo cais", "Cais GTA VI"],
  [/\b(?:praia|beach)\b/, "a praia", "pela praia", "Praia GTA VI"],
  [/\b(?:tunel|tuneis|tunnels?)\b/, "o túnel", "pelo túnel", "Túnel GTA VI"],
  [/\b(?:aeroporto|airport)\b/, "o aeroporto", "pelo aeroporto", "Aeroporto GTA VI"],
];
const COLORS = {
  vermelho: "vermelho", red: "vermelho", azul: "azul", blue: "azul", preto: "preto", black: "preto",
  branco: "branco", white: "branco", verde: "verde", green: "verde", amarelo: "amarelo", yellow: "amarelo",
};
const COLORED_CAR = /\b(?:carro\s+(vermelho|azul|preto|branco|verde|amarelo)|(red|blue|black|white|green|yellow)\s+car)\b/;
const SCENE_OBJECTS = [
  [/\bchave (?:da|de) lucia\b/, "a chave da Lucia", "O que a chave da Lucia abriria?"],
  [/\bchave (?:do|de) jason\b/, "a chave do Jason", "O que a chave do Jason abriria?"],
  [/\bchave\b/, "a chave", "O que você acha que a chave abriria?"],
  [/\bponte (?:de|em) vice city\b/, "a ponte de Vice City", "Qual sua teoria sobre a ponte de Vice City?"],
  [/\batalho\b.{0,35}\bcais abandonado\b/, "o cais abandonado", "Você usaria o atalho do cais abandonado?"],
  [/\bcais abandonado\b/, "o cais abandonado", "Você passaria pelo cais abandonado?"],
  [/\basfalto molhado\b/, "o asfalto molhado", "Como você dirigiria no asfalto molhado?"],
  [/\batalho\b/, "o atalho", "Você experimentaria esse atalho?"],
  [/\bderrap\w*\b/, "a derrapagem", "Como você faria essa derrapagem?"],
  [/\bcarroceria\b/, "a carroceria"],
  [/\bcais\b/, "o cais"],
  [/\bponte\b/, "a ponte"],
  [/\bbarco\b/, "o barco"],
  [/\bhelicoptero\b/, "o helicóptero"],
  [/\bporta\b/, "a porta"],
  [/\bfarol\b/, "o farol"],
  [/\bporta malas\b/, "o porta-malas"],
  [/\bmoto\b/, "a moto"],
  [/\btiroteio\b/, "o tiroteio"],
  [/\bcassino\b/, "o cassino"],
];

function clean(text) {
  return typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
}

function normalize(text) {
  return clean(text).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function fit(text, limit) {
  if (text.length <= limit) return text;
  const prefix = text.slice(0, limit - 1);
  const boundary = prefix.lastIndexOf(" ");
  return (boundary > limit / 2 ? prefix.slice(0, boundary) : prefix).trimEnd() + "…";
}

function filenameTopic(filename) {
  const name = clean(String(filename ?? "").split(/[\\/]/).at(-1)
    ?.replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_–—-]+/g, " "));
  return GAME_NAME.test(normalize(name)) && !/^gta\s*(?:6|vi|seis)$/i.test(name) ? name : "";
}

function candidateCues(segments, fallbackText, start, end) {
  const inWindow = (segments ?? []).filter(part => part.start < end && part.end > start && clean(part.text));
  const sources = inWindow.length ? inWindow : [{ text: fallbackText }];
  return sources.flatMap(part => clean(part.text).split(/(?<=[.!?])\s+/u).filter(Boolean).map(text => ({
    text,
    folded: normalize(text),
    time: part.start,
  })));
}

function getTopics(cues, originalHook, filename) {
  return TOPICS.flatMap((topic, index) => {
    const hits = cues.filter(cue => topic.pattern.test(cue.folded)).length;
    const fromHook = topic.pattern.test(originalHook);
    const fromFilename = topic.pattern.test(filename);
    if (!hits && !fromHook && !fromFilename) return [];
    const score = (hits || fromHook ? 15 : 0)
      + Math.min(hits, 4) * 2 + Number(fromHook) * 2 + topic.weight;
    return [{ ...topic, inSpeech: Boolean(hits || fromHook), score, index }];
  }).sort((a, b) => b.score - a.score || a.index - b.index);
}

function bestQuote(cues, topic, originalHook) {
  let best;
  let highest = 0;
  for (const cue of cues) {
    const words = cue.text.split(" ").length;
    if (words < 5 || words > 33 || !PT_WORDS.test(cue.folded) || PROMO.test(cue.folded)) continue;
    const relevant = Boolean(topic?.pattern.test(cue.folded));
    const inHook = Boolean(originalHook) && originalHook.includes(cue.folded);
    const isScene = LOCATIONS.some(([pattern]) => pattern.test(cue.folded))
      || SCENE_OBJECTS.some(([pattern]) => pattern.test(cue.folded));
    const score = Number(relevant) * 5 + Number(GAME_NAME.test(cue.folded)) * 3
      + Number(inHook) * 2 + Number(isScene) * 4
      + Number(QUESTION_START.test(cue.folded)) + Number(words <= 18);
    if (score >= 3 && score > highest) {
      best = cue;
      highest = score;
    }
  }
  return best;
}

function sourceQuestion(cues, topic, originalHook) {
  const questions = cues.filter(cue => cue.text.endsWith("?") && cue.text.length <= 75
    && cue.text.split(" ").length >= 4 && QUESTION_START.test(cue.folded)
    && !PROMO.test(cue.folded));
  const concrete = cue => SCENE_OBJECTS.some(([pattern]) => pattern.test(cue.folded))
    || LOCATIONS.some(([pattern]) => pattern.test(cue.folded))
    || COLORED_CAR.test(cue.folded);
  return questions.find(cue => originalHook.includes(cue.folded) && concrete(cue))
    ?? questions.find(concrete)
    ?? questions.find(cue => originalHook.includes(cue.folded) && (topic?.pattern.test(cue.folded) || GAME_NAME.test(cue.folded)))
    ?? questions.find(cue => topic?.pattern.test(cue.folded))
    ?? questions.find(cue => GAME_NAME.test(cue.folded));
}

function sceneMoment(cues, start) {
  const moments = [];
  for (const cue of cues) {
    const locations = [...cue.folded.matchAll(ROUTE)].map(match => match[1]);
    const location = LOCATIONS.find(([pattern]) => locations.some(name => pattern.test(name)));
    const car = cue.folded.match(COLORED_CAR);
    const entering = cue.folded.match(ACTOR_ENTERS);
    const questionBonus = Number(cue.text.endsWith("?") && QUESTION_START.test(cue.folded));
    if (location && ESCAPE.test(cue.folded)) {
      moments.push({
        cue, hook: "A fuga " + location[2] + " daria certo?",
        cta: "Você arriscaria a fuga " + location[2] + "?",
        subject: "a fuga " + location[2], tag: location[3], score: 2 + questionBonus,
      });
    }
    if (entering) {
      const actor = (entering[1] ?? entering[3]) === "lucia" ? "Lucia" : "Jason";
      const vehicle = "carro " + COLORS[entering[2] ?? entering[4]];
      moments.push({
        cue, hook: "Por que " + actor + " entra no " + vehicle + "?",
        cta: "Você entraria no " + vehicle + "?",
        subject: actor + " entrando no " + vehicle, tag: vehicle + " GTA VI", score: 2 + questionBonus,
      });
    }
    if (car) {
      const vehicle = "carro " + COLORS[car[1] ?? car[2]];
      moments.push({
        cue, hook: "Você reparou no " + vehicle + "?",
        cta: "Comenta o detalhe do " + vehicle,
        subject: "o " + vehicle, tag: vehicle + " GTA VI", score: 1 + questionBonus,
      });
    }
  }
  return moments.sort((a, b) => b.score - a.score || (a.cue.time ?? start) - (b.cue.time ?? start))[0];
}

function quotedAnchor(cue) {
  if (!cue) return [];
  const scene = SCENE_OBJECTS.find(([pattern]) => pattern.test(cue.folded));
  if (scene) return scene.slice(1, 3);
  const location = LOCATIONS.find(([pattern]) => pattern.test(cue.folded));
  return location ? [location[1]] : [];
}

function composeTitle(hook) {
  const prefix = GTA_NAME.test(normalize(hook)) ? "" : "GTA VI — ";
  return fit(prefix + hook, 100);
}

export function generatePublication({
  segments = [], text = "", hook: originalHook, filename = "", start = 0, end = Infinity,
} = {}) {
  const cues = candidateCues(segments, text, start, end);
  const editorial = cues.filter(cue => !PROMO.test(cue.folded));
  const foldedHook = normalize(originalHook?.text);
  const sourceName = filenameTopic(filename);
  const topics = getTopics(editorial, foldedHook, normalize(sourceName));
  const topic = topics[0];
  const around = normalize(editorial.map(cue => cue.text).join(" "));
  const comparing = COMPARISON.test(around) && GTA_NAME.test(around) && /\bgta\s*(?:5|v)\b/.test(around);
  const moment = sceneMoment(editorial, start);
  const question = sourceQuestion(editorial, topic, foldedHook);
  const quote = question ?? (moment && PT_WORDS.test(moment.cue.folded) ? moment.cue : undefined)
    ?? bestQuote(editorial, topic, foldedHook);
  const [anchor, anchoredCta] = quotedAnchor(quote);
  const matchingMoment = !question || moment?.cue === question ? moment : undefined;
  let hook = question?.text ?? matchingMoment?.hook
    ?? (anchor && quote ? "“" + fit(quote.text, 76) + "”" : undefined)
    ?? (topic?.inSpeech ? topic.hook : undefined) ?? (quote ? "“" + fit(quote.text, 76) + "”" : topic?.hook)
    ?? (fit(sourceName, 80) || "Qual parte da fala sobre GTA VI merece replay?");
  let cta = matchingMoment?.cta ?? anchoredCta
    ?? (anchor ? "Comenta sobre " + anchor : topic?.cta ?? "Qual detalhe de GTA VI você ouviu?");
  const cue = question ?? matchingMoment?.cue ?? quote;

  if (!matchingMoment && !anchor && comparing) {
    hook = question?.text ?? "GTA V ou GTA VI nessa situação?";
    cta = topic?.inSpeech ? "Compara " + topic.subject + " nos dois jogos" : "Qual jogo você prefere nessa situação?";
  } else if (!matchingMoment && !anchor && THEORY.test(around) && !question) {
    hook = topic?.inSpeech && topic.subject !== "as teorias"
      ? "Qual é a sua teoria sobre " + topic.subject + "?"
      : "Qual é a sua teoria?";
    cta = topic?.inSpeech && topic.subject !== "as teorias"
      ? "Qual sua teoria sobre " + topic.subject + "?"
      : "Defende sua teoria sobre GTA VI";
  } else if (!matchingMoment && anchor && !anchoredCta && REACTION.test(around)) {
    cta = "Qual sua opinião sobre " + anchor + "?";
  }

  if (normalize(cta) === normalize(hook) && anchor) cta = "Comenta sua teoria sobre " + anchor;
  cta = fit(cta, 48);
  let context;
  if (matchingMoment) {
    context = "Neste trecho de GTA VI, a narração comenta " + matchingMoment.subject + ".";
  } else if (anchor) {
    context = "Neste trecho de GTA VI, a narração chama atenção para " + anchor + ".";
  } else if (comparing) {
    context = "A narração compara GTA V e GTA VI" + (topic?.inSpeech ? " ao falar sobre " + topic.subject : "") + ".";
  } else if (topic?.inSpeech) {
    context = "Neste trecho sobre GTA VI, a narração comenta " + topic.subject + ".";
  } else if (sourceName) {
    context = "Trecho do vídeo “" + fit(sourceName, 100) + "”.";
  } else {
    context = "Um trecho com comentários sobre GTA VI.";
  }
  if (quote && quote.text !== hook) context += " A fala inclui “" + fit(quote.text, 125) + "”";
  const description = context + "\n\n" + cta + (/[?!]$/.test(cta) ? "" : ".");
  const tags = [...new Set([
    ...BASE_TAGS,
    ...(matchingMoment ? [matchingMoment.tag] : []),
    ...(!matchingMoment && anchor ? [anchor.replace(/^(?:o|a)\s+/i, "") + " GTA VI"] : []),
    ...(comparing ? ["GTA V", "Comparação GTA VI"] : []),
    ...topics.map(item => item.tag),
  ])].slice(0, 10);

  return {
    title: composeTitle(hook),
    description,
    hook: fit(hook, 80),
    cta: fit(cta, 48),
    tags,
    ...(Number.isFinite(cue?.time) ? { cueTime: Math.max(0, cue.time - start) } : {}),
  };
}
