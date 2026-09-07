// ─────────────────────────────────────────────────────────────────────────────
//  A visão geral de um talento, e as peças que ela e a tabela dividem.
//
//  Mesma tela para os dois cadastros: à esquerda quem é a pessoa, no meio o
//  radar, ao lado a avaliação competência a competência. O que muda entre um
//  interno e um interessado é só a ficha da esquerda - o interno traz papel e
//  data de entrada, o interessado traz interesse, origem e situação, e estes são
//  editáveis.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useToast } from './AdminApp';
import { Avatar } from './FormularioTarefa';
import { Dialogo } from '../components/Dialogo';
import { Skeleton } from '../components/Skeleton';
import { IconLink, IconTrash } from '../components/icons';
import { dia as fmtDataBR } from '../lib/datas';
import { RadarHabilidades } from './RadarHabilidades';

export interface Competencia { id: number; nome: string }

export interface TalentoInterno {
  id: string;
  nome: string;
  email: string;
  foto_url: string | null;
  papel: string;
  desde: string;
  media: number | null;
  /** Os nomes do que a pessoa declarou saber. Vêm na listagem porque a tabela
   *  filtra e busca por eles. */
  habilidades: string[];
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
  // O que a tabela mostra e filtra da candidatura. O resto vem na ficha.
  cidade: string;
  uf: string;
  senioridade: string;
  tempo_experiencia: string;
  nivel_ingles: string;
  possui_cnpj: boolean | null;
  indicado_por: string;
  habilidades: string[];
}

/** Uma habilidade declarada pela própria pessoa. */
export interface Habilidade {
  nome: string;
  /** Como veio escrito: "3 anos", "6 meses". */
  tempo: string | null;
  /** De 1 a 5, como ela se avaliou. */
  nivel: number | null;
}

/** A candidatura inteira, como ela chegou. Tudo opcional: interessado
 *  cadastrado à mão no portal tem quase nada disto. */
export interface FichaCandidato {
  nascimento: string | null;
  sexo: string | null;
  cidade: string | null;
  estado: string | null;
  uf: string | null;
  linkedin: string | null;
  github: string | null;
  vaga: string | null;
  modelo_trabalho: string | null;
  contratacao: string | null;
  resumo: string | null;
  senioridade: string | null;
  tempo_experiencia: string | null;
  nivel_ingles: string | null;
  outro_idioma: string | null;
  possui_cnpj: boolean | null;
  regime_fiscal: string | null;
  case_sucesso: string | null;
  indicado_por: string | null;
  indicado_por_email: string | null;
  id_origem: string | null;
  status_origem: string | null;
  candidatura_em: string | null;
  atualizado_origem_em: string | null;
  observacoes: string | null;
}

export interface Nota {
  competencia_id: number;
  nota: number;
  atualizado_em: string;
  atualizado_por_nome: string | null;
}

export const PAPEIS: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  membro: 'Membro',
};

/** Um campo da capa: rótulo em cima, valor embaixo. Campo vazio não vira campo
 *  com traço - a capa ficaria mais cheia de ausências do que de respostas. O
 *  forte é a senioridade, que é a primeira coisa que se procura. */
function Campo({ rotulo, valor, forte, largo, dica }: {
  rotulo: string;
  valor: ReactNode;
  forte?: boolean;
  /** Ocupa duas colunas da grade - para o valor que não cabe em uma. */
  largo?: boolean;
  dica?: string;
}) {
  if (valor == null || valor === '') return null;
  return (
    <div className={`talento-campo${forte ? ' forte' : ''}${largo ? ' largo' : ''}`} title={dica}>
      <dt>{rotulo}</dt>
      <dd>{valor}</dd>
    </div>
  );
}

/** A ficha tem alguma resposta, ou só as colunas vazias? */
function temFicha(f: FichaCandidato) {
  return Boolean(f.resumo || f.case_sucesso || f.senioridade || f.vaga
    || f.nivel_ingles || f.indicado_por || f.id_origem);
}

