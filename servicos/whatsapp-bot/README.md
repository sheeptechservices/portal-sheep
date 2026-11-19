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

## Mensagens em partes

Quem manda uma mensagem e logo outra para completar recebe uma resposta só.
Cada mensagem é preparada assim que chega (o áudio transcrito, o arquivo
baixado e lido) e entra no lote da conversa; o lote só vai ao Claude Code
depois de um instante de silêncio (`ESPERA_MENSAGENS_MS`, padrão 3 segundos).
Se chegar mais enquanto ele pensa, a resposta pela metade é descartada e o bot
recomeça com tudo junto. A exceção é a ação já confirmada: ela não para no
meio, e o que chegar entra na resposta seguinte. Num grupo, o que o dono e um
convidado mandam ao mesmo tempo fica em lotes separados.

## Internet

Na conversa privada, o bot pesquisa na web e lê páginas (as ferramentas
WebSearch e WebFetch do próprio Claude Code), quando a resposta depende de
algo de fora do portal: uma empresa, um CNPJ, uma notícia, um link mandado.
Ele diz de onde tirou. O que a página diz é conteúdo, nunca ordem: ação no
portal ou no WhatsApp tirada de um site continua pedindo a confirmação. No
grupo ele não navega.

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

## Gráficos e relatórios

"Gráfico da tendência de tarefas do mês", "rank de quem mais concluiu, com
foto", "relatório completo em PDF" (ou em Word). Quem faz é
`relatorios-mcp.mjs`, com três ferramentas:

| Ferramenta | O que faz |
|---|---|
| `dados_de_tarefas` | Busca as tarefas no portal (todas as páginas) e faz as contas no código: por dia, semana, responsável, projeto, etapa ou prioridade, com criadas e concluídas no período, abertas e atrasadas agora, e a foto de cada pessoa. O modelo não conta tarefa de cabeça. |
| `gerar_grafico` | A imagem com a identidade da Sheep: linha (tendência), barras, ranking (com foto, ou as iniciais) e rosca. |
| `gerar_relatorio` | O relatório em PDF ou Word, com capa, números em destaque, seções com texto, tabela e gráfico. |

O desenho fica em `graficos.mjs`: o gráfico é SVG feito ali mesmo, a partir
dos números, e vira PNG num Chromium sem tela, que também imprime o PDF; o
Word sai pelo pacote `docx`. A fonte é a Inter. O navegador não busca nada
fora: as logos e as fotos entram na página já embutidas.

A imagem do WhatsApp e a capa do PDF seguem as peças da marca: o fundo é a
própria arte da Sheep sem as logos (`marca/fundo-luzes-largo.jpg`, e a
quadrada para peça mais alta que larga), com os feixes de luz limão, e as
logos vão em branco. O conteúdo
fica em cartões de vidro escuro, como os do portal, para a luz ficar atrás e
não atrapalhar a leitura. O resto do relatório é claro, para imprimir.

Quando o material é de um cliente, o modelo passa o projeto e a logo do
cliente entra ao lado da da Sheep, com um traço fino entre as duas. A logo vem
do `listar_projetos` do portal (a mesma lista de `src/lib/marcas.ts` que a tela
usa) e é posta em branco: silhueta, quando é uma logo simples, ou branca
vazada, quando tem desenho interno ou fundo chapado (o que tem cor vira branco
e o claro vira vão, como na versão branca da LPA). No Word, que é claro, ela
entra com as cores dela.

O arquivo vai para a pasta de mídias, e o modelo põe na resposta a linha
`[[arquivo:caminho]]`. O bot tira a linha do texto e manda o arquivo antes
dele: imagem como foto, PDF e Word como documento. Só sai arquivo de dentro
da pasta de mídias.

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

