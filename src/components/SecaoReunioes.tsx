// ─────────────────────────────────────────────────────────────────────────────
//  A seção de reuniões: registrar à mão, puxar do Fireflies, abrir e assistir.
//
//  Morava na tela de Projetos. Saiu de lá quando o painel do lead passou a ter
//  a mesma aba: é a mesma conversa guardada do mesmo jeito, e duas cópias do
//  desenho começariam iguais e terminariam diferentes.
//
//  O que muda de um dono para o outro é só o vínculo com entregas, que o lead
//  não tem: sem `entregas`, o seletor de vínculo não aparece.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  IconAlert, IconChevronRight, IconExternal, IconMarcoPlanejado, IconPlay,
  IconPlus, IconSearch, IconX,
} from './icons';
import { COR_ENTREGA, ICONE_ENTREGA } from '../lib/etapasEntrega';
import { DatePicker } from './DatePicker';
import { dia as fmtData } from '../lib/datas';
import { SeletorPessoas } from './SeletorPessoas';
import { SeletorVinculo, Chip } from './VinculoReuniao';
import {
  ComNegrito, ReuniaoModal, lerAcoes, lerDados, lerTopicos, type TopicoReuniao,
} from './ReuniaoModal';
import {
  Avatar, ConfirmarExclusao, type Pessoa,
} from '../admin/FormularioTarefa';

/** A entrega, como esta seção precisa dela. Estrutural de propósito: a
 *  `Entrega` da tela de Projetos serve sem conversão, e este arquivo não passa
 *  a depender daquela tela. */
export interface EntregaDaReuniao {
  id: number;
  titulo: string;
  status: string;
}

/** Quem está na equipe do projeto, para aparecer primeiro na escolha de
 *  participantes. O lead não tem equipe, e por isso ela é opcional. */
export interface MembroDaReuniao extends Pessoa { papel: string }

export interface Reuniao {
  /** Id da reunião no Fireflies, quando ela veio de lá. Nulo é registro à mão. */
  fireflies_id?: string | null;
  /** Link da transcrição, para quem quiser o detalhe que a nota resume. */
  link?: string | null;
  /** O que veio do Fireflies além da nota: tópicos com horário, palavras-chave
   *  e itens de ação. Chega como JSON e é lido por `lerDados`. */
  dados?: string | null;
  /** Entregas que esta reunião tratou. A tarefa não se liga direto: ela herda
   *  as reuniões da entrega a que pertence. */
  entregas?: number[];
  id: number;
  projeto_id: string;
  data: string;
  assunto: string;
  notas: string;
  participantes: string[];
  criado_por_nome: string | null;
}

/** Diário de reuniões. Mesma forma da saúde: cada registro é gravado na hora e
 *  o valor está na série, não no último item. */
/** O que a reunião carrega, aberto: resumo, assuntos com horário, itens de
 *  ação por pessoa, palavras-chave e quem participou.
 *
 *  Os assuntos e as ações são clicáveis quando há gravação: cada um leva ao
 *  minuto em que aquilo foi dito. */
