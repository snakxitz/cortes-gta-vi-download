# Cortes GTA VI — Modo Aprimorado v1

Esta é uma **extensão do seu site existente**, não um site completo novo. O modo antigo permanece intacto.

## Instalar no GitHub Pages

Repositório: https://github.com/snakxitz/cortes-gta-vi-download

1. Extraia o ZIP no computador.
2. Entre no repositório do GitHub e confira a branch `main`.
3. Clique **Add file → Upload files**.
4. Envie **somente estes quatro arquivos** para a **raiz do repositório**, no mesmo nível de `index.html`:
   - `aprimorado.html`
   - `aprimorado.css`
   - `aprimorado.js`
   - `aprimorado-video.js`
5. Clique em **Commit changes**. Aguarde o GitHub Pages publicar.
6. Abra: **https://snakxitz.github.io/cortes-gta-vi-download/aprimorado.html**.

**Não apague nem substitua** `index.html`, `app.js`, `video-local.js`, `speech-local.js`, `style.css`, `vendor/` ou `assets/` do site atual. Os quatro novos arquivos usam o FFmpeg e o Whisper que já existem no repositório.

### Colocar um botão na página principal (opcional)

Em `index.html`, dentro do `<nav>` principal, acrescente:

```html
<a href="aprimorado.html">Modo Aprimorado</a>
```

Não é obrigatório; o link direto acima já funciona após a publicação.

## Usar o editor

1. Importe um MP4 ou MOV com cenas de GTA V / GTA VI.
2. Opcional: importe seu MP3 do ElevenLabs. A duração do vídeo será igual à da narração (máximo de 2 minutos nesta versão).
3. Cole a narração no campo de texto, **uma frase por linha**. Ou clique em **Transcrever MP3 automaticamente**, usando o Whisper. Revise o texto, pois a transcrição pode errar.
4. Escolha Comparação, Teoria ou Curiosidade; defina o trecho de origem, marca-d'água, qualidade e volumes.
5. Clique **Montar cenas**. O editor divide a narração em frases e distribui a duração proporcionalmente ao texto. Confira a sincronização: a divisão textual não faz correspondência semântica com as imagens.
6. Em **Revisar cenas**, ajuste o segundo de início de cada cena, identifique GTA V ou GTA VI e corrija a legenda.
7. Assista à prévia aproximada e clique **Gerar MP4 aprimorado**.
8. Quando terminar, confira o resultado e baixe o MP4.

## Recursos disponíveis na v1

- Processamento **local no navegador** com FFmpeg WebAssembly. Nenhum vídeo é enviado a um servidor do projeto.
- Mantém o editor original totalmente independente.
- Narração separada MP3/WAV/M4A; opcionalmente mantém parte do áudio original e adiciona música enviada pelo usuário.
- Transcrição opcional de MP3 com Whisper Tiny, dependente de download do modelo.
- Cenas editáveis com ponto de início no vídeo e legenda associada à frase.
- Formato 9:16 em 720 × 1280 ou 1080 × 1920, 30 fps.
- Fundo desfocado para adaptar vídeos horizontais sem cortar a imagem principal.
- Cabeçalho temático por cena e legendas com `*destaque*` amarelo ou `**destaque forte**` rosa.
- Zoom suave alternado nas cenas no modo Dinâmico; opção sem zoom.
- Exportação MP4 H.264 + AAC com áudio misturado.

## Limitações conhecidas

- A **seleção da cena que combina com a narração depende da revisão do criador**: a v1 não interpreta imagens de GTA V/GTA VI nem identifica diferenças entre jogos automaticamente.
- O tempo das frases coladas é **estimado** pelo comprimento do texto; não é alinhamento palavra por palavra. A transcrição Whisper ajuda a obter o texto, mas a montagem ainda precisa de conferência.
- A v1 **não inclui** os efeitos avançados do motor Python (glitch completo, tracking de objetos, molduras automáticas, transições 3D, som de whoosh automático). Eles exigem módulos adicionais.
- A visualização é uma aproximação: o vídeo exportado é renderizado novamente e deve ser conferido.
- Limite de narração: 120 s. Vídeos de até 2 GB podem exceder a memória disponível do navegador. Comece com testes em 720p e 20–40 s.
- A biblioteca do editor antigo não salva automaticamente os vídeos do modo aprimorado: faça o download do MP4 concluído.
- Exige navegador moderno, WebAssembly, Workers, espaço de armazenamento e conexão para baixar o FFmpeg e o Whisper na primeira execução.
- A opção de áudio original é 0% por padrão. Isso facilita a narração e evita carregar indevidamente música original do vídeo; **não remove direitos autorais** do vídeo-fonte.
- Este pacote não contém gameplay, trilhas, fontes nem logotipos de terceiros.

## Sobre direitos autorais e monetização

Vídeos já publicados no YouTube não são automaticamente livres para reutilização. Para publicar e monetizar, use material autorizado ou amparado por uma base legal válida e acrescente contribuição editorial significativa: análise, contexto, comparação própria e edição substantiva. Cortes + filtros + voz de IA isoladamente **não garantem** monetização.

## Testes executados na preparação

- Validação de sintaxe de `aprimorado.js` e `aprimorado-video.js` com Node.js.
- Verificação de correspondência dos IDs da interface com o JavaScript.
- Teste do pipeline de FFmpeg nativo: vídeo H.264, áudio AAC, filtro de blur + zoom + overlay, recortes, concatenação e mixagem de áudio.

O render completo em navegador com o WebAssembly hospedado no seu GitHub Pages **ainda precisa ser testado após a instalação**, porque depende do FFmpeg WASM e dos codecs do navegador.
