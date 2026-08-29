// Lote de propostas - porte do modo lote do "DUX Gerador de Propostas"
// (`/gerar_lote`, `autoAgruparPorSacado`, `toggleDesagruparLote`,
// `adicionarDiasVencimentos`).
//
// O analista joga várias NFS-e de uma vez, confere a tabela do que foi lido,
// agrupa o que precisa virar uma proposta só e gera tudo. Cada item sai pelo
// mesmo `/api/gerar-documento?action=proposta` da proposta avulsa: uma chamada
// por documento, com barra de progresso, em vez de um ZIP montado no servidor.
// O ZIP é montado aqui no navegador, o que também deixa cada proposta abrível
// na prévia antes de baixar.
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SelectSistema } from '../components/SelectSistema';
import { zipSync } from 'fflate';
import {
  IconArrowRight, IconDownload, IconEye, IconPlus, IconRefresh,
  IconShuffle, IconSpinner, IconTrash, IconUpload, IconZip,
} from '../components/icons';
import { PreviaDocx } from '../components/PreviaDocx';
import { SegSwitch as Segmentado } from '../components/SegSwitch';
import { DatePicker } from '../components/DatePicker';
import { useToast } from './AdminApp';
import { maskCurrency, parseCurrency } from '../lib/masks';
import { extractDocs } from '../lib/ocrExtractor';
import { extrairDadosNf, extracaoOk, type DadosNf } from '../lib/nfseParser';
import { isoAddDays } from '../lib/parcelas';
import { fmtMoeda } from '../lib/simuladorTaxas';
import {
  ajustarParaDiaUtil, brParaIso, fmtDocumento, hojeIso, isoParaBr,
  maskPct, MIME_DOCX, normalizaPct, parseMoedaBR, parsePct, TIPOS_DOC,
  type Marca, type TipoDoc,
} from '../lib/gerador';
import {
  montarPlanoLote, nomearSemRepetir,
  type GrupoLote, type NotaLote,
} from '../lib/loteProposta';

/** Quantas propostas o navegador pede ao mesmo tempo. */
const CONCORRENCIA = 3;

/** Uma linha da tabela: o que foi lido de um documento, já editável. */
interface Linha {
  id: number;
  arquivo: string;
  status: 'lendo' | 'ok' | 'parcial' | 'erro' | 'manual';
  erro?: string;
  cedente: string;
  cedenteCnpj: string;
  sacado: string;
  sacadoCnpj: string;
  numeroNf: string;
  valorTotal: string;        // mascarado
  valorAntecipado: string;   // mascarado
  dataEmissao: string;       // ISO
  /** "dd/mm/aaaa, dd/mm/aaaa" - texto livre, é o campo mais mexido da tela */
  vencimentos: string;
  /** Valores por parcela lidos do documento, quando vieram; texto do extrator */
  valoresParcelas: string;
  grupo: number | null;
}

interface Gerado {
  nome: string;
  base64: string;
  rotulo: string;
  liquido: number;
}

function linhaVazia(id: number, status: Linha['status'] = 'manual'): Linha {
  return {
    id, arquivo: '', status,
    cedente: '', cedenteCnpj: '', sacado: '', sacadoCnpj: '', numeroNf: '',
    valorTotal: '', valorAntecipado: '', dataEmissao: '', vencimentos: '',
    valoresParcelas: '', grupo: null,
  };
}

/** Texto "dd/mm/aa, dd/mm/aaaa" -> lista de ISO, descartando o que não é data. */
function datasDoTexto(texto: string): string[] {
  return String(texto ?? '').split(',').map(s => brParaIso(s.trim())).filter(Boolean);
}

/** Lista de ISO -> texto no formato que a coluna de vencimentos usa. */
function textoDasDatas(datas: string[]): string {
  return datas.map(isoParaBr).filter(Boolean).join(', ');
}

