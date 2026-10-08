// ─────────────────────────────────────────────────────────────────────────────
//  Subir uma proposta feita fora do gerador.
//
//  A proposta montada no PowerPoint, no Canva ou num HTML à parte entra no
//  histórico como as outras: com versão, link para o cliente e, quando tem
//  oportunidade, chip no card do funil. A diferença é que o conteúdo dela é o
//  arquivo, e a linha diz isso - "Upload externo" - para ninguém procurá-la no
//  gerador.
//
//  Ninguém digita o nome dela. O título vem do próprio arquivo, lido pela IA
//  assim que ele é solto; o cliente vem da oportunidade escolhida, e sem
//  oportunidade, do arquivo também. Por isso o arquivo sobe no instante em que
//  cai na gaveta: é lá no servidor que a IA o lê, e quando o "Subir" é clicado
//  só falta criar a linha.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PuxadorDoPainel } from '../components/PuxadorDoPainel';
import { SelectSistema } from '../components/SelectSistema';
import { IconAlert, IconCheck, IconDoc, IconSpinner, IconTrash, IconUpload, IconX } from '../components/icons';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
import { useLarguraPainel } from '../lib/painelLateral';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import {
  LIMITE_DO_ARQUIVO, pesoDoArquivo, rotuloDoFormato, subirArquivo, tipoDoArquivo,
  type ArquivoDaProposta,
} from '../lib/proposta/arquivo';

export interface LeadParaEnvio {
  id: string;
  empresa: string | null;
  contato: string | null;
  etapa: string | null;
}

/** O que a gaveta entrega à página: o arquivo já está no servidor, e falta só
 *  a linha da proposta. */
export interface PedidoDeEnvio {
  envio: string;
  arquivo: ArquivoDaProposta;
  /** Vazio quando a proposta não está presa a oportunidade nenhuma. */
  oportunidade_id: string;
  cliente: string;
  subtitulo: string;
  /** A proposta de que esta é versão nova, quando é. */
  origem_id: number | null;
}

/** A proposta de que a nova é versão: ela fixa a oportunidade e o cliente. */
export interface OrigemDoEnvio {
  id: number;
  oportunidade_id: string;
  lead_empresa: string | null;
  cliente: string;
  subtitulo: string;
  proximaVersao: number;
}

/** Onde está o arquivo solto: subindo, sendo lido, pronto ou parado num erro. */
type Fase = 'subindo' | 'lendo' | 'pronto' | 'falhou';

/** O nome do arquivo sem a extensão: o título de reserva, quando a IA não acha
 *  o da proposta. */
const semExtensao = (nome: string) => nome.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();