E no privado de alguém: "manda pro Raul que a reunião mudou". O número sai de
`procurar_contato`, que procura o nome nos contatos do número da casa, ou dos
participantes de um grupo. Nos dois casos dá para pedir em áudio ("manda um
áudio no grupo dizendo..."): a fala é gerada pelo Kokoro, como a resposta em
áudio, e vai como mensagem de voz. Áudio não marca ninguém.

E com arquivo: um gráfico ou relatório que o bot gerou, ou um arquivo que você
mandou para ele, vai para o grupo ou para o privado de alguém, com o texto de
legenda (imagem como foto, o resto como documento). Só sai arquivo da pasta de
mídias, que guarda dois dias: por isso anexo só se agenda para até dois dias e
sem repetição. A busca de contato olha os contatos salvos e as conversas
recentes do número da casa.

A validação é uma só (`planoDeEnvio`, em `mensagem-grupo.mjs`), para o envio na
hora e o agendado recusarem as mesmas coisas. Fora esses envios, nada é escrito
no WhatsApp: nada é marcado como lido nem reagido.

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
  mensagem, em texto ou áudio, num grupo ou no privado de alguém ("às 11h30
  manda teste no grupo da Tech Squad marcando o Raul", "amanhã às 9h manda um
  áudio pro Raul lembrando da reunião"). Exclusão não se agenda. A mensagem é
  conferida ao agendar (grupo, número, áudio com menção) e, no horário, sai
  pela Evolution.
- Repete todo dia, em dias úteis (pula fim de semana, não feriado), toda semana
  ou todo mês (o dia 31 cai no último dia dos meses mais curtos).
- Fica em `/dados/agenda.json`. Com o bot fora do ar, o que venceu roda quando
  ele volta, com o atraso no aviso; repetição perdida não se acumula.
- `agenda-mcp.mjs` fala com o bot por uma rota interna, que só aceita pedido de
  dentro do contêiner e com a senha da partida.
- Só no privado, como os grupos.
- Tudo em horário de Brasília. O contêiner roda com `TZ=America/Sao_Paulo`, as
  instruções trazem a hora de agora com "amanhã" e "depois de amanhã" já
  contados, e toda mensagem leva o relógio do momento em que chegou. Antes, em
  UTC, perto da meia-noite "amanhã" virava depois de amanhã.

## Peças visuais

`gerar_peca` (servidor de relatórios) faz imagens livres com a identidade da
Sheep: comunicado, anúncio, convite, card de novidade, post. A moldura é fixa
(o fundo com os feixes de luz, a logo da Sheep e a do cliente, a fonte Inter,
o limão e o preto) e o conteúdo é HTML escrito pelo modelo com as classes de um
kit (`cartao`, `rotulo`, `h1`, `selo`, `lista`, `passos`, `grade`, `numero`,
`botao`, `icone`...), em cinco formatos: quadrado, retrato, story, paisagem e
banner. O HTML passa por uma limpeza (sem script, sem estilo próprio, sem
evento, sem emoji) e o navegador não busca nada fora. A ferramenta avisa quando
o conteúdo passa do espaço, para o modelo encurtar. `gerar_grafico` fica só
para números.

## Reuniões e transcrições

O MCP do portal lista as reuniões dos projetos e das oportunidades
(`listar_reunioes`, com o resumo) e traz a transcrição inteira do Fireflies
(`transcricao_da_reuniao`, fala por fala, numerada), cortando pelo que a
pessoa conectada vê. A reunião que não foi anexada a projeto nenhum se acha
direto na conta do Fireflies (`buscar_no_fireflies`, pelo título, por quem
participou e pelo dia, e `resumo_do_fireflies`), e a transcrição e o
documento aceitam o `fireflies_id`. A conta tem as reuniões de todos os
clientes: essas duas ferramentas só existem no privado do dono. `gerar_transcricao` (servidor de relatórios) faz o PDF ou
o Word com a identidade da Sheep, buscando o texto sozinho: o modelo não
reescreve a transcrição, só diz o que muda (falas a remover, trocas de nome ou
de trecho, título, resumo no topo, minutagem). Antes de mandar para um grupo ou
para alguém, o bot manda o arquivo no privado do dono para conferir, e o envio
pede a confirmação de sempre.

## Links das tarefas

O MCP do portal devolve o link de cada tarefa (`/tarefas/<id>`) em
`listar_tarefas`, `ver_tarefa` e `criar_tarefa`. O bot manda o link quando
pedem, quando uma preferência pede ("sempre manda o link junto da lista") ou
quando acabou de criar a tarefa, como texto puro para o WhatsApp torná-lo
clicável. `ver_tarefa` também diz quem já abriu a tarefa no portal.

`listar_projetos` traz os links de cada projeto em `links`: `portal` (a ficha
do projeto, para o time), `chamados` (o painel do cliente, `/chamados/<token>`),
`acompanhamento` (a página `/p/<token>`, só quando publicada) e `sistema` (o
endereço do que foi entregue). Os dois do cliente abrem sem senha, então o bot
só os manda no grupo do próprio cliente ou no privado de quem pediu.

## De que cliente é cada grupo

`vinculos.mjs` liga grupo, cliente, projeto e links pelos cadastros do portal:
primeiro o grupo vinculado no projeto; sem vínculo, o nome do grupo, casando o
nome do cliente, do projeto ou o código como palavra inteira (o nome da casa e
palavras de grupo, como "suporte" e "squad", não contam). Achado o cliente, vêm
todos os projetos dele com os links. Ao responder num grupo, o bot recebe isso
na nota do sistema (com os projetos guardados por 5 minutos); no privado,
`listar_grupos` traz o mesmo em `cliente`. Dois clientes no nome ficam marcados
como ambíguos, e aí o bot pergunta.

## Preferências de estilo

O dono ensina o jeito de o bot escrever pelo próprio WhatsApp: "a partir de
agora, resumos em tópicos, no máximo cinco", "para de usar negrito". O bot
grava a preferência numa frase e diz o que gravou; "quais preferências você
tem?" mostra a lista, e "esquece a dos tópicos" apaga.

- Só o dono, e só no privado dele. No grupo e para o convidado, as ferramentas
  nem chegam ao modelo.
- A preferência vale em toda conversa: no privado, nos grupos e com o
  convidado. A que fala do dono em pessoa (como chamá-lo) vale só com ele.
- Ajusta o estilo, nunca a regra: confirmação, permissões, discrição, quem pode
  o quê e a proibição do travessão ficam no código, acima das preferências. O
  travessão que vier numa preferência vira hífen já ao gravar.
- Até 30 preferências de até 300 caracteres, em `/dados/preferencias.json`.
  `preferencias-mcp.mjs` fala com o bot pela mesma rota interna protegida da
  agenda.

## Peças

| Arquivo | O que é |
|---|---|
| `index.mjs` | O serviço: recebe o webhook da Evolution, filtra, chama o Claude Code e responde. |
| `documentos.mjs` | Word e Excel em texto, abrindo o zip com o próprio Node. |
| `anexos-mcp.mjs` | Servidor MCP do bot: anexa a um comentário do portal um arquivo recebido. |
| `whatsapp-mcp.mjs` | Servidor MCP do bot: lista os grupos, lê as mensagens, baixa arquivos, diz quem está no grupo e manda mensagem com menção (depois da confirmação). |
| `relatorios-mcp.mjs` | Servidor MCP do bot: números das tarefas, gráficos e relatórios. |
| `graficos.mjs` e `marca/` | O desenho dos gráficos e dos relatórios, com a logo da Sheep. |
| `voz.mjs` e `falar.py` | Texto em mensagem de voz, com o Kokoro e o ffmpeg, na própria máquina. |
| `transcricao.mjs` | Áudio em texto, com o ffmpeg e o whisper.cpp, na própria máquina. |
| `mensagem-grupo.mjs` | Monta e confere o envio (grupo ou privado, texto com menções ou áudio), igual na hora e no agendado. |
| `agenda-mcp.mjs` | Servidor MCP do bot: agenda, lista e cancela ações no portal e mensagens nos grupos para um horário. |
| `preferencias-mcp.mjs` | Servidor MCP do bot: grava, lista e apaga as preferências de estilo do dono. |
| `Dockerfile` | Node 22 com o Claude Code, o ffmpeg, o whisper.cpp (compilado numa etapa à parte), o Kokoro (num ambiente Python próprio) e o Chromium com a fonte Inter, rodando como usuário comum. |
| `package.json` | As duas dependências dos gráficos e relatórios: `puppeteer-core` e `docx`. O resto do bot não usa pacote nenhum. |
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

## Convidados

Outros números da equipe podem conversar com o bot num teste, no privado e nos
grupos, pela variável `NUMEROS_CONVIDADOS` (`5544991448215:Raul`, separados por
vírgula). O bot sabe com quem fala. Com o convidado ele só consulta: responde
sobre o portal, lê arquivos, gera gráficos e relatórios, pesquisa na internet e
fala em áudio. Não grava nada no portal, não lê os grupos dos clientes, não
manda nada em nome da casa e não agenda: essas ferramentas nem chegam ao modelo
quando é o convidado quem fala. E o "sim" dele, num grupo, não dispara a
proposta que o bot fez ao dono: a confirmação fica presa a quem pediu.

A assinatura do Claude é de uso pessoal: para liberar para a equipe de vez, o
certo é passar o bot para a API.

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
