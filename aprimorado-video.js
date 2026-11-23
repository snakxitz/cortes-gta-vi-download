// Motor de edição local para GitHub Pages — preserva o editor de cortes existente.
// FFmpeg WASM é o mesmo já utilizado em video-local.js do projeto original.
import { FFmpeg } from './vendor/ffmpeg-0.12.15/index.js';

const CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
const MAX_COPY_BYTES = 80 * 1024 * 1024;
const DEFAULT_TIMEOUT = 10 * 60 * 1000;

function safeNumber(v, fallback = 0) { return Number.isFinite(v) ? v : fallback; }
function cleanedText(str) { return String(str||'').trim().replace(/\s+/g,' ').slice(0,230); }
function unwrap(word) {
  if (word.startsWith('**') && word.endsWith('**') && word.length>4) return { text:word.slice(2,-2), color:'#ff2ea0' };
  if (word.startsWith('*') && word.endsWith('*') && word.length>2) return { text:word.slice(1,-1), color:'#ffd60a' };
  return { text:word.replace(/\*/g,''), color:'#ffffff' };
}
function roundedRect(ctx,x,y,w,h,r) {
  r=Math.min(r,w/2,h/2);
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}
function drawOverlay(scene, settings) {
  const width=settings.width, height=Math.round(width*16/9);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('O navegador não conseguiu criar as legendas.');
  const size=width/1080;
  const preset=settings.preset;
  let label = scene.label==='gta5'?'GTA V':scene.label==='gta6'?'GTA VI':scene.label==='detalhe'?'REPAROU NISSO?':
    preset==='comparacao'?'GTA V × GTA VI':preset==='teoria'?'TEORIA GTA':'VOCÊ SABIA?';
  ctx.save();
  ctx.font=`900 ${Math.round(54*size)}px Impact, Arial Black, sans-serif`;
  ctx.textBaseline='middle';
  const pad=24*size;
  const pillWidth=Math.min(width-100*size,ctx.measureText(label).width+pad*2);
  const pillLeft=(width-pillWidth)/2;
  const pillTop=112*size;
  const col=preset==='teoria'?'#ff2ea0':preset==='curiosidade'?'#88e9d6':'#ffd60a';
  ctx.fillStyle=col;roundedRect(ctx,pillLeft,pillTop,pillWidth,78*size,17*size);ctx.fill();
  ctx.fillStyle='#211422';ctx.textAlign='center';ctx.fillText(label,width/2,pillTop+41*size,pillWidth-30*size);
  ctx.fillStyle='rgba(0,0,0,0.52)';roundedRect(ctx,60*size,210*size,10*size,160*size,4*size);ctx.fill();
  ctx.fillStyle=col;roundedRect(ctx,60*size,210*size,10*size,160*size,4*size);ctx.fill();
  if(settings.handle){
    ctx.textAlign='right';ctx.font=`800 ${Math.round(30*size)}px Arial, sans-serif`;
    ctx.lineWidth=4*size;ctx.strokeStyle='#000000d0';ctx.fillStyle='#fff';
    ctx.strokeText(settings.handle,width-65*size,270*size);
    ctx.fillText(settings.handle,width-65*size,270*size);
  }
  const raw=cleanedText(scene.caption);
  if(raw){
    const words=raw.split(/\s+/g).map(unwrap).filter(w=>w.text);
    const maxWidth=width-140*size;
    let fontSize=76*size;
    let lines=[];
    function wrap(){
      ctx.font=`900 ${Math.round(fontSize)}px Impact, Arial Black, sans-serif`;
      const result=[];let current=[];let lineWidth=0;
      for(const word of words){
        const space=current.length?ctx.measureText(' ').width:0;
        const measured=ctx.measureText(word.text).width;
        if(current.length && lineWidth+space+measured>maxWidth){result.push(current);current=[];lineWidth=0;}
        if(current.length){current.push({text:' ',color:'#fff'});lineWidth+=ctx.measureText(' ').width;}
        current.push(word);lineWidth+=measured;
      }
      if(current.length)result.push(current);
      return result;
    }
    lines=wrap();
    while(lines.length>4 && fontSize>40*size){fontSize-=5*size;lines=wrap();}
    if(lines.length>4) lines=lines.slice(0,4);
    const leading=fontSize*1.25;
    const textH=Math.max(leading,lines.length*leading);
    const middleY=height*.75;
    const top=middleY-textH/2;
    ctx.fillStyle='#0a0611b9';roundedRect(ctx,48*size,top-30*size,width-96*size,textH+61*size,24*size);ctx.fill();
    ctx.textBaseline='middle';ctx.lineJoin='round';ctx.textAlign='left';
    ctx.lineWidth=9*size;ctx.strokeStyle='#08040bdc';
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      let rowWidth=0;for(const word of line)rowWidth+=ctx.measureText(word.text).width;
      let x=(width-rowWidth)/2;const y=top+leading*(i+.5);
      for(const word of line){
        ctx.strokeText(word.text,x,y);ctx.fillStyle=word.color;ctx.fillText(word.text,x,y);
        x+=ctx.measureText(word.text).width;
      }
    }
  }
  ctx.restore();
  return new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>{
      canvas.width=canvas.height=1;
      if(blob)resolve(blob);else reject(new Error('Não foi possível criar o overlay de legenda.'));
    },'image/png');
  });
}

