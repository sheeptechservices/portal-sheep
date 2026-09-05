// ─────────────────────────────────────────────────────────────────────────────
//  A visão geral de um talento, e as peças que ela e a tabela dividem.
//
//  Mesma tela para os dois cadastros: à esquerda quem é a pessoa, no meio o
//  radar, ao lado a avaliação competência a competência. O que muda entre um
//  interno e um interessado é só a ficha da esquerda - o interno traz papel e
//  data de entrada, o interessado traz interesse, origem e situação, e estes são
//  editáveis.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { useToast } from './AdminApp';
import { Avatar } from './FormularioTarefa';
import { Dialogo } from '../components/Dialogo';
import { SelectSistema } from '../components/SelectSistema';
import { Skeleton } from '../components/Skeleton';
import { IconTrash } from '../components/icons';
import { dia as fmtDataBR } from '../lib/datas';

export interface Competencia { id: number; nome: string }

export interface TalentoInterno {
  id: string;
  nome: string;
  email: string;
  foto_url: string | null;
  papel: string;
  desde: string;
  media: number | null;
}

export interface TalentoExterno {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  foto_url: string | null;
  interesse: string;
  origem: string;
  situacao: string;
  desde: string;
  media: number | null;
}

export interface Nota {
  competencia_id: number;
  nota: number;
  atualizado_em: string;
  atualizado_por_nome: string | null;
}

/** Onde o interessado está na conversa. A cor sai de token, como todo chip. */
export const SITUACOES = [
  { valor: 'novo', label: 'Novo', cor: 'var(--gray2)' },
  { valor: 'conversando', label: 'Conversando', cor: 'var(--amber)' },
  { valor: 'contratado', label: 'Contratado', cor: 'var(--green-light)' },
  { valor: 'descartado', label: 'Descartado', cor: 'var(--red)' },
];
const ROTULO_SITUACAO: Record<string, { label: string; cor: string }> =
  Object.fromEntries(SITUACOES.map(s => [s.valor, s]));

export const PAPEIS: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  membro: 'Membro',
};

export function ChipSituacao({ situacao }: { situacao: string }) {
  const s = ROTULO_SITUACAO[situacao] ?? { label: situacao, cor: 'var(--gray2)' };
  return (
    <span className="talentos-chip" style={{ color: s.cor }}>
      <span className="talentos-ponto" style={{ background: s.cor }} /> {s.label}
    </span>
  );
}

/** A média em barra. Sem nota, uma frase: barra vazia leria como nota zero. */
export function BarraMedia({ media }: { media: number | null }) {
  if (media == null) return <span className="talentos-sem-nota">sem avaliação</span>;
  return (
    <span className="talentos-media">
      <span className="talentos-media-trilho">
        <span className="talentos-media-tinta" style={{ width: `${media}%` }} />
      </span>
      <strong>{media}</strong>
    </span>
  );
}

/**
 * O radar das competências.
 *
 * Desenhado à mão em SVG, como o painel comercial: são oito eixos e um polígono,
 * e uma biblioteca de gráfico inteira para isso pesaria mais do que a tela. O
 * `viewBox` quadrado se estica sozinho, então nada aqui depende de medir a
 * largura em JavaScript.
 *
 * Sem nota, o eixo vale zero e o polígono encosta no centro - e é isso mesmo que
 * se quer ver: o que ainda não foi avaliado aparece como o buraco que é.
 */
