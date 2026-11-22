# Roteiros de IA para o Modo Aprimorado (v1.2)

## Configuração recomendada: USO PESSOAL (simples e econômica)

**Arquitetura:** GitHub Pages (interface e render local no navegador) → Cloudflare Worker (gateway privado) → Gemini Developer API, nível gratuito (análise de 4 quadros por corte e roteiro original). O MP3 é gerado manualmente no ElevenLabs e depois importado. **Não precisa banco de dados, login, VPS, domínio próprio ou assinatura SaaS.**

**Custo:** cortar, transcrever localmente e exportar não gasta tokens da API Gemini. Apenas **Gerar roteiro com IA** envia dados ao Gemini. Use o **nível gratuito do Gemini Developer API** com o modelo `gemini-3.5-flash-lite`, se disponível no projeto e na região. O nível gratuito está sujeito a cotas e possíveis mudanças: ao atingir a cota, o botão deve exibir erro e não realizar cobrança na configuração gratuita. **Não habilite faturamento** no projeto se sua prioridade absoluta for não pagar. Cloudflare Workers pode ter cota gratuita conforme o plano. Consulte os painéis para confirmar limites e consumo.

### Configurar pelo navegador, sem instalar programas no computador

1. Faça uma conta em **Cloudflare → Workers & Pages**, crie um Worker chamado `cortes-gta-vi-roteiros` e abra a edição do código.
2. Substitua o código inicial pelo conteúdo de [worker.js](./worker.js); **publique o Worker**.
3. Dentro das configurações de **Variables / Secrets**, crie **dois segredos criptografados**: `GEMINI_API_KEY` (chave gratuita criada em https://aistudio.google.com/apikey) e `EDITOR_ACCESS_CODE` (senha exclusiva com ao menos 16 caracteres).
4. Faça deploy da configuração e copie o endereço HTTPS exibido no painel do Worker (termina em `.workers.dev`).
5. Abra o editor **Modo Aprimorado**, importe o vídeo, escolha um corte, preencha a **URL do Worker** e o **Código de acesso** e clique em **Gerar roteiro com IA**.
6. Revise o roteiro produzido a partir dos quadros e da transcrição; copie-o para o ElevenLabs, gere o MP3 e importe-o no editor.

**Não envie chaves ou código de acesso no chat.** As credenciais devem existir apenas nos segredos do Worker; o código pessoal é digitado no formulário do editor quando necessário. Usar o editor em modo pessoal NÃO exige as quatro variáveis do GitHub Actions. O workflow de GitHub Actions é opcional para automatizar novas publicações; no método manual só são necessários os dois segredos dentro da Cloudflare.

**Pré-requisito:** esta branch é de teste. Para abrir o novo formulário no site público, é necessário mesclar a versão testada com `main` após verificar o serviço. Antes da mesclagem, a página pública continua na versão anterior.

**Limite de segurança:** não existe autenticação por usuário nem rate limit no Worker atual. O código de acesso não deve ser compartilhado. O modo pessoal não é apropriado para distribuir a outros usuários sem controles adicionais de abuso/custo.

---


Esta branch adiciona **análise visual de 4 quadros do corte selecionado** e geração de roteiro original para comparações, teorias e curiosidades de GTA V e GTA VI. A narração continua sendo gerada manualmente no ElevenLabs e importada em MP3 no editor.

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
   - `npx wrangler secret put GEMINI_API_KEY`
   - `npx wrangler secret put EDITOR_ACCESS_CODE` (código forte e exclusivo, no mínimo 8 caracteres)
5. Publique: `npx wrangler deploy`.
6. Copie a URL `https://...workers.dev` fornecida pela Cloudflare.
7. Abra o **Modo Aprimorado**, importe um vídeo, escolha um corte, informe a URL do Worker e o código de acesso e clique em **Gerar roteiro com IA**.

**Não coloque chaves Gemini ou o código do editor em arquivos públicos, prints ou mensagens.** O modelo usado é `gemini-3.5-flash-lite`. O acesso gratuito depende dos limites e da disponibilidade da sua chave/projeto.

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

## Deploy alternativo via GitHub Actions (sem instalar Node.js)

O workflow `.github/workflows/publicar-roteiro-ia.yml` foi adicionado **somente à branch de testes**. O GitHub só mostra e permite executar workflows `workflow_dispatch` depois que o arquivo estiver na **branch padrão (main)**. Portanto, o botão **Run workflow ainda não ficará disponível** antes de aprovar e mesclar o pull request. Não mescle automaticamente: primeiro configure os segredos e revise as alterações.

No repositório, abra **Settings → Secrets and variables → Actions → New repository secret** e cadastre quatro valores **sem revelá-los no chat nem em commits**:

- `CLOUDFLARE_API_TOKEN`: token da Cloudflare com permissão Workers Scripts Edit na conta correta.
- `CLOUDFLARE_ACCOUNT_ID`: ID da conta Cloudflare.
- `GEMINI_API_KEY`: chave do projeto de API Gemini, com cobrança e limite de gastos configurados.
- `EDITOR_ACCESS_CODE`: senha exclusiva e forte (mínimo 16 caracteres) para uso pessoal do serviço. Esta senha será digitada no editor ao gerar roteiros.

Depois de mesclar o pull request, abra **Actions → Publicar API de Roteiros GTA VI (Cloudflare) → Run workflow** e acompanhe o resultado. O URL do Worker (`https://...workers.dev`) poderá ser copiado do painel da Cloudflare ou do resultado do workflow. Confira essa URL antes de informar no editor. Você também pode executar o deploy local pelo Wrangler seguindo as etapas anteriores.

**Limitação atual:** o código de acesso é compartilhado e não há limite de taxa por identidade/IP. Para disponibilizar a terceiros, implante autenticação e rate limiting no Cloudflare antes de publicar. Proteja seu orçamento e jamais divulgue a URL juntamente com o código.

## Privacidade no nível gratuito Gemini

No plano gratuito do Gemini Developer API, o Google informa que entradas e saídas podem ser utilizadas para melhorar seus produtos. Evite enviar vídeos ou imagens confidenciais. O editor transfere quatro quadros comprimidos e uma transcrição de referência para o Worker, que os encaminha ao Gemini. Verifique os [preços e termos atuais](https://ai.google.dev/gemini-api/docs/pricing) antes de ativar.
