// ─────────────────────────────────────────────────────────────────────────────
//  O banco de talentos.
//
//  Duas listas na mesma tela: quem já é da casa e quem quer ser. São cadastros
//  diferentes - o time vem de `usuarios`, os interessados de uma tabela própria
//  -, mas a pergunta que se faz aos dois é a mesma: quem é, no que é bom, e o
//  que falta. Por isso a avaliação é uma só, e a visão geral de um interessado
//  tem o mesmo desenho da de quem já trabalha aqui.
//
//  A avaliação é digitada aqui mesmo, competência por competência, e cada nota
//  guarda quem a deu e quando. Não há cálculo escondido: a média que aparece na
//  tabela é a média das notas dadas, e quem não tem nota nenhuma aparece sem
//  média - zero seria uma nota ruim, e o que existe ali é a ausência dela.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth, useToast } from './AdminApp';
import { Avatar } from './FormularioTarefa';
import { Abas } from '../components/Abas';
import FilterDropdown from '../components/FilterDropdown';
import { Skeleton } from '../components/Skeleton';
import { IconAlert, IconChevronRight, IconPlus, IconSearch } from '../components/icons';
import { dia as fmtDataBR } from '../lib/datas';
import { useDegrauTrilha } from '../lib/trilha';
import { useTrocaDeNivel } from '../lib/useTrocaDeNivel';
import {
  BarraMedia, ChipSituacao, NovoInteressado, PAPEIS, SITUACOES, VisaoGeral,
  type Competencia, type Nota, type TalentoExterno, type TalentoInterno,
} from './TalentoVisaoGeral';

type Aba = 'todos' | 'time' | 'interessados';

/** As colunas do meio, por aba - entre a pessoa e a avaliação. A de
 *  interessados é a mais larga porque a candidatura respondeu mais coisas. */
const CABECALHOS: Record<Aba, string[]> = {
  todos: ['Vínculo', 'Papel ou interesse'],
  time: ['Papel', 'No time desde'],
  interessados: ['Interesse', 'Situação'],
};
type Aberto = { tipo: 'interno' | 'externo'; id: string } | null;

/** A ficha de um talento e um nivel abaixo da lista. */
const fundura = (a: Aberto) => (a ? 2 : 1);

/** Uma linha da aba Todos: o que as duas listas têm em comum, mais de onde a
 *  pessoa veio - é o vínculo que diz se "Gestor" é papel ou interesse. */
interface LinhaUnificada {
  tipo: 'interno' | 'externo';
  id: string;
  nome: string;
  email: string;
  foto: string | null;
  /** Papel, para quem é da casa; interesse, para quem quer ser. */
  meio: string;
  media: number | null;
  papel: string | null;
  situacao: string | null;
}

const VINCULOS = [
  { value: 'interno', label: 'Time' },
  { value: 'externo', label: 'Interessado' },
];
const AVALIACOES = [
  { value: 'com', label: 'Já avaliados' },
  { value: 'sem', label: 'Sem avaliação' },
];

