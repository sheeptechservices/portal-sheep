// ─────────────────────────────────────────────────────────────────────────────
//  O sistema de desenho da casa, mostrado com ele mesmo.
//
//  Ele existia espalhado: 32 tokens no `:root`, 2.230 classes em catorze mil
//  linhas de folha e as regras do CLAUDE.md. Tudo certo, e nada em lugar que se
//  possa olhar - então cada tela nova era desenhada por comparação com a última
//  que alguém abriu, e foi assim que apareceram oitenta cores cruas e mil
//  estilos inline no meio do caminho.
//
//  Esta página não descreve o sistema: ela o usa. Cada quadro abaixo é a classe
//  de verdade, com o token de verdade, no tema em que a pessoa está. Ela não
//  tem como mentir - mudou `--yellow`, o quadro muda junto; sumiu uma classe, o
//  exemplo quebra à vista.
//
//  Mora numa aba de Configurações, ao lado de Etapas e Integrações: é ali que
//  vivem os ajustes da casa, e o desenho é um deles.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  IconAlert, IconCheck, IconChevronRight, IconClip, IconPlus, IconSearch,
  IconSpinner, IconTrash, IconX,
} from '../components/icons';
import { Abas } from '../components/Abas';
import { SegSwitch } from '../components/SegSwitch';
import { SelectSistema } from '../components/SelectSistema';
import { DatePicker } from '../components/DatePicker';
import { ConfirmarExclusao, Dialogo } from '../components/Dialogo';
import {
  COR_PRIORIDADE, DESCRICAO_PRIORIDADE, ICONE_PRIORIDADE, PRIORIDADES,
} from '../lib/prioridades';

/** Um bloco da página: o nome da família, o porquê da regra, e os exemplos. */
function Secao({ titulo, porque, children }: {
  titulo: string;
  porque: string;
  children: ReactNode;
}) {
  return (
    <section className="estilo-secao">
      <h2 className="estilo-secao-titulo">{titulo}</h2>
      <p className="estilo-secao-porque">{porque}</p>
      <div className="estilo-grade">{children}</div>
    </section>
  );
}

/** Um exemplo, com o nome pelo qual ele se chama no código - que é o que se
 *  copia para usar. */
function Peca({ nome, nota, children, largo }: {
  nome: string;
  nota?: string;
  children: ReactNode;
  largo?: boolean;
}) {
  return (
    <div className={`estilo-peca${largo ? ' larga' : ''}`}>
      <div className="estilo-palco">{children}</div>
      <code className="estilo-nome">{nome}</code>
      {nota && <p className="estilo-nota">{nota}</p>}
    </div>
  );
}

const CORES: { token: string; nota: string }[] = [
  { token: '--black', nota: 'texto principal' },
  { token: '--gray', nota: 'texto de apoio' },
  { token: '--gray2', nota: 'rótulo, ícone em repouso' },
  { token: '--gray3', nota: 'borda' },
  { token: '--gray4', nota: 'superfície neutra sutil' },
  { token: '--bg', nota: 'fundo da tela' },
  { token: '--white', nota: 'fundo de card e campo' },
  { token: '--card-hover-bg', nota: 'card sob o cursor' },
  { token: '--yellow', nota: 'a cor da casa, para o que age' },
  { token: '--on-yellow', nota: 'texto sobre o amarelo' },
  { token: '--yd', nota: 'amarelo diluído, para chapa' },
  { token: '--yb', nota: 'amarelo de borda' },
  { token: '--red', nota: 'erro e o que não tem volta' },
  { token: '--red-soft', nota: 'chapa de erro' },
  { token: '--green', nota: 'concluído, saudável' },
  { token: '--green-soft', nota: 'chapa de concluído' },
  { token: '--link', nota: 'endereço clicável' },
];