/** Quantos pedaços o analista digitou, mesmo os que ainda não são data válida. */
function pedacosDeData(texto: string): number {
  return String(texto ?? '').split(',').filter(s => s.trim()).length;
}

function base64ParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function docxBlob(base64: string): Blob {
  return new Blob([base64ParaBytes(base64)], { type: MIME_DOCX });
}

function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Página ───────────────────────────────────────────────────────────────────

export default function GeradorLotePropostas({ token }: { token: string }) {
  const { toast } = useToast();

  const [linhas, setLinhas] = useState<Linha[]>([]);
  const proximoId = useRef(1);

  // Parâmetros que valem para o lote inteiro
  const [marca, setMarca] = useState<Marca>('dux');
  const [tipo, setTipo] = useState<'avista' | 'parcelado'>('parcelado');
  const [tipoDoc, setTipoDoc] = useState<TipoDoc>('nf');
  const [ocultarTaxa, setOcultarTaxa] = useState(false);
  const [taxa, setTaxa] = useState('');
  const [dataAntecipacao, setDataAntecipacao] = useState(hojeIso());
  const [servico, setServico] = useState('');
  /** Ao agrupar, somar as parcelas que caem no mesmo vencimento (padrão do original). */
  const [somarMesmaData, setSomarMesmaData] = useState(true);

  const [lendo, setLendo] = useState('');
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null);
  const [gerados, setGerados] = useState<Gerado[]>([]);
  const [falhas, setFalhas] = useState<{ rotulo: string; erro: string }[]>([]);
  const [previa, setPrevia] = useState<Gerado | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const taxaNum = parsePct(taxa);

  // ── Linhas ─────────────────────────────────────────────────────────────────

  const atualizar = useCallback((id: number, patch: Partial<Linha>) => {
    setLinhas(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  function remover(id: number) {
    setLinhas(prev => prev.filter(l => l.id !== id));
  }

  function limpar() {
    setLinhas([]);
    setGerados([]);
    setFalhas([]);
  }

  function adicionarManual() {
    setLinhas(prev => [...prev, linhaVazia(proximoId.current++)]);
  }

  /** Joga o que a leitura extraiu numa linha da tabela. */
  function linhaDaExtracao(id: number, arquivo: string, d: DadosNf): Linha {
    const total = d.valor_total ? parseMoedaBR(d.valor_total) : 0;
    const mascarado = total > 0 ? maskCurrency(String(Math.round(total * 100))) : '';
    const { datas } = ajustarParaDiaUtil(datasDoTexto(d.datas_vencimento ?? ''));
    return {
      id,
      arquivo,
      status: extracaoOk(d) ? 'ok' : 'parcial',
      cedente: d.cliente_razao ?? '',
      cedenteCnpj: d.cliente_cnpj ?? '',
      sacado: d.sacado_razao ?? '',
      sacadoCnpj: d.sacado_cnpj ?? '',
      numeroNf: d.numero_nf ?? '',
      valorTotal: mascarado,
      valorAntecipado: mascarado,
      dataEmissao: d.data_emissao ? brParaIso(d.data_emissao) : '',
      vencimentos: textoDasDatas(datas),
      valoresParcelas: d.valores_parcelas ?? '',
      grupo: null,
    };
  }

  /** Lê os arquivos escolhidos e vira uma linha por documento. */
  async function lerArquivos(arquivos: File[]) {
    if (!arquivos.length || lendo) return;
    const ids = arquivos.map(() => proximoId.current++);

    // As linhas entram já visíveis, em "lendo", para a tabela não pular depois
    setLinhas(prev => [
      ...prev,
      ...arquivos.map((f, i) => ({ ...linhaVazia(ids[i], 'lendo' as const), arquivo: f.name })),
    ]);

    setLendo(`Lendo 1 de ${arquivos.length}…`);
    try {
      const docs = await extractDocs(arquivos, (c, t, fase) => {
        setLendo(fase === 'ocr' ? `Sem texto - reconhecendo com OCR (${c} de ${t})…` : `Lendo ${c} de ${t}…`);
      });

      let lidas = 0;
      let parciais = 0;
      setLinhas(prev => prev.map(l => {
        const i = ids.indexOf(l.id);
        if (i < 0) return l;
        const doc = docs[i];
        if (!doc) return { ...l, status: 'erro', erro: 'Não foi possível ler o arquivo.' };
        const nova = linhaDaExtracao(l.id, arquivos[i].name, extrairDadosNf(doc.text, arquivos[i].name));
        lidas++;
        if (nova.status === 'parcial') parciais++;
        return nova;
      }));

      toast(parciais ? 'info' : 'success',
        `${lidas} documento${lidas === 1 ? '' : 's'} lido${lidas === 1 ? '' : 's'}`,
        parciais
          ? `${parciais} com leitura parcial - confira as linhas destacadas antes de gerar.`
          : 'Revise a tabela e ajuste o que precisar.');
    } catch (e: any) {
      console.error('[lote] leitura', e);
      setLinhas(prev => prev.map(l => (ids.includes(l.id) && l.status === 'lendo'
        ? { ...l, status: 'erro', erro: e?.message ?? 'Falha na leitura.' }
        : l)));
      toast('error', 'Falha ao ler os documentos', e?.message ?? 'Tente novamente.');
    } finally {
      setLendo('');
    }
  }

  // ── Grupos ─────────────────────────────────────────────────────────────────

  const gruposUsados = useMemo(() => {
    const n = new Set<number>();
    for (const l of linhas) if (l.grupo != null) n.add(l.grupo);
    return [...n].sort((a, b) => a - b);
  }, [linhas]);

  function moverParaGrupo(id: number, destino: number | null | 'novo') {
    if (destino === 'novo') {
      const proximo = (gruposUsados[gruposUsados.length - 1] ?? 0) + 1;
      atualizar(id, { grupo: proximo });
      return;
    }
    atualizar(id, { grupo: destino });
  }

  /** Porte de `autoAgruparPorSacado`: um grupo por sacado que aparece 2+ vezes. */
  function agruparPorSacado() {
    const porSacado = new Map<string, number[]>();
    linhas.forEach(l => {
      if (l.status === 'lendo' || l.status === 'erro') return;
      const chave = l.sacado.trim().toUpperCase();
      if (!chave) return;
      porSacado.set(chave, [...(porSacado.get(chave) ?? []), l.id]);
    });

    let numero = 0;
    const destino = new Map<number, number>();
    for (const ids of porSacado.values()) {
      if (ids.length < 2) continue;
      numero++;
      for (const id of ids) destino.set(id, numero);
    }

    setLinhas(prev => prev.map(l => ({ ...l, grupo: destino.get(l.id) ?? null })));
    if (!numero) toast('info', 'Nenhum sacado repetido', 'Não há duas notas do mesmo sacado para agrupar.');
    else toast('success', `${numero} grupo${numero === 1 ? '' : 's'} montado${numero === 1 ? '' : 's'}`, 'Cada grupo vira uma proposta só.');
  }

  function desfazerGrupos() {
    setLinhas(prev => prev.map(l => ({ ...l, grupo: null })));
  }

  /** Porte de `adicionarDiasVencimentos`: empurra todos os vencimentos do lote. */
  function empurrarVencimentos(dias: number) {
    setLinhas(prev => prev.map(l => {
      const datas = datasDoTexto(l.vencimentos);
      if (!datas.length) return l;
      return { ...l, vencimentos: textoDasDatas(datas.map(d => isoAddDays(d, dias))) };
    }));
    toast('info', `+${dias} dias`, 'Todos os vencimentos do lote foram adiados.');
  }

  // ── Plano ──────────────────────────────────────────────────────────────────

  // As notas mantêm a ordem e a posição das linhas: o índice do plano é o índice
  // da tabela, então os grupos apontam para a linha certa mesmo com erro no meio.
  const notas: NotaLote[] = useMemo(() => linhas.map(l => {
    const face = parseCurrency(l.valorTotal);
    const antecipado = parseCurrency(l.valorAntecipado) || face;
    const datas = datasDoTexto(l.vencimentos);
    const valores = l.valoresParcelas.split(/,\s+(?=\d)/).map(s => s.trim()).filter(Boolean);
    const comValor = valores.length === datas.length;
    return {
      clienteRazao: l.cedente.trim(),
      clienteCnpj: l.cedenteCnpj.trim(),
      sacadoRazao: l.sacado.trim(),
      sacadoCnpj: l.sacadoCnpj.trim(),
      valorTotal: face,
      valorAntecipado: antecipado,
      numeroNf: l.numeroNf.trim(),
      dataEmissao: l.dataEmissao,
      parcelas: datas.map((vencimento, i) => ({
        vencimento,
        valor: comValor ? parseMoedaBR(valores[i]) : 0,
      })),
    };
  }), [linhas]);

  const grupos: GrupoLote[] = useMemo(() => gruposUsados.map(n => ({
    indices: linhas.map((l, i) => (l.grupo === n ? i : -1)).filter(i => i >= 0),
  })), [gruposUsados, linhas]);

  const plano = useMemo(() => montarPlanoLote(notas, grupos, {
    marca, tipo, tipoDocumento: tipoDoc, ocultarTaxa,
    taxaMensal: taxaNum, dataAntecipacao, servico,
    desagrupar: !somarMesmaData,
  }), [notas, grupos, marca, tipo, tipoDoc, ocultarTaxa, taxaNum, dataAntecipacao, servico, somarMesmaData]);

  /** Índice do plano em que cada cedente aparece pela primeira vez. */
  const primeiraDoCedente = useMemo(() => {
    const vistos = new Set<string>();
    return plano.itens.map(it => {
      const cnpj = it.nota.clienteCnpj.replace(/\D/g, '');
      if (!cnpj || vistos.has(cnpj)) return false;
      vistos.add(cnpj);
      return true;
    });
  }, [plano.itens]);

  const temLendo = linhas.some(l => l.status === 'lendo');
  const pronto = plano.itens.length > 0 && taxaNum > 0 && !!dataAntecipacao && !temLendo && !progresso;

  // ── Geração ────────────────────────────────────────────────────────────────

  async function gerarUm(indice: number): Promise<{ nome: string; base64: string; liquido: number }> {
    const item = plano.itens[indice];
    const res = await fetch('/api/gerar-documento?action=proposta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: JSON.stringify({
        tipo: item.tipo,
        marca,
        ocultarTaxa,
        clienteRazao: item.nota.clienteRazao,
        clienteCnpj: fmtDocumento(item.nota.clienteCnpj),
        sacadoRazao: item.nota.sacadoRazao,
        sacadoCnpj: fmtDocumento(item.nota.sacadoCnpj),
        valorTotal: item.nota.valorTotal,
        valorAntecipado: item.nota.valorAntecipado ?? item.nota.valorTotal,
        dataEmissao: isoParaBr(item.nota.dataEmissao || dataAntecipacao),
        dataAntecipacao,
        taxaMensal: taxaNum,
        numeroNf: item.nota.numeroNf ?? '',
        servico,
        tipoDocumento: tipoDoc,
        parcelas: item.parcelas,
        // A taxa do cedente é guardada uma vez por lote, não a cada documento
        registrarTaxa: primeiraDoCedente[indice],
      }),
    });
    const raw = await res.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { /* resposta vazia ou não-JSON */ }
    if (!res.ok || !data || data.error || !data.base64) {
      throw new Error(data?.error ?? `Falha ao gerar (${res.status}).`);
    }
    return { nome: data.nome, base64: data.base64, liquido: Number(data.resumo?.totalLiquido) || 0 };
  }

  async function gerarLote() {
    if (!pronto) return;
    const total = plano.itens.length;
    setProgresso({ feito: 0, total });
    setGerados([]);
    setFalhas([]);

    const prontos: Gerado[] = [];
    const erros: { rotulo: string; erro: string }[] = [];
    const usados = new Set<string>();

    try {
      // Em ondas: o progresso continua honesto e a função não recebe 20 chamadas
      // simultâneas de uma vez
      for (let i = 0; i < total; i += CONCORRENCIA) {
        const fatia = plano.itens.slice(i, i + CONCORRENCIA);
        const saidas = await Promise.all(fatia.map((item, j) =>
          gerarUm(i + j)
            .then(r => ({ ok: true as const, item, ...r }))
            .catch((e: any) => ({ ok: false as const, item, erro: e?.message ?? 'Erro desconhecido.' }))));

        for (const s of saidas) {
          if (s.ok) prontos.push({ nome: nomearSemRepetir(s.nome, usados), base64: s.base64, rotulo: s.item.rotulo, liquido: s.liquido });
          else erros.push({ rotulo: s.item.rotulo, erro: s.erro });
        }
        setProgresso({ feito: Math.min(i + CONCORRENCIA, total), total });
      }

      setGerados(prontos);
      // Só o que falhou na geração: o que o plano já tinha descartado continua
      // listado ao vivo acima, junto do botão
      setFalhas(erros);

      if (!prontos.length) toast('error', 'Nenhuma proposta gerada', 'Confira os motivos listados abaixo da tabela.');
      else if (erros.length) toast('info', `${prontos.length} de ${total} geradas`, `${erros.length} falharam - o motivo está na lista.`);
      else toast('success', `${prontos.length} proposta${prontos.length === 1 ? '' : 's'} gerada${prontos.length === 1 ? '' : 's'}`, 'Confira na prévia e baixe o pacote.');
    } finally {
      setProgresso(null);
    }
  }

  function baixarTudo() {
    if (!gerados.length) return;
    const arquivos: Record<string, Uint8Array> = {};
    for (const d of gerados) arquivos[d.nome] = base64ParaBytes(d.base64);
    // level 0: o .docx já é um ZIP comprimido, recomprimir só gasta tempo
    const zip = zipSync(arquivos, { level: 0 });
    baixarBlob(new Blob([zip], { type: 'application/zip' }), 'propostas_lote.zip');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const totalFace = notas.reduce((s, n) => s + n.valorTotal, 0);
  const nGrupos = plano.itens.filter(i => i.origem === 'grupo').length;
  const nSoltas = plano.itens.filter(i => i.origem === 'nota').length;

  return (
    <>
      {/* ── Entrada ── */}
      <div
        className="gd-drop"
        onClick={() => !lendo && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('sobre'); }}
        onDragLeave={e => e.currentTarget.classList.remove('sobre')}
        onDrop={e => {
          e.preventDefault();
          e.currentTarget.classList.remove('sobre');
          lerArquivos(Array.from(e.dataTransfer.files ?? []));
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => { lerArquivos(Array.from(e.target.files ?? [])); e.target.value = ''; }}
        />
        <IconUpload size={22} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {lendo ? (
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--black)' }}>{lendo}</p>
          ) : (
            <>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--black)' }}>Arraste as notas do lote</p>
              <p style={{ fontSize: 11.5, color: 'var(--gray2)' }}>
                Vários PDFs ou imagens de uma vez - cada documento vira uma linha na tabela.
              </p>
            </>
          )}
        </div>
        {lendo
          ? <span className="gd-spin" />
          : <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gray2)' }}>Escolher</span>}
      </div>

      {/* ── Tabela ── */}
      <div className="gd-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <p className="admin-section-title" style={{ marginBottom: 0 }}>
            Notas do lote{linhas.length ? ` (${linhas.length})` : ''}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={adicionarManual}>
              <IconPlus size={12} /> Linha em branco
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={agruparPorSacado} disabled={linhas.length < 2}>
              <IconShuffle size={12} /> Agrupar por sacado
            </button>
            {gruposUsados.length > 0 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={desfazerGrupos}>
                <IconRefresh size={12} /> Desfazer grupos
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => empurrarVencimentos(2)} disabled={!linhas.length}>
              +2 dias
            </button>
            {linhas.length > 0 && (
              <button type="button" className="gd-link" onClick={limpar}>Limpar</button>
            )}
          </div>
        </div>

        {!linhas.length ? (
          <p style={{ padding: '28px 0', textAlign: 'center', fontSize: 12.5, color: 'var(--gray2)' }}>
            Nenhuma nota ainda. Arraste os documentos acima ou comece com uma linha em branco.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <table className="gd-tabela gd-lote">
              <thead>
                <tr>
                  <th style={{ width: 26 }}>#</th>
                  <th style={{ width: 92 }}>Grupo</th>
                  <th>Cedente</th>
                  <th>Sacado</th>
                  <th style={{ width: 84 }}>Nº doc.</th>
                  <th style={{ width: 116 }}>Valor</th>
                  <th style={{ width: 116 }}>A antecipar</th>
                  <th style={{ width: 200 }}>Vencimentos</th>
                  <th style={{ width: 34 }} />
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const nParc = pedacosDeData(l.vencimentos);
                  const validas = datasDoTexto(l.vencimentos).length;
                  return (
                    <tr key={l.id} className={l.status === 'erro' ? 'erro' : l.status === 'parcial' ? 'parcial' : undefined}>
                      <td style={{ color: 'var(--gray2)', fontWeight: 700 }}>{i + 1}</td>
                      <td>
                        <select
                          className="form-select gd-lote-inp"
                          value={l.grupo == null ? '' : String(l.grupo)}
                          onChange={e => moverParaGrupo(l.id, e.target.value === '' ? null : e.target.value === 'novo' ? 'novo' : Number(e.target.value))}
                        >
                          <option value="">-</option>
                          {gruposUsados.map(n => <option key={n} value={n}>Grupo {n}</option>)}
                          <option value="novo">Novo grupo</option>
                        </select>
                      </td>
                      <td>
                        {l.status === 'lendo' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--gray2)' }}>
                            <span className="gd-spin" /> lendo…
                          </span>
                        ) : (
                          <input
                            className="form-input gd-lote-inp"
                            value={l.cedente}
                            placeholder="Razão social"
                            title={l.arquivo || undefined}
                            onChange={e => atualizar(l.id, { cedente: e.target.value })}
                          />
                        )}
                      </td>
                      <td>
                        <input
                          className="form-input gd-lote-inp"
                          value={l.sacado}
                          placeholder="Razão social"
                          onChange={e => atualizar(l.id, { sacado: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="form-input gd-lote-inp"
                          value={l.numeroNf}
                          placeholder="-"
                          onChange={e => atualizar(l.id, { numeroNf: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="form-input gd-lote-inp num"
                          inputMode="numeric"
                          value={l.valorTotal}
                          placeholder="R$ 0,00"
                          onChange={e => {
                            const v = maskCurrency(e.target.value);
                            // O valor a antecipar acompanha o total até ser mexido à mão
                            atualizar(l.id, l.valorAntecipado === l.valorTotal
                              ? { valorTotal: v, valorAntecipado: v }
                              : { valorTotal: v });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className="form-input gd-lote-inp num"
                          inputMode="numeric"
                          value={l.valorAntecipado}
                          placeholder="R$ 0,00"
                          onChange={e => atualizar(l.id, { valorAntecipado: maskCurrency(e.target.value) })}
                        />
                      </td>
                      <td>
                        <input
                          className="form-input gd-lote-inp"
                          value={l.vencimentos}
                          placeholder="dd/mm/aaaa, dd/mm/aaaa"
                          onChange={e => atualizar(l.id, { vencimentos: e.target.value })}
                        />
                        <span style={{ fontSize: 10, color: nParc && validas !== nParc ? 'var(--red)' : 'var(--gray2)' }}>
                          {!nParc ? 'sem vencimento'
                            : validas !== nParc ? `${nParc - validas} data(s) inválida(s)`
                            : `${validas} parcela${validas === 1 ? '' : 's'}`}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="gd-lote-x"
                          onClick={() => remover(l.id)}
                          aria-label={`Remover a nota ${i + 1}`}
                        >
                          <IconTrash size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {linhas.length > 1 && (
                <tfoot>
                  <tr>
                    <td colSpan={5}>Total de face</td>
                    <td className="num">{fmtMoeda(totalFace)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {linhas.some(l => l.status === 'erro') && (
          <p style={{ fontSize: 11.5, color: '#B45309', marginTop: 10 }}>
            Linhas em vermelho não foram lidas. Preencha à mão ou remova antes de gerar.
          </p>
        )}
      </div>

      {/* ── Parâmetros do lote ── */}
      <div className="gd-card">
        <p className="admin-section-title">Vale para todo o lote</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 12, alignItems: 'flex-end' }}>
          <CampoLote label="Marca">
            <Segmentado
              valor={marca}
              onChange={setMarca}
              opcoes={[{ valor: 'dux', label: 'DUX' }, { valor: 'prematch', label: 'Prematch' }]}
            />
          </CampoLote>
          <CampoLote label="Modalidade">
            <Segmentado
              valor={tipo}
              onChange={setTipo}
              opcoes={[{ valor: 'avista', label: 'À vista' }, { valor: 'parcelado', label: 'Parcelado' }]}
            />
          </CampoLote>
          <CampoLote label="Lastro">
            <div style={{ minWidth: 170 }}>
              <SelectSistema valor={tipoDoc} onChange={setTipoDoc} opcoes={TIPOS_DOC} />
            </div>
          </CampoLote>
          <label className="form-checkbox-label" style={{ paddingTop: 0, paddingBottom: 10 }}>
            <input type="checkbox" className="form-checkbox" checked={ocultarTaxa}
              onChange={e => setOcultarTaxa(e.target.checked)} />
            Ocultar taxa no documento
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginTop: 16 }}>
          <CampoLote label="Taxa mensal">
            <div style={{ position: 'relative' }}>
              <input className="form-input" inputMode="decimal" placeholder="0,00" style={{ paddingRight: 34 }}
                value={taxa}
                onChange={e => setTaxa(maskPct(e.target.value))}
                onBlur={() => setTaxa(t => normalizaPct(t))} />
              <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, fontWeight: 700, color: taxa ? 'var(--gray)' : 'var(--gray2)', pointerEvents: 'none' }}>%</span>
            </div>
          </CampoLote>
          <CampoLote label="Data de antecipação">
            <DatePicker compact allowPast value={dataAntecipacao} onChange={setDataAntecipacao} />
          </CampoLote>
          <CampoLote label="Serviço prestado">
            <input className="form-input" value={servico} onChange={e => setServico(e.target.value)}
              placeholder="Como aparece na proposta" />
          </CampoLote>
        </div>

        {gruposUsados.length > 0 && (
          <label className="form-checkbox-label" style={{ marginTop: 14 }}>
            <input type="checkbox" className="form-checkbox" checked={somarMesmaData}
              onChange={e => setSomarMesmaData(e.target.checked)} />
            Nos grupos, somar as notas que vencem no mesmo dia numa parcela só
          </label>
        )}
      </div>

      {/* ── Gerar ── */}
      <div className="gd-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <p className="admin-section-title" style={{ marginBottom: 2 }}>
              {plano.itens.length === 0
                ? 'Nada a gerar ainda'
                : `${plano.itens.length} proposta${plano.itens.length === 1 ? '' : 's'}`}
            </p>
            <p style={{ fontSize: 11.5, color: 'var(--gray2)' }}>
              {plano.itens.length === 0
                ? 'Preencha as notas, a taxa e a data de antecipação.'
                : `${nSoltas} avulsa${nSoltas === 1 ? '' : 's'}${nGrupos ? ` · ${nGrupos} agrupada${nGrupos === 1 ? '' : 's'}` : ''}`
                  + (plano.erros.length ? ` · ${plano.erros.length} de fora` : '')}
            </p>
          </div>
          <button className="btn btn-primary" disabled={!pronto} onClick={gerarLote}>
            {progresso
              ? <><IconSpinner size={13} /> Gerando {progresso.feito} de {progresso.total}…</>
              : <>Gerar lote <IconArrowRight size={13} /></>}
          </button>
        </div>

        {progresso && (
          <div className="gd-barra" style={{ marginTop: 14 }}>
            <span style={{ width: `${Math.round((progresso.feito / Math.max(progresso.total, 1)) * 100)}%` }} />
          </div>
        )}

        {plano.erros.length > 0 && !progresso && !temLendo && (
          <ul style={{ listStyle: 'none', marginTop: 14, display: 'grid', gap: 5 }}>
            {plano.erros.map(e => (
              <li key={e.rotulo} style={{ fontSize: 11.5, color: '#B45309' }}>
                <strong style={{ fontWeight: 700 }}>{e.rotulo}:</strong> {e.erro}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Resultado ── */}
      {(gerados.length > 0 || falhas.length > 0) && (
        <div className="gd-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <p className="admin-section-title" style={{ marginBottom: 0 }}>
              Documentos gerados{gerados.length ? ` (${gerados.length})` : ''}
            </p>
            {gerados.length > 0 && (
              <button type="button" className="btn btn-primary btn-sm" onClick={baixarTudo}>
                <IconZip size={13} /> Baixar todos (.zip)
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            {gerados.map(d => (
              <div key={d.nome} className="gd-lote-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.nome}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--gray2)' }}>
                    {d.rotulo} · líquido {fmtMoeda(d.liquido)}
                  </p>
                </div>
                <button type="button" className="gd-lote-acao" onClick={() => setPrevia(d)} aria-label={`Ver ${d.nome}`}>
                  <IconEye size={14} />
                </button>
                <button type="button" className="gd-lote-acao" onClick={() => baixarBlob(docxBlob(d.base64), d.nome)} aria-label={`Baixar ${d.nome}`}>
                  <IconDownload size={14} />
                </button>
              </div>
            ))}
          </div>

          {falhas.length > 0 && (
            <>
              <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gray2)', marginTop: 18 }}>
                Não geradas
              </p>
              <ul style={{ listStyle: 'none', marginTop: 8, display: 'grid', gap: 5 }}>
                {falhas.map((f, i) => (
                  <li key={`${f.rotulo}-${i}`} style={{ fontSize: 11.5, color: '#B45309' }}>
                    <strong style={{ fontWeight: 700 }}>{f.rotulo}:</strong> {f.erro}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Prévia de um documento do lote */}
      {previa && createPortal(
        <div className="gd-modal-fundo" onClick={e => { if (e.target === e.currentTarget) setPrevia(null); }}>
          <div className="gd-modal">
            <div className="gd-modal-topo">
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {previa.nome}
                </p>
                <p style={{ fontSize: 11.5, color: 'var(--gray2)' }}>{previa.rotulo}</p>
              </div>
              <button type="button" className="gd-modal-fechar" onClick={() => setPrevia(null)} aria-label="Fechar">&times;</button>
            </div>
            <div className="gd-modal-corpo">
              <PreviaDocx blob={docxBlob(previa.base64)} />
            </div>
            <div className="gd-modal-rodape">
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" className="gd-link" onClick={() => setPrevia(null)}>Fechar</button>
                <button className="btn btn-primary" onClick={() => baixarBlob(docxBlob(previa.base64), previa.nome)}>
                  Baixar .docx
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function CampoLote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
