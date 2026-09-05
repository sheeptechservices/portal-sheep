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
import { Skeleton } from '../components/Skeleton';
import { IconAlert, IconChevronRight, IconPlus, IconSearch } from '../components/icons';
import { dia as fmtDataBR } from '../lib/datas';
import { useDegrauTrilha } from '../lib/trilha';
import {
  BarraMedia, ChipSituacao, NovoInteressado, PAPEIS, VisaoGeral,
  type Competencia, type Nota, type TalentoExterno, type TalentoInterno,
} from './TalentoVisaoGeral';

type Aba = 'time' | 'interessados';
type Aberto = { tipo: 'interno' | 'externo'; id: string } | null;

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
  const [aba, setAba] = useState<Aba>('time');
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

  /** A pessoa aberta, buscada na lista de onde ela veio. */
  const pessoa = useMemo(() => {
    if (!aberto) return null;
    return aberto.tipo === 'interno'
      ? internos.find(t => t.id === aberto.id) ?? null
      : externos.find(t => t.id === aberto.id) ?? null;
  }, [aberto, internos, externos]);

  const filtrados = useMemo(() => {
    const q = dobrar(busca.trim());
    const casa = (campos: string[]) => !q || campos.some(c => dobrar(c).includes(q));
    return {
      internos: internos.filter(t => casa([t.nome, t.email, PAPEIS[t.papel] ?? t.papel])),
      externos: externos.filter(t => casa([t.nome, t.email, t.interesse, t.origem])),
    };
  }, [busca, internos, externos]);

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

  if (aberto && pessoa) {
    return (
      <VisaoGeral
        tipo={aberto.tipo}
        pessoa={pessoa}
        competencias={competencias}
        podeAvaliar={podeAvaliar}
        podeEditar={podeEditar}
        api={api}
        gravar={gravar}
        onNotas={notas => atualizarMedia(aberto.tipo, aberto.id, notas)}
        onMudar={campos => setExternos(l => l.map(t => (t.id === aberto.id ? { ...t, ...campos } : t)))}
        onExcluir={() => {
          setExternos(l => l.filter(t => t.id !== aberto.id));
          setAberto(null);
        }}
      />
    );
  }

  return (
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
                <th>{aba === 'time' ? 'Papel' : 'Interesse'}</th>
                <th>{aba === 'time' ? 'No time desde' : 'Situação'}</th>
                <th>Avaliação</th>
                <th />
              </tr>
            </thead>
            {/* A `key` é a assinatura do resultado: é a troca dela que remonta as
                linhas e faz a entrada tocar. Digitar uma letra que não muda o
                resultado não reanima nada. */}
            <tbody className="lista-anima" key={
              aba + ':' + (aba === 'time'
                ? filtrados.internos.map(t => t.id).join()
                : filtrados.externos.map(t => t.id).join())
            }>
              {aba === 'time' && filtrados.internos.map(t => (
                <Linha key={t.id} nome={t.nome} email={t.email} foto={t.foto_url} media={t.media}
                  meio={PAPEIS[t.papel] ?? t.papel}
                  fim={t.desde ? fmtDataBR(t.desde.slice(0, 10)) : '-'}
                  onAbrir={() => setAberto({ tipo: 'interno', id: t.id })} />
              ))}
              {aba === 'interessados' && filtrados.externos.map(t => (
                <Linha key={t.id} nome={t.nome} email={t.email} foto={t.foto_url} media={t.media}
                  meio={t.interesse || '-'}
                  fim={<ChipSituacao situacao={t.situacao} />}
                  onAbrir={() => setAberto({ tipo: 'externo', id: t.id })} />
              ))}
            </tbody>
          </table>
          {((aba === 'time' && filtrados.internos.length === 0)
            || (aba === 'interessados' && filtrados.externos.length === 0)) && (
            <p className="talentos-vazio">
              {busca.trim()
                ? 'Ninguém com esse nome por aqui.'
                : aba === 'time'
                  ? 'Nenhuma pessoa ativa no portal ainda.'
                  : 'Nenhum interessado cadastrado. O botão acima abre o cadastro.'}
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
  );
}

/** Uma linha da tabela. A linha inteira é o gatilho: o alvo do clique é a pessoa
 *  que se estava lendo, e não um botão a mais no fim dela. */
function Linha({ nome, email, foto, meio, fim, media, onAbrir }: {
  nome: string; email: string; foto: string | null;
  meio: string; fim: ReactNode; media: number | null;
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
      <td>{meio}</td>
      <td>{fim}</td>
      <td><BarraMedia media={media} /></td>
      <td className="talentos-seta"><IconChevronRight size={13} /></td>
    </tr>
  );
}