/** Os anos completos até hoje. Sem data, nada - idade calculada de nada seria
 *  um número inventado. */
function idade(nascimentoIso: string | null): number | null {
  if (!nascimentoIso) return null;
  const d = new Date(nascimentoIso.slice(0, 10));
  if (Number.isNaN(d.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - d.getFullYear();
  const mes = hoje.getMonth() - d.getMonth();
  if (mes < 0 || (mes === 0 && hoje.getDate() < d.getDate())) anos--;
  return anos >= 0 && anos < 120 ? anos : null;
}

/** A média em barra. Sem nota, uma frase: barra vazia leria como nota zero. */
export function BarraMedia({ media }: { media: number | null }) {
  if (media == null) return <span className="talentos-sem-nota">sem avaliação</span>;
  return (
    <span className="talentos-media">
      <span className="talentos-media-trilho">
        <span className="talentos-media-tinta" style={{ width: `${Math.min(100, media * 10)}%` }} />
      </span>
      <strong>{media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</strong>
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
export function Radar({ competencias, notas, foco, onFoco, max = 10, tom = 'casa' }: {
  competencias: Competencia[];
  notas: Map<number, number>;
  /** A competência em foco - a mesma que a régua embaixo acende. */
  foco?: number | null;
  onFoco?: (id: number | null) => void;
  /** O topo da escala: 10 na avaliação da casa, 5 nas habilidades declaradas.
   *  O desenho é o mesmo; o que muda é o que cada anel vale. */
  max?: number;
  /** Quem deu a nota. São dois desenhos iguais na mesma tela, e a cor é o que
   *  diz num relance qual é a leitura da casa e qual é a da própria pessoa. */
  tom?: 'casa' | 'declarado';
}) {
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
  const MAX = max;
  const ponto = (i: number, valor: number) => {
    // Começa no topo e gira no sentido do relógio, como todo mostrador.
    const angulo = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (Math.max(0, Math.min(MAX * 1.3, valor)) / MAX) * raio;
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
    <svg className={`talentos-radar tom-${tom}${foco != null ? ' com-foco' : ''}`}
      viewBox={`0 0 ${LARGURA} ${ALTURA}`} role="img"
      aria-label={`Radar de ${n} competências`}
      onMouseLeave={() => onFoco?.(null)}>
      {/* A teia: quatro anéis de 25 em 25, para a leitura ter régua. */}
      {/* Quatro anéis, sempre: a régua do desenho não muda de densidade só
          porque a escala vai a 5 em vez de 10. */}
      {[0.25, 0.5, 0.75, 1].map(f => f * MAX).map(v => (
        <polygon key={v} className="talentos-radar-teia" points={poligono(() => v)} />
      ))}
      {competencias.map((c, i) => {
        const [x, y] = ponto(i, MAX);
        return (
          <line key={i} x1={centro.x} y1={centro.y} x2={x} y2={y}
            className={`talentos-radar-eixo${foco === c.id ? ' aceso' : ''}`} />
        );
      })}
      <polygon className="talentos-radar-area" points={poligono(i => notas.get(competencias[i].id) ?? 0)} />
      {competencias.map((c, i) => {
        const [x, y] = ponto(i, notas.get(c.id) ?? 0);
        return (
          <circle key={c.id} cx={x} cy={y} r="3.5"
            className={`talentos-radar-ponto${foco === c.id ? ' aceso' : ''}`} />
        );
      })}
      {competencias.map((c, i) => {
        const [x, y] = ponto(i, MAX * 1.2);
        // O rótulo se alinha pelo lado em que está: à direita do desenho ele
        // começa no eixo, à esquerda termina nele, e em cima e embaixo fica
        // centrado. Alinhado sempre ao centro, os de lado invadiam o polígono.
        const meio = Math.abs(x - centro.x) < 6;
        const linhas = emLinhas(c.nome);
        const nota = notas.get(c.id);
        // A área de toque cobre o eixo inteiro, da ponta ao rótulo: mirar num
        // ponto de 3,5px de raio é pedir pontaria, e o eixo é o que a pessoa
        // está lendo. Invisível, mas clicável.
        const [tx, ty] = ponto(i, MAX * 0.6);
        return (
          <g key={c.id} className={`talentos-radar-eixo-grupo${foco === c.id ? ' aceso' : ''}`}
            role="button" tabIndex={0}
            aria-label={`${c.nome}: ${nota != null ? nota : 'sem nota'}`}
            onMouseEnter={() => onFoco?.(c.id)}
            onFocus={() => onFoco?.(c.id)}
            onBlur={() => onFoco?.(null)}>
            <line className="talentos-radar-alvo" x1={centro.x} y1={centro.y} x2={x} y2={y} />
            <text className="talentos-radar-rotulo" x={x} y={y}
              textAnchor={meio ? 'middle' : x > centro.x ? 'start' : 'end'}
              dominantBaseline={y < centro.y - 6 ? 'auto' : y > centro.y + 6 ? 'hanging' : 'middle'}>
              {linhas.map((linha, k) => (
                <tspan key={k} x={x} dy={k === 0 ? 0 : 12}>{linha}</tspan>
              ))}
            </text>
            {/* O valor só aparece no foco: oito números soltos no desenho o
                tempo todo virariam mancha, e a régua embaixo já os tem. */}
            {foco === c.id && (
              <g className="talentos-radar-balao" aria-hidden="true">
                <rect x={tx - 20} y={ty - 12} width={40} height={22} rx={6} />
                <text x={tx} y={ty} textAnchor="middle" dominantBaseline="central">
                  {nota != null ? nota : '-'}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * O e-mail quebra depois do arroba, e nao no meio do dominio.
 *
 * O `<wbr>` e uma oportunidade de quebra, nao um caractere: a linha pode
 * partir ali, e quem copia continua levando o endereco inteiro.
 */
function EmailQuebravel({ valor }: { valor: string }) {
  const arroba = valor.indexOf('@');
  if (arroba < 0) return <>{valor}</>;
  return <>{valor.slice(0, arroba + 1)}<wbr />{valor.slice(arroba + 1)}</>;
}

export function VisaoGeral({
  tipo, pessoa, competencias, podeAvaliar, podeEditar, api, gravar,
  onNotas, onExcluir,
}: {
  tipo: 'interno' | 'externo';
  pessoa: TalentoInterno | TalentoExterno;
  competencias: Competencia[];
  podeAvaliar: boolean;
  podeEditar: boolean;
  api: (busca: string) => Promise<any>;
  gravar: (corpo: Record<string, unknown>) => Promise<any>;
  onNotas: (notas: Nota[]) => void;
  onExcluir: () => void;
}) {
  const { toast } = useToast();
  const [notas, setNotas] = useState<Nota[]>([]);
  const [habilidades, setHabilidades] = useState<Habilidade[]>([]);
  const [ficha, setFicha] = useState<FichaCandidato | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  /** A competência sob o ponteiro, no radar ou na régua. As duas peças mostram
   *  o mesmo número, e uma acende a outra - senão é preciso contar os vértices
   *  para saber qual linha é qual. */
  const [focoComp, setFocoComp] = useState<number | null>(null);
  const externo = tipo === 'externo' ? (pessoa as TalentoExterno) : null;

  useEffect(() => {
    let vivo = true;
    api(`action=talento_notas&tipo=${tipo}&id=${encodeURIComponent(pessoa.id)}`)
      .then((d: any) => {
        if (!vivo) return;
        if (d?.notas) setNotas(d.notas);
        setHabilidades(d?.habilidades ?? []);
        setFicha(d?.ficha ?? null);
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [api, tipo, pessoa.id]);

  /** A coluna da esquerda é o radar de habilidades. Sem habilidade declarada -
   *  o caso de quem é da casa -, a avaliação ocupa a linha inteira. */
  const temEsquerda = habilidades.length > 0;

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

  return (
    <div className="admin-content-wrap">
      {/* A capa: quem é a pessoa, em uma faixa. Antes isso era uma coluna
          estreita ao lado do radar, e a identidade - nome, papel, senioridade,
          onde mora - ficava espremida em 280px enquanto o resto da tela
          sobrava. */}
      <header className="painel talento-capa">
        <Avatar nome={pessoa.nome} foto={pessoa.foto_url} size={76} />
        <div className="talento-capa-texto">
          <h1 className="talento-capa-nome">{pessoa.nome}</h1>
          <p className="talento-capa-papel">
            {externo
              ? (externo.interesse || 'Sem interesse declarado')
              : (PAPEIS[(pessoa as TalentoInterno).papel] ?? '-')}
          </p>
          {/* Campo e valor, e não fileira de chips: chip serve para uma etiqueta
              que se lê sozinha ("Pleno"), e aqui metade dos valores não diz o que
              é sem o rótulo - "Remoto", "MEI", "Masculino". */}
          <dl className="talento-dados-capa">
            <Campo rotulo="Senioridade" valor={ficha?.senioridade ?? null} forte />
            <Campo rotulo="Experiência" valor={ficha?.tempo_experiencia ?? null} />
            <Campo rotulo="Inglês" valor={ficha?.nivel_ingles ?? null} />
            <Campo rotulo="Outro idioma" valor={ficha?.outro_idioma ?? null} />
            <Campo rotulo="Onde mora" valor={ficha?.cidade ? [ficha.cidade, ficha.uf].filter(Boolean).join(' - ') : null} />
            <Campo rotulo="Modelo" valor={ficha?.modelo_trabalho ?? null} />
            <Campo rotulo="Contratação" valor={ficha?.contratacao ?? null} />
            <Campo rotulo="CNPJ" valor={ficha?.possui_cnpj == null ? null
              : ficha.possui_cnpj ? `Sim${ficha.regime_fiscal ? ` (${ficha.regime_fiscal})` : ''}` : 'Não'} />
            <Campo rotulo="Idade"
              valor={ficha?.nascimento && idade(ficha.nascimento) != null ? `${idade(ficha.nascimento)} anos` : null}
              dica={ficha?.nascimento ? `Nascimento: ${fmtDataBR(ficha.nascimento.slice(0, 10))}` : undefined} />
            <Campo rotulo="Sexo" valor={ficha?.sexo ?? null} />
            {/* O e-mail ocupa duas colunas: numa só ele quebrava no meio, e
                endereço partido não se lê nem se copia com o olho. */}
            <Campo rotulo="E-mail" largo
              valor={pessoa.email ? <EmailQuebravel valor={pessoa.email} /> : null} />
            <Campo rotulo="Telefone" valor={externo?.telefone || null} />
            <Campo rotulo="Candidatura"
              valor={ficha?.candidatura_em ? fmtDataBR(ficha.candidatura_em.slice(0, 10)) : null} />
            <Campo rotulo={externo ? 'Cadastrado em' : 'No time desde'}
              valor={!externo || !ficha ? (pessoa.desde ? fmtDataBR(pessoa.desde.slice(0, 10)) : null) : null} />
          </dl>
          <div className="talento-contato">
            {ficha?.linkedin && (
              <a className="talentos-link" href={ficha.linkedin} target="_blank" rel="noreferrer noopener">
                <IconLink size={13} /> LinkedIn
              </a>
            )}
            {ficha?.github && (
              <a className="talentos-link" href={ficha.github} target="_blank" rel="noreferrer noopener">
                <IconLink size={13} /> GitHub
              </a>
            )}
          </div>
        </div>

        <div className="talento-capa-acoes">
          {externo && podeEditar && (
            <button className="btn btn-secondary" onClick={() => setConfirmando(true)}>
              <IconTrash size={13} /> Excluir
            </button>
          )}
        </div>
      </header>

      {/* Antes das duas colunas: é a apresentação da pessoa, em texto corrido, e
          quem chega na ficha lê isto primeiro. Dentro de uma coluna ele ficava
          embaixo da árvore, que é consulta, não leitura. */}
      {ficha?.resumo && (
        <section className="painel talento-resumo">
          <div className="painel-topo">
            <div>
              <p className="painel-titulo">Resumo profissional</p>
              <p className="painel-apoio">Como ela se descreveu</p>
            </div>
          </div>
          <p className="talentos-texto">{ficha.resumo}</p>
        </section>
      )}

      {/* Duas colunas: à esquerda o que a pessoa trouxe - a árvore, o que ela
          escreveu -, à direita o que a casa diz dela e de onde ela veio. Sem
          nada do lado esquerdo (o caso de quem é da casa), a avaliação ocupa a
          largura inteira em vez de deixar meia tela vazia. */}
      <div className={`talento-grade${temEsquerda ? '' : ' sozinha'}`}>
        <div className="talento-coluna">
          {habilidades.length > 0 && (
            <section className="painel">
              <div className="painel-topo">
                <div>
                  <p className="painel-titulo">Habilidades declaradas</p>
                  <p className="painel-apoio">
                    {habilidades.length} {habilidades.length === 1 ? 'habilidade' : 'habilidades'}, de 1 a 5, no nível que a própria pessoa se deu
                  </p>
                </div>
              </div>
              <RadarHabilidades habilidades={habilidades} />
            </section>
          )}

        </div>

        <div className="talento-coluna">
          {/* Radar e régua no mesmo painel: são a mesma pergunta - o quanto a
              casa conhece esta pessoa - e separados obrigavam a olhar duas
              vezes para o mesmo número. */}
          <section className="painel">
            <div className="painel-topo">
              <div>
                <p className="painel-titulo">Avaliação da casa</p>
                <p className="painel-apoio">
                  {notas.length
                    ? `${notas.length} de ${competencias.length} competências avaliadas${podeAvaliar ? ', de 1 a 10' : ''}`
                    : podeAvaliar ? 'Ainda sem avaliação - dê a primeira nota abaixo, de 1 a 10' : 'Ainda sem avaliação'}
                </p>
              </div>
            </div>
            {carregando
              ? <Skeleton h={300} radius="var(--radius-md)" />
              : <Radar competencias={competencias} notas={porCompetencia}
                  foco={focoComp} onFoco={setFocoComp} />}
            <ul className="talentos-lista-notas">
              {competencias.map(c => {
                const n = notas.find(x => x.competencia_id === c.id);
                return (
                  <li key={c.id}
                    className={`talentos-nota-linha${focoComp === c.id ? ' aceso' : ''}`}
                    onMouseEnter={() => setFocoComp(c.id)}
                    onMouseLeave={() => setFocoComp(null)}>
                    <div className="talentos-nota-topo">
                      <span className="talentos-nota-nome">{c.nome}</span>
                      {podeAvaliar ? (
                        <input
                          className="form-input talentos-nota-campo"
                          type="number" min={1} max={10} step={1}
                          value={n ? String(n.nota) : ''}
                          placeholder="-"
                          onChange={e => {
                            const v = Number(e.target.value);
                            if (e.target.value === '' || !Number.isFinite(v)) return;
                            void darNota(c.id, Math.max(1, Math.min(10, Math.round(v))));
                          }}
                        />
                      ) : (
                        <strong className="talentos-nota-valor">{n ? n.nota : '-'}</strong>
                      )}
                    </div>
                    <span className="talentos-media-trilho">
                      <span className="talentos-media-tinta" style={{ width: `${(n?.nota ?? 0) * 10}%` }} />
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
      </div>

      {/* Embaixo dos dois radares, na largura inteira: é leitura corrida, e
          leitura corrida não divide espaço com desenho. */}
      {ficha?.case_sucesso && (
        <section className="painel talento-case">
          <div className="painel-topo">
            <div>
              <p className="painel-titulo">Case de sucesso</p>
              <p className="painel-apoio">O que ela contou ter feito</p>
            </div>
          </div>
          <p className="talentos-texto">{ficha.case_sucesso}</p>
        </section>
      )}

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