function timeProgress(progress, duration, from, to, message) {
  return ({time}) => {
    if(!Number.isFinite(time))return;
    const ratio=Math.min(1,Math.max(0,time/1e6/duration));
    progress(from+ratio*(to-from),message);
  };
}
async function openEngine(signal, progress) {
  signal?.throwIfAborted();
  const ffmpeg=new FFmpeg();
  let closed=false;
  const abort=()=>{closed=true;ffmpeg.terminate();};
  signal?.addEventListener('abort',abort,{once:true});
  try {
    progress(0.01,'Carregando o motor FFmpeg…');
    await withTimeout(ffmpeg.load({coreURL:CORE_BASE+'/ffmpeg-core.js',wasmURL:CORE_BASE+'/ffmpeg-core.wasm'}),120000,'O download do FFmpeg demorou demais.');
    signal?.throwIfAborted();
    await ffmpeg.createDir('/media');
    return {
      ffmpeg,
      check(){signal?.throwIfAborted();if(closed)throw new Error('Processamento interrompido.');},
      close(){if(!closed){closed=true;ffmpeg.terminate();}signal?.removeEventListener('abort',abort);}
    };
  } catch(e) {abort();signal?.removeEventListener('abort',abort);throw e;}
}
async function withTimeout(promise,ms,message){
  let timer;
  try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms);})]);}
  finally {clearTimeout(timer);}
}
async function mountMedia(ffmpeg, files, signal) {
  const blobs=files.filter(x=>x.file).map(x=>({name:x.key,data:x.file}));
  let mounted=false;
  try{mounted=Boolean(await ffmpeg.mount('WORKERFS',{blobs},'/media'));}catch{mounted=false;}
  if(mounted)return Object.fromEntries(blobs.map(b=>[b.name,'/media/'+b.name]));
  for(const item of blobs){
    signal?.throwIfAborted();
    if(item.data.size>MAX_COPY_BYTES)throw new Error('Este navegador não conseguiu montar arquivos grandes sem copiar. Experimente Chrome/Edge atualizado ou um MP4 menor.');
    await ffmpeg.writeFile('/media/'+item.name,new Uint8Array(await item.data.arrayBuffer()));
  }
  return Object.fromEntries(blobs.map(b=>[b.name,'/media/'+b.name]));
}
async function probeAudio(ffmpeg,source){
  await ffmpeg.ffprobe(['-v','error','-show_entries','stream=codec_type','-of','json','-o','/probe.json',source]);
  let metadata;
  try{metadata=JSON.parse(await ffmpeg.readFile('/probe.json','utf8'));}
  catch{throw new Error('O FFmpeg não conseguiu reconhecer o vídeo.');}
  await ffmpeg.deleteFile('/probe.json').catch(()=>{});
  return (metadata.streams||[]).some(s=>s.codec_type==='audio');
}
async function run(ffmpeg,args,signal,ms=DEFAULT_TIMEOUT){
  signal?.throwIfAborted();
  const code=await withTimeout(ffmpeg.exec(args),ms,'A renderização excedeu o tempo permitido neste navegador.');
  signal?.throwIfAborted();
  if(code!==0)throw new Error('Falha no FFmpeg (código '+code+'). Tente 720p, menos cenas ou outro arquivo MP4.');
}
function graphFor(width,height,zoom){
  const filter=[
    '[0:v]scale=ceil(iw*sar/2)*2:ih,setsar=1,split=2[b][f]',
    `[b]scale=270:480:force_original_aspect_ratio=increase:force_divisible_by=2,crop=270:480,boxblur=12:2,scale=${width}:${height}:flags=fast_bilinear,setsar=1[bg]`,
    `[f]scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1[fg]`,
    '[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p[base]'
  ];
  if(zoom)filter.push(`[base]crop=iw/1.045:ih/1.045:(iw-ow)/2:(ih-oh)/2,scale=${width}:${height},setsar=1[zoom]`);
  filter.push(`[1:v]scale=${width}:${height},format=rgba[art]`);
  filter.push(`[${zoom?'zoom':'base'}][art]overlay=0:0:shortest=1:format=auto,format=yuv420p[v]`);
  return filter.join(';');
}
function encodeConcatPlaylist(count){return Array.from({length:count},(_,i)=>`file '/cena-${i}.mp4'`).join('\n')+'\n';}

