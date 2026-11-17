# Bot do WhatsApp

O número da casa no WhatsApp conversando com IA. Roda na VPS, ao lado da
Evolution, e responde só ao número autorizado: no privado, ou quando ele
menciona o bot num grupo. Qualquer outra mensagem é ignorada antes de gastar
qualquer coisa.

A IA é o Claude Code rodando com a **assinatura** (não com créditos de API),
ligado ao MCP do portal: consulta, cria, move, edita e comenta cards. Ação que
altera o portal sempre passa por confirmação: o bot propõe, termina com
"Confirma? (sim/não)", e as ferramentas de escrita só ficam liberadas na
mensagem que responde "sim".

## Peças

| Arquivo | O que é |
|---|---|
| `index.mjs` | O serviço: recebe o webhook da Evolution, filtra, chama o Claude Code e responde. Sem dependências. |
| `Dockerfile` | Node 22 com o Claude Code, rodando como usuário comum. |
| `stack.yml` | A stack do Docker Swarm, na mesma rede da Evolution. |

## Segredos

Ficam em `/opt/sheep-bot/segredos.env` na VPS, legível só pelo root:

| Variável | De onde vem |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude setup-token`, no computador de quem tem a assinatura |
| `PORTAL_MCP_TOKEN` | Perfil do portal > Conectar IA > Gerar token para automação |
| `EVOLUTION_APIKEY` | lida da própria Evolution na VPS |
| `WEBHOOK_SEGREDO` | gerado na VPS; vira parte do endereço do webhook |

Nenhum deles vai para o repositório.

## Instalação (na VPS, pelo console)

1. Criar `/opt/sheep-bot/` com os três arquivos deste diretório.
2. Descobrir a rede da Evolution e pôr o nome dela no `stack.yml` (no lugar de
   `REDE_DA_EVOLUTION`).
3. Criar o `segredos.env`: os dois tokens são colados por quem os gerou; a
   chave da Evolution e o segredo do webhook são preenchidos por comando.
4. `docker build -t sheep-bot:1 /opt/sheep-bot`
5. `docker stack deploy -c /opt/sheep-bot/stack.yml sheepbot`
6. Apontar o webhook da instância para o bot (evento `MESSAGES_UPSERT`):
   `http://sheepbot_bot:3000/webhook/<WEBHOOK_SEGREDO>`.

## Uso

- Mande mensagem para o número da casa, do número autorizado.
- Em grupo, mencione o bot (ou responda a uma mensagem dele).
- "nova conversa" zera a memória. A conversa também recomeça sozinha depois de
  6 horas parada.
- Logs: `docker service logs -f sheepbot_bot`.

## Cuidados

- O bot gasta do mesmo saldo da assinatura que você usa no Claude.
- A assinatura é de uso pessoal. Se outras pessoas forem usar o bot, o certo é
  trocar para a API.
- Para revogar o acesso ao portal: Perfil > Conectar IA > Desconectar o
  "Bot do WhatsApp (token fixo)".
