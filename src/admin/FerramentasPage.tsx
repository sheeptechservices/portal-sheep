import { useCallback, useEffect, useState } from 'react';
import { useAuth, useToast } from './AdminApp';
import { podeAbrirPagina, podeVerUsuarios } from './papeis';
import { Dialogo, ConfirmarExclusao } from '../components/Dialogo';
import { SelectSistema } from '../components/SelectSistema';
import { CampoTexto } from '../components/CampoTexto';
import { TextoRico } from '../components/TextoRico';
import { IconEdit, IconLink, IconPlus, IconTrash } from '../components/icons';

/** Área da operação que é dona da ferramenta - vira uma coluna no hub. */
type AreaId = 'juridico' | 'comercial' | 'tecnologia';

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
  /** Cadastrada pelo hub, e não escrita no código: dá para corrigir e tirar. */
  link?: FerramentaLink;
}

/** Uma ferramenta de fora, como o servidor a guarda. */
interface FerramentaLink {
  id: number;
  area: AreaId;
  nome: string;
  descricao: string | null;
  url: string;
}

/** Cor do card das ferramentas por link. Uma só para todas: elas são atalhos
 *  para fora, e a cor própria fica para as da casa, que cada uma tem a sua. */
const COR_LINK = '#475569';

// Ordem das colunas no hub. A área sem ferramenta ainda aparece, reservando o
// lugar dela no hub.
const AREAS: { id: AreaId; nome: string; descricao: string }[] = [
  { id: 'juridico', nome: 'Jurídico', descricao: 'Contratos e documentos da casa' },
  { id: 'comercial', nome: 'Comercial', descricao: 'Quem trabalha com a gente, e quem pode vir a trabalhar' },
  { id: 'tecnologia', nome: 'Tecnologia', descricao: 'Os acessos e a infraestrutura da casa' },
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

/** Folha com selo - gerador de propostas */
const IconProposta = (
  <svg {...svgProps}>
    <path d="M13.4 2.6H6.2A2.2 2.2 0 0 0 4 4.8v14.4a2.2 2.2 0 0 0 2.2 2.2h7" />
    <path d="M13.4 2.6 19 8.2v3" />
    <path d="M7.8 11h5.6M7.8 14.6h3.4" />
    <circle cx="17.4" cy="17.4" r="3.2" />
    <path d="m15.9 17.4 1.1 1.1 2-2.2" />
  </svg>
);

/** Cadeado fechado - o cofre de senhas */
const IconCofre = (
  <svg {...svgProps}>
    <rect x="3.4" y="10.4" width="17.2" height="11" rx="2.2" />
    <path d="M7.6 10.4V7.2a4.4 4.4 0 0 1 8.8 0v3.2" />
    <path d="M12 14.6v2.6" />
  </svg>
);

/** Pessoas - o banco de talentos */
const IconTalentos = (
  <svg {...svgProps}>
    <path d="M16.4 20.6v-1.8a3.6 3.6 0 0 0-3.6-3.6H6.4a3.6 3.6 0 0 0-3.6 3.6v1.8" />
    <circle cx="9.6" cy="7.4" r="3.6" />
    <path d="M17.2 11.4l1.5 1.5 3-3" />
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
    id: 'gerador-contratos',
    page: 'gerador-documentos',
    area: 'juridico',
    nome: 'Gerador de Contratos',
    descricao: 'Gere o contrato de serviço com o cliente ou o de colaborador a partir do modelo da casa: o texto fixo fica, o resto você preenche.',
    icon: IconGerador,
    cor: '#D97706',
  },
  {
    id: 'gerador-propostas',
    page: 'gerador-propostas',
    area: 'comercial',
    nome: 'Gerador de Propostas',
    descricao: 'Monte a apresentação comercial a partir do modelo aprovado: o projeto, as entregas, o cronograma e o investimento.',
    icon: IconProposta,
    cor: '#0EA5E9',
  },
  {
    id: 'cofre',
    page: 'cofre',
    area: 'tecnologia',
    nome: 'Cofre de Senhas',
    descricao: 'As senhas das ferramentas, do GitHub e dos servidores. Cadastrar é livre; para ver, o portal manda um código ao seu e-mail.',
    icon: IconCofre,
    cor: '#0F766E',
  },
  {
    id: 'banco-talentos',
    page: 'talentos',
    area: 'comercial',
    nome: 'Banco de Talentos',
    descricao: 'Quem já é da casa e quem quer ser, com a avaliação de competências de cada um em um só lugar.',
    icon: IconTalentos,
    cor: '#7C3AED',
  },
];