export function EnvioDeProposta({ leads, origem, enviar, onFechar, onSubir }: {
  leads: LeadParaEnvio[] | null;
  origem: OrigemDoEnvio | null;
  /** O POST do `admin-data`, com a sessão da tela. */
  enviar: (corpo: Record<string, unknown>) => Promise<any>;
  onFechar: () => void;
  onSubir: (p: PedidoDeEnvio) => void;
}) {
  const painel = useLarguraPainel('proposta-envio');
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);
  const seletor = useRef<HTMLInputElement>(null);

  const [leadId, setLeadId] = useState(origem?.oportunidade_id ?? '');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [fase, setFase] = useState<Fase | null>(null);
  const [envio, setEnvio] = useState<{ envio: string; partes: number } | null>(null);
  const [lido, setLido] = useState<{ titulo: string; cliente: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  /** O arquivo da vez. Trocar de arquivo no meio, ou fechar a gaveta, faz a
   *  resposta do anterior chegar num lugar que não a espera mais. */
  const rodada = useRef(0);
  useEffect(() => () => { rodada.current++; }, []);

  const lead = leads?.find(l => l.id === leadId) ?? null;
  // O cliente não se digita: é o da proposta de origem, o da oportunidade, ou
  // o que a IA leu no arquivo, nesta ordem.
  const cliente = origem?.cliente ?? lead?.empresa ?? lido?.cliente ?? '';
  const titulo = lido?.titulo ?? '';

  async function receber(lista: FileList | File[] | null | undefined) {
    const f = [...(lista ?? [])][0];
    if (!f) return;
    setAviso(null);
    if (f.size === 0) { setAviso(`"${f.name}" está vazio.`); return; }
    if (f.size > LIMITE_DO_ARQUIVO) { setAviso(`"${f.name}" passa de 25 MB.`); return; }
    const minha = ++rodada.current;
    setArquivo(f);
    setLido(null);
    setEnvio(null);
    setFase('subindo');
    const subido = await subirArquivo(enviar, f);
    if (minha !== rodada.current) return;
    if (!subido.ok) { setFase('falhou'); setAviso(subido.erro); return; }
    setEnvio({ envio: subido.envio, partes: subido.partes });
    setFase('lendo');
    const r = await enviar({
      action: 'ler_proposta_externa', envio: subido.envio, partes: subido.partes,
      arquivo_nome: f.name, arquivo_tipo: tipoDoArquivo(f),
    }).catch(() => null);
    if (minha !== rodada.current) return;
    if (r?.ok) {
      setLido({ titulo: String(r.titulo), cliente: String(r.cliente ?? '') });
    } else {
      // Sem a leitura, a proposta sobe com o nome do arquivo: travar a subida
      // por causa do título seria pior que um título a conferir.
      setLido({ titulo: semExtensao(f.name) || 'Proposta', cliente: '' });
      setAviso(`${r?.error ?? 'A IA não leu o arquivo.'} O título ficou com o nome do arquivo.`);
    }
    setFase('pronto');
  }

  function tirarArquivo() {
    rodada.current++;
    setArquivo(null);
    setFase(null);
    setEnvio(null);
    setLido(null);
    setAviso(null);
  }

  const pronto = fase === 'pronto' && !!arquivo && !!envio && !!titulo;

  function subir() {
    if (!pronto || !arquivo || !envio) return;
    onSubir({
      envio: envio.envio,
      arquivo: { nome: arquivo.name, tipo: tipoDoArquivo(arquivo), tamanho: arquivo.size, partes: envio.partes },
      oportunidade_id: leadId,
      cliente: cliente || 'Cliente não identificado',
      subtitulo: titulo,
      origem_id: origem?.id ?? null,
    });
    fechar();
  }

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`} {...fundo}>
      <PuxadorDoPainel largura={painel.largura} arrastando={painel.arrastando}
        setArrastando={painel.setArrastando} porTecla={painel.porTecla} />
      <div className="admin-modal painel-gaveta" style={{ width: `min(${painel.largura}px, 96vw)` }}
        onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="painel-rotulo">
              {origem ? `VERSÃO ${origem.proximaVersao} DA PROPOSTA` : 'PROPOSTA DE FORA'}
            </p>
            {/* O título é o que a IA leu no arquivo, e não um campo. Antes do
                arquivo, o lugar diz de onde ele vai vir; durante a leitura,
                gira. */}
            {titulo ? (
              <p className="painel-titulo troca" key="titulo">{titulo}</p>
            ) : fase === 'subindo' || fase === 'lendo' ? (
              <p className="painel-titulo envio-proposta-titulo-vazio troca" key="lendo">
                <IconSpinner size={15} />
              </p>
            ) : (
              <p className="painel-titulo envio-proposta-titulo-vazio troca" key="vazio">
                O título vem do arquivo
              </p>
            )}
          </div>
          <button className="admin-modal-close" aria-label="Fechar" onClick={fechar}><IconX size={16} /></button>
        </div>

        <div className="admin-modal-body envio-proposta-corpo">
          <p className="acessos-dica">
            A proposta feita fora do gerador entra no histórico com a etiqueta Upload externo. A IA lê o
            título no arquivo, e o cliente vem da oportunidade. PDF, HTML e imagem abrem aqui dentro; os
            outros formatos ficam para baixar.
          </p>

          <input ref={seletor} type="file" style={{ display: 'none' }}
            onChange={e => { void receber(e.target.files); e.target.value = ''; }} />
          {/* O convite a soltar e, depois, o arquivo solto: a mesma área trocando
              de cara, sem mudar de lugar. */}
          {arquivo ? (
            <div className="analise-anexo envio-proposta-arquivo troca" key="arquivo">
              <span className="analise-anexo-icone"><IconDoc size={14} /></span>
              <span className="analise-anexo-nome" title={arquivo.name}>{arquivo.name}</span>
              <span className="analise-anexo-peso">
                {rotuloDoFormato({ nome: arquivo.name, tipo: tipoDoArquivo(arquivo) })} · {pesoDoArquivo(arquivo.size)}
              </span>
              <span className="candidato-arquivo-estado">
                {fase === 'subindo' ? <><IconSpinner size={12} /> Subindo</>
                  : fase === 'lendo' ? <><IconSpinner size={12} /> Lendo o título</>
                    : fase === 'pronto' ? <><IconCheck size={12} /> Pronto</> : null}
              </span>
              <button type="button" className="analise-anexo-tirar" aria-label={`Tirar ${arquivo.name}`}
                onClick={tirarArquivo}>
                <IconTrash size={12} />
              </button>
            </div>
          ) : (
            <button type="button" key="solta"
              className={`analise-solta troca${arrastando ? ' sobre' : ''}`}
              onClick={() => seletor.current?.click()}
              onDragOver={e => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={e => { e.preventDefault(); setArrastando(false); void receber(e.dataTransfer.files); }}>
              <IconDoc size={14} />
              <span>
                <b>Solte aqui o arquivo da proposta</b>
                <small>PDF, HTML, PowerPoint ou outro formato, até 25 MB</small>
              </span>
              <IconUpload size={13} />
            </button>
          )}
          {aviso && <p className="analise-erro surge"><IconAlert size={11} /> {aviso}</p>}

          <div className="form-group">
            <label className="form-label">Oportunidade</label>
            {origem ? (
              // A versão é da mesma família, e a família é de uma oportunidade só.
              <p className="envio-proposta-leitura">
                {origem.oportunidade_id ? (origem.lead_empresa ?? 'Oportunidade da proposta de origem') : 'Sem oportunidade'}
              </p>
            ) : leads == null ? (
              <div className="dux-spinner-row" style={{ justifyContent: 'flex-start', padding: '10px 0' }}>
                <span className="dux-spinner sm" />
              </div>
            ) : (
              <SelectSistema<string>
                valor={leadId}
                placeholder="Sem oportunidade"
                onChange={setLeadId}
                opcoes={[
                  // Opcional: a proposta de fora pode chegar antes de o lead
                  // existir no funil.
                  { valor: '', label: 'Sem oportunidade', descricao: 'O cliente vem do arquivo' },
                  ...leads.map(l => ({
                    valor: l.id,
                    label: l.empresa ?? 'Oportunidade sem empresa',
                    descricao: [l.etapa, l.contato].filter(Boolean).join(' · ') || undefined,
                  })),
                ]} />
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Cliente</label>
            {/* Leitura, e não campo: o nome segue a oportunidade, ou o arquivo. */}
            <p className={`envio-proposta-leitura troca${cliente ? '' : ' vazio'}`} key={cliente || 'vazio'}>
              {cliente || (leadId ? 'Oportunidade sem empresa' : 'Vem da oportunidade, ou do arquivo')}
            </p>
          </div>
        </div>

        <div className="painel-rodape">
          <button type="button" className="modal-acao" onClick={fechar}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!pronto} onClick={subir}
            title={pronto ? undefined : 'Solte o arquivo e espere a IA ler o título'}>
            <IconUpload size={14} /> Subir proposta
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
