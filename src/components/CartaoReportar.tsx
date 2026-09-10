// ─────────────────────────────────────────────────────────────────────────────
//  O convite a reportar, no pé do menu.
//
//  Quem usa o portal todo dia é quem encontra o que está errado nele, e até
//  agora esse achado dependia de a pessoa lembrar de mandar mensagem para
//  alguém. Aqui o caminho é de dois cliques, e do lugar onde ela já está.
//
//  O relato abre dentro do próprio cartão, e não num modal: o que se conta aqui
//  são três linhas e um print, e tirar a pessoa da tela em que ela achou o
//  problema é justamente perder a tela que ela ia descrever.
//
//  O fundo é o palco da tela de entrada em miniatura: as mesmas ondas em WebGL,
//  do shader compartilhado de `lib/ondas` e em configuração reduzida (ver
//  `OndasCartao`), com os dois focos em CSS por baixo como reserva. Ele existe
//  porque o cartão precisa se separar dos itens de navegação sem gritar: parado
//  e chapado, ele viraria mais uma linha do menu.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  IconAlert, IconCheck, IconDoc, IconImage, IconInbox, IconMegafone, IconSpinner, IconTrash,
  IconUpload,
} from './icons';
import { ListaReportes, TIPOS_DO_RELATO, type ReporteNaLista } from './ListaReportes';
import { SelectSistema } from './SelectSistema';
import { ICONE_PRIORIDADE, PRIORIDADES } from '../lib/prioridades';
import { iniciarOndas } from '../lib/ondas';

/** O print anexado, já lido e pronto para viajar no corpo do pedido. */
export interface PrintDoRelato {
  nome: string;
  tipo: string;
  tamanho: number;
  /** Data URL. O servidor separa o cabeçalho antes de anexar ao e-mail. */
  base64: string;
}

export interface Relato {
  texto: string;
  pagina: string;
  urgencia: string;
  /** 'bug' ou 'melhoria'. Quem escreve escolhe porque e quem sabe: de fora, "o
   *  relatorio nao bate" e "queria um relatorio novo" chegam com a mesma cara. */
  tipo: string;
  anexos?: PrintDoRelato[];
}

/**
 * A urgência é a escala de prioridade da casa - as mesmas quatro palavras que
 * já estão em projeto e em tarefa -, mas com a régua deste assunto: aqui o que
 * se mede não é a ordem da fila, e sim o quanto o problema trava quem escreveu.
 *
 * A frase de apoio existe porque "urgente" sem régua vira o padrão de todo
 * mundo: quem escreve está sempre com o problema na frente. Dizer que urgente é
 * trabalho parado dá a régua sem precisar de política.
 */
const REGUA: Record<string, string> = {
  'Urgente': 'Trabalho parado agora',
  'Alta': 'Atrapalha o dia',
  'Média': 'Incomoda, dá para levar',
  'Baixa': 'Quando der',
};

/** Teto de cada anexo. Menor que os 8 MB dos anexos do sistema de propósito:
 *  estes aqui viajam dentro de um e-mail, além de ir para o banco. */
const LIMITE_PRINT = 5 * 1024 * 1024;

/** Quantos cabem num relato. Um problema raramente se explica com um print só -
 *  tem o da tela, o do console e o PDF que o cliente mandou. */
const MAX_ANEXOS = 5;

/** O que se pode anexar: imagem, para o print, e PDF, para o documento. */
const TIPOS_ACEITOS = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];

/** Nunca zero: um arquivo minúsculo arredondado para `0 KB` lê como anexo
 *  vazio, e o que se quer dizer ali é só que ele é leve. */
const peso = (b: number) =>
  b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

/** FileReader em promessa, para o envio poder esperar a leitura do print. */
function lerComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('não foi possível ler a imagem'));
    r.readAsDataURL(file);
  });
}

/**
 * O gatilho é o único pedaço do dropdown que fica sobre o cartão: com o branco
 * do sistema ele seria um retângulo claro no meio das ondas, e na altura de
 * 42px destoaria dos campos daqui. Os dois campos do cartão dividem o mesmo
 * desenho - dois selects lado a lado com métricas diferentes leem como dois
 * componentes distintos.
 *
 * A borda fica na folha, e não aqui: inline ela venceria o hover, e um campo
 * sem hover destoa de tudo no cartão.
 */
