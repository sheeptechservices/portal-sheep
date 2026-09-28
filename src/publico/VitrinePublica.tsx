// ─────────────────────────────────────────────────────────────────────────────
//  A vitrine de profissionais, como o cliente vê.
//
//  Abre por `/v/<token>`, sem login. Mostra os selecionados de uma vaga sem
//  nome e sem contato: o que descreve o trabalho, e nada que leve à pessoa.
//  Quem gostou de alguém diz aqui mesmo, e a casa recebe o recado.
//
//  Mora fora de `src/admin` de propósito: nada deste arquivo importa de lá, e é
//  isso que garante que o código do portal não desce para quem abre o link.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { IconCheck, IconSearch, IconX } from '../components/icons';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
import { useSaidaSuave } from '../lib/useSaidaSuave';

interface PerfilDaVitrine {
  id: number;
  apelido: string;
  resumo: string;
  senioridade: string | null;
  tempo_experiencia: string | null;
  modelo_trabalho: string | null;
  contratacao: string | null;
  ingles: string | null;
  competencias: { nome: string; nota: number }[];
  habilidades: string[];
  pedido: boolean;
}

interface Vitrine {
  titulo: string;
  empresa: string | null;
  recado: string | null;
  perfis: PerfilDaVitrine[];
}

/** O radar de uma pessoa, no mesmo desenho do portal: a teia de fundo e o
 *  polígono das notas. Aqui ele é pequeno, porque divide o cartão com o texto. */
function Radar({ competencias }: { competencias: { nome: string; nota: number }[] }) {
  const lados = competencias.length;
  if (lados < 3) return null;
  const raio = 46;
  const centro = 60;
  const ponto = (i: number, valor: number) => {
    const ang = (Math.PI * 2 * i) / lados - Math.PI / 2;
    const r = (raio * Math.max(0, Math.min(5, valor))) / 5;
    return `${centro + r * Math.cos(ang)},${centro + r * Math.sin(ang)}`;
  };
  const poligono = (f: (i: number) => number) =>
    competencias.map((_, i) => ponto(i, f(i))).join(' ');
  return (
    <svg className="vit-radar" viewBox="0 0 120 120" role="img"
      aria-label={competencias.map(c => `${c.nome}: ${c.nota} de 5`).join('; ')}>
      {[1, 2, 3, 4, 5].map(v => (
        <polygon key={v} className="vit-radar-teia" points={poligono(() => v)} />
      ))}
      <polygon className="vit-radar-area" points={poligono(i => competencias[i].nota)} />
    </svg>
  );
}

/** As etiquetas do alto do cartão: o que se compara de relance entre um
 *  profissional e outro. */
function Etiquetas({ p }: { p: PerfilDaVitrine }) {
  const itens = [p.senioridade, p.tempo_experiencia, p.modelo_trabalho, p.contratacao,
    p.ingles && `Inglês ${p.ingles}`].filter(Boolean) as string[];
  if (!itens.length) return null;
  return <ul className="vit-etiquetas">{itens.map(i => <li key={i}>{i}</li>)}</ul>;
}

const ABERTURA_MAX = 240;

/**
 * Parte o resumo em abertura e resto.
 *
 * O que vinha depois de um marcador já chega aqui em linhas, e vira lista. O
 * currículo escrito num parágrafo só, que é metade deles, é cortado no fim da
 * primeira frase que passa de um terço da leitura: a abertura diz do que se
 * trata e o resto fica guardado. Cortar no meio da palavra, ou não cortar,
 * devolve a parede de texto que fazia o cliente desistir no terceiro cartão.
 */
function partirResumo(resumo: string) {
  const linhas = resumo.split('\n').map(l => l.trim()).filter(Boolean);
  if (!linhas.length) return { abertura: '', continuacao: '', itens: [] as string[] };
  const [primeira, ...itens] = linhas;
  if (itens.length || primeira.length <= ABERTURA_MAX) {
    return { abertura: primeira, continuacao: '', itens };
  }
  const ponto = primeira.slice(0, ABERTURA_MAX).lastIndexOf('. ');
  const corte = ponto > 90 ? ponto + 1 : primeira.lastIndexOf(' ', ABERTURA_MAX);
  return {
    abertura: primeira.slice(0, corte).trim(),
    continuacao: primeira.slice(corte).trim(),
    itens,
  };
}

/**
 * O texto do profissional, em forma de leitura.
 *
 * A abertura fica solta, e o resto nasce recolhido: o currículo inteiro aberto
 * em cada cartão é a parede que fazia o cliente desistir antes de chegar ao
 * terceiro. Quem se interessou abre.
 */
