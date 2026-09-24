# MCP das tarefas

Um servidor MCP remoto no próprio portal, para que a IA (Claude Code, claude.ai,
Cursor e outros clientes MCP) faça pelas tarefas tudo o que a pessoa faz na tela:
listar com filtro, ler o detalhe, criar, editar, mover de etapa, excluir, cuidar
das subtarefas, comentar, responder, marcar pessoas, anexar e baixar anexo.

## Decisões

- **Acesso por pessoa, concedido pelo admin.** Coluna `usuarios.mcp_habilitado`,
  desligada para todos, inclusive master e admin. Só o administrador do sistema
  (`podeGerenciarUsuarios`) vê e mexe no interruptor.
- **Escondido de quem não tem.** Sem acesso, a pessoa não vê menu, tela, instrução
  nem campo de resposta que mencione o MCP. O `me` só manda `mcp: true` para quem
  tem; para os outros o campo não existe.
- **O que a pessoa pode fazer pelo MCP é o que o papel dela já permite.** A matriz
  de permissões, o corte por equipe e as regras de etiqueta valem igual.
- **Sem marca de origem.** O que a IA grava sai assinado pela pessoa conectada,
  sem selo e sem coluna de origem.
- **Exclusão de tarefa incluída**, com `destructiveHint`, só para quem tem
  `tarefas:excluir`.

## Arquitetura

As ferramentas são um adaptador em processo sobre `handleAdminData`: cada uma
chama as ações que a tela já usa, passando o `usuario` resolvido pelo token.
Porteiro, `guardaDaEquipe`, regras de etiqueta, notificações e auditoria vêm
junto, sem segunda cópia de regra.

```
cliente MCP ──POST /api/mcp (Bearer)──> api/mcp.ts
                                          ├─ _mcp/auth.ts        token -> usuario
                                          ├─ _mcp/protocolo.ts   JSON-RPC
                                          └─ _mcp/ferramentas.ts -> handleAdminData
```

### Autorização (OAuth 2.1, o portal como servidor de autorização)

| Caminho | Papel |
|---|---|
| `/.well-known/oauth-protected-resource` | RFC 9728, aponta o servidor de autorização (rewrite para `api/mcp-oauth.ts`) |
| `/.well-known/oauth-authorization-server` | RFC 8414 (rewrite para `api/mcp-oauth.ts`) |
| `POST /api/mcp-oauth/registro` | RFC 7591, cliente público, `token_endpoint_auth_method: none` |
| `GET /mcp/conectar?...` | tela do SPA dentro do `AdminApp`: entra com o Google se preciso e pede consentimento |
| `POST /api/mcp-oauth/token` | `authorization_code` (com PKCE S256) e `refresh_token` |

- A tela `/mcp/conectar` chama a ação `mcp_autorizar` (sessão normal do portal).
  Ela confere `mcp_habilitado`, o cliente e o `redirect_uri`, e devolve a URL de
  retorno com um código de uso único que vale 5 minutos. Sem acesso, a ação
  responde como ação desconhecida (a mesma resposta, por método e por papel) e a
  tela manda a pessoa para o início do portal. Erro de pedido OAuth vem marcado
  com `oauth: true`, e só esse a tela mostra.
- Access token de 1 hora e refresh token de 60 dias, rotativo. O banco guarda
  só o SHA-256 de cada um.
- `redirect_uri`: correspondência exata com o registrado. Aceita `https`, `http`
  só em `localhost`/`127.0.0.1`/`[::1]`, e esquema próprio de aplicativo
  (`cursor://...`, RFC 8252). Recusa `javascript:`, `data:`, `file:` e afins.
- Registro e token passam pelo `checkLoginRateLimit`; só `invalid_grant` conta
  como tentativa falha.
- Tabelas: `mcp_clientes` (id, nome, redirect_uris, criado_em), `mcp_codigos`
  (hash do código, cliente, usuário, redirect_uri, challenge, expira_em) e
  `mcp_tokens` (hash do access, hash do refresh, cliente, usuário, validades,
  criado_em, visto_em).
