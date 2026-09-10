// ─────────────────────────────────────────────────────────────────────────────
//  Prévia de arquivo.
//
//  Uma janela só para todo anexo do sistema: anexo de projeto, evidência de
//  entrega, arquivo de comentário, print de chamado e anexo de oportunidade.
//  Quem chama diz como buscar o conteúdo - o `api` da tela é que carrega o
//  token da sessão -, e a janela cuida do resto: imagem e PDF abrem aqui
//  dentro, o resto oferece o download.
//
//  Ela é tela cheia, e não uma caixa branca no meio da página. Um print de
//  chamado é lido para se achar o detalhe que quem escreveu não soube nomear, e
//  dentro de uma moldura de 960px isso vira apertar os olhos. Aqui a página sai
//  do caminho: o fundo escurece, o arquivo ocupa o que tiver, e as duas ações
//  ficam soltas no canto de cima, onde não disputam com o que se está olhando.
//
//  Morava dentro de `ProjetosPage`, e a conversa da tarefa não conseguia usá-la
//  sem uma importação circular.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconArrowLeft, IconArrowRight, IconDownload, IconX } from './icons';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';

/** Serve a qualquer anexo do sistema: todos são arquivo com id, e o que muda é
 *  só de onde o conteúdo vem. */
export function PreviaArquivo({ arquivo, onCarregar, onBaixar, onFechar, camada, navegacao }: {
  arquivo: {
    nome: string;
    comentario?: string | null;
    /** O que identifica ESTE arquivo. Sem ela vale o nome, e dois anexos com o
     *  mesmo nome nao trocariam de conteudo ao navegar. */
    chave?: string | number;
  };
  /** O buscador vem da página: o `api` carrega o token da sessão. */
  onCarregar: () => Promise<{ tipo: string; base64: string } | null>;
  onBaixar: () => void;
  onFechar: () => void;
  /**
   * Em que camada a prévia abre. O padrão cobre as gavetas do sistema, mas quem
   * a chama de dentro de uma janela que sobe mais alto precisa dizer - a prévia
   * é sempre o que está por cima, e não o que fica atrás de quem a abriu.
   */
  camada?: number;
  /** Quando o arquivo faz parte de um conjunto - os anexos de um chamado, por
   *  exemplo -, a previa vira um folheador: setas no cabecalho, a posicao ao
   *  lado do nome e as setas do teclado. Sem isto ela continua sendo uma janela
   *  de um arquivo so. */
  navegacao?: {
    posicao: number;
    total: number;
    onAnterior: () => void;
    onProximo: () => void;
  };
}) {
  const [conteudo, setConteudo] = useState<{ tipo: string; url: string } | null>(null);
  const [erro, setErro] = useState('');
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);

  useEffect(() => {
    let vivo = true;
    let criada = '';
    (async () => {
      try {
        const r = await onCarregar();
        if (!vivo) return;
        if (!r?.base64) { setErro('O arquivo não veio.'); return; }
        const bytes = Uint8Array.from(atob(r.base64), c => c.charCodeAt(0));
        criada = URL.createObjectURL(new Blob([bytes], { type: r.tipo }));
        setConteudo({ tipo: r.tipo, url: criada });
      } catch {
        if (vivo) setErro('Não foi possível abrir o arquivo.');
      }
    })();
    // A URL do blob segura o arquivo em memória enquanto existir: soltá-la ao
    // fechar evita acumular cópias a cada prévia aberta.
    return () => { vivo = false; if (criada) URL.revokeObjectURL(criada); };
  }, [arquivo.chave ?? arquivo.nome]);

  // Modal em portal não recebe tecla por si: o Esc é escutado na janela.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onFechar(); return; }
      // As setas so mandam quando ha para onde ir: numa previa de arquivo unico
      // elas continuam pertencendo a pagina atras.
      if (!navegacao || navegacao.total < 2) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); navegacao.onAnterior(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); navegacao.onProximo(); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onFechar, navegacao]);

  const imagem = conteudo?.tipo.startsWith('image/');
  const pdf = conteudo?.tipo === 'application/pdf';

  return createPortal(
    // O fundo é a própria tela: clicar nele fecha, e o arquivo no meio segura o
    // clique para quem quiser olhar de perto sem perder a janela.
    <div className={`previa-tela${saindo ? ' saindo' : ''}`}
      style={{ zIndex: camada ?? 10002 }} {...fundo}>
      {/* O nome à esquerda e as ações à direita, os dois soltos sobre o
          arquivo. Sem barra: uma faixa opaca no topo comeria justamente a
          altura que a imagem tem para crescer. */}
      <div className="previa-topo">
        <span className="previa-nome" title={arquivo.nome}>{arquivo.nome}</span>
        <div className="previa-acoes">
          <button type="button" className="previa-botao" title="Baixar"
            aria-label="Baixar" onClick={() => onBaixar()}>
            <IconDownload size={15} />
          </button>
          <button type="button" className="previa-botao" title="Fechar (Esc)"
            aria-label="Fechar" onClick={fechar}>
            <IconX size={16} />
          </button>
        </div>
      </div>

      <div className="previa-palco" onClick={e => e.stopPropagation()}>
        {erro && <div className="previa-recado"><p>{erro}</p></div>}
        {!erro && !conteudo && <div className="dux-spinner-row"><span className="dux-spinner" /></div>}
        {conteudo && imagem && (
          <img src={conteudo.url} alt={arquivo.nome} className="previa-img" />
        )}
        {conteudo && pdf && (
          <iframe src={conteudo.url} className="previa-iframe" title={arquivo.nome} />
        )}
        {conteudo && !imagem && !pdf && (
          <div className="previa-recado">
            <p>Visualização não disponível para este formato.</p>
            <button type="button" className="btn btn-primary" style={{ marginTop: 16 }}
              onClick={() => onBaixar()}>
              Baixar arquivo
            </button>
          </div>
        )}
      </div>

      {/* O que veio escrito junto do anexo, no pé e sobre o escuro: é legenda
          do que está na tela, e não um bloco da ficha. */}
      {arquivo.comentario && (
        <p className="previa-legenda" onClick={e => e.stopPropagation()}>
          {arquivo.comentario}
        </p>
      )}

      {/* O folheador só aparece quando há mais de um: uma seta que não leva a
          lugar nenhum é um botão morto. Fica no pé, e não no topo com as ações -
          passar de anexo é o gesto repetido, e ele não deve dividir espaço com
          o de fechar. */}
      {navegacao && navegacao.total > 1 && (
        <div className="previa-folheador" onClick={e => e.stopPropagation()}>
          <button type="button" aria-label="Anexo anterior" title="Anterior (seta esquerda)"
            onClick={navegacao.onAnterior}>
            <IconArrowLeft size={14} />
          </button>
          <span>{navegacao.posicao} de {navegacao.total}</span>
          <button type="button" aria-label="Próximo anexo" title="Próximo (seta direita)"
            onClick={navegacao.onProximo}>
            <IconArrowRight size={14} />
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
