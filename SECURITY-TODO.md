# SECURITY-TODO

Auditoria de 2026-07-28 · leitura estática de `api/` (21 handlers), `src/admin/`, `src/portal/`, `vercel.json`.
Detalhamento e caminhos de exploração: `SECURITY-AUDIT.md`.

Status: `[ ]` aberto · `[x]` corrigido

---

## Crítico

**[ ] A-1 - XSS armazenado rouba o token de admin**
`api/submit-file.ts:32` · `src/admin/SolicitacoesPage.tsx:3222,3242,3308`
Upload público aceita `arquivo.tipo` sem validar; o admin cria o Blob com esse MIME e o teste é `includes('pdf')`. `"text/html;x=pdf"` renderiza como HTML em iframe sem sandbox; `blob:` herda a origem e o script lê o token do `localStorage`.
→ MIME do Blob por allowlist (nunca do campo `tipo`); `=== 'application/pdf'`; `sandbox=""` no iframe; validar magic-byte no servidor.

**[ ] A-2 - `/api/d4sign` sem auth vaza as credenciais da D4Sign**
`api/d4sign.ts`
Sem `validateAdminSession` e com `Access-Control-Allow-Origin: '*'`. O `embedUrl` retornado contém `tokenAPI` e `cryptKey` em texto claro. Também permite emitir PDF de aceite com conta de escrow arbitrária na conta legítima da DUX.
→ Exigir sessão; remover CORS `*`; nunca devolver as chaves ao cliente (proxy server-side); **rotacionar `D4SIGN_API_KEY` e `D4SIGN_CRYPT_KEY`** (ver A-5 antes de rotacionar).

**Código corrigido em 2026-08-28:** o endpoint passou a exigir `x-admin-session`
(checada antes de qualquer coisa, inclusive antes de revelar se a integração
está configurada), o CORS `*` e o `OPTIONS` saíram, o `embedUrl` **deixou de ser
devolvido** - as credenciais não saem mais do servidor, ficam só dentro do
`d4fetch` - e `action=create` grava linha em `auditoria`. O espelho do dev em
`vite.config.ts` foi trancado igual. Nada no `src/` chamava este endpoint: o
fluxo de assinatura hoje é o canvas do portal de aceite, então a correção não
tirou funcionalidade de ninguém.

**O item segue aberto pelo que falta:** as chaves ficaram públicas por meses e
**não foram rotacionadas**. Enquanto isso não acontecer, quem já as capturou
segue com a conta da D4Sign na mão e com a chave do cofre (ver A-5). Considerar
`D4SIGN_API_KEY` e `D4SIGN_CRYPT_KEY` comprometidas.

---

## Alto

**[ ] A-3 - `register-cedente` apaga e assume cadastro de terceiro**
`api/register-cedente.ts:39-62`
Sem prova de posse do CNPJ: sobrescreve `email_responsavel` e executa `DELETE FROM cedente_arquivos`. Cadastro `rejeitado` volta a `pendente` a cada reenvio.
→ Prova de posse (código no e-mail já registrado); nunca deletar por rota pública; `rejeitado` terminal → `409`; rate limit.

**[ ] A-4 - cerca de cedente contornável com CNPJ malformado**
`api/submit.ts:67-78`
Toda a autorização vive dentro de `if (cnpjDigits.length === 14)`. CNPJ curto pula a checagem e insere. É o degrau de entrada do A-1.
→ Inverter: `if (length !== 14) return 400`; gerar `id` e `createdAt` no servidor; rate limit.

**[x] A-5 - `D4SIGN_CRYPT_KEY` era a chave-mestra do cofre de credenciais**
`api/_credentials.ts`
Fallback `APP_ENCRYPTION_KEY || D4SIGN_CRYPT_KEY`: a chave que o A-2 vaza protegia o cofre. Rotacionar a D4Sign quebrava o cofre em silêncio (`catch` retornava `null` sem log).

**Corrigido em 2026-08-28:** foi gerada uma `APP_ENCRYPTION_KEY` própria (48
bytes de entropia), a única credencial do cofre (a chave da Anthropic) foi
**recifrada** com ela e conferida lendo de volta do banco, o fallback para a
`D4SIGN_CRYPT_KEY` saiu do `masterKey()` e a falha de decriptação passou a ser
logada em vez de virar `null` calado. Cofre e D4Sign agora são independentes:
rotacionar uma não mexe na outra.

**Atenção operacional:** `APP_ENCRYPTION_KEY` virou obrigatória. Sem ela o cofre
não abre - o ambiente que não a tiver cai no fallback de env (`ANTHROPIC_API_KEY`)
ou perde a integração. Precisa estar definida na Vercel **antes** do próximo
deploy.

**[ ] A-6 - nenhum cabeçalho de segurança**
`vercel.json`
Sem CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, HSTS. É o que transforma o A-1 em exfiltração.
→ Bloco `headers` com CSP (`connect-src` restrito). Validar workers de `tesseract.js`/`pdfjs-dist` (`worker-src 'self' blob:`).

---

## Médio

**[ ] A-7 - token em `localStorage` e aceito via `?session=`**
`src/admin/AdminApp.tsx:614-635,450` · `SolicitacoesPage.tsx:3206`
Token legível por JS. O caminho `?session=` não é gerado por nada no repo - superfície sem uso que vaza em histórico, `Referer` e preview de link.
→ Remover `?session=`; migrar para cookie `HttpOnly; Secure; SameSite=Strict` + CSRF; guardar hash do token no banco; encurtar as 8h (`_admin-handler.ts:409`).