- Toda chamada ao `/api/mcp` confere três coisas: o token vale, o usuário está
  ativo e `mcp_habilitado = 1`. Falhando qualquer uma, a resposta é 401 com
  `WWW-Authenticate: Bearer resource_metadata="..."`.
- Desligar o interruptor apaga os tokens da pessoa. O Perfil de quem tem acesso
  mostra a URL do MCP e os clientes conectados, com botão de desconectar
  (ações `mcp_conexoes` e `mcp_desconectar`).

### Transporte

`api/mcp.ts`, Streamable HTTP sem estado: POST com um JSON-RPC, resposta JSON,
sem SSE e sem sessão. Métodos: `initialize`, `notifications/initialized`,
`ping`, `tools/list`, `tools/call`. GET e DELETE respondem 405. Sem SDK: o
recorte do protocolo é pequeno, e a casa já escreve essas peças à mão.

O `instructions` do `initialize` descreve o vocabulário do portal e proíbe
travessão longo e médio no texto gravado.

### Ferramentas

O `tools/list` só mostra o que a pessoa pode chamar, conforme `podeAcao`.

| Ferramenta | Por baixo |
|---|---|
| `listar_tarefas` | ação nova `tarefas_filtradas` (`tarefas:ver`) |
| `ver_tarefa` | `tarefa_atividade` + `tarefa_subtarefas` + a linha da tarefa |
| `criar_tarefa` | `salvar_tarefa` |
| `editar_tarefa` | lê a tarefa, aplica o patch, `salvar_tarefa` |
| `excluir_tarefa` | `excluir_tarefa` |
| `adicionar_subtarefa`, `editar_subtarefa`, `excluir_subtarefa` | ações de subtarefa |
| `comentar` | `add_tarefa_comentario` |
| `excluir_comentario`, `joinha_comentario` | ações de mesmo nome |
| `baixar_anexo` | `tarefa_comentario_anexo_base64` |
| `listar_projetos`, `listar_status`, `listar_etiquetas`, `listar_pessoas` | ação nova `tarefas_projetos` (`tarefas:ver`), `tarefa_status_configs`, `tarefa_etiquetas`, `usuarios_notificaveis` |

`tarefas_filtradas` aceita projeto, status, responsável (id, e-mail ou `eu`),
prioridade, etiqueta, entrega, prazo de/até, texto, `incluir_concluidas`,
`limite` (padrão 50, teto 200) e `cursor`. O membro só enxerga tarefa de
projeto em que está na equipe, mais a Geral, como na listagem da tela. A
descrição vem cortada em 300 caracteres; `ver_tarefa` traz inteira.

Status e etiqueta entram pelo nome; pessoa entra por id ou e-mail.

## Erros

- Recusa, validação e a regra de etiqueta voltam como resultado com
  `isError: true` e a mensagem do servidor, para a IA corrigir a chamada.
- Protocolo: códigos JSON-RPC padrão (`-32700`, `-32600`, `-32601`, `-32602`).
- 500 sai genérico para o cliente e detalhado no `console.error`.

## Correção de passagem

`tarefa_subtarefas` (GET) passa a chamar `guardaDaEquipe`: um membro que
soubesse um id lia o passo a passo de tarefa alheia. As três escritas de
subtarefa já estavam guardadas.

## Testes

- `scripts/check-permissoes.mjs` cobre as ações novas.
- `scripts/test-mcp.mjs` (`npm run test:mcp`): OAuth (redirect, PKCE, código
  de uso único, rotação do refresh, corte ao desligar), o esconderijo (mesma
  resposta de ação inexistente, `me` e lista de usuários sem o campo), a
  vitrine por permissão e um passeio pelas ferramentas sobre o handler real.
- Ponta a ponta no `vercel dev` com `claude mcp add --transport http`.

## Fora do escopo

Recursos e prompts MCP, SSE, escopos OAuth granulares, anexo por URL e o resto
do portal (oportunidades, projetos, cofre).
