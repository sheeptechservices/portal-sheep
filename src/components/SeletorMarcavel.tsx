// ─────────────────────────────────────────────────────────────────────────────
//  O seletor marcável da casa: um gatilho, uma lista em portal e um quadradinho
//  por item.
//
//  Nasceu do seletor de vínculo (reunião ↔ entrega), que era a única lista
//  desse feitio no sistema e não tinha busca: com dez reuniões no projeto, achar
//  a certa era rolar e ler uma a uma. A busca entrou aqui, e não lá, porque o
//  gesto - "marque nesta lista o que tem a ver" - é o mesmo em qualquer tela que
//  venha a precisar dele.
//
//  O que muda de um lugar para o outro é o rótulo, o que está na lista e o
//  desenho do gatilho. O resto - abrir e fechar, o portal, a busca, o vazio -
//  é igual, e é isto aqui.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconSearch } from './icons';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { contemTermo } from '../lib/texto';

/** Uma linha da lista. A `nota` desempata dois nomes parecidos - a data da
 *  reunião, a etapa da entrega - e também entra na busca. */
export interface OpcaoMarcavel {
  id: number;
  nome: string;
  nota?: string | null;
}

/** A partir de quantos itens a busca aparece. Abaixo disso a lista cabe de uma
 *  olhada, e um campo em cima dela seria peça a mais para a mesma resposta. */
const BUSCA_A_PARTIR_DE = 6;
const LARGURA = 280;

export function SeletorMarcavel({
  rotulo, acao, icone, opcoes, escolhidos, vazio, onAlternar,
  classeGatilho = 'vinculo-gatilho', buscaAPartirDe = BUSCA_A_PARTIR_DE, placeholderBusca = 'Buscar',
}: {
  /** O título da lista: o que se está marcando ali. */
  rotulo: string;
  /** O que o botão diz. Sem texto, o gatilho vira um ícone que ninguém acha. */
  acao: string;
  /** A marca do gatilho. Quem chama é quem sabe o que a lista liga. */
  icone?: React.ReactNode;
  opcoes: OpcaoMarcavel[];
  escolhidos: number[];
  /** O que dizer quando não há o que escolher. */
  vazio: string;
  onAlternar: (id: number, ligar: boolean) => void;
  /** Para o gatilho seguir o desenho da tela que o abriga. */
  classeGatilho?: string;
  buscaAPartirDe?: number;
  placeholderBusca?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const campoBusca = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useDropdownDismiss(aberto, [gatilho, lista], () => setAberto(false));

  const buscando = opcoes.length > buscaAPartirDe;
  const filtradas = useMemo(
    () => opcoes.filter(o => contemTermo(o.nome, busca) || contemTermo(o.nota, busca)),
    [opcoes, busca],
  );

  // Fechou: a busca volta ao zero. Reabrir com o filtro de antes esconderia a
  // metade da lista sem ninguém ter pedido.
  useEffect(() => { if (!aberto) setBusca(''); }, [aberto]);

  // O foco vai para a busca na abertura: quem abre uma lista de vinte já sabe o
  // nome do que procura.
  useEffect(() => { if (aberto && buscando) campoBusca.current?.focus(); }, [aberto, buscando]);

  // Antes da pintura: medido depois, o menu aparece uma vez no canto da tela.
  useLayoutEffect(() => {
    if (!aberto) return;
    const r = gatilho.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      top: r.bottom + 5,
      // Encostado à direita do gatilho, sem sair pela borda da janela.
      left: Math.max(8, Math.min(r.right - LARGURA, window.innerWidth - LARGURA - 8)),
    });
  }, [aberto]);

  return (
    <>
      <button type="button" ref={gatilho} className={classeGatilho}
        aria-expanded={aberto} onClick={() => setAberto(a => !a)}>
        {icone}
        {acao}
      </button>
      {aberto && createPortal(
        <div ref={lista} className="vinculo-lista surge" style={{ top: pos.top, left: pos.left }}>
          <p className="vinculo-rotulo">{rotulo}</p>

          {buscando && (
            <label className="vinculo-busca">
              <IconSearch size={12} />
              <input
                ref={campoBusca}
                className="form-input"
                value={busca}
                placeholder={placeholderBusca}
                aria-label={`${placeholderBusca} em ${rotulo.toLocaleLowerCase('pt-BR')}`}
                onChange={e => setBusca(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Escape') return;
                  e.preventDefault();
                  // O primeiro Escape desfaz a busca, o segundo fecha a lista:
                  // fechar tudo de uma vez obrigaria a abrir de novo para ver a
                  // lista inteira.
                  if (busca) setBusca('');
                  else setAberto(false);
                }}
              />
            </label>
          )}

          {opcoes.length === 0 ? (
            <p className="vinculo-vazio">{vazio}</p>
          ) : filtradas.length === 0 ? (
            <p className="vinculo-vazio">Nada com esse nome.</p>
          ) : (
            // A chave é a assinatura do resultado: é a troca dela que remonta os
            // itens e faz a entrada tocar. Digitar uma letra que não muda o
            // resultado não reanima nada.
            <div className="lista-anima" key={filtradas.map(o => o.id).join(',')}>
              {filtradas.map(o => {
                const marcado = escolhidos.includes(o.id);
                return (
                  <label key={o.id} className="vinculo-opcao">
                    <input type="checkbox" className="form-checkbox" checked={marcado}
                      onChange={() => onAlternar(o.id, !marcado)} />
                    <span>
                      {o.nome}
                      {o.nota && <span className="vinculo-nota">{o.nota}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