export function CorpoReuniao({ reg, pessoas, entregas, somenteLeitura, onAssistir, onVincular, onAbrirEntrega }: {
  reg: Reuniao;
  pessoas: Pessoa[];
  /** As entregas do projeto, para escolher onde a reunião foi tratada.
   *  Ausente no lead: ali não há entrega a que vincular, e sem elas o seletor
   *  e os chips não aparecem. */
  entregas?: EntregaDaReuniao[];
  /** Quem só lê continua abrindo a reunião, os tópicos e a gravação. O que
   *  some é o gatilho de vincular e o de soltar o vínculo. */
  somenteLeitura: boolean;
  onAssistir: () => void;
  onVincular?: (tipo: 'entrega', alvoId: number, ligar: boolean) => void;
  onAbrirEntrega?: (entregaId: number) => void;
}) {
  const dados = lerDados(reg.dados);
  const topicos = lerTopicos(dados?.topicos);
  const acoes = lerAcoes(dados?.acoes);
  const daCasa = reg.participantes
    .map(id => pessoas.find(x => x.id === id))
    .filter((p): p is Pessoa => !!p);

  return (
    <div className="reuniao-corpo">
      <div className="reuniao-acoes">
        {reg.fireflies_id && (
          <button type="button" className="modal-acao-primaria" onClick={onAssistir}>
            <IconPlay size={13} /> Assistir a gravação
          </button>
        )}
        {dados?.duracao ? <span className="reuniao-duracao">{dados.duracao} min</span> : null}
        <span style={{ marginLeft: 'auto' }}>
          {!somenteLeitura && entregas && (
          <SeletorVinculo
            rotulo="Entregas tratadas nesta reunião"
            acao="Vincular entrega"
            vazio="O projeto ainda não tem entregas."
            opcoes={entregas.map(e => ({ id: e.id, nome: e.titulo, nota: e.status }))}
            escolhidos={reg.entregas ?? []}
            onAlternar={(id, ligar) => onVincular?.('entrega', id, ligar)}
          />
          )}
        </span>
      </div>

      {entregas && (reg.entregas?.length ?? 0) > 0 && (
        <div className="vinculo-chips">
          {reg.entregas!.map(id => {
            const e = entregas.find(x => x.id === id);
            // A marca da entrega é a da etapa dela, na cor da etapa: é o mesmo
            // sinal que a linha da entrega mostra, e ele diz de relance se
            // aquilo que a reunião tratou já andou.
            const Marca = ICONE_ENTREGA[e?.status ?? ''] ?? IconMarcoPlanejado;
            return (
              <Chip key={id}
                icone={<Marca size={12} />}
                cor={COR_ENTREGA[e?.status ?? ''] ?? 'var(--gray2)'}
                nome={e?.titulo ?? 'Entrega removida'}
                nota={e?.status}
                titulo={e ? `Ver a entrega - ${e.status}` : 'Entrega removida'}
                onAbrir={() => onAbrirEntrega?.(id)}
                onSoltar={somenteLeitura ? undefined : () => onVincular?.('entrega', id, false)}
              />
            );
          })}
        </div>
      )}

      <p className="reuniao-notas"><ComNegrito texto={reg.notas} /></p>

      {topicos.length > 0 && (
        <div className="reuniao-bloco">
          <p className="reuniao-rotulo">Assuntos</p>
          <div className="reuniao-topicos">
            {topicos.map((t, i) => (
              <div key={`${t.inicio}-${i}`} className="reuniao-topico">
                <span className="reuniao-tempo">{t.rotulo}</span>
                <span>
                  <strong>{t.titulo}</strong>
                  {t.linhas.length > 0 && <span> <ComNegrito texto={t.linhas.join(' ')} /></span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {acoes.length > 0 && (
        <div className="reuniao-bloco">
          <p className="reuniao-rotulo">Combinados</p>
          {acoes.map(g => (
            <div key={g.quem} className="reuniao-acao-grupo">
              <p className="reuniao-quem">{g.quem}</p>
              <ul>
                {g.itens.map((it, i) => (
                  <li key={i}>
                    <ComNegrito texto={it.texto} />
                    {it.rotulo && <span className="reuniao-tempo">{it.rotulo}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {(dados?.palavras?.length ?? 0) > 0 && (
        <div className="reuniao-palavras">
          {dados!.palavras!.map(p => <span key={p} className="reuniao-palavra">{p}</span>)}
        </div>
      )}

      {(dados?.participantes?.length ?? 0) > 0 && (
        <p className="reuniao-gente">{dados!.participantes!.join(' · ')}</p>
      )}

      {daCasa.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 7 }}>
          {daCasa.map(p => (
            <span key={p.id} title={p.nome}>
              <Avatar nome={p.nome} foto={p.foto_url} size={20} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Uma reunião da conta do Fireflies, como ela chega da rota. */
export interface ReuniaoFF {
  id: string;
  titulo: string;
  data: string | null;
  duracao: number | null;
  participantes: string[];
  url: string | null;
}

/** Busca no Fireflies e anexa ao projeto.
 *
 *  A lista vem das reuniões mais recentes da conta e é filtrada por título ou
 *  participante. A busca é do servidor para cá porque a chave da API não sai do
 *  cofre - a tela nunca fala com o Fireflies direto. */
function BuscaFireflies({ jaAnexadas, salvando, onBuscar, onAnexar, onFechar }: {
  /** Ids do Fireflies que este projeto já tem: essas saem da lista. */
  jaAnexadas: string[];
  salvando: boolean;
  onBuscar: (busca: string) => Promise<{ reunioes?: ReuniaoFF[]; error?: string }>;
  onAnexar: (ids: string[]) => Promise<void>;
  onFechar: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [reunioes, setReunioes] = useState<ReuniaoFF[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  /** O que vai ser anexado quando a pessoa confirmar. */
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  /** Anexo em curso. O botão desliga enquanto isso: puxar dez reuniões leva
   *  segundos, e sem o aviso a pessoa clica de novo - foi assim que nasceram as
   *  cópias. */
  const [anexando, setAnexando] = useState(false);

  // A consulta espera a digitação parar: cada tecla seria uma ida ao Fireflies.
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => {
      setCarregando(true);
      onBuscar(busca.trim())
        .then(d => {
          if (!vivo) return;
          if (d?.error) { setErro(d.error); setReunioes([]); }
          else { setErro(null); setReunioes(d.reunioes ?? []); }
          setCarregando(false);
        })
        .catch(() => { if (vivo) { setErro('Não foi possível falar com o Fireflies.'); setCarregando(false); } });
    }, busca ? 350 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [busca]);

  /** O que já está no projeto sai da lista: oferecer de novo o que a pessoa
   *  acabou de anexar só dá trabalho de reconhecer. */
  const disponiveis = reunioes.filter(m => !jaAnexadas.includes(m.id));

  const alternar = (id: string) =>
    setEscolhidas(e => (e.includes(id) ? e.filter(x => x !== id) : [...e, id]));

  async function anexar() {
    if (anexando) return;
    setAnexando(true);
    try {
      await onAnexar(escolhidas);
      setEscolhidas([]);
    } finally {
      setAnexando(false);
    }
  }

  return (
    <div className="ff-busca">
      <div className="secao-busca" style={{ marginBottom: 12 }}>
        <span className="secao-busca-campo">
          <IconSearch size={13} />
          <input autoFocus value={busca} aria-label="Buscar reunião no Fireflies"
            placeholder="Buscar por título ou participante"
            onChange={e => setBusca(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') onFechar(); }} />
          {busca && (
            <button type="button" aria-label="Limpar a busca" onClick={() => setBusca('')}>
              <IconX size={12} />
            </button>
          )}
        </span>
        <button type="button" className="modal-acao" onClick={onFechar}>Fechar</button>
      </div>

      {erro ? (
        <p className="ff-vazio ff-erro"><IconAlert size={13} /> {erro}</p>
      ) : carregando ? (
        <div className="dux-spinner-row" style={{ padding: '14px' }}>
          <span className="dux-spinner sm" />
        </div>
      ) : disponiveis.length === 0 ? (
        <p className="ff-vazio">
          {busca.trim()
            ? `Nenhuma reunião com "${busca.trim()}".`
            : jaAnexadas.length > 0
              ? 'Todas as reuniões da conta já estão anexadas.'
              : 'Nenhuma reunião na conta.'}
        </p>
      ) : (
        <>
          {/* A `key` é a assinatura do resultado: quando ele muda, os itens
              remontam e a entrada toca. */}
          <div className="admin-file-list lista-anima"
            key={disponiveis.map(m => m.id).join(',')}>
            {disponiveis.map(m => {
              const marcada = escolhidas.includes(m.id);
              return (
                <label key={m.id} className={`admin-file-item ff-item${marcada ? ' marcada' : ''}`}>
                  <input type="checkbox" className="form-checkbox" checked={marcada}
                    onChange={() => alternar(m.id)} />
                  <div className="ff-item-texto">
                    <p className="ff-item-titulo">{m.titulo}</p>
                    <p className="ff-item-meta">
                      {fmtData(m.data ? m.data.slice(0, 10) : null)}
                      {m.duracao ? ` · ${m.duracao} min` : ''}
                      {m.participantes.length ? ` · ${m.participantes.slice(0, 3).join(', ')}` : ''}
                      {m.participantes.length > 3 ? ` +${m.participantes.length - 3}` : ''}
                    </p>
                  </div>
                  {m.url && (
                    <a className="admin-file-download" href={m.url} target="_blank" rel="noopener noreferrer"
                      title="Abrir a transcrição no Fireflies"
                      onClick={e => { e.stopPropagation(); e.preventDefault(); window.open(m.url!, '_blank', 'noopener'); }}>
                      <IconExternal size={13} />
                    </a>
                  )}
                </label>
              );
            })}
          </div>

          {/* A barra só aparece com algo escolhido: sem seleção ela seria um
              botão apagado ocupando espaço. */}
          {escolhidas.length > 0 && (
            <div className="ff-barra surge">
              <span>{escolhidas.length} selecionada{escolhidas.length > 1 ? 's' : ''}</span>
              <button type="button" className="modal-acao" disabled={anexando}
                onClick={() => setEscolhidas([])}>
                Limpar
              </button>
              <button type="button" className="modal-acao-primaria" disabled={anexando || salvando}
                onClick={() => void anexar()}>
                {anexando
                  ? <><span className="dux-spinner sm na-cor" /> Anexando…</>
                  : `Anexar ${escolhidas.length}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function SecaoReunioes({ registros, pessoas, equipe, entregas, focada, salvando, somenteLeitura,
  onRegistrar, onVincular, onAbrirEntrega, onBuscarFireflies, onBuscarGravacao,
  onAnexarFireflies, onExcluir }: {
  registros: Reuniao[];
  pessoas: Pessoa[];
  /** Quem está no projeto aparece primeiro na escolha de participantes. O lead
   *  não tem equipe, então ali a lista vem na ordem em que veio. */
  equipe?: MembroDaReuniao[];
  salvando: boolean;
  somenteLeitura: boolean;
  onRegistrar: (r: { data: string; assunto: string; notas: string; participantes: string[] }) => Promise<void>;
  /** As entregas do projeto, para vincular a reunião a elas. Ausentes no lead. */
  entregas?: EntregaDaReuniao[];
  onVincular?: (reuniaoId: number, tipo: 'entrega', alvoId: number, ligar: boolean) => void;
  onAbrirEntrega?: (entregaId: number) => void;
  /** Reunião que a tela deve abrir e destacar, vinda do chip de uma entrega. */
  focada?: number | null;
  onBuscarFireflies: (busca: string) => Promise<{ reunioes?: ReuniaoFF[]; error?: string }>;
  onBuscarGravacao: (firefliesId: string) => Promise<{ video?: string | null; audio?: string | null; error?: string }>;
  onAnexarFireflies: (firefliesIds: string[]) => Promise<void>;
  onExcluir: (r: Reuniao) => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const [buscandoFF, setBuscandoFF] = useState(false);
  /** Os dois painéis desta seção nascem montados na primeira abertura e ficam:
   *  é o que faz fechar ser suave, e de quebra a busca do Fireflies guarda o
   *  que já tinha achado. */
  const [jaAbriuForm, setJaAbriuForm] = useState(false);
  const [jaAbriuFF, setJaAbriuFF] = useState(false);
  /** Reuniões com o corpo aberto. Nasce vazio: o resumo de uma reunião do
   *  Fireflies tem parágrafos, e três delas seguidas enterravam a lista. */
  const [abertas, setAbertas] = useState<number[]>([]);
  /** A reunião esperando confirmação. Excluir é definitivo, e a nota some com
   *  ela - o link para a transcrição inclusive. */
  const [excluindo, setExcluindo] = useState<Reuniao | null>(null);
  /** A reunião com a gravação aberta. */
  const [assistindo, setAssistindo] = useState<Reuniao | null>(null);
  /** A que acabou de ser aberta pelo chip de uma entrega. */
  const [realcada, setRealcada] = useState<number | null>(null);

  // Vindo do chip de uma entrega: abre a reunião pedida e pisca.
  useEffect(() => {
    if (focada == null) return;
    setJaAbertas(j => (j.includes(focada) ? j : [...j, focada]));
    setAbertas(a => (a.includes(focada) ? a : [...a, focada]));
    setRealcada(focada);
    const t = setTimeout(() => setRealcada(r => (r === focada ? null : r)), 2200);
    return () => clearTimeout(t);
  }, [focada]);
  /** As que já foram abertas alguma vez: o conteúdo delas fica montado, e é
   *  isso que faz o recolher ser suave. */
  const [jaAbertas, setJaAbertas] = useState<number[]>([]);
  const alternarReuniao = (id: number) => {
    setJaAbertas(j => (j.includes(id) ? j : [...j, id]));
    setAbertas(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id]));
  };
  const [data, setData] = useState('');
  const [assunto, setAssunto] = useState('');
  const [notas, setNotas] = useState('');
  const [quem, setQuem] = useState<string[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});

  const doProjeto = (equipe ?? []).map(m => m.id);
  const ordenadas = [
    ...pessoas.filter(p => doProjeto.includes(p.id)),
    ...pessoas.filter(p => !doProjeto.includes(p.id)),
  ];

  function limpar() {
    setData(''); setAssunto(''); setNotas(''); setQuem([]); setErros({}); setAbrindo(false);
  }

  async function registrar() {
    const novos: Record<string, string> = {};
    if (!data) novos.data = 'Informe a data.';
    if (!assunto.trim()) novos.assunto = 'Informe o assunto.';
    if (!notas.trim()) novos.notas = 'Registre o que foi tratado.';
    setErros(novos);
    if (Object.keys(novos).length) return;
    await onRegistrar({ data, assunto: assunto.trim(), notas: notas.trim(), participantes: quem });
    limpar();
  }

  return (
    <section>
      <div className="admin-section-head">
        <p className="admin-section-title">
          Reuniões
          {registros.length > 0 && <span style={{ marginLeft: 6, fontWeight: 600 }}>({registros.length})</span>}
        </p>
        {!somenteLeitura && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Puxar do Fireflies e registrar à mão são o mesmo gesto - guardar
                o que foi conversado -, então ficam lado a lado. */}
            <button type="button" className="secao-add"
              onClick={() => { setJaAbriuFF(true); setBuscandoFF(v => !v); setAbrindo(false); }}
              title="Buscar reunião no Fireflies" aria-label="Buscar reunião no Fireflies">
              <img src="/marcas/fireflies.webp" alt="" width={14} height={14}
                style={{ display: 'block', objectFit: 'contain' }} />
            </button>
            <button type="button" className="secao-add"
              onClick={() => { setJaAbriuForm(true); setAbrindo(a => !a); setBuscandoFF(false); }}
              title="Registrar reunião" aria-label="Registrar reunião">
              <IconPlus size={14} />
            </button>
          </span>
        )}
      </div>

      {jaAbriuFF && (
        <div className={`revelar${buscandoFF ? ' aberto' : ''}`}>
          <div>
            <BuscaFireflies
              jaAnexadas={registros.map(r => r.fireflies_id).filter((x): x is string => !!x)}
              salvando={salvando}
              onBuscar={onBuscarFireflies}
              onAnexar={async ids => { await onAnexarFireflies(ids); }}
              onFechar={() => setBuscandoFF(false)}
            />
          </div>
        </div>
      )}

      {/* Montado na primeira abertura e mantido, como manda o `.revelar`: com
          o formulário nascendo e morrendo, fechar era um corte seco. */}
      {jaAbriuForm && (
        <div className={`revelar${abrindo ? ' aberto' : ''}`}>
          <div>
            <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="campos-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Data *</label>
              <DatePicker compact allowPast value={data}
                onChange={v => { setData(v); setErros(e => ({ ...e, data: '' })); }} error={erros.data} />
            </div>
            <div className="form-group">
              <label className="form-label">Assunto *</label>
              <input className={`form-input${erros.assunto ? ' error' : ''}`} value={assunto}
                onChange={e => { setAssunto(e.target.value); setErros(x => ({ ...x, assunto: '' })); }}
                placeholder="Alinhamento semanal" />
              {erros.assunto && <p className="form-error">{erros.assunto}</p>}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Participantes</label>
            <SeletorPessoas pessoas={ordenadas} valor={quem} onChange={setQuem}
              vazio="Escolher participantes" />
          </div>

          <div className="form-group">
            <label className="form-label">O que foi tratado *</label>
            <textarea className={`form-input${erros.notas ? ' error' : ''}`} rows={4} value={notas}
              onChange={e => { setNotas(e.target.value); setErros(x => ({ ...x, notas: '' })); }}
              placeholder="Decisões, encaminhamentos e responsáveis" />
            {erros.notas && <p className="form-error">{erros.notas}</p>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="modal-acao" onClick={limpar}>Cancelar</button>
            <button type="button" className="modal-acao-primaria" disabled={salvando}
              onClick={() => void registrar()}>
              {salvando ? 'Registrando…' : 'Registrar'}
            </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {assistindo && (
        <ReuniaoModal
          reuniao={assistindo}
          buscarGravacao={onBuscarGravacao}
          onFechar={() => setAssistindo(null)}
        />
      )}

      {excluindo && (
        <ConfirmarExclusao
          titulo={excluindo.assunto}
          oQue="reunião"
          onCancelar={() => setExcluindo(null)}
          onConfirmar={() => { onExcluir(excluindo); setExcluindo(null); }}
        />
      )}

      {registros.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0 }}>Nenhuma reunião registrada.</p>
      ) : (
        <div className="admin-file-list">
          {registros.map(reg => {
            const aberta = abertas.includes(reg.id);
            return (
            <div key={reg.id}
              className={`admin-file-item${realcada === reg.id ? ' realcada' : ''}`}
              ref={el => { if (realcada === reg.id && el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}
              style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" className="reuniao-cabeca" aria-expanded={aberta}
                  onClick={() => alternarReuniao(reg.id)}>
                  {reg.fireflies_id && (
                    <img src="/marcas/fireflies.webp" alt="" width={13} height={13}
                      title="Puxada do Fireflies"
                      style={{ display: 'block', objectFit: 'contain', flexShrink: 0 }} />
                  )}
                  <strong>{reg.assunto}</strong>
                  <span>
                    {fmtData(reg.data)}
                    {reg.criado_por_nome ? ` · ${reg.criado_por_nome}` : ''}
                  </span>
                  <span className={`entrega-seta${aberta ? ' aberta' : ''}`}>
                    <IconChevronRight size={12} />
                  </span>
                </button>
                {reg.link && (
                  <a href={reg.link} target="_blank" rel="noopener noreferrer"
                    className="admin-file-download" title="Abrir a transcrição no Fireflies">
                    <IconExternal size={13} />
                  </a>
                )}
                {!somenteLeitura && (
                  <button type="button" className="file-delete-btn" title="Excluir reunião"
                    aria-label={`Excluir reunião ${reg.assunto}`} onClick={() => setExcluindo(reg)}>
                    <IconX size={13} />
                  </button>
                )}
              </div>

              <div className={`revelar${aberta ? ' aberto' : ''}`}>
                <div>
                  {/* Montado na primeira abertura e mantido: é o que faz o
                      recolher ser suave. Uma aba com dez reuniões não constrói
                      dez destes de saída, só os que forem abertos. */}
                  {jaAbertas.includes(reg.id) && (
                    <CorpoReuniao reg={reg} pessoas={pessoas} entregas={entregas}
                      somenteLeitura={somenteLeitura}
                      onAssistir={() => setAssistindo(reg)}
                      onVincular={(tipo, alvo, ligar) => onVincular?.(reg.id, tipo, alvo, ligar)}
                      onAbrirEntrega={onAbrirEntrega} />
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