export function Radar({ competencias, notas }: { competencias: Competencia[]; notas: Map<number, number> }) {
  const n = competencias.length;
  if (n < 3) {
    return <p className="talentos-vazio">O radar precisa de pelo menos três competências.</p>;
  }
  // O quadro e mais largo do que alto de proposito: os rotulos que sobram sao os
  // dos eixos laterais, e e para o lado que eles crescem.
  const LARGURA = 400;
  const ALTURA = 320;
  const centro = { x: LARGURA / 2, y: ALTURA / 2 };
  const raio = ALTURA / 2 - 62;
  const ponto = (i: number, valor: number) => {
    // Começa no topo e gira no sentido do relógio, como todo mostrador.
    const angulo = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (Math.max(0, Math.min(130, valor)) / 100) * raio;
    return [centro.x + Math.cos(angulo) * r, centro.y + Math.sin(angulo) * r] as const;
  };
  /** Nome comprido vira duas linhas. Numa linha so ele saia do quadro - e
   *  encolher a fonte ate caber deixaria o rotulo ilegivel. */
  const emLinhas = (nome: string) => {
    if (nome.length <= 14) return [nome];
    const partes = nome.split(' ');
    if (partes.length < 2) return [nome];
    const meio = Math.ceil(partes.length / 2);
    return [partes.slice(0, meio).join(' '), partes.slice(meio).join(' ')];
  };
  const poligono = (valor: (i: number) => number) =>
    competencias.map((_, i) => ponto(i, valor(i)).join(',')).join(' ');

  return (
    <svg className="talentos-radar" viewBox={`0 0 ${LARGURA} ${ALTURA}`} role="img"
      aria-label={`Radar de ${n} competências`}>
      {/* A teia: quatro anéis de 25 em 25, para a leitura ter régua. */}
      {[25, 50, 75, 100].map(v => (
        <polygon key={v} className="talentos-radar-teia" points={poligono(() => v)} />
      ))}
      {competencias.map((_, i) => {
        const [x, y] = ponto(i, 100);
        return <line key={i} className="talentos-radar-eixo" x1={centro.x} y1={centro.y} x2={x} y2={y} />;
      })}
      <polygon className="talentos-radar-area" points={poligono(i => notas.get(competencias[i].id) ?? 0)} />
      {competencias.map((c, i) => {
        const [x, y] = ponto(i, notas.get(c.id) ?? 0);
        return <circle key={c.id} className="talentos-radar-ponto" cx={x} cy={y} r="3.5" />;
      })}
      {competencias.map((c, i) => {
        const [x, y] = ponto(i, 120);
        // O rótulo se alinha pelo lado em que está: à direita do desenho ele
        // começa no eixo, à esquerda termina nele, e em cima e embaixo fica
        // centrado. Alinhado sempre ao centro, os de lado invadiam o polígono.
        const meio = Math.abs(x - centro.x) < 6;
        const linhas = emLinhas(c.nome);
        return (
          <text key={c.id} className="talentos-radar-rotulo" x={x} y={y}
            textAnchor={meio ? 'middle' : x > centro.x ? 'start' : 'end'}
            dominantBaseline={y < centro.y - 6 ? 'auto' : y > centro.y + 6 ? 'hanging' : 'middle'}>
            {linhas.map((linha, k) => (
              <tspan key={k} x={x} dy={k === 0 ? 0 : 12}>{linha}</tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}

export function VisaoGeral({
  tipo, pessoa, competencias, podeAvaliar, podeEditar, api, gravar,
  onNotas, onMudar, onExcluir,
}: {
  tipo: 'interno' | 'externo';
  pessoa: TalentoInterno | TalentoExterno;
  competencias: Competencia[];
  podeAvaliar: boolean;
  podeEditar: boolean;
  api: (busca: string) => Promise<any>;
  gravar: (corpo: Record<string, unknown>) => Promise<any>;
  onNotas: (notas: Nota[]) => void;
  onMudar: (campos: Partial<TalentoExterno>) => void;
  onExcluir: () => void;
}) {
  const { toast } = useToast();
  const [notas, setNotas] = useState<Nota[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const externo = tipo === 'externo' ? (pessoa as TalentoExterno) : null;

  useEffect(() => {
    let vivo = true;
    api(`action=talento_notas&tipo=${tipo}&id=${encodeURIComponent(pessoa.id)}`)
      .then((d: any) => { if (vivo && d?.notas) setNotas(d.notas); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [api, tipo, pessoa.id]);

  const porCompetencia = useMemo(
    () => new Map(notas.map(n => [n.competencia_id, n.nota])),
    [notas],
  );

  /** Pinta primeiro e desfaz no erro: ninguém espera a ida e a volta para ver a
   *  nota que acabou de digitar. */
  async function darNota(competencia_id: number, valor: number) {
    const antes = notas;
    const novas = [
      ...notas.filter(n => n.competencia_id !== competencia_id),
      {
        competencia_id, nota: valor,
        atualizado_em: new Date().toISOString(),
        atualizado_por_nome: 'Você',
      },
    ];
    setNotas(novas);
    onNotas(novas);
    const r = await gravar({
      action: 'salvar_talento_nota', tipo, pessoa_id: pessoa.id, competencia_id, nota: valor,
    });
    if (r?.error) {
      setNotas(antes);
      onNotas(antes);
      toast('error', 'A nota não foi gravada', r.error);
    }
  }

  async function mudarCampo(campo: 'situacao', valor: string) {
    if (!externo) return;
    const antes = externo[campo];
    onMudar({ [campo]: valor } as Partial<TalentoExterno>);
    const r = await gravar({ action: 'update_talento_externo', id: pessoa.id, [campo]: valor });
    if (r?.error) {
      onMudar({ [campo]: antes } as Partial<TalentoExterno>);
      toast('error', 'Não foi possível gravar', r.error);
    }
  }

  return (
    <div className="admin-content-wrap">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{pessoa.nome}</h1>
        {externo && podeEditar && (
          <button className="btn btn-secondary" onClick={() => setConfirmando(true)}>
            <IconTrash size={13} /> Excluir
          </button>
        )}
      </div>

      <div className="talentos-visao">
        {/* Quem é a pessoa. */}
        <section className="painel talentos-ficha">
          <Avatar nome={pessoa.nome} foto={pessoa.foto_url} size={92} />
          <p className="talentos-ficha-nome">{pessoa.nome}</p>
          <p className="talentos-ficha-papel">
            {externo
              ? (externo.interesse || 'Sem interesse declarado')
              : (PAPEIS[(pessoa as TalentoInterno).papel] ?? '-')}
          </p>

          <dl className="talentos-ficha-dados">
            <dt>E-mail</dt><dd>{pessoa.email || '-'}</dd>
            {externo && <><dt>Telefone</dt><dd>{externo.telefone || '-'}</dd></>}
            {externo && <><dt>Origem</dt><dd>{externo.origem || '-'}</dd></>}
            <dt>{externo ? 'Cadastrado em' : 'No time desde'}</dt>
            <dd>{pessoa.desde ? fmtDataBR(pessoa.desde.slice(0, 10)) : '-'}</dd>
          </dl>

          {externo && (
            <div className="talentos-ficha-situacao">
              <span className="form-label">Situação</span>
              {podeEditar ? (
                <SelectSistema
                  valor={externo.situacao}
                  onChange={v => mudarCampo('situacao', v)}
                  opcoes={SITUACOES.map(s => ({
                    valor: s.valor,
                    label: s.label,
                    icone: <span className="talentos-ponto" style={{ background: s.cor }} />,
                  }))}
                  estiloGatilho={{ height: 'auto', padding: '9px 14px' }}
                />
              ) : (
                <ChipSituacao situacao={externo.situacao} />
              )}
            </div>
          )}
        </section>

        {/* O que ela sabe fazer. */}
        <section className="painel talentos-radar-painel">
          <div className="painel-topo">
            <div>
              <p className="painel-titulo">Competências</p>
              <p className="painel-apoio">
                {notas.length
                  ? `${notas.length} de ${competencias.length} avaliadas`
                  : 'Ainda sem avaliação'}
              </p>
            </div>
          </div>
          {carregando
            ? <Skeleton h={320} radius="var(--radius-md)" />
            : <Radar competencias={competencias} notas={porCompetencia} />}
        </section>

        {/* A régua, competência a competência. */}
        <section className="painel talentos-notas">
          <div className="painel-topo">
            <div>
              <p className="painel-titulo">Avaliação</p>
              <p className="painel-apoio">
                {podeAvaliar ? 'De 0 a 100, por competência' : 'Somente leitura'}
              </p>
            </div>
          </div>
          <ul className="talentos-lista-notas">
            {competencias.map(c => {
              const n = notas.find(x => x.competencia_id === c.id);
              return (
                <li key={c.id} className="talentos-nota-linha">
                  <div className="talentos-nota-topo">
                    <span className="talentos-nota-nome">{c.nome}</span>
                    {podeAvaliar ? (
                      <input
                        className="form-input talentos-nota-campo"
                        type="number" min={0} max={100}
                        value={n ? String(n.nota) : ''}
                        placeholder="-"
                        onChange={e => {
                          const v = Number(e.target.value);
                          if (e.target.value === '' || !Number.isFinite(v)) return;
                          void darNota(c.id, Math.max(0, Math.min(100, v)));
                        }}
                      />
                    ) : (
                      <strong className="talentos-nota-valor">{n ? n.nota : '-'}</strong>
                    )}
                  </div>
                  <span className="talentos-media-trilho">
                    <span className="talentos-media-tinta" style={{ width: `${n?.nota ?? 0}%` }} />
                  </span>
                  {n?.atualizado_por_nome && (
                    <span className="talentos-nota-quem">
                      {n.atualizado_por_nome} · {fmtDataBR(n.atualizado_em.slice(0, 10))}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {confirmando && (
        <Dialogo
          titulo="Excluir interessado"
          descricao={<>Tirar <strong>{pessoa.nome}</strong> do banco de talentos? As notas dadas somem junto.</>}
          rotuloOk="Excluir"
          onFechar={() => setConfirmando(false)}
          onConfirmar={async () => {
            const r = await gravar({ action: 'delete_talento_externo', id: pessoa.id });
            if (r?.error) { toast('error', 'Não foi possível excluir', r.error); return; }
            toast('success', 'Interessado excluído', `${pessoa.nome} saiu do banco de talentos.`);
            onExcluir();
          }}
        />
      )}
    </div>
  );
}

/** O cadastro de quem ainda não é da casa. Só o nome é obrigatório: o resto se
 *  descobre conversando, e exigir tudo na primeira tela faz a pessoa não ser
 *  cadastrada. */
export function NovoInteressado({ gravar, onFechar, onCriado }: {
  gravar: (corpo: Record<string, unknown>) => Promise<any>;
  onFechar: () => void;
  onCriado: (t: TalentoExterno) => void;
}) {
  const { toast } = useToast();
  const [r, setR] = useState({ nome: '', email: '', telefone: '', interesse: '', origem: '' });
  const set = (k: keyof typeof r, v: string) => setR(p => ({ ...p, [k]: v }));

  return (
    <Dialogo
      titulo="Novo interessado"
      descricao="Alguém que quer trabalhar na Sheep e ainda não trabalha."
      rotuloOk="Cadastrar"
      perigo={false}
      largura={460}
      onFechar={onFechar}
      onConfirmar={async () => {
        const nome = r.nome.trim();
        if (!nome) { toast('error', 'Falta o nome', 'É o único campo obrigatório.'); return; }
        const resposta = await gravar({ action: 'create_talento_externo', ...r, nome });
        if (!resposta || resposta.error) {
          toast('error', 'Não foi possível cadastrar', resposta?.error ?? 'Tente de novo.');
          return;
        }
        onCriado({
          id: resposta.id,
          nome,
          email: r.email,
          telefone: r.telefone,
          foto_url: null,
          interesse: r.interesse,
          origem: r.origem,
          situacao: 'novo',
          desde: resposta.criado_em,
          media: null,
        });
        toast('success', 'Interessado cadastrado', `${nome} entrou no banco de talentos.`);
      }}
    >
      <div className="talentos-form">
        <label><span className="form-label">Nome</span>
          <input className="form-input" value={r.nome} onChange={e => set('nome', e.target.value)}
            placeholder="Como a pessoa se apresenta" /></label>
        <label><span className="form-label">E-mail</span>
          <input className="form-input" value={r.email} onChange={e => set('email', e.target.value)}
            placeholder="Para onde escrever" /></label>
        <label><span className="form-label">Telefone</span>
          <input className="form-input" value={r.telefone} onChange={e => set('telefone', e.target.value)}
            placeholder="(00) 00000-0000" /></label>
        <label><span className="form-label">Interesse</span>
          <input className="form-input" value={r.interesse} onChange={e => set('interesse', e.target.value)}
            placeholder="O que quer fazer aqui" /></label>
        <label><span className="form-label">Origem</span>
          <input className="form-input" value={r.origem} onChange={e => set('origem', e.target.value)}
            placeholder="Indicação, LinkedIn, evento…" /></label>
      </div>
    </Dialogo>
  );
}
