// Cloudflare Worker - segredos OPENAI_API_KEY e EDITOR_ACCESS_CODE via wrangler secret put
const BASE_ORIGIN = 'https://snakxitz.github.io';
const MAX_BODY_BYTES = 2300000;
function send(data,status=200){
 return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':BASE_ORIGIN,'Vary':'Origin','X-Content-Type-Options':'nosniff'}});
}
function same(a,b){
 const aa=new TextEncoder().encode(String(a||'')), bb=new TextEncoder().encode(String(b||''));
 let diff=aa.length ^ bb.length;
 for(let i=0;i<Math.max(aa.length,bb.length);i++)diff|=(aa[i]||0)^(bb[i]||0);
 return diff===0 && aa.length>=8;
}
function validFrame(f){
 if(!f||!Number.isFinite(f.tempo)||f.tempo<0)return false;
 const m=typeof f.imagem==='string' && /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(f.imagem);
 return !!(m && m[1].length<440000);
}
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin');
  const path=new URL(request.url).pathname;
  if(request.method==='OPTIONS'){
   if(origin!==BASE_ORIGIN)return new Response(null,{status:403});
   return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':BASE_ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Editor-Code','Access-Control-Max-Age':'600','Vary':'Origin'}});
  }
  if(path==='/health' && request.method==='GET')return send({ok:true});
  if(path!=='/api/roteiro')return send({erro:'Rota não encontrada.'},404);
  if(request.method!=='POST')return send({erro:'Método não permitido.'},405);
  if(origin!==BASE_ORIGIN)return send({erro:'Origem não permitida.'},403);
  if(!env.OPENAI_API_KEY || !env.EDITOR_ACCESS_CODE)return send({erro:'Configure os segredos do Worker.'},503);
  if(!same(request.headers.get('X-Editor-Code'),env.EDITOR_ACCESS_CODE))return send({erro:'Código de acesso inválido.'},401);
  if(Number(request.headers.get('Content-Length')||0)>MAX_BODY_BYTES)return send({erro:'Imagens grandes demais.'},413);
  let raw;try{raw=await request.text();}catch{return send({erro:'Falha ao ler requisição.'},400);}
  if(raw.length>MAX_BODY_BYTES)return send({erro:'Imagens grandes demais.'},413);
  let body;try{body=JSON.parse(raw);}catch{return send({erro:'JSON inválido.'},400);}
  const {estilo,duracao,transcricao,quadros}=body||{};
  if(!['comparacao','teoria','curiosidade'].includes(estilo)||!Number.isInteger(duracao)||duracao<10||duracao>120||typeof transcricao!=='string'||transcricao.length>3000||!Array.isArray(quadros)||quadros.length<2||quadros.length>6||!quadros.every(validFrame))return send({erro:'Dados inválidos para roteiro.'},400);
  const instructions=[
   'Você é roteirista de YouTube Shorts sobre GTA V e GTA VI em português do Brasil.',
   'Use APENAS os quadros de imagem e a transcrição fornecidos. A transcrição pode conter erros.',
   'Os quadros são amostras estáticas e NÃO provam ações entre eles ou a identidade do jogo.',
   'Jamais classifique uma imagem como GTA V ou VI sem evidência visual clara e não invente mecânicas, eventos, versões ou diferenças.',
   'Se a imagem não demonstrar uma comparação real, ofereça observações específicas e hipótese explicitamente marcada como hipótese.',
   'Crie narração ORIGINAL e transformativa, sem copiar frases do vídeo, com gancho específico, observações verificáveis, sua análise interpretativa prudente e uma pergunta final.',
   'Use frases curtas naturais em linhas separadas, sem colchetes, instruções, etiquetas nem markdown.',
   'Mantenha tamanho apropriado para '+duracao+' segundos (cerca de '+Math.round(duracao*2.2)+' palavras).',
   'Responda apenas JSON: {"titulo":string,"roteiro":string,"observacoes":string[],"alertas":string[],"revisar":true}.',
   'Em observacoes, cite instantes dos quadros quando possível. Em alertas, liste fatos não confirmados. Não afirme fatos não verificados.'
  ].join('\n');
  const media=[{type:'text',text:'Estilo: '+estilo+'. Transcrição de referência: '+(transcricao||'(nenhuma)')}];
  for(const frame of quadros){
   media.push({type:'text',text:'Imagem do vídeo no tempo '+frame.tempo+' segundos.'});
   media.push({type:'image_url',image_url:{url:frame.imagem,detail:'low'}});
  }
  let response;
  try{
   response=await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{'Authorization':'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-4.1-mini',temperature:0.4,max_completion_tokens:850,response_format:{type:'json_object'},messages:[{role:'system',content:instructions},{role:'user',content:media}]})
   });
  }catch{return send({erro:'Serviço de IA inacessível.'},502);}
  if(!response.ok)return send({erro:response.status===429?'Limite de uso da IA atingido.':'Erro na geração do roteiro.'},502);
  let data;
  try{const out=await response.json();data=JSON.parse(out.choices?.[0]?.message?.content||'{}');}
  catch{return send({erro:'A IA não retornou o formato esperado.'},502);}
  if(typeof data.roteiro!=='string'||data.roteiro.trim().length<30||data.roteiro.length>4500)return send({erro:'Roteiro inválido.'},502);
  return send({titulo:String(data.titulo||'').slice(0,120),roteiro:data.roteiro,observacoes:Array.isArray(data.observacoes)?data.observacoes.map(x=>String(x).slice(0,250)).slice(0,6):[],alertas:Array.isArray(data.alertas)?data.alertas.map(x=>String(x).slice(0,250)).slice(0,6):[],revisar:true});
 }
};
