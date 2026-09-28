// ─────────────────────────────────────────────────────────────────────────────
//  A caixa de marcar um objetivo como feito.
//
//  A prova é opcional: quem tem o print anexa ali mesmo, e quem não tem marca
//  do mesmo jeito. Um print entra arrastado, escolhido ou colado com Ctrl+V - a
//  colagem é ouvida na janela inteira, porque o foco raramente está onde se
//  imagina.
//
//  Morava dentro do balão de objetivos, e saiu de lá quando a Planning passou a
//  pedir a mesma coisa: é o mesmo gesto, na mesma semana, sobre o mesmo
//  objetivo - duas caixas divergiriam no primeiro ajuste.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconClip, IconUpload, IconX } from './icons';
import { Dialogo } from './Dialogo';
import { arquivosColados } from '../lib/colarArquivos';

/** O teto de uma prova: o mesmo do anexo de comentário, e o do servidor. */
export const LIMITE_DE_PROVA = 8 * 1024 * 1024;

/** Quantas provas cabem de uma vez. Cinco prints já contam a história; mais que
 *  isso é anexo procurando problema. */
const MAX_DE_PROVAS = 5;

/** O tamanho de um arquivo, para quem lê. */
function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function CaixaDaProva({ texto, onFechar, onConfirmar }: {
  /** O objetivo que está sendo marcado, para a caixa dizer do que se trata. */
  texto: string;
  onFechar: () => void;
  onConfirmar: (arquivos: File[]) => void;
}) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erro, setErro] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  // O `Dialogo` confirma depois da animação de saída; o que foi escolhido vai
  // por aqui, e não pelo estado de quando o clique aconteceu.
  const escolhidos = useRef<File[]>([]);
  escolhidos.current = arquivos;

  const somar = useCallback((lista: File[]) => {
    const grandes = lista.filter(f => f.size > LIMITE_DE_PROVA);
    const cabem = lista.filter(f => f.size <= LIMITE_DE_PROVA);
    setErro(grandes.length
      ? `"${grandes[0].name}" passa de 8 MB. Mande um recorte ou um arquivo menor.`
      : '');
    if (cabem.length) setArquivos(a => [...a, ...cabem].slice(0, MAX_DE_PROVAS));
  }, []);

  useEffect(() => {
    const colar = (e: ClipboardEvent) => {
      const colados = arquivosColados(e.clipboardData);
      if (!colados.length) return;
      e.preventDefault();
      somar(colados);
    };
    window.addEventListener('paste', colar);
    return () => window.removeEventListener('paste', colar);
  }, [somar]);

  return (
    <Dialogo
      titulo="Marcar como feito"
      descricao={<>Se tiver, anexe a evidência de que <strong>{texto}</strong> foi cumprido.</>}
      rotuloOk="Marcar como feito"
      perigo={false}
      zIndex={10060}
      largura={440}
      onFechar={onFechar}
      onConfirmar={() => onConfirmar(escolhidos.current)}
    >
      <div className="objetivos-prova">
      <div
        className={`objetivos-prova-area${arrastando ? ' arrastando' : ''}`}
        role="button" tabIndex={0}
        onClick={() => entrada.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.current?.click(); } }}
        onDragOver={e => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={e => {
          e.preventDefault();
          setArrastando(false);
          somar([...(e.dataTransfer?.files ?? [])]);
        }}>
        <IconUpload size={18} />
        <b>Anexe a evidência <span className="objetivos-prova-opcional">(opcional)</span></b>
        <span>Arraste, cole um print com Ctrl+V ou clique para escolher</span>
      </div>
      <input ref={entrada} type="file" multiple hidden
        onChange={e => { somar([...(e.target.files ?? [])]); e.target.value = ''; }} />
      {arquivos.length > 0 && (
        <ul className="objetivos-prova-arquivos lista-anima" key={arquivos.map(f => f.name).join('|')}>
          {arquivos.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <IconClip size={12} />
              <span className="objetivos-prova-nome" title={f.name}>{f.name}</span>
              <span className="objetivos-prova-tamanho">{tamanhoLegivel(f.size)}</span>
              <button type="button" className="objetivos-prova-tirar" aria-label={`Tirar ${f.name}`}
                onClick={() => setArquivos(a => a.filter((_, k) => k !== i))}>
                <IconX size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {erro && <p className="objetivos-prova-erro surge">{erro}</p>}
      </div>
    </Dialogo>
  );
}