export default function EstiloPage() {
  const [aba, setAba] = useState<'a' | 'b'>('a');
  const [seg, setSeg] = useState<'sim' | 'nao'>('nao');
  const [sel, setSel] = useState<string>('Média');
  const [data, setData] = useState('');
  const [caixa, setCaixa] = useState<null | 'dialogo' | 'exclusao'>(null);
  const [aberto, setAberto] = useState(false);

  return (
    // Sem cabeçalho próprio: quem monta esta página é a aba de Configurações, e
    // ela já põe o título e a chamada. Dois títulos seguidos seriam o mesmo
    // texto dito duas vezes.
    <div className="estilo-pagina">
      <Secao
        titulo="Cor"
        porque="Nunca hex literal em componente novo. A cor vem por token, e é isso que faz o tema escuro funcionar sozinho: o tema redefine as mesmas variáveis, e nenhuma tela precisa saber disso."
      >
        {CORES.map(c => (
          <Peca key={c.token} nome={`var(${c.token})`} nota={c.nota}>
            <span className="estilo-cor" style={{ background: `var(${c.token})` }} />
          </Peca>
        ))}
      </Secao>

      <Secao
        titulo="Raio"
        porque="Quatro medidas, e nenhuma no meio. O sm é de peça pequena (chip, item de lista), o md é de campo e botão, o lg é de card e modal, e a pílula é do que é redondo por inteiro."
      >
        {['sm', 'md', 'lg', 'pill'].map(r => (
          <Peca key={r} nome={`var(--radius-${r})`}>
            <span className="estilo-raio" style={{ borderRadius: `var(--radius-${r})` }} />
          </Peca>
        ))}
      </Secao>

      <Secao
        titulo="Sombra"
        porque="A sombra diz altura, e altura diz o que está por cima do quê. Card em repouso, card sob o cursor, e o realce amarelo do que chama para a ação."
      >
        <Peca nome="var(--shadow-card)" nota="repouso">
          <span className="estilo-caixa" style={{ boxShadow: 'var(--shadow-card)' }} />
        </Peca>
        <Peca nome="var(--shadow-card-hover)" nota="sob o cursor">
          <span className="estilo-caixa" style={{ boxShadow: 'var(--shadow-card-hover)' }} />
        </Peca>
        <Peca nome="var(--shadow-yellow)" nota="destaque">
          <span className="estilo-caixa" style={{ boxShadow: 'var(--shadow-yellow)' }} />
        </Peca>
      </Secao>

      <Secao
        titulo="Transição"
        porque="Só estes três tempos. Se o elemento muda de cor, é transition; se ele se move ou muda de elevação, é transition-spring; e a curva anti é para animação longa, como a troca de tema. Passe o cursor nos três para sentir a diferença."
      >
        <Peca nome="var(--transition)" nota=".1s ease - realce imediato: cor, borda, fundo">
          <span className="estilo-alvo t-cor" />
        </Peca>
        <Peca nome="var(--transition-spring)" nota=".18s - movimento e elevação: card, botão, modal">
          <span className="estilo-alvo t-mola" />
        </Peca>
        <Peca nome="var(--curva-anti)" nota="a curva das animações longas">
          <span className="estilo-alvo t-anti" />
        </Peca>
      </Secao>

      <Secao
        titulo="Botão"
        porque="Todo elemento clicável tem hover, e elementos do mesmo tipo se comportam igual. Não invente um hover novo para um botão que já tem irmãos na tela."
      >
        <Peca nome=".btn.btn-primary"><button className="btn btn-primary">Salvar</button></Peca>
        <Peca nome=".btn.btn-secondary"><button className="btn btn-secondary">Cancelar</button></Peca>
        <Peca nome=".modal-acao-primaria"><button className="modal-acao-primaria">Registrar</button></Peca>
        <Peca nome=".modal-acao"><button className="modal-acao">Voltar</button></Peca>
        <Peca nome=".admin-toolbar-btn" nota="ícone só, sempre com aria-label">
          <button className="admin-toolbar-btn" aria-label="Buscar"><IconSearch size={15} /></button>
        </Peca>
        <Peca nome=".secao-add" nota="acrescentar dentro de uma seção">
          <button className="secao-add" aria-label="Acrescentar"><IconPlus size={14} /></button>
        </Peca>
        <Peca nome=".delete-confirm-ok" nota="o que não tem volta">
          <button className="delete-confirm-ok">Excluir</button>
        </Peca>
        <Peca nome=".file-delete-btn" nota="tirar, dentro de uma linha">
          <button className="file-delete-btn" aria-label="Tirar"><IconX size={13} /></button>
        </Peca>
      </Secao>

      <Secao
        titulo="Campo"
        porque="Campo e dropdown são sempre os da casa: nunca select nativo, nunca input de data cru. O menu do sistema operacional abre com a cor e a fonte dele, ignora o tema escuro e não tem nada do desenho do portal. O foco realça a borda em cinza - não existe anel colorido de foco no sistema."
      >
        <Peca nome=".form-input" largo>
          <input className="form-input" placeholder="Um campo de texto" />
        </Peca>
        <Peca nome=".form-input.error" nota="a moldura marca; a mensagem é de quem chama" largo>
          <input className="form-input error" defaultValue="Valor recusado" readOnly />
        </Peca>
        <Peca nome="SelectSistema" nota="com uma linha dizendo o que cada opção quer dizer" largo>
          <SelectSistema
            valor={sel}
            onChange={setSel}
            opcoes={PRIORIDADES.map(p => ({
              valor: p as string,
              label: p,
              icone: ICONE_PRIORIDADE[p]({ size: 15 }),
              descricao: DESCRICAO_PRIORIDADE[p],
            }))}
          />
        </Peca>
        <Peca nome="DatePicker" largo>
          <DatePicker value={data} onChange={setData} compact allowPast />
        </Peca>
        <Peca nome="SegSwitch" nota="pergunta fechada, com as duas respostas à vista">
          <SegSwitch
            valor={seg}
            onChange={setSeg}
            pequeno
            opcoes={[{ valor: 'nao', label: 'Não' }, { valor: 'sim', label: 'Sim' }]}
          />
        </Peca>
        <Peca nome=".form-checkbox">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" className="form-checkbox" defaultChecked readOnly /> Marcado
          </label>
        </Peca>
      </Secao>

      <Secao
        titulo="Chip e etiqueta"
        porque="O chip é uma peça que aponta outra: a reunião dentro da entrega, a entrega dentro da reunião. A etiqueta é um estado, e não leva a lugar nenhum."
      >
        <Peca nome=".vinculo-chip" nota="clicável: leva ao outro lado">
          <span className="vinculo-chip">
            <button type="button" className="vinculo-chip-alvo">
              <span className="vinculo-chip-ico"><IconChevronRight size={12} /></span>
              <strong>Alinhamento semanal</strong><span>20/08</span>
            </button>
          </span>
        </Peca>
        <Peca nome=".usuarios-tag" nota="um estado, sem destino">
          <span className="usuarios-tag">convidado</span>
        </Peca>
        {PRIORIDADES.map(p => (
          <Peca key={p} nome={`ICONE_PRIORIDADE['${p}']`} nota={DESCRICAO_PRIORIDADE[p]}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 600, color: COR_PRIORIDADE[p],
            }}>
              {ICONE_PRIORIDADE[p]({ size: 15 })}{p}
            </span>
          </Peca>
        ))}
      </Secao>

      <Secao
        titulo="Carregamento"
        porque="Nada fica parado sem dizer que está trabalhando. O esqueleto tem a forma do que vem, e não é um giro no meio do vazio: o bloco já ocupa o tamanho certo, então nada pula quando o conteúdo chega."
      >
        <Peca nome=".dux-spinner" nota="a ação em curso">
          <span className="dux-spinner" />
        </Peca>
        <Peca nome="IconSpinner" nota="dentro de um botão ou de uma frase">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <IconSpinner size={14} /> Gravando…
          </span>
        </Peca>
        <Peca nome=".ativ-esqueleto" nota="a forma do que está por vir" largo>
          <div className="ativ-esqueleto" aria-hidden="true"><span /><span /><span /></div>
        </Peca>
      </Secao>

      <Secao
        titulo="Aviso"
        porque="O erro fala na chapa vermelha, o concluído na verde. As duas são diluídas: a cor cheia num bloco de texto grita mais do que o assunto merece."
      >
        <Peca nome=".login-aviso" largo>
          <p className="login-aviso"><IconAlert size={13} /> Isto aqui pede atenção.</p>
        </Peca>
        <Peca nome=".form-error">
          <p className="form-error">O campo é obrigatório.</p>
        </Peca>
        <Peca nome="var(--green-soft)" nota="o que deu certo">
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            borderRadius: 'var(--radius-pill)', background: 'var(--green-soft)',
            color: 'var(--green)', fontSize: 12, fontWeight: 700,
          }}>
            <IconCheck size={12} /> Concluído
          </span>
        </Peca>
      </Secao>

      <Secao
        titulo="Abrir e fechar"
        porque="Nada aparece, some ou muda de tamanho de estalo. O bloco que empurra a página usa revelar; a peça que nasce sem mexer no resto usa surge; a mesma área trocando de conteúdo usa troca, que é só opacidade. E o que revelar cobre precisa estar montado antes de abrir - montado só enquanto aberto, ele anima de nada para nada."
      >
        <Peca nome=".revelar" nota="anima a altura: o que está embaixo desce junto" largo>
          <div>
            <button type="button" className="checklist-add" onClick={() => setAberto(a => !a)}>
              <span className={`entrega-seta${aberto ? ' aberta' : ''}`}>
                <IconChevronRight size={12} />
              </span>
              {aberto ? 'Recolher' : 'Abrir'}
            </button>
            <div className={`revelar${aberto ? ' aberto' : ''}`}>
              <div>
                <p style={{ fontSize: 13, color: 'var(--gray)', padding: '10px 0 0', margin: 0 }}>
                  A seta gira 90 graus, e nunca troca de ícone.
                </p>
              </div>
            </div>
          </div>
        </Peca>
        <Peca nome=".surge" nota="entra subindo de leve, no lugar onde já cabia">
          <span className="surge" style={{
            display: 'inline-block', padding: '6px 12px',
            borderRadius: 'var(--radius-sm)', background: 'var(--gray4)', fontSize: 12.5,
          }}>
            Apareci por condição
          </span>
        </Peca>
        <Peca nome=".troca" nota="só opacidade: a peça não pula de lugar">
          <span className="troca" style={{ fontSize: 13 }}>Texto que vira campo</span>
        </Peca>
      </Secao>

      <Secao
        titulo="Navegação"
        porque="O traço da aba ativa desliza até ela, medindo o botão de verdade. Com o traço preso a cada aba, trocar era um corte seco, e nada dizia de onde para onde a atenção foi."
      >
        <Peca nome="Abas" largo>
          <Abas
            valor={aba}
            onChange={setAba}
            opcoes={[{ valor: 'a', label: 'Geral' }, { valor: 'b', label: 'Reuniões' }]}
          />
        </Peca>
      </Secao>

      <Secao
        titulo="Popup"
        porque="Modal, popup e diálogo abrem e fecham com animação, nunca com um corte. Todo caminho de fechar - o fundo, o botão, o Cancelar, o Escape - passa pelo mesmo fechar, que é o do useSaidaSuave. Sem o gancho, o React desmonta no instante em que a condição vira falsa e a saída nunca chega a rodar."
      >
        <Peca nome="ConfirmarExclusao" nota="o caso curto: apagar uma coisa com nome">
          <button className="delete-confirm-ok" onClick={() => setCaixa('exclusao')}>Abrir</button>
        </Peca>
        <Peca nome="Dialogo" nota="a mesma caixa, para qualquer pergunta">
          <button className="btn btn-primary" onClick={() => setCaixa('dialogo')}>Abrir</button>
        </Peca>
      </Secao>

      <Secao
        titulo="Card"
        porque="O padrão da casa é o card subir dois pixels no hover, ganhar a sombra de elevação e clarear o fundo. Vale para todos: card de projeto, de tarefa e do funil."
      >
        <Peca nome=".kanban-card" largo>
          <div className="kanban-card" style={{ '--col-color': 'var(--yellow)' } as CSSProperties}>
            <div className="kanban-card-topo">
              <p className="kanban-card-title">Uma empresa qualquer</p>
            </div>
            <p className="kanban-card-sub">Carina Martins · Portal</p>
            <div className="kanban-card-meta">
              <span className="kanban-card-value">R$ 50.000</span>
              <span className="kanban-card-days">7d</span>
            </div>
            <div className="kanban-card-footer">
              <span className="kanban-card-comments">
                <span style={{ display: 'block' }}><IconClip size={12} /></span>2
              </span>
            </div>
          </div>
        </Peca>
        <Peca nome=".admin-file-item" nota="linha de lista, com a ação aparecendo no hover" largo>
          <div className="admin-file-item">
            <span style={{ flex: 1, fontSize: 13 }}>contrato-assinado.pdf</span>
            <button className="file-delete-btn" aria-label="Excluir"><IconTrash size={13} /></button>
          </div>
        </Peca>
      </Secao>

      <Secao
        titulo="Tabela"
        porque="Cabeçalho em versalete cinza, linha que acende no hover, e a ação da linha só sob o cursor: cinco lixeiras numa lista de cinco competem com o que está escrito."
      >
        <Peca nome=".admin-table" largo>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Pessoa</th><th>Papel</th><th>Último acesso</th></tr>
              </thead>
              <tbody>
                <tr><td>Gui Zaidan</td><td>Master</td><td>há 5 min</td></tr>
                <tr><td>Rafael Breder</td><td>Membro</td><td>há 2 dias</td></tr>
              </tbody>
            </table>
          </div>
        </Peca>
      </Secao>

      {caixa === 'exclusao' && (
        <ConfirmarExclusao
          titulo="Um exemplo" oQue="peça"
          onCancelar={() => setCaixa(null)} onConfirmar={() => setCaixa(null)}
        />
      )}
      {caixa === 'dialogo' && (
        <Dialogo
          titulo="Mover para fechado?"
          descricao={<>A etapa vira <strong>Fechado</strong>. Deseja continuar?</>}
          perigo={false}
          onFechar={() => setCaixa(null)} onConfirmar={() => setCaixa(null)}
        />
      )}
    </div>
  );
}
