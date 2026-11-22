import { renderEnhanced, transcribeNarration } from './aprimorado-video.js';
import { suggestSpeechCuts, proposeVisualWindows, chooseVisualWindows, draftNarration, timeLabel } from './aprimorado-cortes.js';
import { sampleVisualActivity } from './cover-local.js';
import { analyzeVideoSpeech } from './aprimorado-analisar.js';

const $ = id => document.getElementById(id);
const fields = {
  video: $('video-file'), voice: $('voice-file'), music: $('music-file'),
  script: $('script'), preset: $('preset'), intensity: $('intensity'),
  quality: $('quality'), duration: $('duration'), start: $('source-start'),
  handle: $('handle'), original: $('original-volume'), musicVolume: $('music-volume')
};
const videoPlayer = $('preview-video');
const voicePlayer = $('voice-player');
const buttonPlay = $('play-preview');
const list = $('scenes');
const maxVideoBytes = 2 * 1024 ** 3;
let videoUrl, voiceUrl, outputUrl;
let videoFile, voiceFile, musicFile;
let videoDuration = 0, voiceDuration = 0;
let scenes = [];
let totalDuration = 0;
let playing = false;
let clock = 0;
let startedAt = 0;
let renderController;
let renderBusy = false;
let cutCandidates = [];
let selectedCut;
let analysisController;
const candidateList = $('cut-list');
const candidateStatus = $('cut-status');

function notify(message, bad = false) {
  $('status').textContent = message;
  $('status').style.color = bad ? '#ffb0b0' : '#d5ffdc';
}
function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function readDuration(file, kind) {
  return new Promise((resolve, reject) => {
    const media = document.createElement(kind);
    const url = URL.createObjectURL(file);
    const cleanup = () => {
      clearTimeout(timer);
      media.removeAttribute('src'); media.load(); URL.revokeObjectURL(url);
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Tempo esgotado ao ler o arquivo.')); }, 20000);
    media.preload = 'metadata';
    media.onloadedmetadata = () => {
      const duration = media.duration;
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) reject(new Error('Não foi possível identificar a duração. Tente um MP4 ou MP3 compatível.'));
      else resolve(duration);
    };
    media.onerror = () => { cleanup(); reject(new Error('Não foi possível abrir o arquivo. Verifique o formato.')); };
    media.src = url;
  });
}
function resetVideoPreview() {
  pause();
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = undefined;
}
function updateReady() {
  $('prepare').disabled = !videoFile || renderBusy;
  $('transcribe').disabled = !voiceFile || renderBusy;
  $('render').disabled = !videoFile || scenes.length === 0 || renderBusy;
  buttonPlay.disabled = !videoFile || scenes.length === 0 || renderBusy;
  $('scrubber').disabled = !scenes.length || renderBusy;
  $('analyze-cuts').disabled = !videoFile || renderBusy;
  $('copy-script').disabled = !fields.script.value.trim() || renderBusy;
  $('copy-brief').disabled = !selectedCut || renderBusy;
}
fields.video.addEventListener('change', async () => {
  const f = fields.video.files?.[0];
  resetVideoPreview(); videoFile = undefined; videoDuration = 0; scenes = [];
  cutCandidates = []; selectedCut = undefined; document.dispatchEvent(new CustomEvent('aprimorado:corte-selecionado',{detail:null})); fields.script.value = '';
  $('cut-reference').hidden = true; showCandidateCards(); drawSceneRows(); updateReady();
  if (!f) return;
  if (!/\.(mp4|mov)$/i.test(f.name) || f.size === 0 || f.size > maxVideoBytes) {
    notify('Escolha MP4/MOV com conteúdo e até 2 GB.', true); return;
  }
  try {
    const duration = await readDuration(f, 'video');
    videoFile = f; videoDuration = duration; videoUrl = URL.createObjectURL(f);
    videoPlayer.src = videoUrl;
    $('preview-placeholder').hidden = true;
    fields.start.max = Math.max(0, Math.floor(videoDuration - 1));
    candidateStatus.textContent = 'Vídeo pronto: selecione duração e clique em “Analisar vídeo e sugerir cortes”.';
    notify('Vídeo carregado: ' + f.name + ' (' + formatTime(duration) + ').');
  } catch (e) { notify(e.message, true); }
  updateReady();
});
fields.voice.addEventListener('change', async () => {
  const f = fields.voice.files?.[0];
  pause();
  if (voiceUrl) URL.revokeObjectURL(voiceUrl);
  voiceUrl = undefined; voiceDuration = 0; voiceFile = undefined;
  if (!f) { voicePlayer.removeAttribute('src'); scenes = [];drawSceneRows();notify('Narração removida. Monte novamente as cenas.');updateReady(); return; }
  if (!/\.(mp3|wav|m4a)$/i.test(f.name) || f.size > 100 * 1024 ** 2) {
    notify('Use MP3, WAV ou M4A de até 100 MB.', true); updateReady(); return;
  }
  try {
    const duration = await readDuration(f, 'audio');
    if (duration > 120) throw new Error('A v1 aceita narrações de até 2 minutos.');
    voiceFile = f; voiceDuration = duration; voiceUrl = URL.createObjectURL(f);
    voicePlayer.src = voiceUrl;
    scenes = []; drawSceneRows();
    notify('Narração carregada (' + formatTime(duration) + '). Revise o roteiro e clique em “Montar cenas para prévia”.');
  } catch (e) { notify(e.message, true); }
  updateReady();
});
fields.music.addEventListener('change', () => {
  const f = fields.music.files?.[0];
  if (f && (!/\.(mp3|wav|m4a)$/i.test(f.name) || f.size > 100 * 1024 ** 2)) {
    musicFile = undefined; notify('A música deve ser MP3/WAV/M4A de até 100 MB.', true); return;
  }
  musicFile = f;
});
for (const [id, output] of [['original-volume','original-label'],['music-volume','music-label']]) {
  $(id).addEventListener('input', () => $(output).textContent = $(id).value + '%');
}