**[ ] A-8 - `/api/slack` e `/api/slack-cadastro` sem auth: phishing interno**
`api/slack.ts:81` · `api/slack-cadastro.ts:33`
Anônimo injeta `mrkdwn` arbitrário e o bot oficial entrega por DM ao time de operações.
→ Disparar dentro de `api/submit.ts` (server-side) e despublicar as rotas; escapar `mrkdwn`; nunca aceitar `blocks` do cliente.

**[ ] A-9 - `check-cedente` é oráculo público da carteira**
`api/check-cedente.ts:24-33`
Distingue `pending` de `rejected` sem auth e sem rate limit → enumera clientes e decisões de crédito.
→ Colapsar em resposta neutra; rate limit (10/h por IP); BotID/CAPTCHA.

**[ ] A-10 - senha única, sem identidade, sem trilha de auditoria**
`api/admin-data.ts` · `_admin-handler.ts`
Uma senha para tudo; `admin_sessions` não gravava quem logou; `solicitacao_eventos` não tinha autor. Sem papéis, sem MFA.

**Corrigido em 2026-08-28, em duas etapas.** Primeiro entrou o login individual
por conta Google do domínio, com `usuarios`, `admin_sessions.usuario_id`, autoria
nas entidades editáveis e a tabela `auditoria`. Depois a senha compartilhada foi
**removida do sistema**: a ação `login` responde 410, o formulário saiu da tela
(e o CSS dele também), a env var foi apagada e `getAdminSession` passou a recusar
sessão sem dono - o que mata na hora as que estavam abertas, em vez de deixá-las
gravando anônimo até expirar. Não existe mais escrita sem pessoa.

**O que resta deste item:** papéis (`usuarios.papel` existe e nada lê dele, então
todo mundo do domínio vê tudo) e trilha de **leitura** (abrir card, baixar anexo e
exportar CSV não deixam rastro; é o que segura `access_logging` em `partial`).
MFA agora é herdado da política do Workspace - se a DUX exigir verificação em duas
etapas, o Portal exige junto.

**[ ] A-11 - `cnpj-lookup` é proxy aberto para APIs pagas**
`api/cnpj-lookup.ts:89`
Terceiros consomem a cota da DUX; rate limit do provedor derruba o formulário para clientes reais.
→ Rate limit por IP; cachear respostas em tabela própria.

**[ ] A-12 - upload sem validação de tipo nem limite de volume**
`api/submit-file.ts` · `api/register-cedente-file.ts` · `api/admin-data.ts:13`
Sem MIME allowlist, sem magic-byte, sem limite de quantidade. Base64 em coluna `TEXT` (+33% de custo).
→ Helper compartilhado de validação; limite por solicitação/cadastro; migrar binários para Vercel Blob; download com `Content-Disposition: attachment` + `nosniff`.

**[ ] A-13 - rate limit só no login, ancorado em header**
`api/admin-data.ts:23` · `_admin-handler.ts:426-439`
`x-forwarded-for` com `.split(',')[0]` é o padrão falsificável. Nenhuma outra rota pública tem limite.
→ Usar `x-real-ip`/`x-vercel-forwarded-for`; helper de rate limit em toda rota pública; Vercel Firewall/BotID. **Confirmar em produção** se `x-forwarded-for` do cliente chega ao handler.

**[ ] A-15 - texto de terceiro entra no prompt sem cerca**
`api/ai-parecer.ts` · `api/analise-credito.ts` · `api/deps-consulta.ts`
Rotas exigem sessão, mas documentos de cedentes chegam ao prompt como texto livre - alvo é a decisão de crédito.
→ Delimitar (`<documento_do_cedente>`) e afirmar no system prompt que é dado, nunca instrução; manter decisão humana registrada. O padrão de validar saída contra o banco (`ai-parecer.ts:146-150`) já está certo - estender.

---

## Baixo

**[x] A-14 - comparação de senha não era timing-safe**
`api/admin-data.ts` - `pwd !== process.env.ADMIN_PASSWORD`
Resolvido por remoção em 2026-08-28: não há mais senha para comparar (ver A-10).
Vale registrar que o valor em uso era o nome da empresa mais o ano, ou seja,
adivinhável em poucas tentativas - o que torna prudente assumir que o painel
pode ter sido acessado por terceiros antes desta data. A auditoria por usuário
começa agora; não há como reconstruir o que houve antes.

---

## Ordem de execução

**Hoje:** A-2 → A-5 → A-1 → A-4 → A-6 → A-7 (remover `?session=`)
**Semana:** A-12 → A-3 → A-8 → A-13 → A-9
**Mês:** A-10 → A-7 (cookie) → A-11 → A-15

---

## Pendências de verificação (fora do alcance da leitura estática)

- [ ] `x-forwarded-for` enviado pelo cliente chega ao handler na Vercel? (define severidade de A-13)
- [ ] `dist/` publicado contém source maps?
- [ ] Escopos reais do `SLACK_BOT_TOKEN`
- [ ] `TURSO_AUTH_TOKEN` é full-access? Existe token com escopo menor por ambiente?
- [ ] Preview deployments públicos apontando para o banco de produção
- [ ] `scripts/` (`import-cedentes-direct.py`, `migrate-*.mjs`) - credencial no histórico do git?

---

## Nota

`TOOL_DOC.md` não foi atualizado: ele replica para o `dux-tool-registry` company-wide, e descrever o vazamento do A-2 antes da rotação amplia a exposição. Sequência: corrigir A-2/A-5 → rotacionar → registrar em **Warnings** e reavaliar **Data Exposure & Leak Surface** (A-1, A-2, A-3, A-9 são `**open**`). `audit_status`/`audit_date` são campo de auditor humano.
