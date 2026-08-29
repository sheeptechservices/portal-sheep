# Backlog - Demands Pipeline Tool

Registro interno de ideias, melhorias e pendências. **Não é publicado** no `dux-tool-registry` (diferente do `TOOL_DOC.md`). Sirva-se à vontade para editar.

Convenções:
- **Prioridade:** 🔴 alta · 🟡 média · 🟢 baixa
- Ao concluir um item, mova-o para **Concluído** com a data.
- Itens que afetam segurança/exposição de dados devem também ser refletidos no `TOOL_DOC.md` (ver `AGENTS.md`).

---

## 🚀 Em andamento

_(nada no momento - mover para cá o que estiver sendo trabalhado)_

---

## 📋 A fazer

### Infra / autenticação
- [ ] 🟡 **Endurecer o login individual (o que ficou de fora da primeira rodada).**
  O login por conta Google e a autoria por usuário entraram em 2026-08-27 (ver Concluído). O que sobrou:
  - Aposentar a senha compartilhada (`ADMIN_PASSWORD`) quando todo mundo já estiver entrando pelo Google.
  - Trocar o token de sessão do `localStorage` por cookie `httpOnly`/`SameSite` - hoje um XSS alcança o token. Repensar junto o fluxo de entrada por `?session=` na URL.
  - Papéis/permissões (a coluna `usuarios.papel` já existe e não é lida por nada): hoje todo mundo do domínio vê tudo.
  - Trilha de **leitura**: `auditoria` só registra escrita. Abrir card, baixar anexo e exportar CSV seguem sem rastro, e é isso que segura o `access_logging` em `partial`.
  - Tela de Configurações para listar usuários e desativar acesso (`usuarios.ativo` já corta a sessão, mas só via banco).

### Formulários públicos
- [ ] 🟡 _(ex.: melhorias de UX / validação nos formulários de solicitação e onboarding)_

### Painel administrativo
- [ ] 🟡 **Configurar o wizard do formulário de solicitações (aba em Configurações).**
  Hoje a árvore de decisão do formulário de solicitações (perguntas, caminhos SIM/NÃO e o resultado - `fim_type` / fluxo de pagamento) é totalmente **hardcoded** em `src/App.tsx` (`handleDecision` + os nós `node5`, `nodeB`, `nodeA`, `nodeA1`, `nodeA2`, `nodeConvergente`). Criar uma aba em **Configurações** onde o usuário possa montar/editar livremente esse fluxo, sem depender de deploy.
  - Editor visual das perguntas: texto, tooltip, ordem e ramificação (para onde vai no SIM e no NÃO).
  - Definição do resultado de cada caminho terminal (qual fluxo de pagamento / `fim_type`, ou "sem fluxo definido").
  - Persistir a configuração no banco e o formulário público passar a ler dela (fallback para o fluxo atual se não houver config).
  - Cuidado com versionamento: mudanças na árvore não devem quebrar solicitações antigas já gravadas (as `decisions` ficam atreladas à versão vigente na época).
  - _Motivação: dar autonomia ao time para ajustar regras de fluxo sem código (ex.: o ajuste recente do nó convergente teria sido feito pela própria equipe)._ Implementação **futura**.
- [ ] 🟡 _(ex.: pipeline kanban, cadastros, relatórios)_

### Análise de crédito / IA
- [ ] 🟡 _(ex.: ajustes no parecer de crédito, extração de documentos)_

### Integrações
- [ ] 🟢 _(Slack, D4Sign, DEPS, Receita, Google Sheets, Anthropic)_

### Infra / técnico
- [ ] 🟢 _(ex.: autenticação por usuário no painel - hoje é senha compartilhada)_

---

## 💡 Ideias / talvez

- _(anotações soltas que ainda não viraram tarefa)_

---

## ✅ Concluído

- **2026-08-27 - Login por conta Google da DUX + autoria por usuário.** A tela de entrada lidera com o botão oficial do Google (GIS); o servidor valida o ID token contra o JWKS (assinatura RS256, emissor, audiência, validade, e-mail verificado e a claim `hd` do Workspace) e só aceita `@wearedux.com` (`GOOGLE_ALLOWED_DOMAIN`), com convidados avulsos em `ADMIN_GOOGLE_EMAILS`. Nova tabela `usuarios` (upsert por e-mail a cada entrada, `ativo` revoga acesso) e `admin_sessions.usuario_id`: a sessão passou a ter dono. Toda escrita carimba quem fez - eventos e comentários (`autor_id`/`autor_nome`, exibidos no balão), solicitações, cedentes, sacados, liquidez, pendências, aceites, diretrizes e análises (coluna "Analista" na listagem e no CSV) -, e o que não tem coluna própria cai na nova tabela `auditoria`, gravada num ponto único do despacho. A senha compartilhada ficou como plano B, recolhida na tela de entrada, assinando como "Acesso compartilhado". `TOOL_DOC.md` atualizado (`access_logging` de `none` para `partial`).
- _(mover itens finalizados para cá, com data - ex.: `2026-07-06 - descrição`)_