function Texto({ resumo }: { resumo: string }) {
  const [aberto, setAberto] = useState(false);
  const { abertura, continuacao, itens } = useMemo(() => partirResumo(resumo), [resumo]);
  if (!abertura) return null;
  const temMais = Boolean(continuacao) || itens.length > 0;
  return (
    <div className="vit-texto">
      <p className="vit-abertura">{abertura}</p>
      {temMais && (
        <>
          <div className={`revelar${aberto ? ' aberto' : ''}`}>
            <div>
              {continuacao && <p className="vit-abertura vit-continuacao">{continuacao}</p>}
              {itens.length > 0 && (
                <ul className="vit-itens">
                  {itens.map((l, i) => <li key={`${i}-${l.slice(0, 20)}`}>{l}</li>)}
                </ul>
              )}
            </div>
          </div>
          <button type="button" className="vit-mais" aria-expanded={aberto}
            onClick={() => setAberto(a => !a)}>
            {aberto ? 'Ver menos' : itens.length > 0 ? `Ver mais (${itens.length})` : 'Ver mais'}
          </button>
        </>
      )}
    </div>
  );
}

/** Um selecionado. Sem nome, sem contato: o apelido, o que ele faz e as notas. */
function Cartao({ p, onPedir, enviando }: {
  p: PerfilDaVitrine;
  onPedir: () => void;
  enviando: boolean;
}) {
  // As três competências mais fortes vão para o alto do cartão, e as outras
  // ficam no radar: a comparação entre profissionais começa por elas.
  const fortes = [...p.competencias].sort((a, b) => b.nota - a.nota).slice(0, 3);
  return (
    <article className={`vit-cartao${p.pedido ? ' pedido' : ''}`}>
      <header className="vit-cartao-topo">
        <div className="vit-cartao-quem">
          <h2>{p.apelido}</h2>
          <Etiquetas p={p} />
        </div>
        <button type="button" className={`vit-pedir${p.pedido ? ' feito' : ''}`}
          onClick={onPedir} disabled={p.pedido || enviando}>
          {p.pedido ? <><IconCheck size={13} /> Interesse enviado</> : 'Tenho interesse'}
        </button>
      </header>

      {fortes.length > 0 && (
        <ul className="vit-fortes">
          {fortes.map(c => (
            <li key={c.nome}>
              <span>{c.nome}</span>
              <span className="vit-nota-comp" aria-label={`${c.nota} de 5`}>
                {[1, 2, 3, 4, 5].map(n => <i key={n} className={n <= c.nota ? 'cheia' : undefined} />)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Texto resumo={p.resumo} />

      {p.habilidades.length > 0 && (
        <ul className="vit-habilidades">
          {p.habilidades.map(h => <li key={h}>{h}</li>)}
        </ul>
      )}

      {/* O radar vem por último e recolhido: ele é a leitura fina de quem já
          gostou do cartão, e aberto em todos eles vira uma parede de teias. */}
      {p.competencias.length >= 3 && <Forcas competencias={p.competencias} />}
    </article>
  );
}

/** As competências inteiras, no radar da casa. Abre quando alguém pede. */
function Forcas({ competencias }: { competencias: { nome: string; nota: number }[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="vit-forcas-bloco">
      <button type="button" className="vit-mais" aria-expanded={aberto}
        onClick={() => setAberto(a => !a)}>
        {aberto ? 'Esconder as competências' : `Ver as ${competencias.length} competências`}
      </button>
      <div className={`revelar${aberto ? ' aberto' : ''}`}>
        <div>
          <div className="vit-forcas">
            <Radar competencias={competencias} />
            <ul>
              {competencias.map(c => (
                <li key={c.nome}>
                  <span>{c.nome}</span>
                  <span className="vit-nota-comp" aria-label={`${c.nota} de 5`}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <i key={n} className={n <= c.nota ? 'cheia' : undefined} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A confirmação do "tenho interesse".
 *
 * Não pergunta nada: quem está pedindo é a empresa a quem esta vitrine foi
 * aberta, e ela já está gravada no link. Pedir o nome de novo seria pedir o que
 * a casa sabe desde que mandou o endereço.
 */
function CaixaDoInteresse({ apelido, empresa, onConfirmar, onFechar, enviando }: {
  apelido: string;
  empresa: string | null;
  /** Manda o interesse e diz se deu certo: deu, a caixa se fecha sozinha. */
  onConfirmar: () => Promise<boolean>;
  onFechar: () => void;
  enviando: boolean;
}) {
  // Abrir e fechar com animacao, como todo dialogo da casa: sem o gancho, o
  // React desmonta no instante do clique e a saida nunca chega a rodar.
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [fechar]);

  return (
    <div className={`vit-modal${saindo ? ' saindo' : ''}`} role="dialog" aria-modal="true"
      aria-label={`Interesse em ${apelido}`} {...fundo}>
      <div className="vit-modal-caixa">
        <div className="vit-modal-topo">
          <strong>Interesse em {apelido}</strong>
          <button type="button" aria-label="Fechar" onClick={fechar}><IconX size={15} /></button>
        </div>
        <p className="vit-modal-texto">
          A Sheep recebe o aviso{empresa ? ` de que ${empresa} quer falar com este profissional` : ''} e
          entra em contato para apresentar quem você escolheu.
        </p>
        <div className="vit-modal-pe">
          <button type="button" className="vit-secundario" onClick={fechar}>Cancelar</button>
          <button type="button" className="vit-primario" autoFocus disabled={enviando}
            onClick={() => void onConfirmar().then(ok => { if (ok) fechar(); })}>
            {enviando ? 'Enviando' : 'Confirmar interesse'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VitrinePublica({ token }: { token: string }) {
  const [vitrine, setVitrine] = useState<Vitrine | null>(null);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [pedindo, setPedindo] = useState<PerfilDaVitrine | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let vivo = true;
    fetch(`/api/vitrine-publica?token=${encodeURIComponent(token)}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!vivo) return;
        if (!ok) { setErro(String(d?.error ?? 'Esta página não está disponível.')); return; }
        setVitrine(d as Vitrine);
      })
      .catch(() => { if (vivo) setErro('Não foi possível abrir esta página.'); });
    return () => { vivo = false; };
  }, [token]);

  useEffect(() => {
    if (vitrine) document.title = `${vitrine.titulo} · Sheep Technology`;
  }, [vitrine]);

  /** A busca varre o que está à vista: o apelido, o resumo, as habilidades e as
   *  competências. Quem procura "SQL" quer o cartão que diz SQL, esteja essa
   *  palavra na habilidade ou na frase. */
  const visiveis = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase('pt-BR');
    if (!q || !vitrine) return vitrine?.perfis ?? [];
    return vitrine.perfis.filter(p => [
      p.apelido, p.resumo, p.senioridade, p.tempo_experiencia, p.modelo_trabalho,
      p.contratacao, p.ingles, ...p.habilidades, ...p.competencias.map(c => c.nome),
    ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(q));
  }, [busca, vitrine]);

  async function enviarInteresse(): Promise<boolean> {
    if (!pedindo) return false;
    setEnviando(true);
    const r = await fetch(`/api/vitrine-publica?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ perfil_id: pedindo.id }),
    }).then(x => x.json()).catch(() => null);
    setEnviando(false);
    if (!r?.ok) { setAviso('Não foi possível enviar. Tente de novo.'); return false; }
    setVitrine(v => (v == null ? v : {
      ...v,
      perfis: v.perfis.map(p => (p.id === pedindo.id ? { ...p, pedido: true } : p)),
    }));
    setAviso(`Recebemos seu interesse em ${pedindo.apelido}. A Sheep entra em contato.`);
    return true;
  }

  if (erro) {
    return (
      <div className="vit-pagina vit-centro">
        <p className="vit-erro">{erro}</p>
      </div>
    );
  }
  if (!vitrine) {
    return (
      <div className="vit-pagina vit-centro">
        <div className="vit-girando" />
      </div>
    );
  }

  return (
    <div className="vit-pagina">
      <header className="vit-topo">
        <div className="vit-topo-texto">
          <h1>{vitrine.titulo}</h1>
          {vitrine.empresa && <p className="vit-empresa">Seleção para {vitrine.empresa}</p>}
          {vitrine.recado && <p className="vit-recado">{vitrine.recado}</p>}
        </div>
        {/* A assinatura da casa, no alto e sempre no mesmo lugar: quem abriu o
            link veio de fora, e precisa ver de quem é a página sem procurar.
            Ela substitui o rótulo "Sheep Technology" que ficava acima do
            título - o desenho já diz a mesma coisa, e dizê-la duas vezes na
            mesma linha de olhar é ruído. */}
        <img className="vit-marca-sheep" src="/logo-lockup.png" alt="Sheep Technology" />
      </header>

      {vitrine.perfis.length > 3 && (
        <div className="vit-busca">
          <IconSearch size={13} />
          <input value={busca} aria-label="Buscar profissional"
            placeholder="Buscar por habilidade, senioridade ou palavra do resumo"
            onChange={e => setBusca(e.target.value)} />
          {busca && (
            <button type="button" aria-label="Limpar a busca" onClick={() => setBusca('')}>
              <IconX size={12} />
            </button>
          )}
        </div>
      )}

      {aviso && <p className="vit-aviso" role="status">{aviso}</p>}

      {visiveis.length === 0 ? (
        <p className="vit-vazio">
          {vitrine.perfis.length === 0
            ? 'Nenhum profissional nesta seleção ainda.'
            : `Nenhum profissional para "${busca.trim()}".`}
        </p>
      ) : (
        <div className="vit-lista">
          {visiveis.map(p => (
            <Cartao key={p.id} p={p} enviando={enviando} onPedir={() => { setAviso(''); setPedindo(p); }} />
          ))}
        </div>
      )}

      {pedindo && (
        <CaixaDoInteresse apelido={pedindo.apelido} empresa={vitrine.empresa} enviando={enviando}
          onFechar={() => setPedindo(null)}
          onConfirmar={enviarInteresse} />
      )}

      <footer className="vit-pe">
        Seleção preparada pela Sheep Technology.
      </footer>
    </div>
  );
}
