# Cortes GTA VI — Modo Aprimorado v1.1

## O que foi corrigido

**Agora os cortes vêm antes da narração.** O usuário não precisa gravar ou gerar um MP3 para selecionar o trecho que deseja transformar em Short.

### Fluxo de trabalho

1. **Importar vídeo**: selecione um MP4/MOV salvo no computador (próprio ou usado com autorização).
2. **Definir**: estilo (comparação, teoria ou curiosidade), duração dos trechos e segundo inicial da busca.
3. **Analisar**: escolha **Movimento das imagens** (rápido) ou **Falas do vídeo / Whisper** (mais demorado, precisa de áudio com fala). O sistema sugere 1, 3 ou 5 trechos. A busca examina até 6 minutos no modo visual ou 4 minutos no modo de fala a partir do segundo indicado. Você pode mudar o início e analisar outra parte.
4. **Pré-visualizar**: clique em **Ver trecho**. Ouça/assista para confirmar o que realmente acontece na cena.
5. **Escolher**: clique em **Usar este corte**. O sistema preenche um roteiro-base **com lacunas**, que você deve completar com sua análise original. Se você usou o Whisper, a transcrição do corte aparece separadamente como referência. Escolha o idioma (português ou inglês) do áudio original antes de analisar.
6. **Preparar roteiro**: com o Worker de IA configurado, clique em **Gerar roteiro com IA** para transcrever o áudio do corte e usar a transcrição como base. Você também pode preencher o roteiro-base ou copiar o briefing e preparar o texto manualmente. Revise os fatos e use **Copiar roteiro para o ElevenLabs**.
7. **Gerar narração**: crie o MP3 no ElevenLabs e retorne ao editor.
8. **Montar e exportar**: importe o áudio, clique em **Montar cenas para prévia**, ajuste as cenas e exporte MP4 720p ou 1080p.

> Não confunda seleção por movimento ou palavras-chave com entendimento completo de gameplay. A busca visual mede diferenças de quadros, não determina se a cena é GTA V ou GTA VI. O rascunho de roteiro é um modelo editorial, **não uma análise factual automática do vídeo**. Confira os fatos e as imagens antes de narrar.

## Instalação no seu GitHub Pages

Repositório de destino: https://github.com/snakxitz/cortes-gta-vi-download

Acesse `main` > **Add file** > **Upload files** e adicione **estes seis arquivos na raiz**, no mesmo nível de `index.html`:

- `aprimorado.html`
- `aprimorado.css`
- `aprimorado.js`
- `aprimorado-video.js`
- `aprimorado-cortes.js` (novo)
- `aprimorado-analisar.js` (novo)

Se o GitHub perguntar sobre substituição dos arquivos da v1, confirme a atualização desses arquivos. **Não remova** os arquivos existentes como `index.html`, `app.js`, `video-local.js`, `speech-local.js`, `cover-local.js`, `style.css` e `vendor/`: a v1.1 usa parte deles.

Depois do commit e da publicação, abra:

https://snakxitz.github.io/cortes-gta-vi-download/aprimorado.html

O editor antigo permanece em https://snakxitz.github.io/cortes-gta-vi-download/

## Recursos mantidos

- Importação MP4/MOV, resolução de saída 720 x 1280 ou 1080 x 1920.
- Corte de cenas com tempo de origem ajustável.
- Títulos por estilo e etiquetas manuais GTA V/GTA VI.
- Destaques amarelos (*palavra*) e rosas (**palavra**).
- Voz de IA ou narração própria enviada em MP3/WAV/M4A.
- Música opcional, volume do áudio original ajustável, zoom discreto, prévia e exportação local.

## Limitações relevantes

- O roteiro automático usa a fala transcrita do trecho e depende de um Worker de IA configurado. O áudio da voz é gerado no ElevenLabs e importado depois.
- O modo de análise por fala transcreve até 4 minutos por busca, pelo Whisper local, podendo demorar e baixar modelos na primeira execução.
- O modo visual usa amostras de movimento e funciona como sugestão, não como detecção semântica confiável dos melhores momentos.
- A duração da montagem é ajustada ao áudio do ElevenLabs quando enviado. Se o MP3 for mais longo que o trecho disponível perto do final do original, ajuste o início das cenas ou escolha outra posição.
- Textos exibidos nas cenas são compostos como overlays estáticos por cena; a sincronização é aproximada e deve ser revisada.
- O motor FFmpeg WebAssembly pode exigir navegador recente e bastante memória, especialmente para vídeos grandes.
- Conteúdo de terceiros pode gerar reivindicações de direitos autorais ou ser considerado reutilizado pelo YouTube. Cortes, efeitos e nova narração, isoladamente, não garantem autorização ou monetização.

## Testes realizados

- `node --check` para os módulos JavaScript novos e os módulos alterados: **passou**.
- Testes de lógica pura para seleção de 20/30/40/60/65 segundos, janelas sem sobreposição, transcrição filtrada e geração de roteiro-base: **passou**.
- A renderização por FFmpeg **nativo** havia sido verificada na v1 para as operações centrais de vídeo, legenda e mixagem.
- **Ainda precisa testar no GitHub Pages a análise no navegador, a interface com um vídeo real, o Whisper e a renderização MP4 via WebAssembly**. O smoke test automatizado em Chromium nesta sessão excedeu o tempo disponível.

## Solução de problemas

- **404**: confirme que `aprimorado.html` está na raiz da branch publicada e aguarde o GitHub Pages atualizar.
- **O botão de análise não habilita**: aguarde a leitura dos metadados ou selecione um vídeo MP4/MOV que o navegador consiga abrir.
- **O editor não reconheceu o que há na imagem**: ele não interpreta o conteúdo visual semanticamente. Assista às opções e preencha o roteiro com as diferenças verificadas.
- **Falha de memória**: experimente 720p, vídeo mais curto e menos cenas. Mantenha a aba aberta.