function setCandidateStatus(message, isError = false) {
  candidateStatus.textContent = message;
  candidateStatus.style.color = isError ? '#ffb1b1' : '';
}
function showCandidateCards() {
  candidateList.replaceChildren();
  if (!cutCandidates.length) {
    const empty = document.createElement('p'); empty.className='empty';
    empty.textContent='Os trechos sugeridos aparecerão aqui.'; candidateList.append(empty);return;
  }
  for (let i = 0; i < cutCandidates.length; i++) {
    const c = cutCandidates[i];
    const card = document.createElement('article');card.className='cut-card';
    if(c===selectedCut) card.classList.add('chosen');
    const head=document.createElement('div');head.className='cut-head';
    const name=document.createElement('strong');name.textContent=`Opção ${i+1} · ${timeLabel(c.start)}–${timeLabel(c.end)}`;
    const kind=document.createElement('small');kind.textContent=c.type==='fala'?'Baseada nas falas':'Baseada em movimento';
    head.append(name,kind);
    const excerpt=document.createElement('p');excerpt.className='cut-excerpt';
    excerpt.textContent=c.excerpt ? c.excerpt.slice(0,270)+(c.excerpt.length>270?'…':'') : 'Sem transcrição: assista ao vídeo para identificar o que aparece.';
    const actions=document.createElement('div');actions.className='inline-actions';
    const watch=document.createElement('button');watch.type='button';watch.className='av-button ghost';watch.textContent='▶ Ver trecho';
    watch.addEventListener('click',()=>watchCandidate(c));
    const use=document.createElement('button');use.type='button';use.className='av-button';use.textContent=c===selectedCut?'Selecionado':'Usar este corte';
    use.addEventListener('click',()=>selectCandidate(c));
    actions.append(watch,use);card.append(head,excerpt,actions);candidateList.append(card);
  }
}
function watchCandidate(c) {
  pause();
  videoPlayer.controls=true;
  $('preview-layer').hidden=true;
  try { videoPlayer.currentTime=c.start; videoPlayer.muted=false; videoPlayer.volume=.85;
    videoPlayer.play().catch(()=>notify('Clique no botão de play na prévia para assistir ao trecho.'));
  } catch(e) { notify('Não foi possível abrir a prévia: '+e.message,true); }
  watchCandidate.current=c;
  setCandidateStatus(`Prévia: ${timeLabel(c.start)} até ${timeLabel(c.end)}. Clique em “Usar este corte” quando escolher.`);
}
videoPlayer.addEventListener('timeupdate',()=>{
  const c=watchCandidate.current;
  if(c && videoPlayer.currentTime>=c.end-.05){ videoPlayer.pause();watchCandidate.current=undefined; }
});
function selectCandidate(c) {
  watchCandidate.current=undefined;
  pause();selectedCut=c; document.dispatchEvent(new CustomEvent('aprimorado:corte-selecionado',{detail:{...c}}));
  fields.start.value=c.start.toFixed(2);
  fields.duration.value=String(Math.round(c.end-c.start));
  fields.script.value=draftNarration(fields.preset.value,c);
  $('cut-reference').hidden=false;
  $('cut-reference-time').textContent=`Trecho ${timeLabel(c.start)} a ${timeLabel(c.end)} · ${c.type==='fala'?'transcrição disponível':'análise visual, sem transcrição'}`;
  $('cut-transcript').textContent=c.excerpt || 'O vídeo não foi transcrito. Assista ao trecho e descreva apenas o que você verificou nas imagens.';
  scenes=[];drawSceneRows();updateReady();showCandidateCards();
  videoPlayer.controls=true;$('preview-layer').hidden=true;
  videoPlayer.currentTime=c.start;
  notify('Trecho escolhido. Confira a prévia, complete o roteiro abaixo e gere o áudio no ElevenLabs.');
  $('script-title').scrollIntoView({behavior:'smooth',block:'start'});
}
$('abort-analysis').addEventListener('click',()=>{analysisController?.abort();});
$('analyze-cuts').addEventListener('click',async()=>{
  if(!videoFile || renderBusy)return;
  pause();watchCandidate.current=undefined; videoPlayer.pause();
  const from=Number(fields.start.value),seconds=Number(fields.duration.value),count=Number($('cut-count').value);
  if(!Number.isFinite(from)||from<0||from>=videoDuration){setCandidateStatus('Escolha um início de busca válido.',true);return;}
  if(!Number.isFinite(seconds)||seconds>videoDuration-from){setCandidateStatus('Não há vídeo suficiente para essa duração. Escolha menos segundos ou um início anterior.',true);return;}
  const method=$('cut-method').value;
  const until=Math.min(videoDuration,from+(method==='fala'?240:360));
  analysisController=new AbortController();
  setBusy(true);$('abort-analysis').hidden=false;
  setCandidateStatus(method==='fala'?'Carregando Whisper. Isso pode demorar alguns minutos…':'Procurando mudanças entre as cenas…');
  try {
    if(method==='fala'){
      const transcript=await analyzeVideoSpeech(videoFile,from,until,(p,msg)=>setCandidateStatus(`${Math.round(p*100)}% · ${msg}`),analysisController.signal,$('video-language').value);
      cutCandidates=suggestSpeechCuts(transcript,from,until,seconds,count);
      if(!cutCandidates.length)throw new Error('Não foi possível identificar falas suficientes neste intervalo. Escolha análise visual ou mude o início da busca.');
    } else {
      const groups=proposeVisualWindows(from,until,seconds,count);
      const samples=[...new Set(groups.flatMap(g=>g.map(x=>x.start+(x.end-x.start)/3)))];
      const activity=await sampleVisualActivity(videoPlayer,samples,analysisController.signal);
      analysisController.signal.throwIfAborted();
      cutCandidates=chooseVisualWindows(groups,activity);
    }
    selectedCut=undefined; document.dispatchEvent(new CustomEvent('aprimorado:corte-selecionado',{detail:null})); showCandidateCards();
    setCandidateStatus(`${cutCandidates.length} trechos sugeridos em ${timeLabel(from)}–${timeLabel(until)}. Assista às opções antes de escolher. A análise visual mede movimento, não identifica o jogo.`);
  } catch(error){
    setCandidateStatus(analysisController.signal.aborted?'Análise cancelada.':`Não foi possível sugerir cortes: ${error.message}`,true);
  }finally{
    analysisController=undefined;
    $('abort-analysis').hidden=true;
    setBusy(false);
  }
});
$('copy-brief').addEventListener('click',async()=>{
  if (!selectedCut) return;
  const style = fields.preset.options[fields.preset.selectedIndex].textContent;
  const text = [
    'Crie um roteiro ORIGINAL para narração de YouTube Shorts em português do Brasil.',
    'Tipo: '+style+'. Duração-alvo: '+Math.round(selectedCut.end-selectedCut.start)+' segundos.',
    'Fonte: vídeo de GTA V/GTA VI, trecho de '+timeLabel(selectedCut.start)+' a '+timeLabel(selectedCut.end)+'.',
    'Faça um gancho nos 3 primeiros segundos, desenvolvimento claro e pergunta/CTA no final.',
    'NÃO invente diferenças entre os jogos, fatos, nomes nem imagens. Identifique o que precisa ser confirmado visualmente e pergunte se estiver faltando informação.',
    'O roteiro deve ter análise e comentários originais, em frases curtas, uma frase por linha, já pronto para revisão antes do ElevenLabs.',
    'Transcrição de referência (pode estar incompleta, NÃO copie literalmente): '+(selectedCut.excerpt || '[Este trecho não foi transcrito. Peça uma descrição das imagens antes de produzir roteiro factual.]'),
    'Rascunho editorial atual: '+fields.script.value.trim(),
  ].join('\n\n');
  try {await navigator.clipboard.writeText(text);notify('Briefing copiado! Cole no ChatGPT para preparar o roteiro, confirme os fatos e depois use o ElevenLabs.');}
  catch {notify('Não foi possível copiar automaticamente. Tente novamente em conexão segura (https).',true);}
});
$('copy-script').addEventListener('click',async()=>{
  const value=fields.script.value.trim();if(!value)return;
  if (/\[[^\]]+\]/.test(value)) {
    notify('Preencha primeiro as instruções entre colchetes com sua análise do que aparece no vídeo.',true);
    fields.script.focus();return;
  }
  try {await navigator.clipboard.writeText(value);notify('Roteiro copiado. Edite as lacunas, gere a narração no ElevenLabs e volte para carregar o MP3.');}
  catch {fields.script.focus();fields.script.select();notify('Selecione o roteiro no campo e copie com Ctrl+C.');}
});
fields.script.addEventListener('input',()=>{
  if(scenes.length){pause();scenes=[];drawSceneRows();notify('Roteiro alterado. Clique em “Montar cenas para prévia” novamente.');}
  updateReady();
});
fields.duration.addEventListener('change',()=>{
  if(cutCandidates.length) setCandidateStatus('Duração modificada. Clique em “Analisar vídeo e sugerir cortes” para atualizar as opções.');
});

