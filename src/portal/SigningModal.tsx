import { useEffect, useRef, useState } from 'react';
import { IconEdit, IconCamera, IconImage } from '../components/icons';
import { formatCPF } from '../lib/aceite-storage';

export interface SigningResult {
  nome: string;
  cpf: string;
  cargo: string;
  signatureDataUrl: string;
  fotoDataUrl: string;
}

interface Props {
  onSigned: (result: SigningResult) => void;
  onClose: () => void;
}

type Step = 'dados' | 'assinatura' | 'foto';
type SigMode = 'draw' | 'text';

const STEPS: { key: Step; label: string }[] = [
  { key: 'dados',      label: 'Identificação' },
  { key: 'assinatura', label: 'Assinatura'    },
  { key: 'foto',       label: 'Foto com Doc.' },
];

const SIG_FONTS = [
  { id: 'Dancing Script', label: 'Clássica'   },
  { id: 'Caveat',         label: 'Manuscrita' },
  { id: 'Satisfy',        label: 'Elegante'   },
];

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Caveat:wght@700&family=Satisfy&display=swap';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return isMobile;
}

function useSignatureFonts() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (document.querySelector(`link[href="${FONTS_URL}"]`)) { setReady(true); return; }
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = FONTS_URL;
    link.onload = () => setReady(true);
    document.head.appendChild(link);
  }, []);
  return ready;
}

