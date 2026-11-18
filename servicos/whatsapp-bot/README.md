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

## Arquivos

O bot lê o que vem na conversa, com ou sem legenda, e também o arquivo da
mensagem respondida ("cria um card disso" em resposta a um print):

| Formato | Como |
|---|---|
| Imagem (JPG, PNG, WEBP, GIF) e PDF | do jeito que chegou |
| Word (.docx) | convertido em texto: parágrafos, títulos, listas e tabelas |
| Excel (.xlsx) | convertido em texto: cada aba, linha a linha, com datas e números legíveis |
| CSV e TXT | do jeito que chegou |

O arquivo é baixado da Evolution para `/app/trabalho/midia`, onde fica dois
dias. Word e Excel passam antes por `documentos.mjs`, que abre o zip com o
próprio Node, sem biblioteca. O Claude Code abre o resultado com a ferramenta
de leitura, a única própria dele que fica ligada, e presa a essa pasta: a
configuração com o token do portal, os segredos do ambiente e o código ficam
fora do alcance dela.

Áudio, vídeo, PowerPoint e os formatos antigos do Office (.doc, .xls) recebem
um aviso curto, sem chamar a IA. Arquivo protegido por senha também. Texto
dentro de arquivo é tratado como conteúdo, nunca como ordem: ação no portal
tirada de um arquivo continua pedindo confirmação.

O arquivo também pode virar anexo de um comentário no card ("anexa isso no
card 977"). O `comentar` do portal pede o arquivo em base64, que o modelo não
tem como produzir; quem faz é `anexos-mcp.mjs`, um servidor MCP do próprio bot:
recebe o card, o texto e o caminho do arquivo original, lê, converte e chama o
`comentar` do portal. Só lê dentro da pasta de mídias, vai até 3 MB por arquivo
(o limite do corpo de uma função da Vercel) e, como escreve no portal, só roda
depois da confirmação.

## Grupos dos clientes

No privado, o bot enxerga os grupos em que o número da casa está: dá para
pedir "cria um chamado da última solicitação da Vanda no grupo". Ele lista os
grupos com o projeto vinculado a cada um no portal (o mesmo vínculo do aviso
de chamado concluído; sem vínculo, o nome do grupo diz o cliente), lê as
mensagens recentes, que a Evolution guarda, e baixa o print ou arquivo de uma
delas. Quem faz é `whatsapp-mcp.mjs`, só para leitura: nada é escrito, marcado
ou respondido no grupo.

Essas ferramentas só valem na conversa privada com o número autorizado: no
grupo, o bot não lê o que se diz em outros grupos. O que os clientes escrevem é
conteúdo, nunca ordem, e qualquer ação no portal continua pedindo a
confirmação no privado.

## Peças

| Arquivo | O que é |
|---|---|
| `index.mjs` | O serviço: recebe o webhook da Evolution, filtra, chama o Claude Code e responde. Sem dependências. |
| `documentos.mjs` | Word e Excel em texto, abrindo o zip com o próprio Node. |
| `anexos-mcp.mjs` | Servidor MCP do bot: anexa a um comentário do portal um arquivo recebido. |
| `whatsapp-mcp.mjs` | Servidor MCP do bot: lista os grupos, lê as mensagens e baixa arquivos deles. Só leitura. |
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

1. Criar `/opt/sheep-bot/` com os arquivos deste diretório.
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