function stripMarkup(text) { return text.replace(/\*\*/g, '').replace(/\*/g,'').trim(); }
function phraseList(text) {
  const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const phrases = lines.flatMap(line => line.length > 115
    ? (line.match(/.{1,90}(?:\s|$)/g) || [line]).map(x => x.trim()).filter(Boolean)
    : [line]);
  if (phrases.length <= 18) return phrases;
  const reduced = [];
  const step = Math.ceil(phrases.length / 18);
  for (let i = 0; i < phrases.length; i += step) reduced.push(phrases.slice(i, i + step).join(' '));
  return reduced;
}
function createTimeline() {
  if (!videoFile) throw new Error('Importe um vídeo primeiro.');
  const start = Number(fields.start.value);
  if (!Number.isFinite(start) || start < 0 || start >= videoDuration) throw new Error('Informe um segundo de início válido.');
  const seconds = voiceFile ? voiceDuration : Number(fields.duration.value);
  if (!Number.isFinite(seconds) || seconds < 3 || seconds > 120) throw new Error('A duração deve estar entre 3 e 120 segundos.');
  if (start + seconds > videoDuration + 0.04) throw new Error('O vídeo não possui ' + Math.ceil(seconds) + ' segundos a partir do início selecionado. Escolha outro trecho.');
  let text = phraseList(fields.script.value);
  if (!text.length) text = Array(Math.max(1, Math.ceil(seconds / 4.5))).fill('');
  const weights = text.map(t => t ? Math.max(6, stripMarkup(t).length) : 20);
  const weightTotal = weights.reduce((a,b) => a+b,0);
  let elapsed = 0;
  const built = text.map((caption, i) => {
    const length = i === text.length - 1 ? seconds - elapsed : seconds * weights[i] / weightTotal;
    const scene = { start: Math.round((start + elapsed) * 100) / 100,
      timelineStart: elapsed, length, caption, label: 'auto', id: i };
    elapsed += length;
    return scene;
  });
  totalDuration = seconds;
  return built;
}
function drawSceneRows() {
  list.replaceChildren();
  if (!scenes.length) {
    const p = document.createElement('p'); p.className = 'empty';
    p.textContent = 'Escolha um corte, complete seu roteiro e clique em “Montar cenas para prévia”.'; list.append(p); return;
  }
  const fragment = document.createDocumentFragment();
  scenes.forEach((scene, i) => {
    const article = document.createElement('article'); article.className = 'scene';
    article.innerHTML = `<div class="scene-header"><strong>Cena ${i+1}</strong><span>${formatTime(scene.timelineStart)} – ${formatTime(scene.timelineStart + scene.length)} · ${scene.length.toFixed(1)} s</span></div>`;
    const grid = document.createElement('div'); grid.className = 'scene-grid';
    const timeLabel = document.createElement('label'); timeLabel.textContent = 'Início no vídeo (s)';
    const timeInput = document.createElement('input'); timeInput.type = 'number'; timeInput.min = 0;
    timeInput.max = Math.max(0, videoDuration-scene.length).toFixed(2);
    timeInput.step = '.1'; timeInput.value = scene.start.toFixed(2);
    timeInput.addEventListener('change', () => {
      const n = Number(timeInput.value);
      if (!Number.isFinite(n) || n < 0 || n + scene.length > videoDuration + .01) {
        timeInput.value = scene.start.toFixed(2); notify('O trecho ultrapassa a duração do vídeo.', true); return;
      }
      scene.start = n;
      syncPreview(clock);
    });
    timeLabel.append(timeInput);
    const choiceLabel = document.createElement('label'); choiceLabel.textContent = 'Identificação';
    const select = document.createElement('select');
    for (const [value,title] of [['auto','Tema'],['gta5','GTA V'],['gta6','GTA VI'],['detalhe','DETALHE']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = title;
      if (scene.label === value) option.selected = true;
      select.append(option);
    }
    select.addEventListener('change',()=>{ scene.label=select.value; syncPreview(clock); });
    choiceLabel.append(select);
    const textLabel = document.createElement('label'); textLabel.textContent = 'Legenda da cena';
    const textInput = document.createElement('input'); textInput.type='text'; textInput.value=scene.caption;
    textInput.maxLength=230; textInput.placeholder='Texto para aparecer na tela';
    textInput.addEventListener('input',()=>{ scene.caption=textInput.value; syncPreview(clock); });
    textLabel.append(textInput);
    grid.append(timeLabel,choiceLabel,textLabel); article.append(grid); fragment.append(article);
  });
  list.append(fragment);
}
$('prepare').addEventListener('click', () => {
  pause();
  try {
    scenes = createTimeline(); drawSceneRows(); updateReady();
    videoPlayer.controls=false; $('preview-layer').hidden=false; watchCandidate.current=undefined;
    $('scrubber').value = 0; clock = 0; syncPreview(0);
    notify(`${scenes.length} cenas montadas para ${totalDuration.toFixed(1)} s. Revise os tempos, etiquetas e frases antes de exportar.`);
  } catch (e) { notify(e.message,true); }
});
$('transcribe').addEventListener('click', async () => {
  if (!voiceFile || renderBusy) return;
  setBusy(true);
  notify('Preparando transcrição da narração. O modelo Whisper será baixado na primeira vez…');
  const controller = new AbortController(); renderController = controller;
  try {
    const parts = await transcribeNarration(voiceFile, (p,m) => notify(`${Math.round(p*100)}% · ${m}`),controller.signal);
    if (!parts.length) throw new Error('Nenhuma fala foi detectada. Cole o roteiro manualmente.');
    const fragments = [];
    for (const part of parts) {
      const words = part.text.trim().split(/\s+/);
      for (let i=0;i<words.length;i+=11) fragments.push(words.slice(i,i+11).join(' '));
    }
    if (fields.script.value.trim() && !window.confirm('Substituir o texto do roteiro pela transcrição do MP3?')) return;
    fields.script.value=fragments.join('\n');
    scenes=[];drawSceneRows();updateReady();
    notify('Narração transcrita. Revise o texto, corrija palavras e clique em “Montar cenas”.');
  } catch(e) { notify(e.name === 'AbortError'?'Transcrição cancelada.':e.message,true); }
  finally { renderController=undefined; setBusy(false); }
});

function labelFor(scene) {
  if (scene.label === 'gta5') return 'GTA V';
  if (scene.label === 'gta6') return 'GTA VI';
  if (scene.label === 'detalhe') return 'REPAROU NISSO?';
  return { comparacao:'GTA V × GTA VI', teoria:'TEORIA GTA', curiosidade:'VOCÊ SABIA?' }[fields.preset.value];
}
function activeScene(t) {
  return scenes.find(s => t >= s.timelineStart - .001 && t < s.timelineStart+s.length - .001) || scenes.at(-1);
}
function formatCaption(text) {
  // Set textContent only: do not interpret uploaded text as HTML.
  const container = $('preview-caption');
  container.replaceChildren();
  const raw = text || ' ';
  const tokens = raw.match(/\*\*[^*]+\*\*|\*[^*]+\*|[^*]+/g) || [raw];
  for (const token of tokens) {
    const el = token.startsWith('**') && token.endsWith('**') ? document.createElement('em') :
      token.startsWith('*') && token.endsWith('*') ? document.createElement('strong') : document.createTextNode(token);
    if (el.nodeType===3) { container.append(el); } else { el.textContent=stripMarkup(token); container.append(el); }
  }
}
function syncPreview(t) {
  if (!scenes.length) return;
  const scene = activeScene(Math.min(Math.max(0,t),totalDuration-.0001));
  if (!scene) return;
  $('preview-label').textContent = labelFor(scene);
  formatCaption(scene.caption);
  $('preview-brand').textContent = fields.handle.value.trim();
  const desired = scene.start + Math.max(0,Math.min(t-scene.timelineStart, scene.length-.03));
  if (videoPlayer.readyState > 0 && Math.abs(videoPlayer.currentTime-desired) > .32) {
    try { videoPlayer.currentTime = desired; } catch { /* metadata still loading */ }
  }
  $('preview-clock').textContent = formatTime(t)+' / '+formatTime(totalDuration);
  $('scrubber').value = Math.round(1000*t/totalDuration);
}
function pause() {
  playing = false; videoPlayer.pause();voicePlayer.pause();
  buttonPlay.textContent='▶ Reproduzir';
}
function frame() {
  if (!playing) return;
  clock = voiceFile ? voicePlayer.currentTime : Math.min(totalDuration,(performance.now()-startedAt)/1000);
  syncPreview(clock);
  if (clock >= totalDuration-.04 || (voiceFile && voicePlayer.ended)) { pause(); return; }
  requestAnimationFrame(frame);
}
buttonPlay.addEventListener('click', async () => {
  if (!scenes.length) return;
  if (playing) { pause(); return; }
  if (clock >= totalDuration-.05) clock = 0;
  playing=true;startedAt=performance.now()-clock*1000; syncPreview(clock);
  if (voiceFile) { voicePlayer.currentTime=clock; try{await voicePlayer.play();}catch(e){pause();notify('Autorize a reprodução de áudio no navegador.',true);return;} }
  videoPlayer.muted = Number(fields.original.value) === 0;
  videoPlayer.volume = Number(fields.original.value) / 100;
  videoPlayer.play().catch(()=>{});
  buttonPlay.textContent='⏸ Pausar';requestAnimationFrame(frame);
});
$('scrubber').addEventListener('input',()=>{
  clock = totalDuration*Number($('scrubber').value)/1000;
  if (voiceFile) voicePlayer.currentTime=clock;
  if (playing) startedAt=performance.now()-clock*1000;
  syncPreview(clock);
});
fields.preset.addEventListener('change',()=>syncPreview(clock));
fields.handle.addEventListener('input',()=>syncPreview(clock));

function setBusy(value){
  renderBusy=value;
  for(const input of Object.values(fields)) input.disabled=value;
  $('prepare').disabled=value || !videoFile;
  $('transcribe').disabled=value || !voiceFile;
  $('render').disabled=value || !scenes.length;
  $('analyze-cuts').disabled=value || !videoFile;
  $('copy-script').disabled=value || !fields.script.value.trim();
  $('copy-brief').disabled=value || !selectedCut;
  $('cancel').hidden=!value || Boolean(analysisController);
  $('cancel').disabled=!value;
  updateReady();
}
$('cancel').addEventListener('click',()=>{
  if (renderController) { notify('Cancelando processamento…'); $('cancel').disabled=true;renderController.abort(); }
});
$('render').addEventListener('click',async()=>{
  if(!scenes.length || renderBusy)return;
  if (fields.script.value.includes('[') && fields.script.value.includes(']')) {
    notify('Seu roteiro ainda contém instruções entre colchetes. Preencha o conteúdo real e monte as cenas novamente.',true);
    return;
  }
  pause();
  const snapshot=scenes.map(s=>({...s}));
  for(const s of snapshot){
    if(!Number.isFinite(s.start) || s.start<0 || s.start+s.length>videoDuration+.01){notify('Confira o início da cena '+(s.id+1)+'.',true);return;}
  }
  if(outputUrl){URL.revokeObjectURL(outputUrl);outputUrl=undefined;}
  $('result').hidden=true;
  renderController=new AbortController();
  setBusy(true);
  $('progress').hidden=false;$('progress').value=0;
  notify('Iniciando exportação…');
  try{
    const blob=await renderEnhanced({
      source:videoFile,voice:voiceFile,music:musicFile,scenes:snapshot,
      seconds:totalDuration,width:Number(fields.quality.value),
      preset:fields.preset.value,intensity:fields.intensity.value,
      originalVolume:Number(fields.original.value)/100,
      musicVolume:Number(fields.musicVolume.value)/100,
      handle:fields.handle.value.trim()
    },(progress,message)=>{ $('progress').value=Math.max(0,Math.min(100,Math.round(progress*100)));notify(message); },renderController.signal);
    outputUrl=URL.createObjectURL(blob);
    $('rendered-video').src=outputUrl;
    $('download').href=outputUrl;
    $('download').download='gta-vi-aprimorado-'+Date.now()+'.mp4';
    $('result').hidden=false;
    $('progress').value=100;
    notify('Exportação concluída. Confira o vídeo e clique em “Baixar MP4”.');
  }catch(e){$('progress').hidden=true;notify(renderController.signal.aborted?'Exportação cancelada.':`Falha ao exportar: ${e.message}`,true);}
  finally {renderController=undefined;setBusy(false);}
});
window.addEventListener('beforeunload',()=>{
  for (const url of [videoUrl,voiceUrl,outputUrl]) if(url)URL.revokeObjectURL(url);
});
updateReady();
