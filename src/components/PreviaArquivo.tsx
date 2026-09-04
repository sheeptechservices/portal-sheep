// ─────────────────────────────────────────────────────────────────────────────
//  Prévia de arquivo.
//
//  Uma janela só para todo anexo do sistema: anexo de projeto, evidência de
//  entrega e arquivo de comentário. Quem chama diz como buscar o conteúdo - o
//  `api` da tela é que carrega o token da sessão -, e a janela cuida do resto:
//  imagem e PDF abrem aqui dentro, o resto oferece o download.
//
//  Morava dentro de `ProjetosPage`, e a conversa da tarefa não conseguia usá-la
//  sem uma importação circular.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconDownload, IconX } from './icons';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';

/** Serve a qualquer anexo do sistema: todos são arquivo com id, e o que muda é
 *  só de onde o conteúdo vem. */
export function PreviaArquivo({ arquivo, onCarregar, onBaixar, onFechar, camada }: {
  arquivo: { nome: string; comentario?: string | null };
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
  }, [arquivo.nome]);

  // Modal em portal não recebe tecla por si: o Esc é escutado na janela.
  useEffect(() => {
    const sair = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', sair);
    return () => window.removeEventListener('keydown', sair);
  }, [onFechar]);

  const imagem = conteudo?.tipo.startsWith('image/');
  const pdf = conteudo?.tipo === 'application/pdf';

  return createPortal(
    <div className={`file-preview-backdrop${saindo ? ' saindo' : ''}`}
      style={{ zIndex: camada ?? 10002 }} {...fundo}>
      <div className="file-preview-modal" onClick={e => e.stopPropagation()}>
        <div className="file-preview-header">
          <span className="file-preview-name">{arquivo.nome}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="file-preview-action" onClick={() => onBaixar()}>
              <IconDownload size={13} />
              Baixar
            </button>
            <button type="button" className="file-preview-close" aria-label="Fechar" onClick={fechar}>
              <IconX size={16} />
            </button>
          </div>
        </div>
        <div className="file-preview-body">
          {erro && <div className="file-preview-unsupported"><p>{erro}</p></div>}
          {!erro && !conteudo && <div className="file-preview-spinner" />}
          {conteudo && imagem && (
            <img src={conteudo.url} alt={arquivo.nome} className="file-preview-img" />
          )}
          {conteudo && pdf && (
            <iframe src={conteudo.url} className="file-preview-iframe" title={arquivo.nome} />
          )}
          {conteudo && !imagem && !pdf && (
            <div className="file-preview-unsupported">
              <p>Visualização não disponível para este formato.</p>
              <button type="button" className="btn btn-primary" style={{ marginTop: 16 }}
                onClick={() => onBaixar()}>
                Baixar arquivo
              </button>
            </div>
          )}
        </div>
        {arquivo.comentario && (
          <p style={{ fontSize: 12.5, color: 'var(--gray)', margin: 0, padding: '12px 20px',
            borderTop: '1px solid var(--gray3)', whiteSpace: 'pre-wrap' }}>
            {arquivo.comentario}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
