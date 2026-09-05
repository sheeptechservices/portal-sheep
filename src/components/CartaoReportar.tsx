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
import { useEffect, useRef, useState } from 'react';
import {
  IconAlert, IconCheck, IconImage, IconInbox, IconMegafone, IconSpinner, IconTrash, IconUpload,
} from './icons';
import { ListaReportes, type ReporteNaLista } from './ListaReportes';
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
  print?: PrintDoRelato;
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

/** Teto do print. Menor que os 8 MB dos anexos do sistema de propósito: este
 *  aqui viaja dentro de um e-mail, e não para o banco. */
const LIMITE_PRINT = 5 * 1024 * 1024;

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

export function CartaoReportar({
  pagina, enviar, listar, carregarPrint, mudarStatus, podeMudarStatus,
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
  /** Só o dono do painel muda o andamento; o resto do time só lê. */
  podeMudarStatus?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  // Sem valor inicial: obrigatório é obrigatório. Um padrão aqui seria uma
  // resposta que ninguém deu - e "Média" em tudo é o mesmo que urgência nenhuma.
  const [urgencia, setUrgencia] = useState('');
  const [print, setPrint] = useState<{ file: File; url: string } | null>(null);
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

  // A prévia é um blob: sem revogar, cada print escolhido deixa um objeto vivo
  // até a aba fechar.
  useEffect(() => () => { if (print) URL.revokeObjectURL(print.url); }, [print]);

  function receber(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErro('O anexo precisa ser uma imagem.'); return; }
    if (file.size > LIMITE_PRINT) { setErro(`A imagem passa de ${LIMITE_PRINT / 1024 / 1024} MB.`); return; }
    setErro(null);
    setPrint(p => {
      if (p) URL.revokeObjectURL(p.url);
      return { file, url: URL.createObjectURL(file) };
    });
  }

  function tirarPrint() {
    setPrint(p => { if (p) URL.revokeObjectURL(p.url); return null; });
    if (seletor.current) seletor.current.value = '';
    // O foco vai para a área de soltar, que nasce no lugar da prévia: sem isso
    // ele cai no `body` junto com o botão que acabou de sumir, e quem navega
    // por teclado recomeça a ordem do zero.
    requestAnimationFrame(() => solta.current?.focus());
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
      const arquivo = dados.files?.[0]
        ?? [...(dados.items ?? [])].find(i => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile();
      if (arquivo?.type.startsWith('image/')) {
        // Só engole o evento quando havia imagem: colar texto na descrição
        // continua sendo colar texto.
        e.preventDefault();
        receber(arquivo);
      }
    };
    document.addEventListener('paste', aoColar);
    return () => document.removeEventListener('paste', aoColar);
  }, [aberto]);

  const completo = !!texto.trim() && !!urgencia;

  async function mandar() {
    const limpo = texto.trim();
    // Uma queixa por vez, na ordem em que os campos aparecem: listar as duas
    // juntas faz a pessoa reler o cartão inteiro para achar o que faltou.
    if (!limpo) { campo.current?.focus(); return; }
    if (!urgencia) { setErro('Escolha a urgência.'); return; }
    setEnviando(true);
    setErro(null);
    let anexo: PrintDoRelato | undefined;
    if (print) {
      try {
        anexo = {
          nome: print.file.name || 'print.png',
          tipo: print.file.type,
          tamanho: print.file.size,
          base64: await lerComoDataUrl(print.file),
        };
      } catch {
        setEnviando(false);
        setErro('Não foi possível ler a imagem.');
        return;
      }
    }
    const r = await enviar({ texto: limpo, pagina, urgencia, print: anexo });
    setEnviando(false);
    if (r?.error) { setErro(r.error); return; }
    // O relato sai da tela junto com o painel: guardá-lo faria o próximo nascer
    // com o anterior dentro.
    setTexto('');
    setUrgencia('');
    tirarPrint();
    setAberto(false);
    setPronto(true);
    setAviso(r?.aviso ?? null);
  }

  /**
   * Cancelar joga fora o rascunho inteiro - texto, urgência e print.
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
    setUrgencia('');
    tirarPrint();
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

            <span className="reportar-rotulo">Urgência</span>
            <SelectSistema
              valor={urgencia}
              onChange={v => { setUrgencia(v); setErro(null); }}
              placeholder="Escolher…"
              // A lista abre num portal no `body`, fora do alcance de qualquer
              // regra escrita a partir daqui: sem a classe, ela nasce na escala
              // e na cor do sistema, e desce clara e grande sobre o cartão.
              classeLista="reportar-lista"
              // O gatilho é o único pedaço do dropdown que fica sobre o cartão:
              // com o branco do sistema ele seria um retângulo claro no meio
              // das ondas, e na altura de 42px destoaria dos campos daqui.
              estiloGatilho={{
                height: 32, padding: '0 9px', fontSize: 11.5,
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255, 255, 255, .06)',
                color: 'var(--reportar-tinta)',
                // A borda fica na folha, e nao aqui: inline ela venceria o
                // hover, e um campo sem hover destoa de tudo no cartao.

              }}
              opcoes={PRIORIDADES.map(nivel => ({
                valor: nivel as string,
                label: nivel,
                descricao: REGUA[nivel],
                icone: ICONE_PRIORIDADE[nivel]({ size: 14 }),
              }))}
            />

            <span className="reportar-rotulo">Print</span>
            <input
              ref={seletor}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { receber(e.target.files?.[0]); }}
            />
            {print ? (
              <div className="reportar-print">
                <img src={print.url} alt="Prévia do print" />
                <div className="reportar-print-info">
                  <p className="reportar-print-nome">{print.file.name || 'imagem colada'}</p>
                  <p className="reportar-print-peso">{peso(print.file.size)}</p>
                </div>
                <button type="button" className="reportar-print-tirar" onClick={tirarPrint}
                  aria-label="Remover o print">
                  <IconTrash size={12} />
                </button>
              </div>
            ) : (
              // Área de soltar E botão E alvo do colar: três formas de chegar na
              // mesma imagem, porque cada pessoa recorta a tela do seu jeito.
              <button
                type="button"
                ref={solta}
                className={`reportar-solta${arrastando ? ' sobre' : ''}`}
                onClick={() => seletor.current?.click()}
                onDragOver={e => { e.preventDefault(); setArrastando(true); }}
                onDragLeave={() => setArrastando(false)}
                onDrop={e => { e.preventDefault(); setArrastando(false); receber(e.dataTransfer.files?.[0]); }}
              >
                <IconImage size={14} />
                <span>
                  <b>Cole com Ctrl+V</b>
                  <small>ou clique aqui</small>
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
            title={aberto && !completo ? 'Escreva o relato e escolha a urgência.' : undefined}
            onClick={() => (aberto ? void mandar() : setAberto(true))}
          >
            {enviando
              ? <><IconSpinner size={13} /> Enviando…</>
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
          podeMudarStatus={podeMudarStatus}
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
