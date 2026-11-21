const WIDTH = 1080;
const HEIGHT = 1920;
const FONT_FAMILY = 'system-ui, "Arial Black", sans-serif';
const HOOK_FONT = 'Impact, "Arial Black", system-ui, sans-serif';
const MARGIN = 92;
const TEXT_WIDTH = WIDTH - 2 * MARGIN;
const SAMPLE_WIDTH = 72;
const SAMPLE_HEIGHT = 128;
const SAMPLE_POSITIONS = [.04, .19, .36, .53, .71, .89];
const SAMPLE_BUDGET_MS = 9_000;
const FRAME_ERROR = "O navegador não conseguiu ler um quadro do corte para gerar a capa.";

function waitForFrame(video, events, ready, signal, milliseconds, message) {
  signal?.throwIfAborted();
  if (video.error) return Promise.reject(new Error(message));
  if (ready()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error(message)), milliseconds);
    const check = () => { if (ready()) done(); };
    const error = () => done(new Error(message));
    const abort = () => done(signal.reason);

    function done(failure) {
      clearTimeout(timer);
      for (const name of events) video.removeEventListener(name, check);
      video.removeEventListener("error", error);
      signal?.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else resolve();
    }

    for (const name of events) video.addEventListener(name, check);
    video.addEventListener("error", error, { once: true });
    signal?.addEventListener("abort", abort, { once: true });
    check();
  });
}

function coverText(value, fallback) {
  const clean = String(value ?? "").trim().replace(/\s+/gu, " ").toLocaleUpperCase("pt-BR");
  return clean
    ? Array.from(clean).slice(0, 180).join("").replace(/\b(?:VICE CITY|GTA VI|GTA 6)\b/g, (name) => name.replace(" ", "\u00a0"))
    : fallback;
}

function wrapText(context, value, width) {
  const lines = [];
  let line = "";

  for (const word of value.split(" ")) {
    const joined = line ? line + " " + word : word;
    if (context.measureText(joined).width <= width) {
      line = joined;
      continue;
    }

    if (line) lines.push(line);
    line = "";
    for (const char of word) {
      if (line && context.measureText(line + char).width > width) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitText(context, text, width, maxLines, largest, smallest, weight, family = FONT_FAMILY) {
  let size = largest;
  let lines;
  while (true) {
    context.font = weight + " " + size + "px " + family;
    lines = wrapText(context, text, width);
    if (lines.length <= maxLines || size === smallest) break;
    size = Math.max(smallest, size - 4);
  }

  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const last = Array.from(lines.at(-1));
    while (last.length && context.measureText(last.join("") + "…").width > width) last.pop();
    lines[lines.length - 1] = last.join("").trimEnd() + "…";
  }
  return { lines, size, font: context.font };
}

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  context.fill();
}

function drawFrame(context, video, width, height) {
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
  const frameWidth = video.videoWidth * scale;
  const frameHeight = video.videoHeight * scale;
  context.drawImage(video, (width - frameWidth) / 2, (height - frameHeight) / 2, frameWidth, frameHeight);
}

function scoreFrame(pixels) {
  const luminance = new Float32Array(SAMPLE_WIDTH * SAMPLE_HEIGHT);
  let exposure = 0;
  let variance = 0;
  let detail = 0;
  let color = 0;
  let dark = 0;
  let blown = 0;
  let total = 0;

  for (let y = 0; y < SAMPLE_HEIGHT; y++) {
    for (let x = 0; x < SAMPLE_WIDTH; x++) {
      const i = y * SAMPLE_WIDTH + x;
      const [red, green, blue] = [pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]];
      const value = (.2126 * red + .7152 * green + .0722 * blue) / 255;
      luminance[i] = value;
      // The source frame is usually centered over blurred fill, below the top margin and above the cover text.
      const weight = x >= 8 && x < 64 && y >= 32 && y < 88 ? 2 : .5;
      total += weight;
      exposure += value * weight;
      variance += value * value * weight;
      if (value < .10) dark += weight;
      if (value > .96) blown += weight;
      color += (Math.max(red, green, blue) - Math.min(red, green, blue)) / 255 * weight;
      const horizontal = x ? Math.abs(value - luminance[i - 1]) : 0;
      const vertical = y ? Math.abs(value - luminance[i - SAMPLE_WIDTH]) : 0;
      detail += Math.min((horizontal + vertical) / 2, .24) * weight;
    }
  }

  const average = exposure / total;
  const contrast = Math.sqrt(Math.max(0, variance / total - average * average));
  const flat = detail / total < .012 || contrast < .06;
  const darkCard = dark / total > .70 && (dark + blown) / total > .82;
  return 1 - 1.8 * Math.abs(average - .50) + 4.5 * detail / total
    + Math.min(contrast, .30) + .4 * color / total
    - .9 * dark / total - .6 * blown / total - .55 * Number(flat) - .65 * Number(darkCard);
}

function frameTimeInClip(time, duration) {
  return Number.isFinite(duration) ? Math.max(0, Math.min(time, duration - .05)) : 0;
}

async function seekFrame(video, target, signal, timeout) {
  signal?.throwIfAborted();
  if (Math.abs(video.currentTime - target) > .01) video.currentTime = target;
  const ready = () => !video.seeking && video.readyState >= 2 && video.videoWidth > 0
    && video.videoHeight > 0 && Math.abs(video.currentTime - target) < .20;
  await waitForFrame(video, ["seeked", "loadeddata"], ready, signal, timeout, FRAME_ERROR);
}

