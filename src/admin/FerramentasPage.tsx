import { useState } from 'react';
import { useToast } from './AdminApp';

/** Área da operação que é dona da ferramenta - vira uma coluna no hub. */
type AreaId = 'juridico' | 'comercial' | 'cobrancas' | 'operacoes';

interface Ferramenta {
  id: string;
  nome: string;
  descricao: string;
  icon: JSX.Element;
  cor: string;
  area: AreaId;
  /** Card já visível no hub, mas cuja página ainda não existe. */
  breve?: boolean;
  /** Ferramenta externa: abre este link em nova aba em vez de navegar internamente. */
  href?: string;
}

// Ordem das colunas no hub. A área sem ferramenta ainda aparece, reservando o
// lugar dela no hub.
const AREAS: { id: AreaId; nome: string; descricao: string }[] = [
  { id: 'juridico', nome: 'Jurídico', descricao: 'Formalização, análise e documentos das operações' },
  { id: 'comercial', nome: 'Comercial', descricao: 'Apoio à negociação com o cedente' },
  { id: 'cobrancas', nome: 'Cobranças', descricao: 'Acompanhamento e recuperação de títulos vencidos' },
  { id: 'operacoes', nome: 'Operações', descricao: 'Gestão e acompanhamento das operações em andamento' },
];

// Ícones em traço, herdando a cor do card via currentColor. Mesmo peso de linha
// (1.7) e mesma caixa de 24 para os quatro ficarem visualmente da mesma família.
const svgProps = {
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

/** Documento com selo de confirmação */
const IconAceite = (
  <svg {...svgProps}>
    <path d="M14 2.9H6.8A1.8 1.8 0 0 0 5 4.7v14.6a1.8 1.8 0 0 0 1.8 1.8h4.4" />
    <path d="M14 2.9l5 5v3.3" />
    <path d="M14 2.9v5h5" />
    <path d="M8.4 9.6h3.2M8.4 13h2.8" />
    <circle cx="16.8" cy="17.2" r="4.1" />
    <path d="M15.1 17.3l1.2 1.2 2.3-2.4" />
  </svg>
);

/** Medidor de risco */
const IconAnalise = (
  <svg {...svgProps}>
    <path d="M3.6 17.6a8.4 8.4 0 1 1 16.8 0" />
    <path d="M12 17.6l4.1-4.7" />
    <circle cx="12" cy="17.6" r="1.5" />
    <path d="M3.6 17.6h1.8M18.6 17.6h1.8M12 7.6V9" />
  </svg>
);

/** Calculadora */
const IconSimulador = (
  <svg {...svgProps}>
    <rect x="4.6" y="2.8" width="14.8" height="18.4" rx="2.6" />
    <rect x="7.6" y="5.9" width="8.8" height="3.4" rx="1" />
    <path d="M8.7 13.1h.01M12 13.1h.01M15.3 13.1h.01M8.7 17h.01M12 17h.01M15.3 17h.01" strokeWidth="2.2" />
  </svg>
);

/** Documentos gerados a partir de um modelo */
const IconGerador = (
  <svg {...svgProps}>
    <rect x="8.4" y="8.4" width="13.2" height="13.2" rx="2.2" />
    <path d="M4.6 15.6a2.2 2.2 0 0 1-2.2-2.2V4.6a2.2 2.2 0 0 1 2.2-2.2h8.8a2.2 2.2 0 0 1 2.2 2.2" />
    <path d="M11.6 13.2h6.8M11.6 16.8h4.4" />
  </svg>
);

/** Gota - controle de liquidez */
const IconLiquidez = (
  <svg {...svgProps}>
    <path d="M12 3.2c3.6 4.1 5.7 6.9 5.7 9.7a5.7 5.7 0 0 1-11.4 0c0-2.8 2.1-5.6 5.7-9.7z" />
    <path d="M9.4 13.4a2.7 2.7 0 0 0 2.6 2.6" />
  </svg>
);

const FERRAMENTAS: (Ferramenta & { page?: string })[] = [
  {
    id: 'aceite-sacado',
    page: 'aceite-sacado',
    area: 'juridico',
    nome: 'Aceites & Anuências',
    descricao: 'Envie e acompanhe confirmações de aceite do sacado e termos de anuência para operações em andamento.',
    icon: IconAceite,
    cor: '#2563EB',
  },
  {
    id: 'analise-credito',
    page: 'analise-credito',
    area: 'juridico',
    nome: 'Análise de Crédito',
    descricao: 'Extração de documentos por IA, motor de decisão (limite, risco e tipo de operação) e geração de parecer.',
    icon: IconAnalise,
    cor: '#7C3AED',
  },
  {
    id: 'simulador-taxas',
    page: 'simulador-taxas',
    area: 'comercial',
    nome: 'Simulador de Taxas',
    descricao: 'Simule taxas, prazos e o líquido de uma operação para negociar com o cedente antes de formalizar a proposta.',
    icon: IconSimulador,
    cor: '#059669',
  },
  {
    id: 'gerador-documentos',
    page: 'gerador-documentos',
    area: 'juridico',
    nome: 'Gerador de Documentos',
    descricao: 'Monte contratos, termos e aditivos a partir de modelos, já preenchidos com os dados do cedente, do sacado e da operação.',
    icon: IconGerador,
    cor: '#D97706',
  },
  {
    id: 'controle-liquidez',
    area: 'operacoes',
    nome: 'Controle de Liquidez',
    descricao: 'O controle de liquidez do Grupo DUX - rendimento de quem emprestou, comissão de quem trouxe negócio.',
    icon: IconLiquidez,
    cor: '#0891B2',
    href: 'https://dux-liquidity-app.pages.dev/#/assistant',
  },
];

function ToolCard({ ferramenta, onClick }: { ferramenta: Ferramenta; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const { toast } = useToast();
  // Card já com o visual definitivo; só a página é que ainda não existe, então o
  // clique avisa em vez de levar para uma tela vazia.
  const breve = !!ferramenta.breve;
  const externo = !!ferramenta.href;
  const ativo = hovered;

  const abrir = () => {
    if (breve) { toast('info', `${ferramenta.nome} em construção`, 'Essa ferramenta ainda não está disponível.'); return; }
    if (ferramenta.href) { window.open(ferramenta.href, '_blank', 'noopener,noreferrer'); return; }
    onClick();
  };

  return (
    <div
      onClick={abrir}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--white)',
        border: `1px solid ${ativo ? ferramenta.cor + '55' : 'var(--gray3)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: ativo
          ? `0 8px 32px rgba(0,0,0,0.09), 0 0 0 1px ${ferramenta.cor}33`
          : 'var(--shadow-card)',
        transform: ativo ? 'translateY(-2px)' : 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {ativo && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${ferramenta.cor}00, ${ferramenta.cor}, ${ferramenta.cor}00)`,
          borderRadius: '16px 16px 0 0',
        }} />
      )}

      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: ferramenta.cor + '14',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        color: ferramenta.cor,
        border: `1px solid ${ferramenta.cor}22`,
        transition: 'transform 0.18s ease',
        transform: ativo ? 'scale(1.08)' : 'scale(1)',
      }}>
        {ferramenta.icon}
      </div>

      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--black)', marginBottom: 4, lineHeight: 1.3 }}>
          {ferramenta.nome}
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--gray)', lineHeight: 1.5 }}>
          {ferramenta.descricao}
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {breve ? (
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: hovered ? ferramenta.cor : 'var(--gray2)',
            background: hovered ? ferramenta.cor + '14' : 'var(--gray3)',
            padding: '3px 8px', borderRadius: 'var(--radius-pill)',
            transition: 'color 0.15s, background 0.15s',
          }}>
            Em breve
          </span>
        ) : externo ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            style={{ color: hovered ? ferramenta.cor : 'var(--gray2)', transition: 'color 0.15s, transform 0.15s', transform: hovered ? 'translate(1px, -1px)' : 'none' }}>
            <path d="M14 5h5v5M19 5l-8 8M17 13v5a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 18V8.5A1.5 1.5 0 0 1 6.5 7H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            style={{ color: hovered ? ferramenta.cor : 'var(--gray2)', transition: 'color 0.15s, transform 0.15s', transform: hovered ? 'translateX(2px)' : 'none' }}>
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
    </div>
  );
}

