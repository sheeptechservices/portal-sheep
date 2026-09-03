# Padrões do sistema Dux

Instruções obrigatórias para qualquer alteração neste repositório. Valem para todo
código novo e para todo código tocado em uma edição, sem exceção e sem precisar ser
repetido a cada pedido.

## 1. Ícones: SVG sempre, emoji nunca

**É proibido usar emoji em qualquer superfície do produto.** Isso inclui telas React,
CSS (`content:`), textos de botão, títulos de card, estados vazios, versões de
impressão/PDF, relatórios exportados e os templates `.docx`. Emoji quebra a identidade
visual, muda de desenho por sistema operacional, não herda a cor do tema e não escala
junto com a tipografia.

Todo ícone é um SVG de traço, e vem de `src/components/icons.tsx`. Esse arquivo é a
fonte única de ícones do sistema.

Especificação do traço (a mesma de todos os ícones já existentes):

```tsx
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
  {/* paths */}
</svg>
```

- `viewBox="0 0 24 24"`, sempre.
- `fill="none"` e `stroke="currentColor"`: o ícone herda a cor do texto, então funciona
  no tema claro e no escuro sem nenhuma regra extra.
- `strokeWidth` entre `1.8` e `2`, com pontas e junções arredondadas.
- `size` como prop com default, nunca dimensão fixa embutida.
- `aria-hidden="true"` quando o ícone é decorativo (há rótulo de texto ao lado);
  quando o ícone é o único conteúdo do botão, o botão leva `aria-label`.
- Ícone de arquivo/tipo usa o wrapper `Ico` que já existe no arquivo.

Antes de desenhar um ícone novo, verifique se ele já existe em `icons.tsx`. Se não
existir, adicione-o lá (com um comentário curto dizendo para que serve) e importe -
não declare SVG solto dentro de uma página.

Estilo do desenho: contorno geométrico, sério, linha única, sem preenchimento sólido,
sem cor própria, sem gradiente, sem cantos vivos. O conjunto tem que parecer desenhado
pela mesma mão.

**Única exceção:** mensagens enviadas ao Slack (`api/slack*.ts`). Ali o emoji é
convenção nativa da plataforma e continua permitido.

## 2. Travessão longo: proibido

**Nunca use travessão longo (—) nem travessão médio (–)** em nada: texto de interface,
comentário de código, mensagem de commit, documentação, prompt de IA, string de
relatório. Também não os introduza reescrevendo texto existente.

Substitutos:
- Aposto ou pausa: hífen cercado de espaços, ` - `.
- Intervalo numérico: `de 10 a 20` ou `10 a 20`.
- Separador em listas e títulos: ` - ` ou `|`.

Isso vale igualmente para o texto que a IA gera em runtime: os prompts do sistema
devem instruir o modelo a não usar travessão longo.

## 3. Consistência estética e de animação

Nada de valor cru quando existe token. Os tokens estão no `:root` de
`src/styles/main.css` e são redefinidos em `:root[data-theme="dark"]`; usar as
variáveis é o que faz o tema escuro funcionar sozinho.

**Cor:** `var(--black)`, `var(--gray)`, `var(--gray2)`, `var(--gray3)`, `var(--gray4)`,
`var(--white)`, `var(--bg)`, `var(--yellow)`, `var(--on-yellow)`, `var(--red)`,
`var(--green)`. Nunca hex literal em componente novo.

**Raio:** `var(--radius-sm | -md | -lg | -pill)`.

**Sombra:** `var(--shadow-card)` em repouso, `var(--shadow-card-hover)` no hover,
`var(--shadow-yellow)` para destaque em amarelo.

**Transição:** só estes três tempos.

| Token | Valor | Quando usar |
|---|---|---|
| `var(--transition)` | `.1s ease` | realce imediato: cor, borda, background de link e item de lista |
| `var(--transition-spring)` | `.18s cubic-bezier(0.4, 0, 0.2, 1)` | movimento e elevação: card, botão, modal, painel |
| `var(--curva-anti)` | `cubic-bezier(0.2, 0.6, 0.2, 1)` | curva para animações longas (troca de tema, revelação) |

Não escreva `transition: border-color .15s` nem `transition: background .12s`. Se o
elemento se move ou muda de elevação, é `--transition-spring`; se só muda de cor, é
`--transition`.

