// Simulador de Taxas - porta da "Simulação Rápida" do DUX Gerador de Propostas.
// Mesmos campos e o mesmo motor de cálculo (src/lib/simuladorTaxas.ts); a
// diferença é que aqui o resultado aparece na tela em vez de sair num DOCX.
import { Fragment, useMemo, useState } from 'react';
import { DatePicker } from '../components/DatePicker';
import { SegSwitch } from '../components/SegSwitch';
import { IconDownload } from '../components/icons';
import { maskCurrency, parseCurrency } from '../lib/masks';
import { isoAddMonths } from '../lib/parcelas';
import { abrirSimulacaoPdf } from '../lib/simulacaoPdf';
import {
  simular, fmtMoeda, fmtPct, fmtPctAuto, fmtIntervalo,
  type ResultadoSimulacao,
} from '../lib/simuladorTaxas';

const MAX_PARCELAS = 24;

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Enquanto digita: só dígitos e uma vírgula, no máximo 4 casas. */
function maskPct(v: string): string {
  let s = v.replace(/[^\d,.]/g, '').replace(/\./g, ',');
  const partes = s.split(',');
  if (partes.length > 2) s = partes[0] + ',' + partes.slice(1).join('');
  const [int, dec] = s.split(',');
  return dec !== undefined ? `${int.slice(0, 3)},${dec.slice(0, 4)}` : int.slice(0, 3);
}

/** Ao sair do campo: 2 a 4 casas, sem zeros sobrando - igual ao `aplicarMascaraPct`
 *  do app original ("3,5" vira "3,50"; "3,7425" fica como está). */
function normalizaPct(v: string): string {
  const n = parseFloat(v.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return v;
  return n.toFixed(4).replace(/(\.\d{2,}?)0+$/, '$1').replace('.', ',');
}

function parsePct(v: string): number {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

interface LinhaParcela {
  vencimento: string;
  /** Valor mascarado; só usado no modo "valores variáveis" */
  valor: string;
}

// ── Blocos de UI ──────────────────────────────────────────────────────────────

function Campo({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 11, color: 'var(--gray2)', marginTop: 5 }}>{hint}</p>}
    </div>
  );
}

function Resumo({ r }: { r: ResultadoSimulacao }) {
  const itens = [
    {
      label: 'Valor bruto', valor: fmtMoeda(r.totalBruto),
      cor: 'color-mix(in srgb, var(--yellow) 78%, var(--black))',
      bg: 'color-mix(in srgb, var(--yellow) 12%, transparent)',
      borda: 'color-mix(in srgb, var(--yellow) 40%, transparent)',
    },
    {
      label: 'Deságio', valor: fmtMoeda(r.totalJuros), extra: fmtPctAuto(r.desagioPct),
      cor: 'var(--red)',
      bg: 'color-mix(in srgb, var(--red) 8%, transparent)',
      borda: 'color-mix(in srgb, var(--red) 30%, transparent)',
    },
    {
      label: 'Líquido a receber', valor: fmtMoeda(r.totalLiquido),
      cor: 'var(--green)',
      bg: 'color-mix(in srgb, var(--green) 8%, transparent)',
      borda: 'color-mix(in srgb, var(--green) 30%, transparent)',
    },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
      {itens.map(i => (
        <div
          key={i.label}
          style={{
            background: i.bg,
            border: `1px solid ${i.borda}`,
            borderRadius: 'var(--radius-md)',
            padding: '14px 16px',
          }}
        >
          <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gray2)' }}>
            {i.label}
          </p>
          <p style={{ fontSize: 19, fontWeight: 800, color: i.cor, marginTop: 4, letterSpacing: '-0.02em' }}>
            {i.valor}
          </p>
          {i.extra && <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gray)', marginTop: 2 }}>{i.extra} do bruto</p>}
        </div>
      ))}
    </div>
  );
}

