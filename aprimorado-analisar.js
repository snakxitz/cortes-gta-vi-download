// Usa os módulos do editor atual para ler áudio de vídeos e transcrever somente um intervalo.
// Não envia o vídeo a um servidor: FFmpeg e Whisper rodam no navegador.
import { createVideoSession } from './video-local.js';
import { createTranscriptionSession } from './speech-local.js';

export async function analyzeVideoSpeech(file, regionStart, regionEnd, progress = () => {}, signal, language = 'pt') {
  signal?.throwIfAborted();
  if (!(regionEnd > regionStart)) throw new Error('Intervalo de análise inválido.');
  let videoSession, speechSession;
  try {
    progress(.01, 'Abrindo vídeo para análise de voz…');
    videoSession = await createVideoSession(file, p => progress(.01 + p * .14, 'Abrindo vídeo…'), {signal});
    if (!videoSession.hasAudio) throw new Error('O vídeo não contém áudio. Escolha “Movimento das imagens”.');
    if (regionEnd > videoSession.duration + .01) throw new Error('Intervalo maior que o vídeo.');
    progress(.16, 'Carregando modelo Whisper no navegador…');
    speechSession = await createTranscriptionSession(p => progress(.16 + p * .13, 'Preparando Whisper…'), {language,signal});
    const transcript=[];
    const block = 100;
    const overlap=2;
    const whole=regionEnd-regionStart;
    for(let start=regionStart; start<regionEnd-.005; start+=block){
      signal?.throwIfAborted();
      const end=Math.min(start+block,regionEnd);
      const from=Math.max(regionStart,start-overlap);
      const to=Math.min(regionEnd,end+overlap);
      const progressBase=.29 + .70 * (start-regionStart)/whole;
      const weight=.70 * (end-start)/whole;
      progress(progressBase,`Lendo fala de ${Math.floor(start)}s a ${Math.floor(end)}s…`);
      const wav=await videoSession.extractAudio(from,to-from,p=>progress(progressBase+weight*p*.2,'Extraindo áudio da comparação…'));
      const segments=await speechSession.transcribe(wav,p=>progress(progressBase+weight*(.2+.8*p),'Transcrevendo as falas…'));
      for(const s of segments){
        const absStart=from+s.start;
        const absEnd=Math.min(regionEnd,from+s.end);
        const midpoint=(absStart+absEnd)/2;
        if(midpoint >= start-.001 && midpoint < end+.001 && absEnd>absStart && s.text?.trim()){
          transcript.push({start:absStart,end:absEnd,text:s.text.trim()});
        }
      }
    }
    progress(1,'Transcrição pronta.');
    return transcript;
  }finally{
    speechSession?.close();
    videoSession?.close();
  }
}