**Hover:** todo elemento clicável tem estado de hover, e elementos do mesmo tipo se
comportam igual. O padrão da casa é card sobe (`translateY(-2px)` +
`--shadow-card-hover` + `--card-hover-bg`), botão escurece/realça a borda, ícone-botão
ganha `--gray4` de fundo. Não invente um hover novo para um botão que já tem irmãos na
tela.

**Foco:** campo de texto realça a borda em `var(--gray2)` com halo `var(--gray4)`.
Não existe anel colorido de foco no sistema - ele saiu em 09/2026 porque ficava na
tela depois do clique e lia como "selecionado". Não reintroduza.

**Campo e dropdown são sempre os da casa.** Nunca `<select>` nativo, nunca
`window.confirm`, nunca `<input type="date">` cru: o menu do sistema operacional
abre com a cor e a fonte dele, ignora o tema escuro e não tem nada do desenho do
portal. Use o que já existe - `SelectSistema`, `SelectLista`, `DatePicker`,
`SeletorPessoas`, os seletores de papel e de etapa - ou monte o novo com a mesma
moldura (`.form-input`), a mesma lista em portal e o mesmo comportamento de
abrir e fechar descritos abaixo. Campo novo com desenho próprio é o começo de um
segundo sistema dentro do primeiro.

**Dropdown:** clicar no gatilho abre, clicar de novo fecha. Não existe dropdown que
abre e no segundo clique não faz nada - o gatilho alterna (`setAberto(a => !a)`),
mesmo quando ele também mede a posição antes. Fechar por clique fora, por rolagem e
por redimensionar vem do `useDropdownDismiss`, com o gatilho e a lista nos refs. A
lista mora num portal no `body`, com `position: fixed` e `z-index: 10050`: dentro do
bloco ela sairia recortada pelo `overflow: hidden` do `.revelar`, e abaixo de 10050
ela nasce atrás da gaveta de tarefa.

**Abrir e recolher:** todo bloco que expande - detalhe de card, grupo de lista,
formulário que nasce dentro de uma seção, painel de busca - usa a classe `.revelar`, que anima
`grid-template-rows` de `0fr` a `1fr` com `--transition-spring`, e não `height` nem
medição em JavaScript. Duas regras vêm junto com ela, e sem elas não há suavidade:

1. O conteúdo tem de estar montado na primeira abertura e **permanecer montado**.
   Montado só enquanto aberto, o bloco anima de nada para nada e o texto aparece de
   supetão - guarde os ids já abertos, como `jaAbertas`.
2. O filho direto do `.revelar` é um `<div>` só, que carrega `overflow: hidden`. O
   conteúdo vai dentro dele.

A seta que acompanha gira 90 graus (`.entrega-seta.aberta`), nunca troca de ícone.

**Resultado de busca e filtro:** a lista que responde a uma busca leva
`.lista-anima` no contêiner, com uma `key` que é a assinatura do resultado (os ids
visíveis, juntos). É a troca da chave que remonta os itens e faz a entrada tocar;
digitar uma letra que não muda o resultado não reanima nada. Trocar o conteúdo de
uma lista em um quadro não é lido, é notado como falha.

Com um editor aberto dentro da lista, congele a chave: a remontagem apagaria o
rascunho de quem está digitando se uma atualização de fundo mudasse o resultado.

**Peça que aparece por condição** - barra de ação, aviso, campo que nasce depois de
uma escolha - leva `.surge`. É a mesma entrada, aplicada ao bloco inteiro em vez de
aos filhos.

**A mesma área trocando de conteúdo** - texto que vira campo, botão que vira campo,
leitura que vira edição - leva `.troca`, que é só opacidade. A peça não nasce nem
some, ela muda de cara: um deslocamento ali leria como se ela tivesse pulado de
lugar.

**Nada aparece, some ou muda de tamanho de estalo.** É regra do sistema, e não
detalhe de uma tela: o olho perde o que salta, e o corte lê como falha da página.
Antes de escrever `{condicao && <bloco/>}`, escolha o padrão:

