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
    ? 'Trecho escolhido. Informe o endereço do seu Worker e o código pessoal para gerar o roteiro.'
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
  startButton.disabled=true;
  el('ia-cancel').hidden=false;
  details.replaceChildren();
  try{
    const result=await gerarRoteiroIA({
      source,cut,preset:el('preset').value,
      endpoint:endpoint.value,accessCode:password.value,
      signal:current.signal,progress:(p,msg)=>message(Math.round(p*100)+'% · '+msg)
    });
    if(current.signal.aborted)return;
    script.value=result.roteiro;
    script.dispatchEvent(new Event('input',{bubbles:true}));
    details.replaceChildren();
    section('Observações baseadas nos quadros',result.observacoes);
    section('Pontos para conferir',result.alertas);
    const reminder=document.createElement('p');
    reminder.textContent='Roteiro gerado automaticamente. Confira os detalhes e a correspondência das cenas antes de copiar para o ElevenLabs.';
    details.append(reminder);
    message('Roteiro criado e inserido no editor. Revise o conteúdo e use “Copiar roteiro para o ElevenLabs”.');
  }catch(error){
    message(current.signal.aborted?'Análise cancelada.':'Falha na análise: '+(error?.message||'Erro inesperado.'),!current.signal.aborted);
  }finally{
    if(controller===current)controller=null;
    el('ia-cancel').hidden=true;
    startButton.disabled=!cut;
  }
});
