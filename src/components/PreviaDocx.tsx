import { useEffect, useRef, useState } from 'react';
import { ajustarBannerDocx } from '../lib/docxBanner';

/**
 * Prévia do .docx gerado. O `docx-preview` interpreta os estilos do próprio
 * arquivo, então o que aparece aqui é o documento de verdade - não uma
 * reconstrução dos dados. Carregado sob demanda para não pesar o bundle inicial.
 *
 * O enquadramento (`.gd-docx`) vem do Gerador de Contratos, que é quem monta o
 * modal em volta; o giro da espera e o da casa (`.dux-spinner`).
 */
export function PreviaDocx({ blob }: { blob: Blob }) {
  const alvoRef = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando');

  useEffect(() => {
    let vivo = true;
    setEstado('carregando');
    (async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        if (!vivo || !alvoRef.current) return;
        alvoRef.current.innerHTML = '';
        await renderAsync(blob, alvoRef.current, undefined, {
          className: 'gd-docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: true,
          breakPages: true,
          experimental: true,
        });
        ajustarBannerDocx(alvoRef.current);
        if (vivo) setEstado('ok');
      } catch (e) {
        console.error('[gerador] prévia', e);
        if (vivo) setEstado('erro');
      }
    })();
    return () => { vivo = false; };
  }, [blob]);

  return (
    <div style={{ position: 'relative', minHeight: 240 }}>
      {estado === 'carregando' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '60px 0', color: 'var(--gray2)', fontSize: 12.5 }}>
          <span className="dux-spinner sm" /> Montando a prévia…
        </div>
      )}
      {estado === 'erro' && (
        <p style={{ padding: '48px 24px', textAlign: 'center', fontSize: 12.5, color: '#B45309' }}>
          Não foi possível montar a prévia deste documento. Baixe o arquivo para conferir no Word.
        </p>
      )}
      <div ref={alvoRef} style={{ display: estado === 'ok' ? 'block' : 'none' }} />
    </div>
  );
}