export default function FerramentasPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  return (
    <div className="admin-content-wrap">
      <div>
        <h1 className="admin-page-title">Ferramentas</h1>
        <p className="admin-page-desc">Hub de utilitários da operação</p>
      </div>

      {/* Uma coluna por área da operação; os cards da área ficam empilhados nela. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 22,
        alignItems: 'start',
      }}>
        {AREAS.map(area => {
          const doGrupo = FERRAMENTAS.filter(f => f.area === area.id);
          return (
            <section key={area.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--gray3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="integration-section-label" style={{ margin: 0, color: 'var(--black)' }}>{area.nome}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: 'var(--gray2)', background: 'var(--gray3)',
                    minWidth: 18, height: 18, padding: '0 5px', borderRadius: 'var(--radius-pill)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>{doGrupo.length}</span>
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--gray2)', lineHeight: 1.45, marginTop: 3 }}>
                  {area.descricao}
                </p>
              </div>
              {doGrupo.map(f => (
                <ToolCard key={f.id} ferramenta={f} onClick={() => { if (f.page) onNavigate?.(f.page); }} />
              ))}
              {!doGrupo.length && (
                <div style={{
                  border: '1.5px dashed var(--gray3)', borderRadius: 'var(--radius-lg)',
                  padding: '22px 20px', textAlign: 'center',
                  fontSize: 12, color: 'var(--gray2)', lineHeight: 1.5,
                }}>
                  Nenhuma ferramenta por aqui ainda.
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
