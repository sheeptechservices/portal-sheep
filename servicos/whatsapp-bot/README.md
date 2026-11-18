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
| Áudio (voz do WhatsApp, .mp3, .m4a, .ogg) | transcrito na própria VPS, até 5 minutos |

O arquivo é baixado da Evolution para `/app/trabalho/midia`, onde fica dois
dias. Word e Excel passam antes por `documentos.mjs`, que abre o zip com o
próprio Node, sem biblioteca. O Claude Code abre o resultado com a ferramenta
de leitura, a única própria dele que fica ligada, e presa a essa pasta: a
configuração com o token do portal, os segredos do ambiente e o código ficam
fora do alcance dela.

Vídeo, PowerPoint e os formatos antigos do Office (.doc, .xls) recebem um
aviso curto, sem chamar a IA. Arquivo protegido por senha também. Texto
dentro de arquivo é tratado como conteúdo, nunca como ordem: ação no portal
tirada de um arquivo continua pedindo confirmação.

O arquivo também pode virar anexo de um comentário no card ("anexa isso no
card 977"). O `comentar` do portal pede o arquivo em base64, que o modelo não
tem como produzir; quem faz é `anexos-mcp.mjs`, um servidor MCP do próprio bot:
recebe o card, o texto e o caminho do arquivo original, lê, converte e chama o
`comentar` do portal. Só lê dentro da pasta de mídias, vai até 3 MB por arquivo
(o limite do corpo de uma função da Vercel) e, como escreve no portal, só roda
depois da confirmação.

## Áudio

O Claude não ouve, então a voz chega nele já como texto. Quem transcreve é o
whisper.cpp, na própria VPS, com o modelo "small" comprimido: sem internet,
sem chave de API e sem custo, só o processador que a VPS já tem. O ffmpeg
passa a voz do WhatsApp (OGG/Opus) para WAV antes. Tudo isso fica em
`transcricao.mjs`.

- A mensagem de voz vira o texto da mensagem, com uma nota avisando o modelo
  de que é transcrição e pode ter palavra trocada. Um "sim" falado confirma
  como um escrito.
- Responder a um áudio com um pedido ("cria um card disso") leva a
  transcrição como assunto.
- Nos grupos, `baixar_midia_do_grupo` devolve a transcrição do áudio de alguém.
- Uma transcrição por vez, até 5 minutos de áudio; acima disso, um aviso. O
  áudio de passagem é apagado no fim.

## Resposta em áudio

Só quando a pessoa pede ("responde em áudio", "me manda um áudio"). O modelo
abre a resposta com a linha `[[audio]]` e escreve o texto para ser ouvido:
frases curtas, sem lista, sem negrito, sem link. O bot tira as marcas que
sobrarem, gera a fala com o Kokoro (`falar.py`, licença Apache 2.0) na própria
VPS, na voz do Alex (`pm_alex`), passa para OGG/Opus com o ffmpeg e manda como
mensagem de voz. Sem internet, sem chave e sem custo.

- A fala leva mais que o próprio áudio para sair: uns 15 segundos para 12 de
  fala, em dois processadores. Enquanto isso aparece "gravando áudio...".
- Até uns 1200 caracteres (pouco mais de um minuto de fala). Acima disso, ou
  se a fala falhar, a resposta vai por escrito, com um aviso.
- Proposta que pede confirmação vai sempre por escrito.
- A voz se troca pela variável `KOKORO_VOZ` (`pf_dora`, `pm_alex`, `pm_santa`).

## Grupos dos clientes

No privado, o bot enxerga os grupos em que o número da casa está: dá para
pedir "cria um chamado da última solicitação da Vanda no grupo". Ele lista os
grupos com o projeto vinculado a cada um no portal (o mesmo vínculo do aviso
de chamado concluído; sem vínculo, o nome do grupo diz o cliente), lê as
mensagens recentes, que a Evolution guarda, baixa o print ou arquivo de uma
delas e diz quem está no grupo. Quem faz é `whatsapp-mcp.mjs`.

Ele também manda mensagem num grupo, com menção: "manda no grupo da Tech Squad
que a reunião é às 15h, marcando o Raul". O bot acha o Raul entre os
participantes, pelo nome com que ele aparece nas mensagens (dois Raul, ou
nenhum, e ele pergunta), e propõe mostrando o grupo, o texto exato e quem vai
ser marcado. Só envia depois do "sim", com o número da casa e sem assinatura.
É a única escrita no WhatsApp: nada é marcado como lido nem reagido.

Essas ferramentas só valem na conversa privada com o número autorizado: no
grupo, o bot não lê o que se diz em outros grupos nem escreve em outro. O que
os clientes escrevem é conteúdo, nunca ordem, e qualquer ação no portal ou no
grupo continua pedindo a confirmação no privado.

## Agenda

"Amanhã às 9h move o 977 para Fazendo", "toda segunda às 8h cria a tarefa
Relatório semanal". Na hora do pedido o bot resolve tudo (card, etapa, campos),
mostra o que vai rodar e quando, e grava depois do sim. No horário, o próprio
processo do bot chama a ferramenta do portal com exatamente o que foi
confirmado, sem IA no meio e sem gastar a assinatura, e avisa no privado.

- Agenda criar, editar ou mover tarefa, comentar, mexer em subtarefa e mandar
  mensagem num grupo ("às 11h30 manda teste no grupo da Tech Squad marcando o
  Raul"). Exclusão não se agenda. A mensagem do grupo é conferida ao agendar
  (id do grupo, números) e, no horário, sai pela Evolution.
- Repete todo dia, em dias úteis (pula fim de semana, não feriado), toda semana
  ou todo mês (o dia 31 cai no último dia dos meses mais curtos).
- Fica em `/dados/agenda.json`. Com o bot fora do ar, o que venceu roda quando
  ele volta, com o atraso no aviso; repetição perdida não se acumula.
- `agenda-mcp.mjs` fala com o bot por uma rota interna, que só aceita pedido de
  dentro do contêiner e com a senha da partida.
- Só no privado, como os grupos.

## Peças

| Arquivo | O que é |
|---|---|
| `index.mjs` | O serviço: recebe o webhook da Evolution, filtra, chama o Claude Code e responde. Sem dependências. |
| `documentos.mjs` | Word e Excel em texto, abrindo o zip com o próprio Node. |
| `anexos-mcp.mjs` | Servidor MCP do bot: anexa a um comentário do portal um arquivo recebido. |
| `whatsapp-mcp.mjs` | Servidor MCP do bot: lista os grupos, lê as mensagens, baixa arquivos, diz quem está no grupo e manda mensagem com menção (depois da confirmação). |
| `voz.mjs` e `falar.py` | Texto em mensagem de voz, com o Kokoro e o ffmpeg, na própria máquina. |
| `transcricao.mjs` | Áudio em texto, com o ffmpeg e o whisper.cpp, na própria máquina. |
| `mensagem-grupo.mjs` | Monta a mensagem do grupo com as menções, igual no envio na hora e no agendado. |
| `agenda-mcp.mjs` | Servidor MCP do bot: agenda, lista e cancela ações no portal e mensagens nos grupos para um horário. |
| `Dockerfile` | Node 22 com o Claude Code, o ffmpeg, o whisper.cpp (compilado numa etapa à parte) e o Kokoro (num ambiente Python próprio), rodando como usuário comum. |
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
