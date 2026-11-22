# Roteiros de IA para o Modo Aprimorado (v1.2)

Esta branch adiciona **análise visual de 6 quadros do corte selecionado** e geração de roteiro original para comparações, teorias e curiosidades de GTA V e GTA VI. A narração continua sendo gerada manualmente no ElevenLabs e importada em MP3 no editor.

## Importante

- O site hospedado no GitHub Pages é estático e **não pode guardar a chave de API**. Por isso, o botão de IA depende de um **Cloudflare Worker** configurado pelo proprietário.
- O Worker **não está implantado automaticamente** por este pull request. Sem configurá-lo, a função de roteiro IA não funciona; o restante do editor permanece disponível.
- Captura 6 quadros por corte, com tamanho reduzido. A IA não assiste ao vídeo inteiro e pode confundir versões dos jogos, eventos ou datas. **Revise o roteiro e confira o material antes de publicar.**
- A transcrição original é apenas referência e pode conter erros. O roteiro solicita comentário original, mas **não garante elegibilidade de monetização** nem concede autorização para reutilizar vídeos de terceiros.
- O serviço de IA está sujeito a custos do provedor e limites de uso. O código de acesso privado **não substitui autenticação forte e limite de taxa**; use apenas com acesso restrito e monitore a cobrança.

## Instalação do serviço privado (Cloudflare Workers)

1. Crie uma conta Cloudflare e instale Node.js no computador.
2. Em uma pasta local contendo `backend-ia/worker.js` e `backend-ia/wrangler.toml` do repositório, abra o terminal.
3. Instale/execute a ferramenta Wrangler: `npx wrangler login`.
4. Na pasta `backend-ia`, configure seus segredos (o terminal solicitará os valores):
   - `npx wrangler secret put OPENAI_API_KEY`
   - `npx wrangler secret put EDITOR_ACCESS_CODE` (código forte e exclusivo, no mínimo 8 caracteres)
5. Publique: `npx wrangler deploy`.
6. Copie a URL `https://...workers.dev` fornecida pela Cloudflare.
7. Abra o **Modo Aprimorado**, importe um vídeo, escolha um corte, informe a URL do Worker e o código de acesso e clique em **Gerar roteiro com IA**.

**Não coloque chaves OpenAI ou o código do editor em arquivos públicos, prints ou mensagens.** A API usada é `gpt-4.1-mini` por padrão, mas pode ser alterada via variável privada `OPENAI_MODEL` do Worker.

## Fluxo de vídeo

1. Carregar vídeo e analisar cortes (fala/Whisper ou mudanças visuais).
2. Assistir aos resultados, escolher um corte e selecionar o estilo.
3. Gerar roteiro IA; revisar suas observações e alertas. Corrigir afirmações duvidosas.
4. Copiar o roteiro e gerar o MP3 no ElevenLabs.
5. Importar MP3, montar cenas, ajustar legendas e exportar MP4.

## Segurança e privacidade

- O vídeo completo não é enviado ao Worker; apenas os quadros amostrados e uma transcrição abreviada.
- Os dados selecionados são enviados ao provedor de IA externo por intermédio do Worker.
- A chave de API permanece no Worker e nunca na página.
- O Worker permite solicitações de origem do site `https://snakxitz.github.io`, verifica código, formato e limites de entrada.
- CORS não substitui autenticação e não impede requisições fora do navegador. Para uso compartilhado, adicione autenticação por usuário, limites de requisição e monitoramento de gastos.

## Testes após implantação

- Abrir o editor e escolher um vídeo; selecionar trecho de 20 ou 40 s.
- Verificar texto e alertas antes de copiar.
- Importar MP3, criar cenas e exportar MP4.
- Conferir o consumo e os logs do Worker em caso de erro.