export async function renderEnhanced(settings,progress=()=>{},signal){
  if(!settings.source||!Array.isArray(settings.scenes)||!settings.scenes.length)throw new Error('Nenhuma cena foi configurada.');
  const width=settings.width, height=Math.round(width*16/9);
  if(![720,1080].includes(width))throw new Error('Resolução inválida.');
  const total=settings.seconds;
  if(!Number.isFinite(total)||total<3||total>120)throw new Error('Duração inválida.');
  if(settings.scenes.length>28)throw new Error('Reduza para até 28 cenas.');
  const engine=await openEngine(signal,progress);
  const {ffmpeg}=engine;
  let recentLogs=[];
  const onLog=({message})=>{recentLogs.push(message);if(recentLogs.length>8)recentLogs.shift();};
  ffmpeg.on('log',onLog);
  try{
    engine.check();progress(.05,'Preparando arquivos locais…');
    const paths=await mountMedia(ffmpeg,[
      {key:'video',file:settings.source},
      {key:'narracao',file:settings.voice},
      {key:'musica',file:settings.music}
    ],signal);
    engine.check();progress(.09,'Verificando as faixas de áudio…');
    const hasAudio=await probeAudio(ffmpeg,paths.video);
    const originalVolume=safeNumber(settings.originalVolume);
    for(let i=0;i<settings.scenes.length;i++){
      engine.check();const scene=settings.scenes[i];
      const start=Number(scene.start),duration=Number(scene.length);
      if(!Number.isFinite(start)||!Number.isFinite(duration)||start<0||duration<=0)throw new Error('Cena '+(i+1)+' tem valores inválidos.');
      const png=await drawOverlay(scene,settings);
      const pngPath=`/overlay-${i}.png`;
      await ffmpeg.writeFile(pngPath,new Uint8Array(await png.arrayBuffer()));
      const out=`/cena-${i}.mp4`;
      const label=`Renderizando cena ${i+1} de ${settings.scenes.length}…`;
      const phaseFrom=.10+i*.70/settings.scenes.length;
      const phaseTo=.10+(i+1)*.70/settings.scenes.length;
      const update=timeProgress(progress,duration,phaseFrom,phaseTo,label);
      ffmpeg.on('progress',update);
      try{
        const zoom=settings.intensity==='dinamico'&&(i%2===0);
        const args=[
          '-threads','1','-ss',start.toFixed(3),'-i',paths.video,
          '-loop','1','-framerate','30','-i',pngPath,
          '-f','lavfi','-i','anullsrc=r=44100:cl=stereo',
          '-t',duration.toFixed(3),'-filter_complex_threads','1',
          '-filter_complex',graphFor(width,height,zoom),
          '-map','[v]', '-map',hasAudio&&originalVolume>0?'0:a:0':'2:a:0',
          '-c:v','libx264','-threads','1','-preset','ultrafast','-crf',width===720?'25':'24',
          '-r','30','-pix_fmt','yuv420p',
          '-c:a','aac','-ar','44100','-ac','2','-b:a','128k'
        ];
        if(hasAudio&&originalVolume>0)args.push('-af','volume='+Math.max(0,Math.min(1,originalVolume)).toFixed(3));
        args.push('-shortest',out);
        await run(ffmpeg,args,signal);
      }catch(e){
        throw new Error('Cena '+(i+1)+': '+e.message+(recentLogs.length?' ['+recentLogs.at(-1)+']':''));
      }finally{ffmpeg.off('progress',update);}
      await ffmpeg.deleteFile(pngPath).catch(()=>{});
      progress(phaseTo,label);
    }
    engine.check();progress(.81,'Unindo os trechos editados…');
    await ffmpeg.writeFile('/lista.txt',new TextEncoder().encode(encodeConcatPlaylist(settings.scenes.length)));
    await run(ffmpeg,['-f','concat','-safe','0','-i','/lista.txt','-c','copy','-movflags','+faststart','/unido.mp4'],signal);
    engine.check();
    const inputs=[];const audio=[];let channels=1;
    inputs.push('-i','/unido.mp4');
    audio.push('[0:a]volume=1[amb]');
    let mixLabels=['[amb]'];
    if(settings.voice){inputs.push('-i',paths.narracao);audio.push(`[${channels}:a]volume=1,aresample=44100[voz]`);mixLabels.push('[voz]');channels++;}
    if(settings.music){
      inputs.push('-stream_loop','-1','-i',paths.musica);
      audio.push(`[${channels}:a]volume=${Math.max(0,Math.min(.5,settings.musicVolume)).toFixed(3)},aresample=44100[mus]`);
      mixLabels.push('[mus]'); channels++;
    }
    if(mixLabels.length>1){
      progress(.88,'Misturando narração, áudio original e música…');
      audio.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0:normalize=0[a]`);
      const args=[...inputs,'-filter_complex',audio.join(';'),'-map','0:v:0','-map','[a]',
        '-c:v','copy','-c:a','aac','-b:a','192k','-ar','44100',
        '-t',total.toFixed(3),'-movflags','+faststart','/final.mp4'];
      await run(ffmpeg,args,signal);
    }else{
      progress(.90,'Finalizando o MP4…');
      await run(ffmpeg,['-i','/unido.mp4','-map','0:v:0','-map','0:a:0','-c','copy',
        '-t',total.toFixed(3),'-movflags','+faststart','/final.mp4'],signal);
    }
    engine.check();progress(.97,'Lendo o arquivo final…');
    const bytes=await ffmpeg.readFile('/final.mp4');
    if(!bytes?.byteLength)throw new Error('O FFmpeg não produziu um arquivo de vídeo.');
    progress(1,'Vídeo pronto.');
    return new Blob([bytes],{type:'video/mp4'});
  }finally{
    ffmpeg.off('log',onLog);
    engine.close();
  }
}

export async function transcribeNarration(file,progress=()=>{},signal){
  if(!file)throw new Error('Envie um MP3 antes de transcrever.');
  const engine=await openEngine(signal,progress);
  let wav;
  try{
    progress(.06,'Preparando áudio em WAV…');
    const paths=await mountMedia(engine.ffmpeg,[{key:'narracao',file}],signal);
    await run(engine.ffmpeg,['-i',paths.narracao,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le','/transcricao.wav'],signal);
    wav=new Blob([await engine.ffmpeg.readFile('/transcricao.wav')],{type:'audio/wav'});
    progress(.25,'Áudio pronto para transcrição…');
  }finally{engine.close();}
  const {createTranscriptionSession}=await import('./speech-local.js');
  let session;
  try{
    session=await createTranscriptionSession(p=>progress(.25+p*.38,'Carregando o Whisper…'),{language:'pt',signal});
    const result=await session.transcribe(wav,p=>progress(.63+p*.37,'Transcrevendo narração…'));
    progress(1,'Transcrição concluída.');
    return result;
  }finally{session?.close();}
}