function TabelaParcelas({ r, dataAntecipacao }: { r: ResultadoSimulacao; dataAntecipacao: string }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="sim-tabela">
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>Parc.</th>
            <th style={{ textAlign: 'right' }}>Valor</th>
            <th style={{ textAlign: 'center' }}>Intervalo</th>
            <th style={{ textAlign: 'center' }}>Duração</th>
            <th style={{ textAlign: 'center' }}>Taxa</th>
            <th style={{ textAlign: 'right' }}>Deságio</th>
            <th style={{ textAlign: 'right' }}>Valor líquido</th>
          </tr>
        </thead>
        <tbody>
          {r.parcelas.map(p => (
            <tr key={p.n}>
              <td style={{ textAlign: 'center', color: 'var(--gray2)' }}>{p.n}</td>
              <td style={{ textAlign: 'right' }}>{fmtMoeda(p.valor)}</td>
              <td style={{ textAlign: 'center' }}>
                {fmtIntervalo(dataAntecipacao, p.vencimento)}
                {!p.diaUtil && (
                  <span
                    title="Vencimento em fim de semana ou feriado nacional"
                    style={{ marginLeft: 5, color: '#B45309', fontWeight: 800 }}
                  >!</span>
                )}
              </td>
              <td style={{ textAlign: 'center' }}>{p.dias} dias</td>
              <td style={{ textAlign: 'center' }}>{fmtPct(p.taxa * 100, 2)}</td>
              <td style={{ textAlign: 'right', color: '#B45309' }}>{fmtMoeda(p.juros)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoeda(p.liquido)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td />
            <td style={{ textAlign: 'right' }}>{fmtMoeda(r.totalBruto)}</td>
            <td colSpan={3} />
            <td style={{ textAlign: 'right' }}>{fmtMoeda(r.totalJuros)}</td>
            <td style={{ textAlign: 'right' }}>{fmtMoeda(r.totalLiquido)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function SimuladorTaxasPage() {
  const [tipo, setTipo] = useState<'avista' | 'parcelado'>('avista');
  const [valor, setValor] = useState('');
  const [dataEmissao, setDataEmissao] = useState(hojeIso());
  const [dataAntecipacao, setDataAntecipacao] = useState(hojeIso());
  const [taxa, setTaxa] = useState('');
  const [vencUnico, setVencUnico] = useState('');
  const [nParcelas, setNParcelas] = useState(3);
  const [valoresVariaveis, setValoresVariaveis] = useState(false);
  const [linhas, setLinhas] = useState<LinhaParcela[]>(
    () => Array.from({ length: 3 }, () => ({ vencimento: '', valor: '' })),
  );

  const valorNum = parseCurrency(valor);
  const taxaNum = parsePct(taxa);

  function ajustarNParcelas(n: number) {
    const alvo = Math.min(Math.max(1, n), MAX_PARCELAS);
    setNParcelas(alvo);
    setLinhas(prev => {
      const próximo = [...prev];
      while (próximo.length < alvo) próximo.push({ vencimento: '', valor: '' });
      return próximo.slice(0, alvo);
    });
  }

  /** Preenche os vencimentos de 30 em 30 dias a partir da antecipação. */
  function preencherMensal() {
    if (!dataAntecipacao) return;
    setLinhas(prev => prev.map((l, i) => ({ ...l, vencimento: isoAddMonths(dataAntecipacao, i + 1) })));
  }

  function atualizarLinha(i: number, patch: Partial<LinhaParcela>) {
    setLinhas(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  /** Abre a simulação na papelaria da DUX, para o usuário salvar em PDF. */
  function gerarPdf() {
    if (!resultado) return;
    const ok = abrirSimulacaoPdf({
      tipo,
      valorTotal: valorNum,
      dataEmissao,
      dataAntecipacao,
      resultado,
    });
    if (!ok) alert('Pop-up bloqueado. Permita pop-ups para gerar o PDF.');
  }

  // As parcelas que entram no cálculo, já com o valor de cada uma resolvido
  const parcelasEntrada = useMemo(() => {
    if (tipo === 'avista') {
      return vencUnico ? [{ vencimento: vencUnico, valor: valorNum }] : [];
    }
    const preenchidas = linhas.slice(0, nParcelas).filter(l => l.vencimento);
    if (preenchidas.length !== nParcelas) return [];
    if (valoresVariaveis) {
      const vals = linhas.slice(0, nParcelas).map(l => parseCurrency(l.valor));
      if (vals.some(v => v <= 0)) return [];
      return linhas.slice(0, nParcelas).map((l, i) => ({ vencimento: l.vencimento, valor: vals[i] }));
    }
    return preenchidas.map(l => ({ vencimento: l.vencimento, valor: valorNum / nParcelas }));
  }, [tipo, vencUnico, valorNum, linhas, nParcelas, valoresVariaveis]);

  const pronto = valorNum > 0 && taxaNum > 0 && !!dataAntecipacao && parcelasEntrada.length > 0;

  const resultado = useMemo(() => {
    if (!pronto) return null;
    return simular({ dataAntecipacao, taxaMensalPct: taxaNum, parcelas: parcelasEntrada });
  }, [pronto, dataAntecipacao, taxaNum, parcelasEntrada]);

  // Avisos que não impedem o cálculo, mas valem a pena mostrar
  const avisos: string[] = [];
  if (resultado) {
    if (resultado.parcelas.some(p => p.dias < 0)) avisos.push('Há vencimento anterior à data de antecipação - o deságio fica negativo.');
    if (tipo === 'parcelado' && valoresVariaveis) {
      const soma = resultado.totalBruto;
      if (valorNum > 0 && Math.abs(soma - valorNum) > 0.01) {
        avisos.push(`A soma das parcelas (${fmtMoeda(soma)}) difere do valor informado (${fmtMoeda(valorNum)}).`);
      }
    }
  }

  return (
    <div className="admin-content-wrap">
      <div>
        <h1 className="admin-page-title">Simulador de Taxas</h1>
        <p className="admin-page-desc">Deságio e valor líquido de uma antecipação, antes de formalizar a proposta</p>
      </div>

      <style>{`
        .sim-tabela { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 640px; }
        .sim-tabela th {
          font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase;
          color: var(--gray); padding: 8px 10px; border-top: 1.5px solid var(--black); border-bottom: 1.5px solid var(--black);
          white-space: nowrap;
        }
        .sim-tabela td { padding: 9px 10px; border-bottom: 1px solid var(--gray3); color: var(--black); white-space: nowrap; }
        .sim-tabela tbody tr:hover td { background: var(--gray4, var(--bg)); }
        .sim-tabela tfoot td {
          font-weight: 800; border-top: 1.5px solid var(--black); border-bottom: 1.5px solid var(--black);
          padding: 10px; background: transparent;
        }
        .sim-card { background: var(--white); border: 1px solid var(--gray3); border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow-card); }
        .sim-parc-grid { display: grid; grid-template-columns: 28px 1fr; gap: 8px 10px; align-items: center; }
        .sim-parc-grid.com-valor { grid-template-columns: 28px 1fr 1fr; }
      `}</style>

      <div style={{ display: 'grid', gap: 16 }}>

        {/* Tipo da operação */}
        <SegSwitch
          valor={tipo}
          onChange={setTipo}
          opcoes={[
            { valor: 'avista', label: 'À vista' },
            { valor: 'parcelado', label: 'Parcelado' },
          ]}
        />

        {/* Dados da simulação */}
        <div className="sim-card">
          <p className="admin-section-title">Dados da simulação</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginTop: 12 }}>
            <Campo label="Valor (R$)">
              <input
                className="form-input"
                inputMode="numeric"
                placeholder="R$ 0,00"
                value={valor}
                onChange={e => setValor(maskCurrency(e.target.value))}
              />
            </Campo>

            <Campo label="Taxa mensal">
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  inputMode="decimal"
                  placeholder="0,00"
                  style={{ paddingRight: 34 }}
                  value={taxa}
                  onChange={e => setTaxa(maskPct(e.target.value))}
                  onBlur={() => setTaxa(t => normalizaPct(t))}
                />
                <span style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 14, fontWeight: 700, color: taxa ? 'var(--gray)' : 'var(--gray2)', pointerEvents: 'none',
                }}>%</span>
              </div>
            </Campo>

            <Campo label="Data de emissão" hint="Não entra no cálculo; segue para a proposta.">
              <DatePicker compact allowPast value={dataEmissao} onChange={setDataEmissao} />
            </Campo>

            <Campo label="Data de antecipação">
              <DatePicker compact allowPast value={dataAntecipacao} onChange={setDataAntecipacao} />
            </Campo>

            {tipo === 'avista' ? (
              <Campo label="Data de vencimento">
                <DatePicker compact allowPast value={vencUnico} onChange={setVencUnico} />
              </Campo>
            ) : (
              <Campo label="Nº de parcelas">
                <input
                  className="form-input"
                  type="number"
                  min={1}
                  max={MAX_PARCELAS}
                  value={nParcelas}
                  onChange={e => ajustarNParcelas(Number(e.target.value))}
                />
              </Campo>
            )}
          </div>
        </div>

        {/* Parcelas */}
        {tipo === 'parcelado' && (
          <div className="sim-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <p className="admin-section-title" style={{ marginBottom: 0 }}>Parcelas</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={preencherMensal}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, color: 'var(--gray)', textDecoration: 'underline' }}
                >
                  Preencher mensalmente
                </button>
                <SegSwitch
                  pequeno
                  valor={valoresVariaveis ? 'variaveis' : 'fixas'}
                  onChange={v => setValoresVariaveis(v === 'variaveis')}
                  opcoes={[
                    { valor: 'fixas', label: 'Fixas' },
                    { valor: 'variaveis', label: 'Variáveis' },
                  ]}
                />
              </div>
            </div>

            <div className={`sim-parc-grid${valoresVariaveis ? ' com-valor' : ''}`} style={{ marginTop: 14 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--gray2)' }}>#</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gray2)' }}>Vencimento</span>
              {valoresVariaveis && (
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gray2)' }}>Valor</span>
              )}
              {linhas.slice(0, nParcelas).map((l, i) => (
                <Fragment key={i}>
                  <span style={{ fontSize: 12, color: 'var(--gray2)', fontWeight: 700 }}>{i + 1}</span>
                  <DatePicker
                    compact
                    allowPast
                    value={l.vencimento}
                    onChange={v => atualizarLinha(i, { vencimento: v })}
                  />
                  {valoresVariaveis && (
                    <input
                      className="form-input"
                      inputMode="numeric"
                      placeholder="R$ 0,00"
                      value={l.valor}
                      onChange={e => atualizarLinha(i, { valor: maskCurrency(e.target.value) })}
                    />
                  )}
                </Fragment>
              ))}
            </div>

            {!valoresVariaveis && valorNum > 0 && (
              <p style={{ fontSize: 11.5, color: 'var(--gray2)', marginTop: 10 }}>
                Parcelas fixas de {fmtMoeda(valorNum / nParcelas)}.
              </p>
            )}
          </div>
        )}

        {/* Resultado */}
        <div className="sim-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <p className="admin-section-title" style={{ marginBottom: 0 }}>Resultado</p>
            {resultado && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 11.5, color: 'var(--gray2)', fontWeight: 600 }}>
                  {fmtPctAuto(resultado.taxaMensalPct)} ao mês · {fmtPct(resultado.taxaDiariaPct, 4)} ao dia
                </p>
                <button className="btn btn-primary btn-sm" onClick={gerarPdf} title="Gerar PDF da simulação">
                  <IconDownload size={14} />
                  Gerar PDF
                </button>
              </div>
            )}
          </div>

          {!resultado ? (
            <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--gray2)' }}>
              <p style={{ fontSize: 12.5 }}>
                Informe valor, taxa e {tipo === 'avista' ? 'a data de vencimento' : 'as datas das parcelas'} para ver a simulação.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16, marginTop: 14 }}>
              <Resumo r={resultado} />
              {avisos.map(a => (
                <p key={a} style={{ fontSize: 11.5, fontWeight: 600, color: '#B45309', background: 'rgba(180,83,9,0.08)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                  {a}
                </p>
              ))}
              <TabelaParcelas r={resultado} dataAntecipacao={dataAntecipacao} />
              <p style={{ fontSize: 11, color: 'var(--gray2)', lineHeight: 1.5 }}>
                Taxa proporcional a dias corridos (mensal ÷ 30), arredondada a duas casas por parcela - mesmo cálculo
                da proposta gerada pelo DUX Gerador de Propostas.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
