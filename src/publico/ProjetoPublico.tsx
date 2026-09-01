// ─────────────────────────────────────────────────────────────────────────────
//  Acompanhamento do projeto, para o cliente.
//
//  Página de leitura, e só. Não há formulário, não há botão que grave nada, e
//  não há caminho daqui para o portal interno - nem link de entrada, nem menção
//  a ele. O que chega aqui é o que a rota pública devolve, que é um punhado de
//  campos escolhidos a dedo.
//
//  Mora fora de `src/admin` de propósito: nada deste arquivo importa de lá, e
//  por isso o código do portal nem é baixado por quem abre este link.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { logoDoCliente } from '../lib/marcas';
import { porNivelDeContato } from '../lib/papeisDeEquipe';

interface Entrega {
  id: number;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  status: string;
  prazo: string | null;
  tarefas_total: number;
  tarefas_feitas: number;
}

interface Dados {
  projeto: {
    nome: string;
    descricao: string | null;
    status: string;
    previsao_entrega: string | null;
    progresso: number;
    publicado_em: string | null;
    cliente: string | null;
  };
  equipe: { nome: string; papel: string; foto_url: string | null }[];
  entregas: Entrega[];
  ordem_status: string[];
}

/** As mesmas cores de dentro: a entrega bloqueada é vermelha nos dois lados. */
const COR: Record<string, string> = {
  'Planejada': '#8A8B84',
  'Em andamento': '#B58300',
  'Bloqueada': '#D93025',
  'Entregue': '#7C3AED',
  'Validada': '#23A455',
  'Cancelada': '#8A857A',
};

const fmtData = (v: string | null) => {
  if (!v) return null;
  const [a, m, d] = v.slice(0, 10).split('-');
  return d ? `${d}/${m}/${a}` : null;
};

const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2)
  .map(p => p[0]?.toUpperCase() ?? '').join('');

function Avatar({ nome, foto }: { nome: string; foto: string | null }) {
  const [falhou, setFalhou] = useState(false);
  if (foto && !falhou) {
    return <img className="pub-avatar" src={foto} alt="" referrerPolicy="no-referrer"
      onError={() => setFalhou(true)} />;
  }
  return <span className="pub-avatar pub-avatar-vazio">{iniciais(nome)}</span>;
}

function Logo({ cliente }: { cliente: string | null }) {
  const marca = logoDoCliente(cliente);
  if (!marca) {
    return cliente ? <span className="pub-cliente-nome">{cliente}</span> : null;
  }
  // Logo de uma cor só é máscara pintada por trás; as demais entram como
  // imagem. É a mesma regra do carrossel da entrada.
  if (marca.cor) {
    return (
      <span
        className="pub-logo"
        role="img"
        aria-label={cliente ?? 'Cliente'}
        style={{
          height: marca.altura,
          width: marca.altura * (marca.proporcao ?? 3),
          background: marca.cor,
          maskImage: `url(${marca.src})`,
          WebkitMaskImage: `url(${marca.src})`,
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
        }}
      />
    );
  }
  return (
    <img className="pub-logo" src={marca.src} alt={cliente ?? 'Cliente'}
      style={{ height: marca.altura, filter: marca.escurecer ? 'brightness(0.2)' : undefined }} />
  );
}

/** Barra de composição das entregas por situação. */
function Barra({ entregas }: { entregas: Entrega[] }) {
  const contas = [...new Set(entregas.map(e => e.status))]
    .map(st => ({ st, n: entregas.filter(e => e.status === st).length }));
  if (entregas.length === 0) return null;
  return (
    <div className="pub-barra" role="img"
      aria-label={contas.map(c => `${c.n} ${c.st.toLowerCase()}`).join(', ')}>
      {contas.map(({ st, n }) => (
        <span key={st} title={`${n} ${st.toLowerCase()}`}
          style={{ width: `${(n / entregas.length) * 100}%`, background: COR[st] ?? '#8A8B84' }} />
      ))}
    </div>
  );
}

