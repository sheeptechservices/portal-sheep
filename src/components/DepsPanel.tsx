// Painel de Análise DEPS - a mesma estrutura no balão da parte (Leads) e
// na Análise de Crédito, para as duas telas não divergirem em layout nem em
// comportamento. Quem usa o painel decide de onde vem o resultado e o que cada
// ação faz; aqui fica só a casca (chip de score, atalhos, estado de consulta).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { DepsMark } from './DepsMark';

// Nível do score DEPS (0 a 1000) → cor do chip. Score alto = menor risco (verde).
export function depsScoreLevel(score: string): 'alto' | 'medio' | 'baixo' {
  const n = parseInt(String(score ?? '').replace(/\D/g, ''), 10);
  if (!Number.isFinite(n) || n === 0) return 'medio';
  if (n >= 700) return 'alto';
  if (n >= 400) return 'medio';
  return 'baixo';
}

const IcoNovaAba = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>
);
const IcoRefresh = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M20 11A8 8 0 106 5.3M20 4v4h-4M4 13a8 8 0 0014 5.7M4 20v-4h4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
);

export interface DepsPanelProps {
  titulo?: string;              // cabeçalho do painel (default "Análise DEPS")
  score?: string;               // score DEPS; vazio → chip neutro de documento
  sub?: string;                 // linha de apoio (risco, data da consulta…)
  temRelatorio: boolean;        // já existe consulta para esta parte
  reutilizou?: boolean;         // veio do histórico da DEPS (sem custo)
  busy?: boolean;               // consulta em andamento
  onVer: () => void;            // abrir o relatório (preview embutido)
  onNovaAba: () => void;        // abrir o relatório em nova aba
  onAtualizar: () => void;      // gerar nova consulta (com custo → confirmar)
  onGerar: () => void;          // primeira consulta desta parte
  produtoSelect?: React.ReactNode; // seletor de produto/módulo (cada tela tem o seu)
}

export function DepsPanel({
  titulo = 'Análise DEPS', score = '', sub = '', temRelatorio, reutilizou, busy,
  onVer, onNovaAba, onAtualizar, onGerar, produtoSelect,
}: DepsPanelProps) {
  const level = depsScoreLevel(score);
  return (
    <div className="deps-panel">
      <div className="deps-panel-head">
        <DepsMark size={15} />
        <span>{titulo}</span>
        {temRelatorio && reutilizou && (
          <span className="deps-chip-reused" title="Reaproveitado do histórico da DEPS, sem custo">
            <IcoRefresh size={9} />
            sem custo
          </span>
        )}
      </div>

      {temRelatorio ? (
        <>
          <button type="button" className="deps-result" onClick={onVer} title="Ver relatório DEPS">
            {score ? (
              <span className={`deps-score deps-score--${level}`}>{score}</span>
            ) : (
              <span className="deps-score deps-score--none">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
            )}
            <span className="deps-result-body">
              <span className="deps-result-title">{score ? 'Ver relatório completo' : 'Relatório DEPS'}</span>
              {sub && <span className="deps-result-sub">{sub}</span>}
            </span>
            <svg className="deps-result-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div className="deps-panel-actions">
            <button type="button" className="deps-tab-btn" onClick={onNovaAba} title="Abrir em nova aba">
              <IcoNovaAba />
              Nova aba
            </button>
            <button type="button" className="deps-update-btn" disabled={busy} onClick={onAtualizar}
              title="Gerar uma nova consulta (com custo)">
              {busy ? <><span className="deps-spin" /> …</> : <><IcoRefresh />Atualizar</>}
            </button>
          </div>
        </>
      ) : (
        <div className="deps-gen">
          {produtoSelect}
          <button type="button" className="deps-gen-btn" disabled={busy} onClick={onGerar}>
            {busy ? <><span className="deps-spin" /> Consultando…</> : <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" fill="currentColor"/></svg>
              Gerar DEPS</>}
          </button>
        </div>
      )}
    </div>
  );
}

// Preview do relatório DEPS embutido - carrega o relatório do PRÓPRIO portal da
// DEPS (link de consulta compartilhada, público, sem login) dentro de um iframe.
// O portal não manda X-Frame-Options nem frame-ancestors, então o embed é
// permitido; ganhamos o relatório completo e interativo sem reconstruir nada,
// incluindo o botão de imprimir do próprio portal.
export function DepsPreviewModal({ nome, url, onClose, onOpenTab }: {
  nome: string;
  url: string;
  onClose: () => void;
  onOpenTab: () => void;
}) {
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // O `load` do iframe dispara quando o documento carrega, mas o Angular da DEPS
  // ainda leva alguns segundos para pintar - soltar o overlay nesse instante
  // mostraria um branco. Piso de 2,5s cobre a montagem do app.
  useEffect(() => {
    const t = setTimeout(() => setCarregando(false), 2500);
    return () => clearTimeout(t);
  }, []);

  return createPortal(
    <div className="file-preview-backdrop" onClick={onClose}>
      <div className="file-preview-modal" onClick={e => e.stopPropagation()}>
        <div className="file-preview-header">
          <span className="file-preview-name">Relatório DEPS - {nome}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="file-preview-action" onClick={onOpenTab}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Nova aba
            </button>
            <button className="file-preview-close" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="file-preview-body deps-frame-wrap">
          {carregando && (
            <div className="deps-frame-loading">
              <span className="deps-frame-spinner" />
              Carregando o relatório no portal da DEPS…
            </div>
          )}
          <iframe
            src={url}
            className="file-preview-iframe"
            title={`Relatório DEPS ${nome}`}
            referrerPolicy="no-referrer"
            onLoad={() => setTimeout(() => setCarregando(false), 1200)}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