async function selectFrame(context, video, cueTime, frameTime, signal) {
  if (Number.isFinite(frameTime)) {
    await seekFrame(video, frameTimeInClip(frameTime, video.duration), signal, 10_000);
    drawFrame(context, video, WIDTH, HEIGHT);
    return;
  }

  const cue = Number.isFinite(cueTime) ? frameTimeInClip(cueTime, video.duration) : undefined;
  const times = SAMPLE_POSITIONS.map((position) => frameTimeInClip(video.duration * position, video.duration));
  if (cue !== undefined) {
    const closest = times.reduce((best, time, index) =>
      Math.abs(time - cue) < Math.abs(times[best] - cue) ? index : best, 0);
    times[closest] = cue;
  }
  const sample = document.createElement("canvas");
  sample.width = SAMPLE_WIDTH;
  sample.height = SAMPLE_HEIGHT;
  const analysis = sample.getContext("2d", { willReadFrequently: true });
  const deadline = performance.now() + SAMPLE_BUDGET_MS;
  let best;
  try {
    for (const time of new Set(times)) {
      if (!analysis) break;
      const remaining = deadline - performance.now();
      if (remaining <= 0) break;
      try {
        await seekFrame(video, time, signal, Math.min(remaining, best === undefined ? 3_500 : 1_800));
      } catch (error) {
        if (signal?.aborted || video.error) throw error;
        continue;
      }
      drawFrame(analysis, video, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      const pixels = analysis.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data;
      const affinity = cue === undefined ? 0 : .16 * Math.max(0, 1 - Math.abs(time - cue) / 12);
      const score = scoreFrame(pixels) + affinity;
      if (best === undefined || score > best) {
        best = score;
        drawFrame(context, video, WIDTH, HEIGHT);
      }
    }
  } finally {
    sample.width = sample.height = 1;
  }
  if (best === undefined) {
    await seekFrame(video, 0, signal, 5_000);
    drawFrame(context, video, WIDTH, HEIGHT);
  }
}

function paintCover(context, hook, cta) {
  const shade = context.createLinearGradient(0, 0, 0, HEIGHT);
  shade.addColorStop(0, "rgba(25,12,35,.12)");
  shade.addColorStop(.49, "rgba(25,12,35,0)");
  shade.addColorStop(.69, "rgba(21,10,31,.61)");
  shade.addColorStop(1, "rgba(16,10,24,.98)");
  context.fillStyle = shade;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const heading = coverText(hook, "GTA VI");
  const title = fitText(context, heading, TEXT_WIDTH, heading.length > 62 ? 4 : 3, 114, 70, 900, HOOK_FONT);
  const action = fitText(context, coverText(cta, "COMENTA SUA TEORIA"), TEXT_WIDTH - 72, 2, 42, 35, 800);
  const pillWidth = Math.ceil(Math.max(...action.lines.map((line) => context.measureText(line).width))) + 72;
  const actionSpacing = action.size + 7;
  const pillHeight = 40 + actionSpacing * action.lines.length;
  const pillTop = 1685 - pillHeight;
  const titleSpacing = title.size * 1.06;
  const titleTop = pillTop - 36 - titleSpacing * title.lines.length;

  const accent = context.createLinearGradient(MARGIN, 0, MARGIN + 205, 0);
  accent.addColorStop(0, "#ffc195");
  accent.addColorStop(1, "#ed69bd");
  context.fillStyle = accent;
  context.fillRect(MARGIN, titleTop - 31, 205, 9);

  context.font = title.font;
  context.textBaseline = "top";
  context.lineJoin = "round";
  context.lineWidth = Math.max(4, Math.round(title.size * .075));
  context.strokeStyle = "rgba(19,9,26,.68)";
  for (const [index, line] of title.lines.entries()) {
    const y = titleTop + index * titleSpacing;
    context.fillStyle = index === title.lines.length - 1 ? "#ffbc9b" : "#fff8f2";
    context.strokeText(line, MARGIN, y, TEXT_WIDTH);
    context.fillText(line, MARGIN, y, TEXT_WIDTH);
  }

  const pill = context.createLinearGradient(MARGIN, pillTop, MARGIN + pillWidth, pillTop);
  pill.addColorStop(0, "#ffca9f");
  pill.addColorStop(1, "#ffacaa");
  context.fillStyle = pill;
  drawRoundedRect(context, MARGIN, pillTop, pillWidth, pillHeight, 27);
  context.font = action.font;
  context.fillStyle = "#231329";
  for (const [index, line] of action.lines.entries()) {
    context.fillText(line, MARGIN + 36, pillTop + 21 + index * actionSpacing, pillWidth - 72);
  }
}

function encodeJpeg(canvas, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const failure = new Error("O navegador não conseguiu salvar a capa em JPEG.");
    const timer = setTimeout(() => done(failure), 12_000);
    const abort = () => done(signal.reason);

    function done(error, blob) {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(blob);
    }

    signal?.addEventListener("abort", abort, { once: true });
    try {
      canvas.toBlob((blob) => done(blob ? null : failure, blob), "image/jpeg", .92);
    } catch (error) {
      done(error);
    }
  });
}

export async function generateCover(videoBlob, { hook, cta, cueTime, frameTime, signal } = {}) {
  signal?.throwIfAborted();
  const video = document.createElement("video");
  const canvas = document.createElement("canvas");
  const url = URL.createObjectURL(videoBlob);
  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("aria-hidden", "true");
    Object.assign(video.style, {
      position: "fixed", top: "0", left: "0", width: "1px", height: "1px",
      opacity: "0", pointerEvents: "none",
    });
    document.body.append(video);
    video.src = url;
    await waitForFrame(video, ["loadedmetadata"], () => video.readyState >= 1, signal, 20_000, FRAME_ERROR);

    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("O navegador não conseguiu abrir o editor de capa.");
    await selectFrame(context, video, cueTime, frameTime, signal);
    paintCover(context, hook, cta);
    return await encodeJpeg(canvas, signal);
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 1;
  }
}
