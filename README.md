# Cortes GTA VI no navegador

Use o estúdio para gerar 1, 3 ou 5 cortes verticais de 30 ou 65 segundos de um vídeo próprio. Cada resultado inclui o MP4, a capa em JPG e sugestões editáveis de título, descrição e tags.

## Como usar

1. Após ativar o GitHub Pages, abra o [Cortes GTA VI no navegador](https://snakxitz.github.io/cortes-gta-vi-download/#estudio).
2. Selecione um MP4 ou MOV com narração sobre GTA VI. Escolha o idioma, a duração de cada Short e a quantidade.
3. Mantenha a aba aberta durante a geração. Use a biblioteca para assistir, editar e baixar.

O processamento roda no navegador. Na primeira execução, o navegador baixa o modelo de transcrição e o motor de vídeo. A biblioteca fica no navegador usado para criar os cortes. Links diretos de MP4 ou MOV funcionam quando a origem permite o acesso pelo navegador. Para vídeos próprios no YouTube, baixe o arquivo pelo YouTube Studio e envie pelo seletor.

## Publicação

O [ZIP da versão para GitHub Pages](downloads/Cortes-GTA-VI-GitHub-Pages.zip?raw=true) reúne os arquivos estáticos.

Carregue os arquivos deste pacote na raiz do repositório. Em **Settings → Pages**, escolha **Deploy from a branch**, **main** e **/(root)**. O GitHub mostra a URL assim que terminar.

## Importação de links do YouTube

O importador recebe um vídeo próprio ou autorizado e entrega um MP4 ao estúdio. A transcrição, os cortes, as capas e a biblioteca continuam no navegador. O importador recebe um vídeo por vez, de 30 segundos a 2 horas, até 250 MB.

### Teste no Render

1. Abra [Deploy to Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fsnakxitz%2Fcortes-gta-vi-download) e entre na sua conta. O `render.yaml` configura um Web Service Docker no plano gratuito para o estúdio oficial.
2. Confirme a implantação e aguarde o serviço ficar **Live**. Abra o endereço `onrender.com` do serviço com `/health` no final. A resposta esperada é `{"status":"ok"}`.
3. Antes de habilitar a opção no site, teste a importação de um vídeo autorizado. Substitua `ID_DO_VIDEO` pelo ID do seu vídeo e `ENDERECO_DO_SERVICO` pela URL HTTPS do Render.

   ```sh
   curl --fail-with-body -X POST -H 'Origin: https://snakxitz.github.io' \
     'ENDERECO_DO_SERVICO/importar/ID_DO_VIDEO' -o teste.mp4
   ```

4. Depois de confirmar que o arquivo recebido é um MP4 válido, informe a URL HTTPS do serviço em `youtubeImport` no `config.json` e publique.

### Instalação em servidor com Docker

1. Em uma hospedagem com Docker, construa a imagem com `docker build -t cortes-youtube servidor-youtube`.
2. Rode o contêiner com `docker run --rm --init -p 127.0.0.1:8080:8080 -e CORTES_ORIGIN=https://snakxitz.github.io cortes-youtube`. Use como origem apenas protocolo e domínio da página. Para hospedar em outro endereço, ajuste esse valor.
3. Exponha a porta por um proxy HTTPS para o qual você tenha acesso. O proxy precisa permitir a importação por até 3 minutos antes de começar a resposta. Verifique `GET /health` e faça um teste com um vídeo autorizado no próprio servidor.
4. No `config.json` do site, troque `youtubeImport` de `null` para o endereço HTTPS do importador e publique. O campo passa a aceitar links do YouTube. O parâmetro `motor` atende ao painel externo legado.

O limite de um importador simultâneo vale por processo. A origem configurada limita o uso pelo navegador. Para um lançamento aberto, configure limites de requisição também no proxy da hospedagem.
