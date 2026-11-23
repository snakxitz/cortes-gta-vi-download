import { gerarRoteiroIA } from './aprimorado-roteiro-ia.js';

const el=id=>document.getElementById(id);
const startButton=el('ia-generate');
const status=el('ia-status');
const details=el('ia-evidence');
const endpoint=el('ia-endpoint');
const password=el('ia-code');
const script=el('script');
let cut=null;
let controller=null;

function resetCut(candidate){
  if(controller)controller.abort();
  cut=candidate;
  startButton.disabled=!candidate || Boolean(controller);
  details.replaceChildren();
  status.textContent=candidate
    ? 'Trecho escolhido. Informe o código privado para transcrever a fala e gerar o roteiro.'
    : 'Escolha um corte acima para começar.';
}
document.addEventListener('aprimorado:corte-selecionado',event=>resetCut(event.detail||null));
el('video-file').addEventListener('change',()=>resetCut(null));
el('analyze-cuts').addEventListener('click',()=>resetCut(null));

function message(text,isError=false){
  status.textContent=text;
  status.style.color=isError?'#ffb5b5':'';
}
el('ia-cancel').addEventListener('click',()=>{
  controller?.abort();
});

function section(title,items){
  if(!items.length)return;
  const heading=document.createElement('strong');heading.textContent=title;
  const list=document.createElement('ul');
  for(const item of items){const li=document.createElement('li');li.textContent=item;list.append(li);}
  details.append(heading,list);
}
startButton.addEventListener('click',async()=>{
  const source=el('video-file').files?.[0];
  if(!cut||!source){message('Selecione um trecho primeiro.',true);return;}
  if(controller)return;
  controller=new AbortController();
  const current=controller;
  const selected=cut;
  const language=el('video-language').value;
  startButton.disabled=true;
  el('ia-cancel').hidden=false;
  details.replaceChildren();
  try{
    const result=await gerarRoteiroIA({
      source,cut:selected,preset:el('preset').value,language,
      endpoint:endpoint.value,accessCode:password.value,
      signal:current.signal,progress:(p,msg)=>message(Math.round(p*100)+'% · '+msg),
      onTranscript:transcript=>{
        document.dispatchEvent(new CustomEvent('aprimorado:transcricao-pronta',{
          detail:{cut:selected,transcript,language}
        }));
      }
    });
    if(current.signal.aborted)return;
    script.value=result.roteiro;
    script.dispatchEvent(new Event('input',{bubbles:true}));
    details.replaceChildren();
    if (result.tema) { const t=document.createElement('p'); const b=document.createElement('strong'); b.textContent='Tema identificado: '; t.append(b,document.createTextNode(result.tema)); details.append(t); }
    section('O que a transcrição indica',result.observacoes);
    section('Pontos para conferir',result.alertas);
    const reminder=document.createElement('p');
    reminder.textContent='Roteiro gerado a partir da transcrição. Revise as afirmações antes de copiar para o ElevenLabs.';
    details.append(reminder);
    message('Roteiro pronto. Revise o texto e use “Copiar roteiro para o ElevenLabs”.');
  }catch(error){
    message(current.signal.aborted?'Análise cancelada.':'Falha na análise: '+(error?.message||'Erro inesperado.'),!current.signal.aborted);
  }finally{
    if(controller===current)controller=null;
    el('ia-cancel').hidden=true;
    startButton.disabled=!cut;
  }
});