const ESTILO_DO_GATILHO: CSSProperties = {
  height: 32, padding: '0 9px', fontSize: 11.5,
  borderRadius: 'var(--radius-sm)',
  background: 'rgba(255, 255, 255, .06)',
  color: 'var(--reportar-tinta)',
};

/** A régua do tipo, na mesma ideia da régua da urgência: sem ela, a escolha
 *  vira gosto, e a mesma queixa chega classificada de um jeito por pessoa. */
const DESCRICAO_DO_TIPO: Record<string, string> = {
  bug: 'Existe e parou de funcionar, ou funciona errado',
  melhoria: 'Não existe ainda, ou existe e podia ser melhor',
};

export function CartaoReportar({
  pagina, enviar, listar, carregarPrint, mudarStatus, mudarTipo, editar, excluir, admin,
}: {
  /** Em que tela a pessoa estava. Vai no e-mail para quem lê não precisar
   *  perguntar "em qual?". */
  pagina: string;
  enviar: (relato: Relato) => Promise<{ error?: string; aviso?: string | null } | null>;
  /** A fila de quem já reportou. Sem ela o botão da lista não aparece - é o que
   *  mantém o cartão montável fora do painel. */
  listar?: () => Promise<{ reportes?: ReporteNaLista[]; error?: string }>;
  carregarPrint?: (id: number) => Promise<{ nome: string; tipo: string; base64: string } | null>;
  mudarStatus?: (id: number, status: string, avisar: boolean, comentario: string) => Promise<{ error?: string; aviso?: string | null } | null>;
  /** Corrigir a classificacao de um chamado, na fila. */
  mudarTipo?: (id: number, tipo: string) => Promise<{ error?: string } | null>;
  /** Corrigir e apagar o proprio chamado. Quem pode e conferido no servidor. */
  editar?: (id: number, texto: string, urgencia: string) => Promise<{ error?: string } | null>;
  excluir?: (id: number) => Promise<{ error?: string } | null>;
  /** Só o dono do painel muda o andamento; o resto do time só lê. */
  /** O dono do painel - ver `ListaReportes`. */
  admin?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  // Sem valor inicial: obrigatório é obrigatório. Um padrão aqui seria uma
  // resposta que ninguém deu - e "Média" em tudo é o mesmo que urgência nenhuma.
  const [urgencia, setUrgencia] = useState('');
  const [tipoDoRelato, setTipoDoRelato] = useState('');
  const [prints, setPrints] = useState<{ file: File; url: string }[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  // Gravou, mas o aviso por e-mail não saiu. Não é erro - o relato está na fila
  // -, e some junto com o agradecimento.
  const [aviso, setAviso] = useState<string | null>(null);
  const [vendoFila, setVendoFila] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const seletor = useRef<HTMLInputElement>(null);
  /** O cartão inteiro, para saber se a colagem tem dono aqui dentro. */
  const raiz = useRef<HTMLDivElement>(null);
  /** A área de soltar. O foco volta para ela quando o print sai: quem tinha o
   *  foco era o botão da lixeira, e ele desaparece no próprio clique. */
  const solta = useRef<HTMLButtonElement>(null);

  // O foco vai para o campo quando ele abre, e não na montagem: `autoFocus`
  // dispararia com o menu, roubando o cursor de quem nem clicou aqui.
  useEffect(() => {
    if (aberto) campo.current?.focus();
  }, [aberto]);

  // O agradecimento não fica na tela para sempre: some sozinho e o cartão volta
  // ao convite, pronto para o próximo achado.
  useEffect(() => {
    if (!pronto) return;
    const t = setTimeout(() => { setPronto(false); setAviso(null); }, 4000);
    return () => clearTimeout(t);
  }, [pronto]);

  // A prévia é um blob: sem revogar, cada arquivo escolhido deixa um objeto vivo
  // até a aba fechar. Só na saída do cartão - revogar a cada mudança da lista
  // apagaria a prévia dos que continuam nela.
  const vivos = useRef<string[]>([]);
  vivos.current = prints.map(p => p.url);
  useEffect(() => () => { vivos.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  function receber(entrada: FileList | File[] | null | undefined) {
    const arquivos = [...(entrada ?? [])];
    if (!arquivos.length) return;
    setErro(null);
    setPrints(atuais => {
      const cabem = MAX_ANEXOS - atuais.length;
      if (cabem <= 0) { setErro(`São no máximo ${MAX_ANEXOS} anexos.`); return atuais; }
      const novos: { file: File; url: string }[] = [];
      for (const file of arquivos.slice(0, cabem)) {
        if (!TIPOS_ACEITOS.includes(file.type)) {
          setErro(`"${file.name}" precisa ser uma imagem ou um PDF.`);
          continue;
        }
        if (file.size > LIMITE_PRINT) {
          setErro(`"${file.name}" passa de ${LIMITE_PRINT / 1024 / 1024} MB.`);
          continue;
        }
        novos.push({ file, url: URL.createObjectURL(file) });
      }
      return novos.length ? [...atuais, ...novos] : atuais;
    });
  }

  function tirarPrint(i: number) {
    setPrints(atuais => {
      const fora = atuais[i];
      if (fora) URL.revokeObjectURL(fora.url);
      return atuais.filter((_, j) => j !== i);
    });
    if (seletor.current) seletor.current.value = '';
    // O foco vai para a área de soltar, que continua ali embaixo: sem isso ele
    // cai no `body` junto com o botão que acabou de sumir, e quem navega por
    // teclado recomeça a ordem do zero.
    requestAnimationFrame(() => solta.current?.focus());
  }

  function tirarTodos() {
    setPrints(atuais => { atuais.forEach(p => URL.revokeObjectURL(p.url)); return []; });
    if (seletor.current) seletor.current.value = '';
  }

  /**
   * Colar direto, enquanto o cartão está aberto.
   *
   * No documento, e não no cartão: o `paste` nativo só nasce no elemento que
   * tem o foco. Preso ao cartão, ele funcionava até a primeira remoção - o
   * botão da lixeira some no mesmo clique que o aciona, o foco cai no `body`, e
   * dali o evento nunca subia até o cartão. O Ctrl+V então parecia ter
   * quebrado, e só voltava depois de clicar em alguma coisa lá dentro.
   *
   * O preço de ouvir no documento é poder roubar um Ctrl+V de outra tela; por
   * isso a colagem que tem dono - um campo, uma área de texto, um editor - só
   * é assumida quando esse dono está dentro do cartão.
   *
   * `clipboardData.files` cobre o print do Windows (Win+Shift+S) e do macOS;
   * `items` é a rede de segurança para navegador que não preenche `files`.
   */
  useEffect(() => {
    if (!aberto) return;
    const aoColar = (e: ClipboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const dono = alvo?.closest?.('input, textarea, [contenteditable="true"]');
      if (dono && !raiz.current?.contains(dono)) return;
      const dados = e.clipboardData;
      if (!dados) return;
      const daArea = [...(dados.files ?? [])];
      const dosItens = [...(dados.items ?? [])]
        .filter(i => i.kind === 'file')
        .map(i => i.getAsFile())
        .filter(Boolean) as File[];
      const colados = daArea.length ? daArea : dosItens;
      if (colados.length) {
        // Só engole o evento quando havia arquivo: colar texto na descrição
        // continua sendo colar texto.
        e.preventDefault();
        receber(colados);
      }
    };
    document.addEventListener('paste', aoColar);
    return () => document.removeEventListener('paste', aoColar);
  }, [aberto]);

  const completo = !!texto.trim() && !!tipoDoRelato && !!urgencia;

  async function mandar() {
    const limpo = texto.trim();
    // Uma queixa por vez, na ordem em que os campos aparecem: listar as duas
    // juntas faz a pessoa reler o cartão inteiro para achar o que faltou.
    if (!limpo) { campo.current?.focus(); return; }
    if (!tipoDoRelato) { setErro('Diga se é um bug ou uma melhoria.'); return; }
    if (!urgencia) { setErro('Escolha a urgência.'); return; }
    setEnviando(true);
    setErro(null);
    let anexos: PrintDoRelato[] = [];
    try {
      // Os arquivos são lidos em paralelo: três anexos são três leituras ao
      // mesmo tempo, e não três esperas em fila.
      anexos = await Promise.all(prints.map(async p => ({
        nome: p.file.name || 'anexo',
        tipo: p.file.type,
        tamanho: p.file.size,
        base64: await lerComoDataUrl(p.file),
      })));
    } catch {
      setEnviando(false);
      setErro('Não foi possível ler um dos anexos.');
      return;
    }
    const r = await enviar({ texto: limpo, pagina, urgencia, tipo: tipoDoRelato, anexos });
    setEnviando(false);
    if (r?.error) { setErro(r.error); return; }
    // O relato sai da tela junto com o painel: guardá-lo faria o próximo nascer
    // com o anterior dentro.
    setTexto('');
    setTipoDoRelato('');
    setUrgencia('');
    tirarTodos();
    setAberto(false);
    setPronto(true);
    setAviso(r?.aviso ?? null);
  }

  /**
   * Cancelar joga fora o rascunho inteiro - texto, tipo, urgência e print.
   *
   * Guardar era a escolha anterior, e ela criava um fantasma: quem cancelou
   * achava que tinha descartado, e no dia seguinte o cartão abria com o relato
   * de antes dentro, pronto para ser enviado por engano. Sair sem gravar é o
   * que "cancelar" quer dizer.
   *
   * O Escape faz o mesmo, e não um fechar mais brando: é o caminho de teclado
   * do mesmo botão, e dois gestos de fechar com efeitos diferentes é o tipo de
   * detalhe que ninguém decora.
   */
  function fechar() {
    setAberto(false);
    setTexto('');
    setTipoDoRelato('');
    setUrgencia('');
    tirarTodos();
    setErro(null);
  }

  return (
    <div className="reportar-cartao" ref={raiz}>
      {/* Duas camadas de luz, atrás de tudo e sem capturar clique. */}
      <span className="reportar-luz" aria-hidden="true" />
      {/* Com a fila aberta, a janela cobre a tela inteira com desfoque, e o
          desfoque e refeito a cada quadro que as ondas pintam por baixo dela -
          era isso que engasgava a rolagem da lista. Elas voltam ao fechar. */}
      <OndasCartao parado={vendoFila} />
      <span className="reportar-veu" aria-hidden="true" />
      <div className="reportar-conteudo">
        {/* O agradecimento e o convite trocam de lugar pelos dois lados: um
            encolhe enquanto o outro cresce, com a opacidade indo junto. Antes o
            convite voltava de estalo depois dos quatro segundos - e um bloco que
            muda de altura num quadro só é notado como falha, não lido. Os dois
            ficam montados; quem decide é a classe. */}
        <div className={`revelar${pronto ? ' aberto' : ''}`}>
          <div>
            <p className="reportar-obrigado">
              <IconCheck size={13} /> Recebido. Obrigado.
            </p>
            {aviso && <p className="reportar-aviso surge">{aviso}</p>}
          </div>
        </div>
        <div className={`revelar${pronto ? '' : ' aberto'}`}>
          <div>
            <p className="reportar-titulo">Achou algo para melhorar?</p>
            <p className="reportar-chamada">Bug, ideia ou dúvida - manda para o time.</p>
          </div>
        </div>

        {/* O formulário nasce montado e fica: com ele nascendo e morrendo, abrir
            e fechar seria um corte, e o rascunho sumiria a cada toque fora. */}
        <div className={`revelar${aberto ? ' aberto' : ''}`}>
          <div>
            <textarea
              ref={campo}
              className="reportar-campo"
              rows={3}
              value={texto}
              maxLength={4000}
              placeholder="O que aconteceu, ou o que faria diferença"
              onChange={e => { setTexto(e.target.value); setErro(null); }}
              onKeyDown={e => {
                if (e.key === 'Escape') { e.preventDefault(); fechar(); }
                // Enviar com Ctrl+Enter, como em toda caixa de texto longo da
                // casa: Enter sozinho aqui é quebra de linha.
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void mandar(); }
              }}
            />

            {/* O tipo vem antes da urgência porque é a pergunta mais fácil, e
                porque é ele que separa a fila em duas leituras: o que quebrou e
                o que falta. Quem escreve é quem sabe - de fora, "o relatório
                não bate" e "queria um relatório novo" chegam iguais. */}
            <span className="reportar-rotulo">Tipo</span>
            <SelectSistema
              valor={tipoDoRelato}
              onChange={v => { setTipoDoRelato(v); setErro(null); }}
              placeholder="Escolher…"
              classeLista="reportar-lista"
              estiloGatilho={ESTILO_DO_GATILHO}
              opcoes={TIPOS_DO_RELATO.map(t => ({
                valor: t.valor,
                label: t.label,
                descricao: DESCRICAO_DO_TIPO[t.valor],
                icone: <t.Icone size={14} />,
              }))}
            />

            <span className="reportar-rotulo">Urgência</span>
            <SelectSistema
              valor={urgencia}
              onChange={v => { setUrgencia(v); setErro(null); }}
              placeholder="Escolher…"
              // A lista abre num portal no `body`, fora do alcance de qualquer
              // regra escrita a partir daqui: sem a classe, ela nasce na escala
              // e na cor do sistema, e desce clara e grande sobre o cartão.
              classeLista="reportar-lista"
              estiloGatilho={ESTILO_DO_GATILHO}
              opcoes={PRIORIDADES.map(nivel => ({
                valor: nivel as string,
                label: nivel,
                descricao: REGUA[nivel],
                icone: ICONE_PRIORIDADE[nivel]({ size: 14 }),
              }))}
            />

            <span className="reportar-rotulo">
              Anexos{prints.length > 0 ? ` (${prints.length} de ${MAX_ANEXOS})` : ''}
            </span>
            <input
              ref={seletor}
              type="file"
              multiple
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={e => { receber(e.target.files); }}
            />

            {prints.map((p, i) => (
              <div className="reportar-print" key={`${p.file.name}-${i}`}>
                {p.file.type === 'application/pdf'
                  ? <span className="reportar-print-doc"><IconDoc size={14} /></span>
                  : <img src={p.url} alt={`Prévia de ${p.file.name}`} />}
                <div className="reportar-print-info">
                  <p className="reportar-print-nome">{p.file.name || 'imagem colada'}</p>
                  <p className="reportar-print-peso">{peso(p.file.size)}</p>
                </div>
                <button type="button" className="reportar-print-tirar" onClick={() => tirarPrint(i)}
                  aria-label={`Remover ${p.file.name || 'o anexo'}`}>
                  <IconTrash size={12} />
                </button>
              </div>
            ))}

            {prints.length < MAX_ANEXOS && (
              // Área de soltar E botão E alvo do colar: três formas de chegar no
              // mesmo arquivo, porque cada pessoa recorta a tela do seu jeito.
              <button
                type="button"
                ref={solta}
                className={`reportar-solta${arrastando ? ' sobre' : ''}`}
                onClick={() => seletor.current?.click()}
                onDragOver={e => { e.preventDefault(); setArrastando(true); }}
                onDragLeave={() => setArrastando(false)}
                onDrop={e => { e.preventDefault(); setArrastando(false); receber(e.dataTransfer.files); }}
              >
                <IconImage size={14} />
                <span>
                  <b>Cole com Ctrl+V</b>
                  <small>{prints.length ? 'ou solte mais aqui' : 'ou clique - vale imagem e PDF'}</small>
                </span>
                <IconUpload size={13} />
              </button>
            )}

            {erro && (
              <p className="reportar-erro surge"><IconAlert size={11} /> {erro}</p>
            )}
          </div>
        </div>

        <div className="reportar-acoes">
          {aberto && (
            <button type="button" className="reportar-voltar surge" onClick={fechar}>
              Cancelar
            </button>
          )}
          <button
            type="button"
            className={`reportar-botao${aberto ? ' primaria' : ''}`}
            disabled={enviando || (aberto && !completo)}
            // Desabilitado enquanto falta campo, mas o `mandar` confere de novo
            // e diz o que falta: botão apagado sem motivo é adivinhação.
            title={aberto && !completo ? 'Escreva o relato, diga o tipo e escolha a urgência.' : undefined}
            onClick={() => (aberto ? void mandar() : setAberto(true))}
          >
            {/* Sem reticências ao lado do giro: ele já diz que está acontecendo,
                e é a regra do sistema para espera dentro de botão. */}
            {enviando
              ? <><IconSpinner size={13} /> Enviando</>
              : <><IconMegafone size={13} /> {aberto ? 'Enviar' : 'Reportar'}</>}
          </button>
          {/* A fila fica ao lado do Reportar, e some com o formulário aberto:
              em 190px de largura um terceiro botão espremeria os dois que
              importam na hora de enviar. */}
          {!aberto && listar && carregarPrint && (
            <button type="button" className="reportar-botao reportar-botao-ico"
              title="Ver os chamados" aria-label="Ver os chamados"
              onClick={() => setVendoFila(true)}>
              <IconInbox size={13} />
            </button>
          )}
        </div>
      </div>

      {vendoFila && listar && carregarPrint && (
        <ListaReportes
          carregar={listar}
          carregarPrint={carregarPrint}
          mudarStatus={mudarStatus}
          mudarTipo={mudarTipo}
          editar={editar}
          excluir={excluir}
          admin={admin}
          onFechar={() => setVendoFila(false)}
        />
      )}
    </div>
  );
}

/**
 * As ondas do cartão - as mesmas da tela de entrada, no shader compartilhado de
 * `lib/ondas`, em versão reduzida.
 *
 * Reduzida no que não se vê: quatro camadas de deformação no lugar de seis e 30
 * quadros por segundo em vez dos 60 do monitor. O loop é do próprio shader, que
 * é periódico e reinicia o relógio sem emenda.
 *
 * E só roda quando está à vista. Fundo animado que continua girando com o menu
 * recolhido, a aba em segundo plano ou o cartão fora da rolagem é GPU acesa para
 * ninguém - o observador cobre os três casos, porque menu recolhido é coluna de
 * largura zero com `overflow: hidden`, e isso zera a área de interseção.
 *
 * Se o WebGL não subir ou cair depois, o canvas sai e ficam os dois focos em CSS
 * que já estavam atrás dele. O cartão nunca fica preto e parado.
 */
function OndasCartao({ parado }: { parado?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [caiu, setCaiu] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el || caiu) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let ondas: ReturnType<typeof iniciarOndas> = null;
    let vigia = 0;
    let aVista = false;

    const desligar = () => {
      window.clearInterval(vigia);
      vigia = 0;
      ondas?.parar();
      ondas = null;
    };
    const rever = () => {
      const deveRodar = aVista && !document.hidden && !parado;
      if (deveRodar && !ondas) {
        ondas = iniciarOndas(el, { camadas: 4, fps: 30 });
        if (!ondas) { setCaiu(true); return; }
        // Contexto perdido no meio do caminho deixaria um quadro congelado na
        // tela, que é pior do que o degradê. Aqui não há remontagem em cadeia
        // como no login: é decoração de menu, cai para o CSS e pronto.
        vigia = window.setInterval(() => {
          if (ondas?.morto()) { desligar(); setCaiu(true); }
        }, 4000);
      } else if (!deveRodar && ondas) {
        desligar();
      }
    };

    const observador = new IntersectionObserver(([e]) => { aVista = e.isIntersecting; rever(); });
    observador.observe(el);
    document.addEventListener('visibilitychange', rever);

    return () => {
      observador.disconnect();
      document.removeEventListener('visibilitychange', rever);
      desligar();
    };
  }, [caiu, parado]);

  if (caiu) return null;
  return <canvas ref={canvas} className="reportar-ondas" aria-hidden="true" />;
}
