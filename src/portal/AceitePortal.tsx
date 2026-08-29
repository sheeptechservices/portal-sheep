import { useState, useEffect } from 'react';
import { formatCNPJ, formatBRLValue, formatDate, type Operacao, type Anexo, type TipoOperacao } from '../lib/aceite-storage';
import { SigningModal, type SigningResult } from './SigningModal';


// ── Anexos ────────────────────────────────────────────────────────────────────
function fileLabel(tipo: string): string {
  if (tipo === 'application/pdf') return 'PDF';
  if (tipo.startsWith('image/')) return 'Imagem';
  return 'Arquivo';
}

function AnexosSection({ anexos }: { anexos: Anexo[] }) {
  if (anexos.length === 0) return null;

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #E3E4DE', boxShadow: '0 2px 16px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #F0F0EC', background: '#FAFAF8' }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(169,224,62,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="14 2 14 8 20 8" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Documentos Anexados</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {anexos.map((a, i) => (
          <a
            key={a.id}
            href={a.dataUrl}
            download={a.nome}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 18px',
              borderBottom: i < anexos.length - 1 ? '1px solid #F0F0EC' : 'none',
              background: i % 2 === 0 ? '#fff' : '#FAFAF8',
              textDecoration: 'none', transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#F7F7F5')}
            onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#FAFAF8')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#CCCCCC' }}>
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: '#121316', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: '#AAAAAA', flexShrink: 0 }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Section block ──────────────────────────────────────────────────────────────
function DataSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#F8F8F6', borderRadius: 12, padding: '16px 18px' }}>
      <p style={{ fontSize: 10.5, fontWeight: 800, color: '#AAAAAA', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>{title}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px 16px' }}>
        {children}
      </div>
    </div>
  );
}

function DataItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 10.5, color: '#AAAAAA', fontWeight: 600, marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 13, color: '#121316', fontWeight: 500 }}>{value || '-'}</p>
    </div>
  );
}