/** O nome sem acento e em minúsculas, para a busca casar "Joao" com "João". */
const dobrar = (v: string) =>
  v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function TalentosPage({ token }: { token: string }) {
  const { onSessionExpired, pode } = useAuth();
  const { toast } = useToast();
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [internos, setInternos] = useState<TalentoInterno[]>([]);
  const [externos, setExternos] = useState<TalentoExterno[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<Aba>('todos');
  const [fVinculo, setFVinculo] = useState<string[]>([]);
  const [fPapel, setFPapel] = useState<string[]>([]);
  const [fSituacao, setFSituacao] = useState<string[]>([]);
  const [fAvaliacao, setFAvaliacao] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<Aberto>(null);
  const [criando, setCriando] = useState(false);

  const podeAvaliar = pode('talentos:avaliar');
  const podeEditar = pode('talentos:editar');

  const api = useCallback(async (busca: string) => {
    const r = await fetch(`/api/admin-data?${busca}`, { headers: { 'x-admin-session': token } });
    if (r.status === 401) { onSessionExpired(); return null; }
    return await r.json().catch(() => null);
  }, [token, onSessionExpired]);

  const gravar = useCallback(async (corpo: Record<string, unknown>) => {
    const r = await fetch('/api/admin-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: JSON.stringify(corpo),
    });
    if (r.status === 401) { onSessionExpired(); return null; }
    return await r.json().catch(() => ({ error: 'Não foi possível gravar.' }));
  }, [token, onSessionExpired]);

  useEffect(() => {
    let vivo = true;
    api('action=talentos')
      .then(d => {
        if (!vivo) return;
        if (!d || d.error) { setErro(d?.error ?? 'Não foi possível carregar o banco de talentos.'); return; }
        setCompetencias(d.competencias ?? []);
        setInternos(d.internos ?? []);
        setExternos(d.externos ?? []);
      })
      .catch(() => { if (vivo) setErro('Erro de conexão. Tente de novo.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [api]);

  // A ficha sai e a lista entra em dois tempos, como a troca de ferramenta na
  // casca. Tudo aqui embaixo lê `naTela`, e não `aberto`: durante a saída a
  // ficha continua na tela, e ela precisa da pessoa que estava aberta.
  const nivel = useTrocaDeNivel(aberto, fundura);
  const naTela = nivel.mostrado;

  /** A pessoa aberta, buscada na lista de onde ela veio. */
  const pessoa = useMemo(() => {
    if (!naTela) return null;
    return naTela.tipo === 'interno'
      ? internos.find(t => t.id === naTela.id) ?? null
      : externos.find(t => t.id === naTela.id) ?? null;
  }, [naTela, internos, externos]);

  /** As duas listas numa só, em ordem de nome: na aba Todos elas são uma
   *  coisa só, e ordenar por origem separaria de novo o que a aba juntou. */
  const todos = useMemo<LinhaUnificada[]>(() => [
    ...internos.map(t => ({
      tipo: 'interno' as const, id: t.id, nome: t.nome, email: t.email, foto: t.foto_url,
      meio: PAPEIS[t.papel] ?? t.papel, media: t.media, papel: t.papel, situacao: null,
    })),
    ...externos.map(t => ({
      tipo: 'externo' as const, id: t.id, nome: t.nome, email: t.email, foto: t.foto_url,
      meio: t.interesse || '-', media: t.media, papel: null, situacao: t.situacao,
    })),
  ].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [internos, externos]);

  /** Só o que existe na tela vira opção: oferecer "Contratado" sem nenhum
   *  contratado é oferecer uma lista vazia. */
  const opcoes = useMemo(() => ({
    papel: [...new Set(internos.map(t => t.papel))]
      .map(p => ({ value: p, label: PAPEIS[p] ?? p })),
    situacao: SITUACOES.filter(s => externos.some(t => t.situacao === s.valor))
      .map(s => ({ value: s.valor, label: s.label })),
  }), [internos, externos]);

  const temFiltro = fVinculo.length > 0 || fPapel.length > 0
    || fSituacao.length > 0 || fAvaliacao.length > 0;
  const limparFiltros = () => {
    setFVinculo([]); setFPapel([]); setFSituacao([]); setFAvaliacao([]);
  };

  const filtrados = useMemo(() => {
    const q = dobrar(busca.trim());
    const casa = (campos: string[]) => !q || campos.some(c => dobrar(c).includes(q));
    return {
      internos: internos.filter(t => casa([t.nome, t.email, PAPEIS[t.papel] ?? t.papel])),
      externos: externos.filter(t => casa([t.nome, t.email, t.interesse, t.origem])),
      // Filtro vazio não filtra nada: cada grupo só recorta quando alguém
      // escolheu alguma coisa nele.
      todos: todos.filter(t =>
        casa([t.nome, t.email, t.meio])
        && (!fVinculo.length || fVinculo.includes(t.tipo))
        && (!fPapel.length || (t.papel != null && fPapel.includes(t.papel)))
        && (!fSituacao.length || (t.situacao != null && fSituacao.includes(t.situacao)))
        && (!fAvaliacao.length || fAvaliacao.includes(t.media == null ? 'sem' : 'com'))),
    };
  }, [busca, internos, externos, todos, fVinculo, fPapel, fSituacao, fAvaliacao]);

  /** A média entra na lista sem esperar o servidor: ela é conta do que já está
   *  na tela, e recalculá-la no servidor pediria outra ida. */
  // Com um talento aberto, o caminho de pao ganha o nome dele, e "Banco de
  // Talentos" vira o degrau que volta para a lista.
  useDegrauTrilha(pessoa ? pessoa.nome : null, () => setAberto(null));

  const atualizarMedia = (tipo: 'interno' | 'externo', id: string, notas: Nota[]) => {
    const media = notas.length
      ? Math.round(notas.reduce((s, n) => s + n.nota, 0) / notas.length)
      : null;
    if (tipo === 'interno') setInternos(l => l.map(t => (t.id === id ? { ...t, media } : t)));
    else setExternos(l => l.map(t => (t.id === id ? { ...t, media } : t)));
  };

  if (naTela && pessoa) {
    return (
      <div className={`nivel ${nivel.classe}`}>
      <VisaoGeral
        tipo={naTela.tipo}
        pessoa={pessoa}
        competencias={competencias}
        podeAvaliar={podeAvaliar}
        podeEditar={podeEditar}
        api={api}
        gravar={gravar}
        onNotas={notas => atualizarMedia(naTela.tipo, naTela.id, notas)}
        onMudar={campos => setExternos(l => l.map(t => (t.id === naTela.id ? { ...t, ...campos } : t)))}
        onExcluir={() => {
          setExternos(l => l.filter(t => t.id !== naTela.id));
          setAberto(null);
        }}
      />
      </div>
    );
  }

  return (
    <div className={`nivel ${nivel.classe}`}>
    <div className="admin-content-wrap">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Banco de Talentos</h1>
          <p className="admin-page-desc">Quem já é da casa e quem quer ser.</p>
        </div>
        {podeEditar && aba === 'interessados' && (
          <button className="btn btn-primary" style={{ height: 38, padding: '0 18px', fontSize: 13 }}
            onClick={() => setCriando(true)}>
            <IconPlus size={13} /> Novo interessado
          </button>
        )}
      </div>

      <div className="talentos-topo">
        <Abas
          valor={aba}
          onChange={setAba}
          opcoes={[
            { valor: 'todos', label: `Todos (${todos.length})` },
            { valor: 'time', label: `Time (${internos.length})` },
            { valor: 'interessados', label: `Interessados (${externos.length})` },
          ]}
        />
        <label className="talentos-busca">
          <IconSearch size={13} />
          <input className="form-input" placeholder="Buscar por nome, e-mail ou interesse"
            value={busca} onChange={e => setBusca(e.target.value)} />
        </label>
      </div>

      {/* A barra é da aba Todos: nas outras duas o vínculo já está escolhido, e
          o recorte que sobraria (papel, ou situação) cabe na busca. Ela fica
          montada o tempo todo para o `.revelar` ter altura de onde sair, e
          empurra a tabela para baixo em vez de aparecer de estalo. */}
      <div className={`revelar${aba === 'todos' ? ' aberto' : ''}`}>
        <div>
          <div className="admin-toolbar talentos-filtros">
            <span className="admin-toolbar-label">Filtrar</span>
            <FilterDropdown label="Vínculo" values={fVinculo} options={VINCULOS} onChange={setFVinculo} />
            {/* Sem gente de um lado, o filtro daquele lado nao abre menu nenhum -
                controle que abre vazio e um beco. */}
            {opcoes.papel.length > 0 && (
              <FilterDropdown label="Papel" values={fPapel} options={opcoes.papel} onChange={setFPapel} />
            )}
            {opcoes.situacao.length > 0 && (
              <FilterDropdown label="Situação" values={fSituacao} options={opcoes.situacao} onChange={setFSituacao} />
            )}
            <FilterDropdown label="Avaliação" values={fAvaliacao} options={AVALIACOES} onChange={setFAvaliacao} />
            {temFiltro && (
              <button className="admin-toolbar-limpar surge" onClick={limparFiltros}>Limpar</button>
            )}
          </div>
        </div>
      </div>

      {erro ? (
        <p className="ff-vazio ff-erro"><IconAlert size={13} /> {erro}</p>
      ) : carregando ? (
        <Skeleton h={280} radius="var(--radius-md)" />
      ) : (
        <div className="talentos-quadro">
          <table className="talentos-tabela">
            <thead>
              <tr>
                <th>Pessoa</th>
                {CABECALHOS[aba].map(c => <th key={c}>{c}</th>)}
                <th>Avaliação</th>
                <th />
              </tr>
            </thead>
            {/* A `key` é a assinatura do resultado: é a troca dela que remonta as
                linhas e faz a entrada tocar. Digitar uma letra que não muda o
                resultado não reanima nada. */}
            <tbody className="lista-anima" key={
              aba + ':' + (aba === 'todos'
                ? filtrados.todos.map(t => t.tipo + t.id).join()
                : aba === 'time'
                  ? filtrados.internos.map(t => t.id).join()
                  : filtrados.externos.map(t => t.id).join())
            }>
              {aba === 'todos' && filtrados.todos.map(t => (
                <Linha key={t.tipo + t.id} nome={t.nome} email={t.email} foto={t.foto} media={t.media}
                  colunas={[<ChipVinculo tipo={t.tipo} />, t.meio]}
                  onAbrir={() => setAberto({ tipo: t.tipo, id: t.id })} />
              ))}
              {aba === 'time' && filtrados.internos.map(t => (
                <Linha key={t.id} nome={t.nome} email={t.email} foto={t.foto_url} media={t.media}
                  colunas={[
                    PAPEIS[t.papel] ?? t.papel,
                    t.desde ? fmtDataBR(t.desde.slice(0, 10)) : '-',
                  ]}
                  onAbrir={() => setAberto({ tipo: 'interno', id: t.id })} />
              ))}
              {aba === 'interessados' && filtrados.externos.map(t => (
                <Linha key={t.id} nome={t.nome} email={t.email} foto={t.foto_url} media={t.media}
                  colunas={[t.interesse || '-', <ChipSituacao situacao={t.situacao} />]}
                  onAbrir={() => setAberto({ tipo: 'externo', id: t.id })} />
              ))}
            </tbody>
          </table>
          {((aba === 'todos' && filtrados.todos.length === 0)
            || (aba === 'time' && filtrados.internos.length === 0)
            || (aba === 'interessados' && filtrados.externos.length === 0)) && (
            <p className="talentos-vazio">
              {busca.trim() || (aba === 'todos' && temFiltro)
                ? 'Ninguém com esse recorte por aqui.'
                : aba === 'interessados'
                  ? 'Nenhum interessado cadastrado. O botão acima abre o cadastro.'
                  : 'Nenhuma pessoa ativa no portal ainda.'}
            </p>
          )}
        </div>
      )}

      {criando && (
        <NovoInteressado
          gravar={gravar}
          onFechar={() => setCriando(false)}
          onCriado={t => { setExternos(l => [t, ...l]); setCriando(false); }}
        />
      )}
    </div>
    </div>
  );
}

/** De onde a pessoa vem, na aba que junta as duas listas. Mesmo desenho do chip
 *  de situação - ponto e rótulo -, porque é a mesma leitura de relance. */
function ChipVinculo({ tipo }: { tipo: 'interno' | 'externo' }) {
  const cor = tipo === 'interno' ? 'var(--green-light)' : 'var(--gray2)';
  return (
    <span className="talentos-chip" style={{ color: cor }}>
      <span className="talentos-ponto" style={{ background: cor }} />
      {tipo === 'interno' ? 'Time' : 'Interessado'}
    </span>
  );
}

/** Uma linha da tabela. A linha inteira é o gatilho: o alvo do clique é a pessoa
 *  que se estava lendo, e não um botão a mais no fim dela. */
function Linha({ nome, email, foto, colunas, media, onAbrir }: {
  nome: string; email: string; foto: string | null;
  /** As células do meio, na ordem de `CABECALHOS`. */
  colunas: ReactNode[];
  media: number | null;
  onAbrir: () => void;
}) {
  return (
    <tr className="talentos-linha" role="button" tabIndex={0}
      onClick={onAbrir}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } }}>
      <td>
        <span className="talentos-pessoa">
          <Avatar nome={nome} foto={foto} size={30} />
          <span className="talentos-pessoa-texto">
            <span className="talentos-nome">{nome}</span>
            <span className="talentos-email">{email || '-'}</span>
          </span>
        </span>
      </td>
      {colunas.map((c, i) => <td key={i}>{c}</td>)}
      <td><BarraMedia media={media} /></td>
      <td className="talentos-seta"><IconChevronRight size={13} /></td>
    </tr>
  );
}