function ToolCard({ ferramenta, onClick, onEditar, onExcluir }: {
  ferramenta: Ferramenta;
  onClick: () => void;
  /** Só nas ferramentas por link, e só para quem cadastra. */
  onEditar?: () => void;
  onExcluir?: () => void;
}) {
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
      className="ferramenta-card"
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

      {/* Corrigir e tirar moram no canto do card, e aparecem com o ponteiro em
          cima: em repouso o card é o atalho, e duas lixeiras por coluna
          competiriam com o que ele diz. O clique delas não abre o link. */}
      {(onEditar || onExcluir) && (
        <span className="ferramenta-acoes kanban-card-acoes">
          {onEditar && (
            <button type="button" className="kanban-card-acao" title="Editar ferramenta"
              aria-label={`Editar ${ferramenta.nome}`}
              onClick={e => { e.stopPropagation(); onEditar(); }}>
              <IconEdit size={13} />
            </button>
          )}
          {onExcluir && (
            <button type="button" className="kanban-card-acao perigo" title="Excluir ferramenta"
              aria-label={`Excluir ${ferramenta.nome}`}
              onClick={e => { e.stopPropagation(); onExcluir(); }}>
              <IconTrash size={13} />
            </button>
          )}
        </span>
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
        {ferramenta.link
          // A descrição cadastrada é escrita no campo da casa, com as marcas
          // leves; quem a mostra traduz pela regra única.
          ? <TextoRico texto={ferramenta.descricao} className="ferramenta-descricao" />
          : (
            <p style={{ fontSize: 12.5, color: 'var(--gray)', lineHeight: 1.5 }}>
              {ferramenta.descricao}
            </p>
          )}
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

/** O rascunho do formulário de ferramenta por link. Sem `id`, é uma nova. */
interface RascunhoLink {
  id?: number;
  nome: string;
  descricao: string;
  url: string;
  area: AreaId | '';
}

export default function FerramentasPage({ token, onNavigate }: {
  token: string;
  onNavigate?: (page: string) => void;
}) {
  // O hub some com o card que a matriz não abre. Sem isto ele anuncia uma
  // ferramenta que devolve "sem acesso" no clique, e o card vira um convite
  // para uma porta trancada.
  const { pode, usuario, onSessionExpired } = useAuth();
  const { toast } = useToast();
  const veUsuarios = podeVerUsuarios(usuario);
  const liberada = (f: { page?: string }) => !f.page || podeAbrirPagina(pode, f.page, veUsuarios);
  const podeCadastrar = pode('ferramentas:cadastrar');

  const api = useCallback(async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(`/api/admin-data${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { onSessionExpired(); return null; }
    return res.json().catch(() => null);
  }, [token, onSessionExpired]);

  /** As ferramentas de fora. Nulas enquanto não chegaram: as da casa aparecem
   *  na hora, e as de link entram no fim da coluna quando a leitura volta. */
  const [links, setLinks] = useState<FerramentaLink[] | null>(null);
  useEffect(() => {
    void api('?action=ferramentas_links').then(r => setLinks((r?.links ?? []) as FerramentaLink[]));
  }, [api]);

  const [rascunho, setRascunho] = useState<RascunhoLink | null>(null);
  const [excluindo, setExcluindo] = useState<FerramentaLink | null>(null);

  /** Grava a ferramenta. Pinta na hora e fecha o formulário no gesto; a nova
   *  entra com um id provisório que o do servidor substitui, e a recusa desfaz
   *  e reabre o formulário com o que a pessoa escreveu. */
  async function gravar(r: RascunhoLink) {
    const nome = r.nome.trim();
    const url = r.url.trim();
    if (!nome || !url || !r.area) return;
    const dados = { nome, descricao: r.descricao.trim() || null, url, area: r.area as AreaId };
    const antes = links ?? [];
    const provisorio = -Date.now();
    setLinks(r.id
      ? antes.map(x => (x.id === r.id ? { ...x, ...dados } : x))
      : [...antes, { id: provisorio, ...dados }]);
    setRascunho(null);
    const resp = await api('', 'POST', { action: 'salvar_ferramenta_link', id: r.id, ...dados });
    if (!resp || resp.error) {
      setLinks(antes);
      setRascunho(r);
      toast('error', 'Não foi possível gravar', resp?.error ?? 'O servidor não respondeu. Tente de novo.');
      return;
    }
    // O servidor completa o endereço (o https da frente) e devolve o id da nova.
    setLinks(ls => (ls ?? []).map(x => (x.id === (r.id ?? provisorio)
      ? { ...x, id: Number(resp.id), url: String(resp.url ?? x.url) } : x)));
    toast('success', r.id ? 'Ferramenta atualizada' : 'Ferramenta cadastrada');
  }

  async function excluir(l: FerramentaLink) {
    setExcluindo(null);
    const antes = links ?? [];
    setLinks(antes.filter(x => x.id !== l.id));
    const resp = await api('', 'POST', { action: 'excluir_ferramenta_link', id: l.id });
    if (!resp || resp.error) {
      setLinks(antes);
      toast('error', 'Não foi possível excluir', resp?.error ?? 'O servidor não respondeu. Tente de novo.');
      return;
    }
    toast('success', 'Ferramenta excluída');
  }

  /** As de link no formato de card, para morar na mesma coluna das da casa. */
  const comoCard = (l: FerramentaLink): Ferramenta => ({
    id: `link-${l.id}`,
    area: l.area,
    nome: l.nome,
    descricao: l.descricao ?? '',
    icon: <IconLink size={22} />,
    cor: COR_LINK,
    href: l.url,
    link: l,
  });

  return (
    <div className="admin-content-wrap">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Ferramentas</h1>
          <p className="admin-page-desc">Hub de utilitários da operação</p>
        </div>
        {podeCadastrar && (
          <div className="admin-page-acoes">
            <button type="button" className="btn btn-primary"
              style={{ height: 38, padding: '0 18px', fontSize: 13, flexShrink: 0 }}
              onClick={() => setRascunho({ nome: '', descricao: '', url: '', area: '' })}>
              <IconPlus size={13} /> Nova ferramenta
            </button>
          </div>
        )}
      </div>

      {/* Uma coluna por área da operação; os cards da área ficam empilhados nela. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 22,
        alignItems: 'start',
      }}>
        {AREAS.map(area => {
          const doGrupo = [
            ...FERRAMENTAS.filter(f => f.area === area.id && liberada(f)),
            ...(links ?? []).filter(l => l.area === area.id).map(comoCard),
          ];
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
                <div key={f.id} className={f.link ? 'surge' : undefined}>
                  <ToolCard ferramenta={f}
                    onClick={() => { if ('page' in f && f.page) onNavigate?.(f.page as string); }}
                    onEditar={f.link && podeCadastrar && f.link.id > 0 ? () => setRascunho({
                      id: f.link!.id, nome: f.link!.nome, descricao: f.link!.descricao ?? '',
                      url: f.link!.url, area: f.link!.area,
                    }) : undefined}
                    onExcluir={f.link && podeCadastrar && f.link.id > 0 ? () => setExcluindo(f.link!) : undefined} />
                </div>
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

      {rascunho && (
        <Dialogo
          titulo={rascunho.id ? 'Editar ferramenta' : 'Nova ferramenta'}
          descricao="Um atalho para uma ferramenta de fora do portal. O card abre o link numa aba nova."
          perigo={false}
          rotuloOk={rascunho.id ? 'Salvar' : 'Cadastrar'}
          ocupado={!rascunho.nome.trim() || !rascunho.url.trim() || !rascunho.area}
          largura={520}
          onFechar={() => setRascunho(null)}
          onConfirmar={() => void gravar(rascunho)}>
          <div className="ferramenta-form">
            <div className="form-group">
              <label className="form-label" htmlFor="ferramenta-nome">Nome<span>*</span></label>
              <input id="ferramenta-nome" className="form-input" autoFocus maxLength={120}
                value={rascunho.nome} placeholder="Mapeamento de Processos"
                onChange={e => setRascunho(r => r && { ...r, nome: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ferramenta-url">Link de acesso<span>*</span></label>
              <input id="ferramenta-url" className="form-input" maxLength={500} inputMode="url"
                value={rascunho.url} placeholder="https://"
                onChange={e => setRascunho(r => r && { ...r, url: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Área<span>*</span></label>
              <SelectSistema
                valor={rascunho.area}
                onChange={v => setRascunho(r => r && { ...r, area: v as AreaId })}
                placeholder="Em que coluna ela entra"
                opcoes={AREAS.map(a => ({ valor: a.id, label: a.nome, descricao: a.descricao }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Descrição</label>
              <CampoTexto valor={rascunho.descricao} linhas={2} alturaMaxima={160}
                ariaLabel="Descrição da ferramenta"
                placeholder="O que ela faz, em uma ou duas frases"
                onMudar={t => setRascunho(r => r && { ...r, descricao: t })} />
            </div>
          </div>
        </Dialogo>
      )}

      {excluindo && (
        <ConfirmarExclusao titulo={excluindo.nome} oQue="ferramenta"
          onCancelar={() => setExcluindo(null)}
          onConfirmar={() => void excluir(excluindo)} />
      )}
    </div>
  );
}