| O que acontece | Padrão | Por quê |
|---|---|---|
| O bloco empurra o resto da página (formulário que abre, detalhe que expande) | `.revelar` | anima a altura, então o que está embaixo desce junto em vez de saltar |
| A peça nasce sem mexer no resto (aviso, barra de ação, chip) | `.surge` | entra subindo de leve, no lugar onde já cabia |
| A mesma área troca de conteúdo, no mesmo tamanho | `.troca` | só a opacidade muda: a peça continua onde está |
| Lista que responde a busca ou filtro | `.lista-anima` + `key` do resultado | a troca da chave remonta os itens e faz a entrada tocar |
| Modal, gaveta, popup | classes de entrada + `useSaidaSuave` | sem o gancho, a saída nunca roda |

E o que `.revelar` cobre precisa estar **montado antes** de abrir: montado só
enquanto aberto, o bloco anima de nada para nada. Quando o conteúdo tem foco
automático, tire o `autoFocus` (ele dispara na montagem, não na abertura) e mande o
foco por efeito quando o bloco abrir.

Para o que não pode ficar montado - um formulário inteiro que guarda rascunho
próprio -, use `useRevelar`: ele monta o conteúdo um quadro antes de pôr a classe
`aberto`, e na saída tira a classe primeiro e desmonta depois, que é o que dá à
animação de onde sair e para onde ir.

```tsx
const editor = useRevelar(abrindo);
{editor.montado && (
  <div className={`revelar${editor.aberto ? ' aberto' : ''}`}>
    <div><Formulario /></div>
  </div>
)}
```

**Modal, popup e diálogo:** abrem e fecham com animação, nunca com um corte. A
entrada já vem das classes (`.admin-modal-overlay`, `.delete-confirm-modal`); a
saída precisa do gancho `useSaidaSuave`, porque o React desmonta no instante em que
a condição vira falsa e a animação de saída nunca chega a rodar:

```tsx
const { saindo, fechar } = useSaidaSuave(onFechar);
const fundo = useFecharNoFundo(fechar);
<div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`} {...fundo}>
```

Todo caminho de fechar - o fundo, o botão de fechar, o Cancelar, o Escape - chama
`fechar`, e não `onFechar`. Gaveta lateral sai pela direita; diálogo centrado
encolhe de leve, porque ele não veio da borda.

**Movimento reduzido:** animação de entrada, deslocamento e revelação precisa de um
bloco `@media (prefers-reduced-motion: reduce)` que a desligue, como já é feito na
troca de tema.

## 4. Ações de gravar: a tela responde no gesto

Inserir, editar e excluir mudam a tela **antes** de o servidor responder, e voltam
atrás se ele recusar. Ninguém espera a ida e a volta para ver o próprio gesto.

- **Pinta primeiro.** Guarde o estado anterior, aplique a mudança, mande o pedido.
  Deu erro: restaure o que guardou e explique no toast.
- **O painel fecha no gesto.** Nada de `setSalvando(true)` segurando o formulário
  aberto enquanto a gravação vai e volta.
- **Peça nova precisa do id, e só dele.** A ação do servidor devolve o que só ele
  sabe - id, posição na lista, carimbo de data - e a tela monta a linha com o que
  a pessoa acabou de escrever. Nunca recarregue a listagem inteira para ver
  aparecer o que você acabou de criar.
- **A reconciliação vem depois e por baixo.** `reconciliar()` junta rajadas e traz
  o que o servidor deduz sozinho (status e progresso da entrega, por exemplo).
  Ela nunca é esperada com `await` na frente de quem clicou.
- **Nada de laço de requisições.** Três anexos são três pedidos em paralelo, não
  três idas em fila.

## 5. Checklist antes de fechar uma alteração de UI

1. Nenhum emoji novo fora de `api/slack*.ts`.
2. Nenhum travessão longo ou médio no diff.
3. Ícones importados de `src/components/icons.tsx`, com `currentColor`.
4. Cores, raios e sombras via token; nada de hex solto.
5. Transições usando `--transition` ou `--transition-spring`.
6. Hover, foco e `prefers-reduced-motion` cobertos.
7. Bloco que expande usando `.revelar`, com o conteúdo montado uma vez e mantido.
8. Lista que responde a busca com `.lista-anima` e `key` do resultado; peça que
   aparece por condição com `.surge`.
9. Modal fechando por `useSaidaSuave`, com todos os caminhos de fechar passando
   pelo `fechar` do gancho.
10. Dropdown alternando no segundo clique, em portal e acima de qualquer painel.
11. Ação de gravar pintando na hora, com desfazer no erro; nenhuma espera de
    listagem na frente de quem clicou.
12. Conferido nos dois temas (claro e escuro).