function btnSec(mobile: boolean): React.CSSProperties {
  return {
    padding: '0 16px', height: mobile ? 46 : 40, borderRadius: 10,
    border: '1.5px solid #E3E4DE', background: '#fff', cursor: 'pointer',
    fontSize: mobile ? 14 : 13, fontWeight: 600, color: '#666', fontFamily: 'inherit', flexShrink: 0,
  };
}
function btnPrim(mobile: boolean): React.CSSProperties {
  return {
    padding: '0 20px', height: mobile ? 46 : 40, borderRadius: 10,
    border: 'none', background: '#121316', color: '#fff', cursor: 'pointer',
    fontSize: mobile ? 14 : 13, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0,
  };
}
function btnDis(mobile: boolean): React.CSSProperties {
  return { ...btnPrim(mobile), background: '#E3E4DE', color: '#AAAAAA', cursor: 'not-allowed' };
}

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepBar({ current }: { current: Step }) {
  const idx = STEPS.findIndex(s => s.key === current);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 20px' }}>
      {STEPS.map((s, i) => {
        const done   = i < idx;
        const active = i === idx;
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800,
                background: done ? '#1E8A3E' : active ? '#121316' : '#E3E4DE',
                color: done || active ? '#fff' : '#AAAAAA', transition: 'background 0.2s',
              }}>
                {done
                  ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : i + 1}
              </div>
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? '#121316' : done ? '#1E8A3E' : '#AAAAAA', whiteSpace: 'nowrap' }}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 1, background: done ? '#1E8A3E' : '#E3E4DE', margin: '0 10px', transition: 'background 0.2s' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1 - Dados ─────────────────────────────────────────────────────────────
function StepDados({ nome, cpf, cargo, onChange, onNext, onClose, mobile }: {
  nome: string; cpf: string; cargo: string;
  onChange: (field: 'nome' | 'cpf' | 'cargo', v: string) => void;
  onNext: () => void;
  onClose: () => void;
  mobile: boolean;
}) {
  const [touched, setTouched] = useState({ nome: false, cpf: false, cargo: false });
  const cpfClean = cpf.replace(/\D/g, '');
  const cpfValid = cpfClean.length === 11;
  const canNext  = nome.trim().length >= 3 && cpfValid && cargo.trim().length >= 2;

  const inp: React.CSSProperties = {
    height: mobile ? 48 : 42, padding: '0 14px', borderRadius: 10, fontSize: mobile ? 15 : 13.5,
    color: '#121316', outline: 'none', width: '100%', fontFamily: 'inherit',
    transition: 'border-color 0.15s', background: '#fff', boxSizing: 'border-box',
  };

  function err(field: 'nome' | 'cpf' | 'cargo') {
    if (!touched[field]) return false;
    if (field === 'nome')  return nome.trim().length < 3;
    if (field === 'cpf')   return !cpfValid;
    if (field === 'cargo') return cargo.trim().length < 2;
  }

  return (
    <>
      <div style={{ overflowY: 'auto', padding: mobile ? '20px 20px 8px' : '18px 20px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 13, color: '#888', margin: 0, lineHeight: 1.5 }}>
          Preencha seus dados para registrar o aceite com validade jurídica.
        </p>

        {(['nome', 'cpf', 'cargo'] as const).map(field => (
          <div key={field}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
              {field === 'nome' ? 'Nome completo' : field === 'cpf' ? 'CPF' : 'Cargo / Função'}
            </label>
            <input
              value={field === 'nome' ? nome : field === 'cpf' ? cpf : cargo}
              onChange={e => field === 'cpf' ? onChange('cpf', formatCPF(e.target.value)) : onChange(field, e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, [field]: true }))}
              placeholder={field === 'nome' ? 'Digite seu nome completo' : field === 'cpf' ? '000.000.000-00' : 'Ex: Diretor Financeiro'}
              inputMode={field === 'cpf' ? 'numeric' : 'text'}
              autoComplete={field === 'nome' ? 'name' : field === 'cpf' ? 'off' : 'organization-title'}
              style={{ ...inp, border: `1.5px solid ${err(field) ? '#EF4444' : '#E3E4DE'}`, fontVariantNumeric: field === 'cpf' ? 'tabular-nums' : undefined }}
              onFocus={e => { if (!err(field)) e.currentTarget.style.borderColor = '#121316'; }}
              onBlurCapture={e => { if (!err(field)) e.currentTarget.style.borderColor = '#E3E4DE'; }}
            />
            {err(field) && (
              <p style={{ fontSize: 11.5, color: '#EF4444', marginTop: 5 }}>
                {field === 'nome' ? 'Informe o nome completo' : field === 'cpf' ? 'CPF inválido' : 'Informe o cargo'}
              </p>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: '16px 20px', borderTop: '1px solid #E3E4DE', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btnSec(mobile)}>Cancelar</button>
        <button onClick={onNext} disabled={!canNext} style={canNext ? btnPrim(mobile) : btnDis(mobile)}>
          Próximo →
        </button>
      </div>
    </>
  );
}

// ── Step 2 - Assinatura ────────────────────────────────────────────────────────
function StepAssinatura({ onConfirm, onBack, mobile, nome }: {
  onConfirm: (dataUrl: string) => void;
  onBack: () => void;
  mobile: boolean;
  nome: string;
}) {
  const fontsReady = useSignatureFonts();
  const [mode, setMode] = useState<SigMode>('draw');
  const [selectedFont, setSelectedFont] = useState(SIG_FONTS[0].id);

  // Draw mode state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPos   = useRef<{ x: number; y: number } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    ctx.fillStyle   = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#121316';
    ctx.lineWidth   = mobile ? 3 : 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
  }, [mobile]);

  function getPos(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const sx = canvas.width  / rect.width;
    const sy = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * sx, y: (t.clientY - rect.top) * sy };
    }
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  function startDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault(); setDrawing(true); setIsEmpty(false); lastPos.current = getPos(e);
  }
  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (!drawing) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const pos = getPos(e);
    ctx.beginPath(); ctx.moveTo(lastPos.current!.x, lastPos.current!.y); ctx.lineTo(pos.x, pos.y); ctx.stroke();
    lastPos.current = pos;
  }
  function endDraw() { setDrawing(false); lastPos.current = null; }
  function clear() {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); setIsEmpty(true);
  }

  async function confirmText() {
    const fontSpec = `italic bold 52px "${selectedFont}"`;
    try { await document.fonts.load(fontSpec); } catch { /* fallback */ }
    const canvas = document.createElement('canvas');
    const W = 520; const H = mobile ? 220 : 180;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#121316';
    // Scale font to fit
    let fs = 56;
    ctx.font = `italic bold ${fs}px "${selectedFont}"`;
    while (ctx.measureText(nome).width > W - 48 && fs > 20) {
      fs -= 2;
      ctx.font = `italic bold ${fs}px "${selectedFont}"`;
    }
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nome, W / 2, H / 2);
    onConfirm(canvas.toDataURL('image/png'));
  }

  const canvasH = mobile ? 220 : 180;

  const tabActive: React.CSSProperties = {
    flex: 1, height: 34, borderRadius: 8, border: 'none',
    background: '#121316', color: '#fff', cursor: 'pointer',
    fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
  };
  const tabInactive: React.CSSProperties = {
    flex: 1, height: 34, borderRadius: 8, border: '1.5px solid #E3E4DE',
    background: '#fff', color: '#888', cursor: 'pointer',
    fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
  };

  return (
    <>
      {/* Mode tabs */}
      <div style={{ padding: '14px 20px 0', display: 'flex', gap: 6 }}>
        <button onClick={() => setMode('draw')} style={mode === 'draw' ? tabActive : tabInactive}>
          <IconEdit size={13} /> Desenhar
        </button>
        <button onClick={() => setMode('text')} style={mode === 'text' ? tabActive : tabInactive}>
          Aa Usar meu nome
        </button>
      </div>

      {/* ── Draw mode ── */}
      {mode === 'draw' && (
        <div style={{ overflowY: 'auto', padding: '14px 20px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12.5, color: '#888', margin: 0 }}>
            Assine no campo abaixo usando o dedo ou a caneta.
          </p>
          <div style={{ border: '1.5px solid #E3E4DE', borderRadius: 12, overflow: 'hidden', background: '#FAFAF8', position: 'relative', touchAction: 'none' }}>
            {isEmpty && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <p style={{ fontSize: 13, color: '#CCC', fontStyle: 'italic' }}>Assine aqui</p>
              </div>
            )}
            <canvas
              ref={canvasRef}
              width={520} height={canvasH}
              style={{ display: 'block', width: '100%', cursor: 'crosshair', touchAction: 'none' }}
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
            />
          </div>
          <button type="button" onClick={clear}
            style={{ fontSize: 12, color: '#AAAAAA', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', alignSelf: 'flex-start' }}>
            Limpar assinatura
          </button>
        </div>
      )}

      {/* ── Text mode ── */}
      {mode === 'text' && (
        <div style={{ overflowY: 'auto', padding: '14px 20px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 12.5, color: '#888', margin: 0 }}>
            Escolha um estilo para sua assinatura com base no seu nome.
          </p>
          {!fontsReady ? (
            <div className="dux-spinner-row" style={{ padding: '20px 0' }}><span className="dux-spinner sm" /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SIG_FONTS.map(f => {
                const sel = selectedFont === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFont(f.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 16px', borderRadius: 12,
                      border: `1.5px solid ${sel ? '#121316' : '#E3E4DE'}`,
                      background: sel ? '#F8F8F6' : '#fff',
                      cursor: 'pointer', width: '100%', fontFamily: 'inherit',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <span style={{
                      fontFamily: `'${f.id}', cursive`,
                      fontStyle: 'italic', fontWeight: 700,
                      fontSize: mobile ? 28 : 30,
                      color: '#121316',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left',
                    }}>
                      {nome}
                    </span>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginLeft: 12,
                      border: `2px solid ${sel ? '#121316' : '#CCCCCC'}`,
                      background: sel ? '#121316' : '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {sel && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: '16px 20px', borderTop: '1px solid #E3E4DE', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onBack} style={btnSec(mobile)}>← Voltar</button>
        {mode === 'draw' ? (
          <button onClick={() => onConfirm(canvasRef.current!.toDataURL('image/png'))} disabled={isEmpty} style={isEmpty ? btnDis(mobile) : btnPrim(mobile)}>
            Próximo →
          </button>
        ) : (
          <button onClick={confirmText} disabled={!fontsReady} style={fontsReady ? btnPrim(mobile) : btnDis(mobile)}>
            Próximo →
          </button>
        )}
      </div>
    </>
  );
}

// ── Step 3 - Foto com documento ────────────────────────────────────────────────
function StepFoto({ onConfirm, onBack, mobile }: {
  onConfirm: (dataUrl: string) => void;
  onBack: () => void;
  mobile: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const cameraRef  = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  }

  function resetInputs() {
    if (cameraRef.current)  cameraRef.current.value  = '';
    if (galleryRef.current) galleryRef.current.value = '';
  }

  return (
    <>
      <div style={{ overflowY: 'auto', padding: '18px 20px 12px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 13, color: '#888', margin: 0, lineHeight: 1.6 }}>
          Tire uma foto <strong>segurando seu documento de identidade</strong> (RG ou CNH) de forma que seu rosto e o documento estejam visíveis.
        </p>

        <input ref={cameraRef}  type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
        <input ref={galleryRef} type="file" accept="image/*"                        style={{ display: 'none' }} onChange={handleFile} />

        {!preview ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="button" onClick={() => cameraRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', border: '1.5px solid #E3E4DE', borderRadius: 14, background: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%', transition: 'border-color 0.15s, background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#121316'; e.currentTarget.style.background = '#F9F9F7'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E3E4DE'; e.currentTarget.style.background = '#fff'; }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#F0F0EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="#333" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="13" r="4" stroke="#333" strokeWidth="1.8"/>
                </svg>
              </div>
              <div>
                <p style={{ fontSize: mobile ? 15 : 14, fontWeight: 700, color: '#121316', margin: 0 }}>Usar câmera</p>
                <p style={{ fontSize: 12, color: '#AAAAAA', margin: '2px 0 0' }}>Abre a câmera para tirar foto agora</p>
              </div>
            </button>

            <button type="button" onClick={() => galleryRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', border: '1.5px solid #E3E4DE', borderRadius: 14, background: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%', transition: 'border-color 0.15s, background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#121316'; e.currentTarget.style.background = '#F9F9F7'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E3E4DE'; e.currentTarget.style.background = '#fff'; }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#F0F0EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="#333" strokeWidth="1.8"/>
                  <circle cx="8.5" cy="8.5" r="1.5" stroke="#333" strokeWidth="1.8"/>
                  <path d="M21 15l-5-5L5 21" stroke="#333" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p style={{ fontSize: mobile ? 15 : 14, fontWeight: 700, color: '#121316', margin: 0 }}>Escolher da galeria</p>
                <p style={{ fontSize: 12, color: '#AAAAAA', margin: '2px 0 0' }}>Selecione uma foto já tirada</p>
              </div>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '1.5px solid #E3E4DE' }}>
              <img src={preview} alt="Foto com documento" style={{ width: '100%', maxHeight: mobile ? 280 : 260, objectFit: 'cover', display: 'block' }} />
              <button onClick={() => { setPreview(null); resetInputs(); }}
                style={{ position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 10, border: 'none', background: 'rgba(0,0,0,0.55)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => { setPreview(null); resetInputs(); setTimeout(() => cameraRef.current?.click(), 50); }}
                style={{ flex: 1, height: 38, borderRadius: 10, border: '1.5px solid #E3E4DE', background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#666', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <IconCamera size={13} /> Usar câmera
              </button>
              <button type="button" onClick={() => { setPreview(null); resetInputs(); setTimeout(() => galleryRef.current?.click(), 50); }}
                style={{ flex: 1, height: 38, borderRadius: 10, border: '1.5px solid #E3E4DE', background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#666', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <IconImage size={13} /> Trocar foto
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '16px 20px', borderTop: '1px solid #E3E4DE', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onBack} style={btnSec(mobile)}>← Voltar</button>
        <button onClick={() => preview && onConfirm(preview)} disabled={!preview} style={preview ? btnPrim(mobile) : btnDis(mobile)}>
          Confirmar aceite →
        </button>
      </div>
    </>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────
export function SigningModal({ onSigned, onClose }: Props) {
  const mobile = useIsMobile();
  const [step,  setStep]  = useState<Step>('dados');
  const [nome,  setNome]  = useState('');
  const [cpf,   setCpf]   = useState('');
  const [cargo, setCargo] = useState('');
  const [sigDataUrl, setSigDataUrl] = useState('');

  function handleField(field: 'nome' | 'cpf' | 'cargo', v: string) {
    if (field === 'nome')  setNome(v);
    if (field === 'cpf')   setCpf(v);
    if (field === 'cargo') setCargo(v);
  }

  function handleSigConfirm(dataUrl: string) { setSigDataUrl(dataUrl); setStep('foto'); }
  function handleFotoConfirm(fotoDataUrl: string) { onSigned({ nome, cpf, cargo, signatureDataUrl: sigDataUrl, fotoDataUrl }); }

  const stepTitles: Record<Step, string> = {
    dados:      'Identificação do Signatário',
    assinatura: 'Assinatura',
    foto:       'Foto com Documento',
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)',
    display: 'flex', padding: mobile ? 0 : 16,
    alignItems: mobile ? 'flex-end' : 'center',
    justifyContent: 'center',
  };
  const modalStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: mobile ? '20px 20px 0 0' : 16,
    width: '100%',
    maxWidth: mobile ? '100%' : 500,
    maxHeight: mobile ? '92dvh' : '90vh',
    boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'Manrope, sans-serif',
  };

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        {mobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E3E4DE' }} />
          </div>
        )}

        <div style={{ padding: mobile ? '12px 20px 14px' : '16px 20px 14px', borderBottom: '1px solid #E3E4DE', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: mobile ? 15 : 14, fontWeight: 700, color: '#121316', margin: 0 }}>{stepTitles[step]}</p>
            <p style={{ fontSize: 11.5, color: '#999', margin: 0 }}>Etapa {STEPS.findIndex(s => s.key === step) + 1} de {STEPS.length}</p>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#F8F8F6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div style={{ padding: '14px 0 12px', borderBottom: '1px solid #F0F0EC' }}>
          <StepBar current={step} />
        </div>

        {step === 'dados' && (
          <StepDados nome={nome} cpf={cpf} cargo={cargo} onChange={handleField} onNext={() => setStep('assinatura')} onClose={onClose} mobile={mobile} />
        )}
        {step === 'assinatura' && (
          <StepAssinatura onConfirm={handleSigConfirm} onBack={() => setStep('dados')} mobile={mobile} nome={nome} />
        )}
        {step === 'foto' && (
          <StepFoto onConfirm={handleFotoConfirm} onBack={() => setStep('assinatura')} mobile={mobile} />
        )}
      </div>
    </div>
  );
}