export default function ProjetoPublico({ token }: { token: string }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState(false);
  /** Recorte por situação. Filtrar é olhar de outro jeito, não editar. */
  const [foco, setFoco] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projeto-publico?token=${encodeURIComponent(token)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('sem acesso'))))
      .then(d => { if (vivo) setDados(d); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [token]);

  useEffect(() => {
    if (dados) document.title = `${dados.projeto.nome} - Acompanhamento`;
  }, [dados]);

  if (erro) {
    return (
      <div className="pub-vazio">
        <h1>Página não encontrada</h1>
        <p>
          Este link não está mais disponível. Se você recebeu ele de alguém da
          equipe, peça um link novo.
        </p>
      </div>
    );
  }

  if (!dados) {
    return <div className="pub-vazio"><div className="pub-girando" /></div>;
  }

  const { projeto, equipe, entregas, ordem_status } = dados;
  const ordenadas = [...entregas].sort((a, b) =>
    ordem_status.indexOf(a.status) - ordem_status.indexOf(b.status));
  const lista = foco ? ordenadas.filter(e => e.status === foco) : ordenadas;
  const situacoes = ordem_status.filter(st => entregas.some(e => e.status === st));

  return (
    <div className="pub">
      <header className="pub-topo">
        <div className="pub-topo-texto">
          <p className="pub-sobre">Acompanhamento do projeto</p>
          <h1 className="pub-nome">{projeto.nome}</h1>
          {projeto.descricao && <p className="pub-descricao">{projeto.descricao}</p>}
        </div>
        <div className="pub-topo-marca"><Logo cliente={projeto.cliente} /></div>
      </header>

      <section className="pub-secao">
        <h2 className="pub-secao-titulo">Equipe</h2>
        {equipe.length === 0 ? (
          <p className="pub-nada">Nenhuma pessoa alocada ainda.</p>
        ) : (
          // Em degraus de contato: quem abre a conversa primeiro aparece
          // primeiro. Do lado de fora, essa é a pergunta que a lista responde.
          porNivelDeContato(equipe, p => p.papel).map(nivel => (
            <div key={nivel.rotulo} className="pub-nivel">
              <p className="pub-nivel-rotulo">{nivel.rotulo}</p>
              <ul className="pub-equipe">
                {nivel.membros.map(p => (
                  <li key={p.nome}>
                    <Avatar nome={p.nome} foto={p.foto_url} />
                    <span className="pub-equipe-texto">
                      <strong>{p.nome}</strong>
                      <span>{p.papel}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="pub-secao">
        <div className="pub-secao-cabeca">
          <h2 className="pub-secao-titulo">Entregas</h2>
          <span className="pub-conta">{entregas.length}</span>
        </div>

        <Barra entregas={entregas} />

        {situacoes.length > 0 && (
          <div className="pub-filtros">
            <button type="button" className={foco === null ? 'ativo' : undefined}
              onClick={() => setFoco(null)}>
              Todas
              <span>{entregas.length}</span>
            </button>
            {situacoes.map(st => (
              <button key={st} type="button" className={foco === st ? 'ativo' : undefined}
                onClick={() => setFoco(f => (f === st ? null : st))}>
                <span className="pub-ponto" style={{ background: COR[st] ?? '#8A8B84' }} />
                {st}
                <span>{entregas.filter(e => e.status === st).length}</span>
              </button>
            ))}
          </div>
        )}

        {lista.length === 0 ? (
          <p className="pub-nada">Nenhuma entrega nesta situação.</p>
        ) : (
          <ul className="pub-entregas">
            {lista.map(e => {
              const pct = e.tarefas_total > 0
                ? Math.round((e.tarefas_feitas / e.tarefas_total) * 100) : null;
              return (
                <li key={e.id}>
                  <span className="pub-entrega-marca" style={{ background: COR[e.status] ?? '#8A8B84' }} />
                  <div className="pub-entrega-corpo">
                    <p className="pub-entrega-titulo">
                      {e.titulo}
                      {e.categoria && <span className="pub-categoria">{e.categoria}</span>}
                    </p>
                    {e.descricao && <p className="pub-entrega-desc">{e.descricao}</p>}
                    {pct !== null && (
                      <span className="pub-progresso" title={`${e.tarefas_feitas} de ${e.tarefas_total} concluídas`}>
                        <span className="pub-progresso-barra">
                          <span style={{ width: `${pct}%`, background: COR[e.status] ?? '#8A8B84' }} />
                        </span>
                        {e.tarefas_feitas}/{e.tarefas_total}
                      </span>
                    )}
                  </div>
                  <div className="pub-entrega-lado">
                    <span className="pub-chip" style={{
                      color: COR[e.status] ?? '#8A8B84',
                      background: `${COR[e.status] ?? '#8A8B84'}1A`,
                    }}>{e.status}</span>
                    {fmtData(e.prazo) && <span className="pub-prazo">{fmtData(e.prazo)}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="pub-rodape">
        <span>Sheep Technology</span>
        {fmtData(projeto.publicado_em) && <span>Publicado em {fmtData(projeto.publicado_em)}</span>}
      </footer>
    </div>
  );
}