// ── Success Screen ─────────────────────────────────────────────────────────────
function SuccessScreen({ protocolo, nome, aceitoEm, onDownload }: { protocolo: string; nome: string; aceitoEm: string; onDownload?: () => void }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '40px 36px', maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.08)' }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(30,138,62,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#1E8A3E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#121316', marginBottom: 8, letterSpacing: '-0.02em' }}>Aceite confirmado!</h1>
        <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6, marginBottom: 28 }}>
          Obrigado, <strong>{nome}</strong>. Seu aceite foi registrado com sucesso.
        </p>
        <div style={{ background: '#F8F8F6', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: '#AAAAAA', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Número de Protocolo</p>
          <p style={{ fontSize: 20, fontWeight: 800, color: '#121316', letterSpacing: '-0.01em' }}>{protocolo}</p>
          <p style={{ fontSize: 11.5, color: '#AAAAAA', marginTop: 6 }}>{new Date(aceitoEm).toLocaleString('pt-BR')}</p>
        </div>
        {onDownload && (
          <button
            onClick={onDownload}
            style={{
              width: '100%', height: 46, borderRadius: 12, border: 'none',
              background: '#121316', cursor: 'pointer', marginBottom: 16,
              fontSize: 14, fontWeight: 700, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontFamily: 'Manrope, sans-serif',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            Baixar comprovante
          </button>
        )}
        <p style={{ fontSize: 12, color: '#AAAAAA', lineHeight: 1.6 }}>Guarde o número de protocolo como comprovante. Você pode fechar esta página.</p>
      </div>
    </div>
  );
}

// ── Comprovante download ───────────────────────────────────────────────────────
function downloadComprovante(op: Operacao, protocolo: string, aceitoEm: string, signatureDataUrl: string) {
  const parcelas = op.parcelas && op.parcelas.length > 1;
  const valorHtml = parcelas
    ? `<strong>${op.parcelas!.length} parcelas</strong> totalizando <strong>${formatBRLValue(op.parcelas!.reduce((s, p) => s + p.valorNumerico, 0))}</strong>`
    : op.valorNF != null
    ? `<strong>${formatBRLValue(op.valorNF)}</strong>${op.vencimento ? ` &mdash; venc. <strong>${formatDate(op.vencimento)}</strong>` : ''}`
    : '&mdash;';

  const parcelasHtml = parcelas
    ? `<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:13px">
        <thead><tr style="background:#F5F5F3">
          <th style="padding:6px 10px;text-align:left;color:#999;font-weight:700;font-size:11px;text-transform:uppercase">#</th>
          <th style="padding:6px 10px;text-align:left;color:#999;font-weight:700;font-size:11px;text-transform:uppercase">Valor</th>
          <th style="padding:6px 10px;text-align:left;color:#999;font-weight:700;font-size:11px;text-transform:uppercase">Vencimento</th>
        </tr></thead>
        <tbody>${op.parcelas!.map((p, i) => `<tr style="border-top:1px solid #eee"><td style="padding:6px 10px;color:#B45309;font-weight:800">${i + 1}ª</td><td style="padding:6px 10px;font-weight:600">${p.valor || formatBRLValue(p.valorNumerico)}</td><td style="padding:6px 10px;color:#555">${p.vencimento ? formatDate(p.vencimento) : '-'}</td></tr>`).join('')}</tbody>
      </table>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${op.tipo === 'TERMO_ANUENCIA' ? 'Comprovante de Anuência' : 'Comprovante de Aceite'} - ${protocolo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; color: #333; background: #fff; padding: 40px; max-width: 720px; margin: 0 auto; }
  h1 { font-size: 22px; color: #121316; font-weight: 800; margin-bottom: 4px; }
  .sub { font-size: 13px; color: #999; margin-bottom: 28px; }
  .proto { background: #F5F5F3; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px; text-align: center; }
  .proto-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #AAAAAA; font-weight: 700; margin-bottom: 6px; }
  .proto-value { font-size: 22px; font-weight: 800; color: #121316; letter-spacing: -0.01em; }
  .proto-date { font-size: 12px; color: #AAAAAA; margin-top: 4px; }
  .section { margin-bottom: 20px; border: 1px solid #E3E4DE; border-radius: 10px; overflow: hidden; }
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; font-weight: 800; padding: 10px 16px; background: #FAFAF8; border-bottom: 1px solid #F0F0EC; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; padding: 14px 16px; }
  .field-label { font-size: 10px; text-transform: uppercase; color: #AAAAAA; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 3px; }
  .field-value { font-size: 13.5px; color: #121316; font-weight: 500; }
  .sig-box { padding: 16px; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
  .sig-box img { max-width: 280px; border: 1px solid #eee; border-radius: 6px; background: #FAFAF8; }
  @media print { @page { margin: 20mm; } body { padding: 0; } }
</style>
</head>
<body>
  <h1>${op.tipo === 'TERMO_ANUENCIA' ? 'Comprovante de Anuência' : 'Comprovante de Aceite'}</h1>
  <p class="sub">Documento gerado pelo sistema DUX FIDC em ${new Date(aceitoEm).toLocaleString('pt-BR')}</p>

  <div class="proto">
    <p class="proto-label">Número de Protocolo</p>
    <p class="proto-value">${protocolo}</p>
    <p class="proto-date">${new Date(aceitoEm).toLocaleString('pt-BR')}</p>
  </div>

  <div class="section">
    <p class="section-title">Cedente</p>
    <div class="grid">
      <div><p class="field-label">Razão Social</p><p class="field-value">${op.nomeCedente}</p></div>
      <div><p class="field-label">CNPJ</p><p class="field-value">${formatCNPJ(op.cnpjCedente)}</p></div>
    </div>
  </div>

  <div class="section">
    <p class="section-title">${op.tipo === 'TERMO_ANUENCIA' ? 'Anuente' : 'Sacado'}</p>
    <div class="grid">
      <div><p class="field-label">Razão Social</p><p class="field-value">${op.nomeSacado}</p></div>
      ${op.cnpjSacado ? `<div><p class="field-label">CNPJ</p><p class="field-value">${formatCNPJ(op.cnpjSacado)}</p></div>` : ''}
    </div>
  </div>

  <div class="section">
    <p class="section-title">Operação</p>
    <div style="padding:14px 16px">
      <p class="field-label">Valor</p>
      <p class="field-value" style="margin-bottom:${parcelasHtml ? 12 : 0}px">${valorHtml}</p>
      ${parcelasHtml}
    </div>
  </div>

  ${op.bancoNome ? `<div class="section">
    <p class="section-title">Conta Bancária (Escrow)</p>
    <div class="grid">
      <div style="grid-column:1/-1"><p class="field-label">Banco</p><p class="field-value">${op.bancoNome}</p></div>
      ${op.agencia ? `<div><p class="field-label">Agência</p><p class="field-value">${op.agencia}</p></div>` : ''}
      ${op.conta ? `<div><p class="field-label">Conta</p><p class="field-value">${op.conta.length > 1 ? op.conta.slice(0, -1) + '-' + op.conta.slice(-1) : op.conta}</p></div>` : ''}
      ${op.titularConta ? `<div><p class="field-label">Titularidade</p><p class="field-value">${op.titularConta}</p></div>` : ''}
      ${op.cnpjTitular ? `<div><p class="field-label">CNPJ Titular</p><p class="field-value">${formatCNPJ(op.cnpjTitular)}</p></div>` : ''}
    </div>
  </div>` : ''}

  <div class="section">
    <p class="section-title">Assinatura do Sacado</p>
    <div class="sig-box">
      <img src="${signatureDataUrl}" alt="Assinatura" />
    </div>
  </div>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

// ── Portal Main ────────────────────────────────────────────────────────────────
export default function AceitePortal() {
  const token = window.location.pathname.split('/aceite/')[1]?.split('/')[0] ?? '';
  const [op, setOp] = useState<Operacao | null | 'loading' | 'not-found'>('loading');
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [showSigning, setShowSigning] = useState(false);
  const [success, setSuccess] = useState<{ protocolo: string; aceitoEm: string; signatureDataUrl: string } | null>(null);

  useEffect(() => {
    if (!token) { setOp('not-found'); return; }
    fetch(`/api/aceite-portal?token=${encodeURIComponent(token)}`)
      .then(res => {
        if (res.status === 404) { setOp('not-found'); return null; }
        return res.json();
      })
      .then(data => {
        if (!data) return;
        const row = data.operacao;
        const origin = window.location.origin;
        const op: Operacao = {
          id: String(row.id),
          token: String(row.token),
          tipo: (row.tipo ?? 'ACEITE_SACADO') as TipoOperacao,
          status: row.status,
          nomeCedente: String(row.nome_cedente ?? ''),
          cnpjCedente: String(row.cnpj_cedente ?? ''),
          emailCedente: String(row.email_cedente ?? ''),
          emailCedenteResponsavel: row.email_cedente_responsavel != null ? String(row.email_cedente_responsavel) : undefined,
          nomeSacado: String(row.nome_sacado ?? ''),
          cnpjSacado: String(row.cnpj_sacado ?? ''),
          valorNF: row.valor_nf != null ? Number(row.valor_nf) : undefined,
          vencimento: row.vencimento != null ? String(row.vencimento) : undefined,
          periodoServico: row.periodo_servico != null ? String(row.periodo_servico) : undefined,
          parcelas: row.parcelas ? JSON.parse(String(row.parcelas)) : undefined,
          bancoNome: row.banco_nome != null ? String(row.banco_nome) : undefined,
          titularConta: row.titular_conta != null ? String(row.titular_conta) : undefined,
          cnpjTitular: row.cnpj_titular != null ? String(row.cnpj_titular) : undefined,
          agencia: row.agencia != null ? String(row.agencia) : undefined,
          conta: row.conta != null ? String(row.conta) : undefined,
          tokenExpiresAt: String(row.token_expires_at),
          criadoEm: String(row.criado_em),
          link: `${origin}/aceite/${String(row.token)}`,
          aceitante: row.aceitante ? JSON.parse(String(row.aceitante)) : undefined,
        };
        setOp(op);
        const mappedAnexos: Anexo[] = (data.anexos ?? []).map((a: any) => ({
          id: String(a.id), operacaoId: String(a.operacao_id), nome: String(a.nome),
          tipo: String(a.tipo), tamanho: Number(a.tamanho), dataUrl: String(a.data_url), criadoEm: String(a.criado_em),
        }));
        setAnexos(mappedAnexos);
      })
      .catch(() => setOp('not-found'));
  }, [token]);

  if (success) {
    const safeOp = op as Operacao;
    return (
      <SuccessScreen
        protocolo={success.protocolo}
        nome={safeOp.nomeSacado}
        aceitoEm={success.aceitoEm}
        onDownload={() => downloadComprovante(safeOp, success.protocolo, success.aceitoEm, success.signatureDataUrl)}
      />
    );
  }

  if (op === 'loading') return (
    <div style={{ minHeight: '100vh', background: '#F8F8F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span className="dux-spinner" />
    </div>
  );

  if (op === 'not-found' || op === null) return (
    <div style={{ minHeight: '100vh', background: '#F8F8F6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#121316', marginBottom: 8 }}>Link inválido ou expirado</p>
        <p style={{ fontSize: 14, color: '#666' }}>Este link de aceite não foi encontrado ou já expirou.</p>
      </div>
    </div>
  );

  if (op.status === 'ACEITO') return (
    <div style={{ minHeight: '100vh', background: '#F8F8F6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#1E8A3E', marginBottom: 8 }}>Aceite já confirmado</p>
        <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6 }}>
          Esta operação já foi confirmada em {new Date(op.aceitante!.aceitoEm).toLocaleString('pt-BR')}.
          {op.aceitante?.protocolo && <><br />Protocolo: <strong>{op.aceitante.protocolo}</strong></>}
        </p>
      </div>
    </div>
  );

  if (op.status === 'RECUSADO' || op.status === 'EXPIRADO') return (
    <div style={{ minHeight: '100vh', background: '#F8F8F6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#D93025', marginBottom: 8 }}>
          {op.status === 'RECUSADO' ? 'Operação cancelada' : 'Link expirado'}
        </p>
        <p style={{ fontSize: 14, color: '#666' }}>Entre em contato com a empresa para obter um novo link.</p>
      </div>
    </div>
  );

  async function handleSigned({ nome, cpf, cargo, signatureDataUrl, fotoDataUrl }: SigningResult) {
    if (typeof op !== 'object' || !op) return;
    try {
      const res = await fetch('/api/aceite-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', token, nome, cpf, cargo, assinaturaDataUrl: signatureDataUrl, fotoIdentidadeDataUrl: fotoDataUrl }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setShowSigning(false);
      if (data.aceitante) setSuccess({ protocolo: data.aceitante.protocolo, aceitoEm: data.aceitante.aceitoEm, signatureDataUrl });
    } catch { /* handle silently */ }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F6', padding: '24px 16px 48px', fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ maxWidth: 580, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', paddingBottom: 4 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 14,
            background: '#121316', marginBottom: 14 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#121316', letterSpacing: '-0.02em', marginBottom: 4 }}>Confirmação de Aceite</h1>
          <p style={{ fontSize: 14, color: '#666' }}>Revise os dados abaixo e confirme o aceite da operação</p>
        </div>

        {/* Cedente + Sacado */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Cedente */}
          <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #E3E4DE', boxShadow: '0 2px 16px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #F0F0EC', background: '#FAFAF8' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(169,224,62,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="9 22 9 12 15 12 15 22" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Cedente</span>
            </div>
            <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px 16px' }}>
              <div>
                <p style={{ fontSize: 10, color: '#AAAAAA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Razão Social</p>
                <p style={{ fontSize: 14.5, fontWeight: 800, color: '#121316', letterSpacing: '-0.01em' }}>{op.nomeCedente}</p>
              </div>
              <div>
                <p style={{ fontSize: 10, color: '#AAAAAA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>CNPJ</p>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: '#444', fontVariantNumeric: 'tabular-nums' }}>{formatCNPJ(op.cnpjCedente)}</p>
              </div>
            </div>
          </div>

          {/* Sacado */}
          <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #E3E4DE', boxShadow: '0 2px 16px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #F0F0EC', background: '#FAFAF8' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(169,224,62,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="7" r="4" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.09em' }}>{op.tipo === 'TERMO_ANUENCIA' ? 'Anuente' : 'Sacado'}</span>
            </div>
            <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px 16px' }}>
              <div>
                <p style={{ fontSize: 10, color: '#AAAAAA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Razão Social</p>
                <p style={{ fontSize: 14.5, fontWeight: 800, color: '#121316', letterSpacing: '-0.01em' }}>{op.nomeSacado}</p>
              </div>
              {op.cnpjSacado && (
                <div>
                  <p style={{ fontSize: 10, color: '#AAAAAA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>CNPJ</p>
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: '#444', fontVariantNumeric: 'tabular-nums' }}>{formatCNPJ(op.cnpjSacado)}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {(op.valorNF != null || op.vencimento || op.parcelas?.length) && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #E3E4DE', boxShadow: '0 2px 16px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            {/* Header igual cedente/sacado */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #F0F0EC', background: '#FAFAF8' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(169,224,62,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><line x1="12" y1="1" x2="12" y2="23" stroke="#B45309" strokeWidth="2" strokeLinecap="round"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Operação</span>
            </div>

            {/* Parcela única ou só valor */}
            {(!op.parcelas || op.parcelas.length <= 1) && (
              <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px 16px' }}>
                {op.valorNF != null && (
                  <div>
                    <p style={{ fontSize: 10, color: '#AAAAAA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Valor</p>
                    <p style={{ fontSize: 14.5, fontWeight: 800, color: '#121316', letterSpacing: '-0.01em' }}>{formatBRLValue(op.valorNF)}</p>
                  </div>
                )}
                {op.vencimento && (
                  <div>
                    <p style={{ fontSize: 10, color: '#AAAAAA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Vencimento</p>
                    <p style={{ fontSize: 14.5, fontWeight: 800, color: '#121316', letterSpacing: '-0.01em' }}>{formatDate(op.vencimento)}</p>
                  </div>
                )}
              </div>
            )}

            {/* Múltiplas parcelas */}
            {op.parcelas && op.parcelas.length > 1 && (
              <>
                <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px 16px', borderBottom: '1px solid #F0F0EC' }}>
                  <div>
                    <p style={{ fontSize: 10, color: '#AAAAAA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Valor Total</p>
                    <p style={{ fontSize: 14.5, fontWeight: 800, color: '#121316', letterSpacing: '-0.01em' }}>
                      {formatBRLValue(op.parcelas.reduce((s, p) => s + p.valorNumerico, 0))}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, color: '#AAAAAA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Parcelas</p>
                    <p style={{ fontSize: 14.5, fontWeight: 800, color: '#121316', letterSpacing: '-0.01em' }}>{op.parcelas.length}×</p>
                  </div>
                </div>
                {/* cabeçalho tabela */}
                <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr', padding: '8px 18px', borderBottom: '1px solid #F0F0EC', background: '#FAFAF8' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#AAAAAA', textTransform: 'uppercase', letterSpacing: '0.08em' }}>#</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#AAAAAA', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Valor</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#AAAAAA', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Vencimento</span>
                </div>
                {op.parcelas.map((p, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '36px 1fr 1fr',
                    padding: '11px 18px',
                    borderBottom: i < op.parcelas!.length - 1 ? '1px solid #F0F0EC' : 'none',
                    background: i % 2 === 0 ? '#fff' : '#FAFAF8',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#B45309' }}>{i + 1}ª</span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#121316' }}>{p.valor || formatBRLValue(p.valorNumerico)}</span>
                    <span style={{ fontSize: 13, color: '#444', fontWeight: 500 }}>{p.vencimento ? formatDate(p.vencimento) : '-'}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {op.tipo !== 'TERMO_ANUENCIA' && op.bancoNome && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #E3E4DE', boxShadow: '0 2px 16px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #F0F0EC', background: '#FAFAF8' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(169,224,62,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="2" y="7" width="20" height="14" rx="2" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Conta para Pagamento (Escrow)</span>
            </div>
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <p style={{ fontSize: 10, color: '#AAAAAA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Banco</p>
                <p style={{ fontSize: 14.5, fontWeight: 800, color: '#121316', letterSpacing: '-0.01em' }}>{op.bancoNome}</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px 16px' }}>
                {op.agencia && (
                  <div>
                    <p style={{ fontSize: 10, color: '#AAAAAA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Agência</p>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: '#444', fontVariantNumeric: 'tabular-nums' }}>{op.agencia}</p>
                  </div>
                )}
                {op.conta && (
                  <div>
                    <p style={{ fontSize: 10, color: '#AAAAAA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Conta</p>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: '#444', fontVariantNumeric: 'tabular-nums' }}>{op.conta && op.conta.length > 1 ? `${op.conta.slice(0, -1)}-${op.conta.slice(-1)}` : op.conta}</p>
                  </div>
                )}
                {op.titularConta && (
                  <div>
                    <p style={{ fontSize: 10, color: '#AAAAAA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Titularidade</p>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: '#444' }}>{op.titularConta}</p>
                  </div>
                )}
                {op.cnpjTitular && (
                  <div>
                    <p style={{ fontSize: 10, color: '#AAAAAA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>CNPJ</p>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: '#444', fontVariantNumeric: 'tabular-nums' }}>{formatCNPJ(op.cnpjTitular)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <AnexosSection anexos={anexos} />

        {/* Declaração */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 22px', border: '1px solid #E3E4DE', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: '#AAAAAA', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Declaração</p>
          <p style={{ fontSize: 13, color: '#444', lineHeight: 1.75, margin: 0 }}>
            Declaro que estou ciente e autorizado a confirmar o recebimento dos serviços e os dados de pagamento de <strong>{op.nomeCedente}</strong>.{' '}
            {op.parcelas && op.parcelas.length > 1 ? (
              <>
                Declaro ciência de que a operação é composta de <strong>{op.parcelas.length} parcelas</strong>:{' '}
                {op.parcelas.map((p, i) => (
                  <span key={i}>
                    <strong>{i + 1}ª</strong> parcela no valor de <strong>{p.valor || formatBRLValue(p.valorNumerico)}</strong>{p.vencimento ? <> com vencimento em <strong>{formatDate(p.vencimento)}</strong></> : null}{i < op.parcelas!.length - 1 ? '; ' : '. '}
                  </span>
                ))}
              </>
            ) : op.valorNF != null ? (
              <>Declaro ciência de que o valor da operação é de <strong>{formatBRLValue(op.valorNF)}</strong>{op.vencimento ? <> com vencimento em <strong>{formatDate(op.vencimento)}</strong></> : null}. </>
            ) : null}
            {' '}Declaro ainda que a nota fiscal referente a esta operação é exclusiva e não duplicada em outras operações de antecipação, e que os dados bancários indicados para pagamento <strong>não poderão ser alterados sob nenhuma hipótese sem a anuência prévia e formal do financeiro DUX</strong>.
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={() => setShowSigning(true)}
          style={{
            width: '100%', height: 58, borderRadius: 16, border: 'none',
            background: '#121316', cursor: 'pointer',
            fontSize: 16, fontWeight: 700, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#2d2f36')}
          onMouseLeave={e => (e.currentTarget.style.background = '#121316')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#A9E03E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          {op.tipo === 'TERMO_ANUENCIA' ? 'Assinar termo de anuência' : 'Assinar documento de aceite'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 11.5, color: '#AAAAAA', lineHeight: 1.6 }}>
          Este link expira em {new Date(op.tokenExpiresAt).toLocaleDateString('pt-BR')}. Ao confirmar, seus dados serão registrados junto com IP e data/hora para fins de auditoria.
        </p>
      </div>

      {showSigning && typeof op === 'object' && op && (
        <SigningModal
          onSigned={handleSigned}
          onClose={() => setShowSigning(false)}
        />
      )}
    </div>
  );
}
