import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

import type { StatusConfig, UsuarioNotificavel, Notificacao, NovaNotificacao } from './types';
import { useToast, useAuth } from './AdminApp';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import {
  IconAlert, IconAlertOctagon, IconArrastar, IconCheck, IconChevronDown, IconChevronRight,
  IconClipboard, IconEntrada, IconEstrela, IconEye, IconEyeOff, IconPlus, IconProibido,
  IconTrash, IconUser, IconX,
} from '../components/icons';
import { SegSwitch } from '../components/SegSwitch';
import { Abas, AbaPainel } from '../components/Abas';
import { PAPEIS_EQUIPE } from '../lib/papeisDeEquipe';

// ── Move target dropdown ─────────────────────────────
function MoveTargetSelect({
  options, value, onChange, allowNew = true,
}: {
  options: Pick<StatusConfig, 'id' | 'nome' | 'cor'>[];
  value: number | '__new__' | '';
  onChange: (v: number | '__new__') => void;
  allowNew?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const current = typeof value === 'number' ? options.find(o => Number(o.id) === value) : null;

  function openDropdown() {
    const rect = triggerRef.current!.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 220) });
    setOpen(o => !o);
  }

  useDropdownDismiss(open, [triggerRef, dropRef], () => setOpen(false));

  return (
    <>
      <button
        ref={triggerRef}
        className="status-select-trigger"
        style={{ width: '100%', justifyContent: 'flex-start', ...(current ? { '--sc': current.cor } as any : {}) }}
        onClick={openDropdown}
        type="button"
      >
        {current
          ? <><span className="status-select-dot" style={{ background: current.cor }} /><span>{current.nome}</span></>
          : value === '__new__'
            ? <><span style={{ color: 'var(--black)', fontWeight: 600 }}>+ Nova etapa</span></>
            : <span style={{ color: 'var(--gray2)' }}>Selecionar etapa…</span>
        }
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && createPortal(
        <div ref={dropRef} className="status-select-dropdown" style={{ top: pos.top, left: pos.left, minWidth: pos.width }}>
          {options.map(st => (
            <div
              key={st.id}
              className={`status-select-option${Number(value) === Number(st.id) ? ' active' : ''}`}
              onClick={() => { onChange(Number(st.id)); setOpen(false); }}
            >
              <span className="status-select-dot" style={{ background: st.cor }} />
              <span>{st.nome}</span>
              {Number(value) === Number(st.id) && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto', color: st.cor }}>
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          ))}
          {allowNew && (
            <div
              className={`status-select-option${value === '__new__' ? ' active' : ''}`}
              style={{ borderTop: '1px solid var(--gray3)', marginTop: 4, paddingTop: 8, color: 'var(--black)', fontWeight: 600 }}
              onClick={() => { onChange('__new__'); setOpen(false); }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span>Criar nova etapa</span>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

const COLORS = [
  '#6366F1','#8B5CF6','#EC4899','#F43F5E','#EF4444',
  '#F97316','#EAB308','#22C55E','#10B981','#14B8A6',
  '#06B6D4','#3B82F6','#0EA5E9',
];

function useApi(token: string) {
  const { onSessionExpired } = useAuth();
  return useCallback(async function call(path: string, method = 'GET', body?: any) {
    const res = await fetch(`/api/admin-data${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { onSessionExpired(); return {}; }
    return res.json();
  }, [token, onSessionExpired]);
}

// ── Seletor de usuários do portal ─────────────────────────────
function UsuarioDropdown({
  token, onSelect, exclude, compact,
}: {
  token: string;
  onSelect: (user: UsuarioNotificavel) => void;
  exclude: string[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UsuarioNotificavel[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  async function fetchUsers() {
    if (users.length) return;
    setLoading(true);
    try {
      const r = await fetch('/api/admin-data?action=usuarios_notificaveis', { headers: { 'x-admin-session': token } });
      const data = await r.json();
      setUsers(data.usuarios ?? []);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const DROPDOWN_W = 260;
      const spaceRight = window.innerWidth - rect.left;
      if (spaceRight < DROPDOWN_W) {
        setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
      } else {
        setPos({ top: rect.bottom + 6, left: rect.left });
      }
    }
    setOpen(v => !v);
    if (!open) fetchUsers();
  }

  useEffect(() => {
    if (!open) return;
    function outside(e: MouseEvent) {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  const busca = search.trim().toLowerCase();
  const filtered = users
    .filter(u => !exclude.includes(u.id))
    // Busca por nome e por e-mail: quem tem homônimo se distingue pelo endereço.
    .filter(u => !busca || u.nome.toLowerCase().includes(busca) || u.email.toLowerCase().includes(busca));

  return (
    <>
      <button ref={btnRef} className={`notif-add-btn${compact ? ' compact' : ''}`} onClick={toggle} title={compact ? 'Adicionar usuário' : undefined}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        {!compact && 'Adicionar usuário'}
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          className="notif-dropdown"
          style={{ position: 'fixed', top: pos.top, left: pos.left, right: pos.right }}
        >
          <input
            className="notif-search"
            placeholder="Buscar…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div className="notif-list">
            {loading && <div className="dux-spinner-row" style={{ padding: '12px 0' }}><span className="dux-spinner sm" /></div>}
            {!loading && filtered.length === 0 && <p className="notif-list-empty">Nenhum usuário</p>}
            {filtered.map(u => (
              <div key={u.id} className="notif-list-item" onClick={() => { onSelect(u); setOpen(false); setSearch(''); }}>
                {u.foto_url
                  ? <img src={u.foto_url} alt="" className="notif-avatar" referrerPolicy="no-referrer" />
                  : <div className="notif-avatar-placeholder">{u.nome[0]}</div>
                }
                <div style={{ minWidth: 0 }}>
                  <p className="notif-user-name">{u.nome}</p>
                  <p className="notif-user-handle">{u.email}</p>
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Novo lead notification section ────────────
function NovaNotificacaoSection({ token }: { token: string }) {
  const api = useApi(token);
  const [notifs, setNotifs] = useState<NovaNotificacao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('?action=novo_lead_notifs').then(d => {
      setNotifs(d.notificacoes ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function addNotif(user: UsuarioNotificavel) {
    const data = await api('', 'POST', {
      action: 'add_novo_lead_notif',
      usuario_id: user.id,
    });
    if (data.notificacao) setNotifs(prev => [...prev, data.notificacao]);
  }

  async function removeNotif(id: number) {
    await api('', 'POST', { action: 'remove_novo_lead_notif', id });
    setNotifs(prev => prev.filter(n => n.id !== id));
  }

  return (
    <div className="nova-notif-section">
      <div className="nova-notif-header">
        <div className="nova-notif-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <p className="nova-notif-title">Novo lead recebido</p>
          <p className="nova-notif-desc">Enviar e-mail quando um lead entrar no funil</p>
        </div>
      </div>
      {loading ? (
        <div className="nova-notif-body">
          <div className="sk-block" style={{ width: 120, height: 13, borderRadius: 6 }} />
        </div>
      ) : (
        <div className="nova-notif-body">
          <div className="notif-chips">
            {notifs.map(n => (
              <div key={n.id} className="notif-chip">
                <div className="notif-avatar-sm notif-avatar-placeholder">{n.usuario_nome[0]}</div>
                <span title={n.usuario_email}>{n.usuario_nome}</span>
                <button onClick={() => removeNotif(n.id)}>×</button>
              </div>
            ))}
          </div>
          <UsuarioDropdown
            token={token}
            onSelect={addNotif}
            exclude={notifs.map(n => n.usuario_id)}
          />
        </div>
      )}
    </div>
  );
}

// ── Status row ───────────────────────────────────────
function StatusRow({
  status, onUpdate, onDelete, onAddStatus, onSetConversion, onSetEntrada, onToggleExcluded, onToggleRequiresPendencia, allStatuses, token,
  isDragging, dropIndicator, onDragStart, onDragOver, onClearIndicator, onDrop, onDragEnd,
}: {
  status: StatusConfig;
  onUpdate: (s: StatusConfig) => void;
  onDelete: (id: number) => void;
  onAddStatus: (s: StatusConfig) => void;
  onSetConversion: (id: number | null) => void;
  onSetEntrada: (id: number | null) => void;
  onToggleExcluded: (id: number) => void;
  onToggleRequiresPendencia: (id: number) => void;
  allStatuses: StatusConfig[];
  token: string;
  isDragging: boolean;
  dropIndicator: 'before' | 'after' | null;
  onDragStart: () => void;
  onDragOver: (pos: 'before' | 'after') => void;
  onClearIndicator: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const api = useApi(token);
  const { toast } = useToast();
  const rowRef = useRef<HTMLDivElement>(null);
  const colorDotRef = useRef<HTMLButtonElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const starBtnRef = useRef<HTMLButtonElement>(null);
  const banBtnRef = useRef<HTMLButtonElement>(null);
  const pendBtnRef = useRef<HTMLButtonElement>(null);
  const entradaBtnRef = useRef<HTMLButtonElement>(null);

  const [editingName, setEditingName] = useState(false);
  const [showStarTip, setShowStarTip] = useState(false);
  const [starTipPos, setStarTipPos] = useState({ top: 0, left: 0, arrowLeft: '50%' });
  const [showBanTip, setShowBanTip] = useState(false);
  const [banTipPos, setBanTipPos] = useState({ top: 0, left: 0, arrowLeft: '50%' });
  const [showPendTip, setShowPendTip] = useState(false);
  const [pendTipPos, setPendTipPos] = useState({ top: 0, left: 0, arrowLeft: '50%' });
  const [showEntradaTip, setShowEntradaTip] = useState(false);
  const [entradaTipPos, setEntradaTipPos] = useState({ top: 0, left: 0, arrowLeft: '50%' });
  const [nome, setNome] = useState(status.nome);
  const [cor, setCor] = useState(status.cor);
  const [notifs, setNotifs] = useState<Notificacao[]>(status.notificacoes ?? []);
  const [colorPickerPos, setColorPickerPos] = useState<{ top: number; left: number } | null>(null);

  // Delete flow
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveModal, setMoveModal] = useState<{ count: number } | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<number | ''>('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [newNome, setNewNome] = useState('');
  const [newCor, setNewCor] = useState(COLORS[0]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!colorPickerPos) return;
    function handle(e: MouseEvent) {
      if (colorDotRef.current?.contains(e.target as Node)) return;
      if (colorPickerRef.current?.contains(e.target as Node)) return;
      setColorPickerPos(null);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [colorPickerPos]);

  async function handleDeleteClick() {
    try {
      const res = await api(`?action=status_card_count&status_id=${status.id}`);
      if (res.error) throw new Error(res.error);
      const count = Number(res.count ?? 0);
      if (count === 0) {
        setConfirmDelete(true);
      } else {
        setMoveTargetId('');
        setCreatingNew(false);
        setNewNome('');
        setNewCor(COLORS[0]);
        setMoveModal({ count });
      }
    } catch (err) {
      console.error('[handleDeleteClick]', err);
      setConfirmDelete(true);
    }
  }

  async function handleDeleteConfirm() {
    setDeleting(true);
    try {
      const res = await api('', 'POST', { action: 'delete_status', id: status.id });
      if (res.error) throw new Error(res.error);
      onDelete(status.id);
      toast('success', `Etapa "${status.nome}" excluída`);
      setConfirmDelete(false);
    } catch (err) {
      console.error('[handleDeleteConfirm]', err);
      toast('error', 'Erro ao excluir etapa. Tente novamente.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleMoveAndDelete() {
    if (creatingNew && !newNome.trim()) return;
    setDeleting(true);
    try {
      let targetId = moveTargetId as number;
      if (creatingNew) {
        const res = await api('', 'POST', { action: 'create_status', nome: newNome.trim(), cor: newCor });
        if (res.error) throw new Error(res.error);
        targetId = res.status.id;
        onAddStatus(res.status);
      }
      const res = await api('', 'POST', { action: 'delete_status_with_move', id: status.id, move_to_id: targetId });
      if (res.error) throw new Error(res.error);
      onDelete(status.id);
      toast('success', `${res.moved ?? 0} lead(ões) movida(s) e etapa excluída`);
      setMoveModal(null);
    } catch (err) {
      console.error('[handleMoveAndDelete]', err);
      toast('error', 'Erro ao mover e excluir etapa. Tente novamente.');
    } finally {
      setDeleting(false);
    }
  }

  function openColorPicker(e: React.MouseEvent) {
    e.stopPropagation();
    if (colorPickerPos) { setColorPickerPos(null); return; }
    const rect = colorDotRef.current!.getBoundingClientRect();
    setColorPickerPos({ top: rect.bottom + 6, left: rect.left });
  }

  async function handleColorClick(c: string) {
    setCor(c);
    setColorPickerPos(null);
    await api('', 'POST', { action: 'update_status', id: status.id, nome, cor: c });
    onUpdate({ ...status, nome, cor: c, notificacoes: notifs });
    toast('success', 'Cor atualizada');
  }

  function handleNameBlur(e: React.FocusEvent) {
    if (rowRef.current?.contains(e.relatedTarget as Node)) return;
    saveName();
  }

  async function saveName() {
    setEditingName(false);
    if (nome === status.nome) return;
    await api('', 'POST', { action: 'update_status', id: status.id, nome, cor });
    onUpdate({ ...status, nome, cor, notificacoes: notifs });
    toast('success', 'Etapa atualizada');
  }

  async function addNotif(user: UsuarioNotificavel) {
    const data = await api('', 'POST', {
      action: 'add_notificacao',
      status_id: status.id,
      usuario_id: user.id,
    });
    const updated = [...notifs, data.notificacao];
    setNotifs(updated);
    onUpdate({ ...status, nome, cor, notificacoes: updated });
  }

  async function removeNotif(id: number) {
    await api('', 'POST', { action: 'remove_notificacao', id });
    const updated = notifs.filter(n => n.id !== id);
    setNotifs(updated);
    onUpdate({ ...status, nome, cor, notificacoes: updated });
  }

  return (
    <div
      ref={rowRef}
      className={`status-row${isDragging ? ' status-row-dragging' : ''}${dropIndicator ? ' status-row-drop-target' : ''}`}
      draggable={!editingName}
      style={{
        cursor: editingName ? 'default' : 'grab',
        boxShadow: dropIndicator === 'before'
          ? 'inset 0 3px 0 0 var(--yellow)'
          : dropIndicator === 'after'
          ? 'inset 0 -3px 0 0 var(--yellow)'
          : undefined,
      }}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      onDragOver={e => {
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onDragOver(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
      }}
      onDragLeave={e => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) onClearIndicator();
      }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
    >
      <div className="status-row-bar">
        <div className="status-row-left">
          <div className="drag-handle-dots">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="4" cy="3" r="1.2" fill="currentColor"/>
              <circle cx="4" cy="7" r="1.2" fill="currentColor"/>
              <circle cx="4" cy="11" r="1.2" fill="currentColor"/>
              <circle cx="10" cy="3" r="1.2" fill="currentColor"/>
              <circle cx="10" cy="7" r="1.2" fill="currentColor"/>
              <circle cx="10" cy="11" r="1.2" fill="currentColor"/>
            </svg>
          </div>

          <button
            ref={colorDotRef}
            className="status-color-dot-btn"
            onClick={openColorPicker}
            title="Alterar cor"
          >
            <span className="kanban-dot" style={{ background: cor, width: 12, height: 12 }} />
          </button>

          {editingName ? (
            <input
              className="status-name-input"
              value={nome}
              onChange={e => setNome(e.target.value)}
              autoFocus
              onClick={e => e.stopPropagation()}
              onBlur={handleNameBlur}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { setNome(status.nome); setEditingName(false); }
              }}
            />
          ) : (
            <span
              className="status-name"
              onClick={e => { e.stopPropagation(); setNome(status.nome); setEditingName(true); }}
              title="Clique para renomear"
            >
              {nome}
            </span>
          )}
        </div>

        <div className="status-row-right" onClick={e => e.stopPropagation()}>
          <div className="status-notif-chips-inline">
            {notifs.map(n => (
              <div key={n.id} className="notif-chip">
                <div className="notif-avatar-sm notif-avatar-placeholder">{n.usuario_nome[0]}</div>
                <span title={n.usuario_email}>{n.usuario_nome}</span>
                <button onClick={() => removeNotif(n.id)}>×</button>
              </div>
            ))}
          </div>

          <UsuarioDropdown
            token={token}
            onSelect={addNotif}
            exclude={notifs.map(n => n.usuario_id)}
            compact
          />

          <button
            ref={entradaBtnRef}
            className="status-action-btn"
            onClick={() => onSetEntrada(status.is_entrada ? null : status.id)}
            style={status.is_entrada ? { color: 'var(--green)', background: 'rgba(30,138,62,0.1)' } : {}}
            onMouseEnter={() => {
              const rect = entradaBtnRef.current?.getBoundingClientRect();
              if (!rect) return;
              const tipW = 260;
              const rawLeft = rect.left + rect.width / 2 - tipW / 2;
              const clampedLeft = Math.min(Math.max(8, rawLeft), window.innerWidth - tipW - 8);
              const arrowLeft = `${rect.left + rect.width / 2 - clampedLeft}px`;
              setEntradaTipPos({ top: rect.top - 8, left: clampedLeft, arrowLeft });
              setShowEntradaTip(true);
            }}
            onMouseLeave={() => setShowEntradaTip(false)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M3 13h5l1.5 2.5h5L16 13h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 13v5a2 2 0 002 2h14a2 2 0 002-2v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill={status.is_entrada ? 'currentColor' : 'none'} />
              <path d="M12 3v7m0 0l-2.6-2.6M12 10l2.6-2.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {showEntradaTip && createPortal(
            <span
              className="tooltip-box"
              role="tooltip"
              style={{
                position: 'fixed',
                top: entradaTipPos.top,
                left: entradaTipPos.left,
                width: 260,
                transform: 'translateY(-100%)',
                '--arrow-left': entradaTipPos.arrowLeft,
              } as React.CSSProperties}
            >
              <strong style={{ display: 'block', marginBottom: 6 }}>Etapa de entrada</strong>
              <ul style={{ margin: 0, paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>Leads enviadas pelo <em>formulário</em> caem nesta etapa. Só uma etapa pode ter essa marcação.</li>
                <li>Também é a etapa sugerida ao criar um lead pelo painel.</li>
                <li>Sem marcação, vale a <em>primeira</em> etapa da lista.</li>
              </ul>
            </span>,
            document.body
          )}

          <button
            ref={starBtnRef}
            className="status-action-btn"
            onClick={() => onSetConversion(status.is_conversion ? null : status.id)}
            style={status.is_conversion ? { color: 'var(--yellow)', background: 'rgba(0, 201, 167,0.1)' } : {}}
            onMouseEnter={() => {
              const rect = starBtnRef.current?.getBoundingClientRect();
              if (!rect) return;
              const tipW = 240;
              const rawLeft = rect.left + rect.width / 2 - tipW / 2;
              const clampedLeft = Math.min(Math.max(8, rawLeft), window.innerWidth - tipW - 8);
              const arrowLeft = `${rect.left + rect.width / 2 - clampedLeft}px`;
              setStarTipPos({ top: rect.top - 8, left: clampedLeft, arrowLeft });
              setShowStarTip(true);
            }}
            onMouseLeave={() => setShowStarTip(false)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill={status.is_conversion ? 'currentColor' : 'none'} />
            </svg>
          </button>

          {showStarTip && createPortal(
            <span
              className="tooltip-box"
              role="tooltip"
              style={{
                position: 'fixed',
                top: starTipPos.top,
                left: starTipPos.left,
                width: 240,
                transform: 'translateY(-100%)',
                '--arrow-left': starTipPos.arrowLeft,
              } as React.CSSProperties}
            >
              <strong style={{ display: 'block', marginBottom: 6 }}>Etapa de conversão</strong>
              <ul style={{ margin: 0, paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>Marca a etapa que representa <em>negócio fechado</em>. Só uma etapa pode ter essa marcação.</li>
                <li>O relógio do lead <em>para</em> ao chegar aqui, e é esta etapa que alimenta o card de fechados no Funil.</li>
                <li>Leads nesta etapa ficam <em>fora</em> do Gerador de Contratos.</li>
              </ul>
            </span>,
            document.body
          )}

          <button
            ref={banBtnRef}
            className="status-action-btn"
            onClick={() => onToggleExcluded(status.id)}
            style={status.is_excluded ? { color: 'var(--red)', background: 'rgba(217,48,37,0.1)' } : {}}
            onMouseEnter={() => {
              const rect = banBtnRef.current?.getBoundingClientRect();
              if (!rect) return;
              const tipW = 260;
              const rawLeft = rect.left + rect.width / 2 - tipW / 2;
              const clampedLeft = Math.min(Math.max(8, rawLeft), window.innerWidth - tipW - 8);
              const arrowLeft = `${rect.left + rect.width / 2 - clampedLeft}px`;
              setBanTipPos({ top: rect.top - 8, left: clampedLeft, arrowLeft });
              setShowBanTip(true);
            }}
            onMouseLeave={() => setShowBanTip(false)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>

          {showBanTip && createPortal(
            <span
              className="tooltip-box"
              role="tooltip"
              style={{
                position: 'fixed',
                top: banTipPos.top,
                left: banTipPos.left,
                width: 260,
                transform: 'translateY(-100%)',
                '--arrow-left': banTipPos.arrowLeft,
              } as React.CSSProperties}
            >
              <strong style={{ display: 'block', marginBottom: 6 }}>Etapa desconsiderada</strong>
              <ul style={{ margin: 0, paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>Leads nesta etapa ficam <em>fora</em> do Gerador de Contratos.</li>
                <li>Use para etapas que tiram o lead do fluxo sem serem fechamento - descartado, em espera, duplicado.</li>
              </ul>
            </span>,
            document.body
          )}

          <button
            ref={pendBtnRef}
            className="status-action-btn"
            onClick={() => onToggleRequiresPendencia(status.id)}
            style={status.requires_pendencia ? { color: '#B45309', background: 'rgba(180,83,9,0.12)' } : {}}
            onMouseEnter={() => {
              const rect = pendBtnRef.current?.getBoundingClientRect();
              if (!rect) return;
              const tipW = 260;
              const rawLeft = rect.left + rect.width / 2 - tipW / 2;
              const clampedLeft = Math.min(Math.max(8, rawLeft), window.innerWidth - tipW - 8);
              const arrowLeft = `${rect.left + rect.width / 2 - clampedLeft}px`;
              setPendTipPos({ top: rect.top - 8, left: clampedLeft, arrowLeft });
              setShowPendTip(true);
            }}
            onMouseLeave={() => setShowPendTip(false)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {showPendTip && createPortal(
            <span
              className="tooltip-box"
              role="tooltip"
              style={{
                position: 'fixed',
                top: pendTipPos.top,
                left: pendTipPos.left,
                width: 260,
                transform: 'translateY(-100%)',
                '--arrow-left': pendTipPos.arrowLeft,
              } as React.CSSProperties}
            >
              <strong style={{ display: 'block', marginBottom: 6 }}>Exigir pendências</strong>
              <ul style={{ margin: 0, paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>Ao mover um card <em>para esta etapa</em>, o operador precisa registrar as pendências antes de concluir a mudança.</li>
                <li>Útil para etapas que não avançam enquanto houver documento ou aceite faltando.</li>
              </ul>
            </span>,
            document.body
          )}


          <button
            className="status-action-btn danger"
            onClick={(status.is_conversion || status.is_excluded) ? undefined : handleDeleteClick}
            title={status.is_conversion ? 'Etapa de conversão não pode ser excluída' : status.is_excluded ? 'Etapa desconsiderada não pode ser excluída' : 'Excluir etapa'}
            style={(status.is_conversion || status.is_excluded) ? { opacity: 0.3, cursor: 'not-allowed' } : {}}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><polyline points="3,6 5,6 21,6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>

      {/* Color picker portal */}
      {colorPickerPos && createPortal(
        <div
          ref={colorPickerRef}
          className="status-color-picker-popover"
          style={{ position: 'fixed', top: colorPickerPos.top, left: colorPickerPos.left }}
        >
          {COLORS.map(c => (
            <button
              key={c}
              className={`color-swatch${cor === c ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => handleColorClick(c)}
            />
          ))}
        </div>,
        document.body
      )}

      {/* Modal: excluir sem cards */}
      {confirmDelete && createPortal(
        <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }} onClick={() => setConfirmDelete(false)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <p className="delete-confirm-title">Excluir etapa?</p>
            <p className="delete-confirm-desc">
              <strong>{status.nome}</strong> será excluída permanentemente e não poderá ser recuperada.
            </p>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setConfirmDelete(false)}>Cancelar</button>
              <button className="delete-confirm-ok" onClick={handleDeleteConfirm} disabled={deleting}>{deleting ? 'Excluindo…' : 'Excluir'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: mover cards antes de excluir */}
      {moveModal && createPortal(
        <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }} onClick={() => setMoveModal(null)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()} style={{ width: 360 }}>
            <p className="delete-confirm-title">Excluir etapa?</p>
            <p className="delete-confirm-desc">
              <strong>{status.nome}</strong> tem <strong>{moveModal.count}</strong> lead(ões). Para qual etapa deseja movê-las?
            </p>

            <MoveTargetSelect
              options={allStatuses.filter(s => s.id !== status.id)}
              value={creatingNew ? '__new__' : moveTargetId}
              onChange={v => {
                if (v === '__new__') { setCreatingNew(true); setMoveTargetId(''); }
                else { setCreatingNew(false); setMoveTargetId(v); }
              }}
            />

            {creatingNew && (
              <div className="status-move-new">
                <input
                  className="status-name-input"
                  placeholder="Nome da nova etapa…"
                  value={newNome}
                  onChange={e => setNewNome(e.target.value)}
                  autoFocus
                />
                <div className="status-color-picker" style={{ marginTop: 10 }}>
                  {COLORS.map(c => (
                    <button key={c} type="button" className={`color-swatch${newCor === c ? ' active' : ''}`} style={{ background: c }} onClick={() => setNewCor(c)} />
                  ))}
                </div>
              </div>
            )}

            <div className="delete-confirm-actions" style={{ marginTop: 20 }}>
              <button className="delete-confirm-cancel" onClick={() => setMoveModal(null)}>Cancelar</button>
              <button
                className="delete-confirm-ok"
                onClick={handleMoveAndDelete}
                disabled={deleting || (!creatingNew && !moveTargetId) || (creatingNew && !newNome.trim())}
              >
                {deleting ? 'Movendo…' : 'Mover e excluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Integrações Tab ──────────────────────────────────
const ANTHROPIC_COLOR = '#CC785C';
const CLAUDE_ORANGE = '#D97757';

const ANTHROPIC_MODELS: { id: string; label: string; desc: string; tier: string }[] = [
  { id: 'claude-opus-5',              label: 'Opus 5',     desc: 'Melhor leitura de documentos e raciocínio - mesmo preço do 4.8',        tier: 'Recomendado' },
  { id: 'claude-opus-4-8',            label: 'Opus 4.8',   desc: 'Geração anterior do Opus - ainda excelente em análises complexas',      tier: 'Alternativa' },
  { id: 'claude-sonnet-5',            label: 'Sonnet 5',   desc: 'Equilíbrio entre qualidade e custo (~40% do preço do Opus)',            tier: 'Equilibrado' },
  { id: 'claude-sonnet-4-6',          label: 'Sonnet 4.6', desc: 'Geração anterior do Sonnet - sem schema garantido na extração',         tier: 'Legado' },
  { id: 'claude-haiku-4-5-20251001',  label: 'Haiku 4.5',  desc: 'Mais rápido e econômico - para volume, não para análise crítica',       tier: 'Econômico' },
  { id: 'claude-fable-5',             label: 'Fable 5',    desc: 'O mais capaz da Claude, porém ~2× o custo do Opus 5',                   tier: 'Máximo' },
];

/** A marca da Claude, do arquivo oficial. Era um desenho recriado em SVG: doze
 *  raios de comprimento alternado, parecido de longe e diferente de perto. Logo
 *  de terceiro nao se aproxima - ou e ela, ou e um icone generico. */
function ClaudeLogo({ size = 20 }: { size?: number }) {
  return <img src="/marcas/claude.webp" alt="" width={size} height={size}
    style={{ display: 'block', objectFit: 'contain', flexShrink: 0 }} />;
}

// Dropdown de modelo - customizado no padrão do sistema (substitui o <select> nativo)
function ModelSelect({ value, onChange, color = ANTHROPIC_COLOR }: { value: string; onChange: (v: string) => void; color?: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !dropRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const sel = ANTHROPIC_MODELS.find(m => m.id === value) ?? ANTHROPIC_MODELS[0];
  const rect = btnRef.current?.getBoundingClientRect();

  // Posicionamento: abre para baixo, mas vira para cima se não couber na viewport
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const spaceBelow = rect ? vh - rect.bottom : vh;
  const spaceAbove = rect ? rect.top : 0;
  const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
  const maxH = Math.max(160, (openUp ? spaceAbove : spaceBelow) - 16);
  const popStyle: React.CSSProperties = openUp
    ? { bottom: vh - (rect?.top ?? 0) + 6, left: rect?.left ?? 0, width: rect?.width ?? 260, maxHeight: maxH }
    : { top: (rect?.bottom ?? 0) + 6, left: rect?.left ?? 0, width: rect?.width ?? 260, maxHeight: maxH };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`model-select-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
        style={{ '--focus-color': color } as React.CSSProperties}
      >
        <span className="model-select-logo"><ClaudeLogo size={18} /></span>
        <span className="model-select-label">
          <strong>{sel.label}</strong>
          <span className="model-select-sub">{sel.desc}</span>
        </span>
        <span className="model-tier">{sel.tier}</span>
        <svg className="model-select-chevron" width="12" height="8" viewBox="0 0 10 6" fill="none"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && createPortal(
        <div ref={dropRef} className="model-select-pop" style={popStyle}>
          {ANTHROPIC_MODELS.map(m => {
            const active = m.id === value;
            return (
              <div key={m.id} className={`model-opt${active ? ' active' : ''}`} onClick={() => { onChange(m.id); setOpen(false); }}>
                <span className="model-opt-logo"><ClaudeLogo size={20} /></span>
                <div className="model-opt-text">
                  <div className="model-opt-name">{m.label}<span className="model-tier">{m.tier}</span></div>
                  <div className="model-opt-desc">{m.desc}</div>
                </div>
                {active && (
                  <svg className="model-opt-check" width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

// Integração com a Anthropic (Claude). A chave da API é salva criptografada no
// banco (não no .env) e usada na análise de crédito assistida por IA.
function AnthropicIntegrationCard({ api, inicial, onEstado }: {
  api: ReturnType<typeof useApi>;
  /** O que a tabela já descobriu, para não repetir a validação da chave. */
  inicial: EstadoIntegracao;
  onEstado: (e: EstadoIntegracao) => void;
}) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);      // existe credencial salva no Turso
  const [connected, setConnected] = useState(false); // credencial salva E válida
  const [connError, setConnError] = useState<string | null>(null);
  const [model, setModel] = useState(ANTHROPIC_MODELS[0].id);
  const [expanded, setExpanded] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api('?action=anthropic_config').then(d => {
      setHasKey(!!d.has_key);
      setConnected(!!d.connected);
      setConnError(d.error ?? null);
      if (d.model) setModel(d.model);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function save() {
    // Permite salvar só a chave, só o modelo, ou ambos (chave em branco = mantém a atual)
    if (!apiKey.trim() && !hasKey) return;
    setSaving(true);
    const r = await api('', 'POST', { action: 'save_anthropic_key', key: apiKey.trim(), model });
    setSaving(false);
    if (r?.error) {
      // Chave inválida / conexão falhou - não persistiu
      if (apiKey.trim()) { setConnected(false); setConnError(r.error); }
      toast('error', 'Não foi possível conectar', r.error);
      return;
    }
    setHasKey(true);
    setConnected(!!r.connected);
    setConnError(r.connected ? null : 'Conexão inválida.');
    setApiKey('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    if (r.connected) toast('success', 'Anthropic conectada', 'Chave validada e salva no banco.');
  }

  async function remove() {
    if (!confirm('Remover a integração com a Anthropic? A análise de crédito por IA deixará de funcionar.')) return;
    setRemoving(true);
    await api('', 'POST', { action: 'remove_anthropic_key' });
    setHasKey(false);
    setConnected(false);
    setConnError(null);
    setExpanded(false);
    setRemoving(false);
  }

  // Depois da primeira carga, quem muda a situação é este cartão - e ele avisa
  // a linha, para ela não ficar contando uma história velha.
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    onEstado({
      temChave: hasKey,
      conectada: connected,
      detalhe: hasKey ? (ANTHROPIC_MODELS.find(m => m.id === model)?.label ?? model) : null,
      em: inicial.em,
      carregando: false,
    });
  }, [hasKey, connected, model]);

  return (
    <div className="integration-card expanded">
        <div className="integration-form">
          <div className="integration-form-group">
            <label className="integration-label">Chave da API</label>
            <div className="integration-input-wrap">
              <input
                className="integration-input"
                type={showKey ? 'text' : 'password'}
                placeholder={hasKey ? '•••••••••••••••• (chave salva)' : 'sk-ant-...'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
                style={{ '--focus-color': ANTHROPIC_COLOR } as any}
              />
              <button className="integration-eye" onClick={() => setShowKey(v => !v)} type="button">
                {showKey ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/></svg>
                )}
              </button>
            </div>
            <p className="integration-hint">
              Gere a chave no <strong>console.anthropic.com</strong> › API Keys. Fica criptografada no banco.
            </p>
            {!loading && hasKey && !connected && connError && (
              <p className="integration-hint" style={{ color: '#B91C1C', fontWeight: 600 }}><IconAlert size={12} /> {connError}</p>
            )}
          </div>

          <div className="integration-form-group">
            <label className="integration-label">Modelo</label>
            <ModelSelect value={model} onChange={setModel} color={ANTHROPIC_COLOR} />
          </div>

          <div className="integration-form-actions">
            <button
              className="integration-save-btn"
              style={{ background: ANTHROPIC_COLOR }}
              onClick={save}
              disabled={saving || (!apiKey.trim() && !hasKey)}
            >
              {saving ? 'Salvando…' : saved ? <><IconCheck size={12} /> Salvo!</> : hasKey ? 'Salvar alterações' : 'Salvar chave'}
            </button>
            {hasKey && (
              <button className="integration-remove-btn" onClick={remove} disabled={removing}>
                {removing ? 'Removendo…' : 'Remover integração'}
              </button>
            )}
          </div>
        </div>
    </div>
  );
}

// ── Fireflies (reuniões) ─────────────────────────────
// A chave da API fica criptografada no banco, como a da Anthropic, e vale contra
// a API GraphQL deles. O que a integração destrava e' a conversa gravada: hoje
// ela guarda a ligação e diz de que conta ela e'; puxar transcrição para dentro
// do projeto e' o passo seguinte, e mora do lado do servidor.
/** O magenta médio da marca, tirado do próprio arquivo. Serve à pastilha atrás
 *  da logo e ao botão de salvar - a integração fala na cor de quem ela liga. */
const FIREFLIES_COR = '#C5398D';

/** A marca oficial, e não um desenho de traço: aqui ela identifica um terceiro,
 *  e o traço da casa vale para os ícones do sistema, não para logotipo alheio.
 *  O arquivo vive em `public/marcas`, com o resto das marcas. */
function FirefliesLogo({ size = 18 }: { size?: number }) {
  return <img src="/marcas/fireflies.webp" alt="" width={size} height={size}
    style={{ display: 'block', objectFit: 'contain' }} />;
}

function FirefliesIntegrationCard({ api, inicial, onEstado }: {
  api: ReturnType<typeof useApi>;
  /** O que a tabela já descobriu: o cartão não repete a consulta, que valida a
   *  chave contra o Fireflies e custa uma ida à API deles. */
  inicial: EstadoIntegracao;
  onEstado: (e: EstadoIntegracao) => void;
}) {
  const { toast } = useToast();
  const [chave, setChave] = useState('');
  const [temChave, setTemChave] = useState(inicial.temChave);
  const [conectada, setConectada] = useState(inicial.conectada);
  const [erro, setErro] = useState<string | null>(null);
  const [conta, setConta] = useState<{ nome: string | null; email: string | null } | null>(
    inicial.detalhe ? { nome: null, email: inicial.detalhe } : null,
  );
  const [desde, setDesde] = useState<string | null>(inicial.em);
  const [verChave, setVerChave] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const carregando = inicial.carregando;
  const [salvo, setSalvo] = useState(false);

  // A tabela pode terminar a consulta depois de a linha abrir.
  useEffect(() => {
    setTemChave(inicial.temChave);
    setConectada(inicial.conectada);
    setDesde(inicial.em);
    if (inicial.detalhe) setConta(c => c ?? { nome: null, email: inicial.detalhe });
  }, [inicial.temChave, inicial.conectada, inicial.em, inicial.detalhe]);

  async function salvar() {
    if (!chave.trim()) return;
    setSalvando(true);
    const r = await api('', 'POST', { action: 'save_fireflies_key', key: chave.trim() });
    setSalvando(false);
    if (r?.error) {
      setConectada(false);
      setErro(r.error);
      toast('error', 'Não foi possível conectar', r.error);
      return;
    }
    setTemChave(true);
    setConectada(true);
    setErro(null);
    setConta(r.conta ?? null);
    setDesde(new Date().toISOString());
    setChave('');
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    // A linha da tabela acompanha na hora: quem acabou de conectar não deveria
    // precisar recarregar para ver "Conectada".
    onEstado({
      temChave: true, conectada: true,
      detalhe: r?.conta?.email ?? r?.conta?.nome ?? null,
      em: new Date().toISOString(), carregando: false,
    });
    toast('success', 'Fireflies conectado', r?.conta?.email ? `Conta ${r.conta.email}.` : 'Chave validada e salva.');
  }

  async function remover() {
    if (!confirm('Remover a integração com o Fireflies? A chave sai do cofre.')) return;
    setRemovendo(true);
    await api('', 'POST', { action: 'remove_fireflies_key' });
    setTemChave(false);
    setConectada(false);
    setConta(null);
    setDesde(null);
    setErro(null);
    setRemovendo(false);
    onEstado({ temChave: false, conectada: false, detalhe: null, em: null, carregando: false });
  }

  return (
    <div className="integration-card expanded">
      <div className="integration-form">
        <div className="integration-form-group">
          <label className="integration-label">Chave da API</label>
          <div className="integration-input-wrap">
            <input
              className="integration-input"
              type={verChave ? 'text' : 'password'}
              placeholder={temChave ? '•••••••••••••••• (chave salva)' : 'Cole a chave do Fireflies'}
              value={chave}
              onChange={e => setChave(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && salvar()}
              style={{ ['--focus-color' as string]: FIREFLIES_COR }}
            />
            <button className="integration-eye" type="button" onClick={() => setVerChave(v => !v)}
              aria-label={verChave ? 'Ocultar a chave' : 'Mostrar a chave'}>
              {verChave ? <IconEyeOff size={14} /> : <IconEye size={14} />}
            </button>
          </div>
          <p className="integration-hint">
            Gere a chave em <strong>app.fireflies.ai</strong> › Settings › Developer Settings.
            Fica criptografada no banco, como as demais.
          </p>
          {!carregando && temChave && !conectada && erro && (
            <p className="integration-hint" style={{ color: '#B91C1C', fontWeight: 600 }}>
              <IconAlert size={12} /> {erro}
            </p>
          )}
        </div>

        {conta && (
          <div className="integration-form-group">
            <label className="integration-label">Conta conectada</label>
            <div className="integration-input-wrap">
              <input className="integration-input readonly" readOnly tabIndex={-1}
                value={[conta.nome, conta.email].filter(Boolean).join(' - ') || '-'} />
            </div>
          </div>
        )}

        <div className="integration-form-actions">
          <button className="integration-save-btn" style={{ background: FIREFLIES_COR }}
            onClick={salvar} disabled={salvando || !chave.trim()}>
            {salvando ? 'Salvando…' : salvo ? <><IconCheck size={12} /> Salvo!</> : temChave ? 'Trocar a chave' : 'Salvar chave'}
          </button>
          {temChave && (
            <button className="integration-remove-btn" onClick={remover} disabled={removendo}>
              {removendo ? 'Removendo…' : 'Remover integração'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** O que a tabela mostra de cada integração, para as três linhas serem lidas
 *  do mesmo jeito. Quem preenche é cada cartão, que já sabe consultar o próprio
 *  endpoint - a tabela não busca nada por conta própria. */
interface EstadoIntegracao {
  /** Existe credencial salva no cofre. */
  temChave: boolean;
  /** Salva e válida numa checagem ao vivo. */
  conectada: boolean;
  /** Conta, plano, modelo: o que identifica a ligação para quem lê a linha. */
  detalhe: string | null;
  /** Quando a credencial foi salva ou revalidada. */
  em: string | null;
  carregando: boolean;
}

const ESTADO_INICIAL: EstadoIntegracao = {
  temChave: false, conectada: false, detalhe: null, em: null, carregando: true,
};

function fmtQuando(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** A situação da integração, na mesma pílula das outras telas. */
function PilulaIntegracao({ estado }: { estado: EstadoIntegracao }) {
  if (estado.carregando) return <span className="integration-badge disconnected">Verificando</span>;
  if (estado.conectada) {
    return (
      <span className="integration-badge connected">
        <span className="live-dot" />
        Conectada
      </span>
    );
  }
  if (estado.temChave) return <span className="integration-badge disconnected">Chave inválida</span>;
  return <span className="integration-badge disconnected">Não conectada</span>;
}

/** Uma linha da tabela e, quando aberta, o formulário logo abaixo dela.
 *
 *  A configuração continua sendo do cartão de cada integração - o que muda é
 *  que ele deixa de ser o item de uma lista e passa a ser o corpo expansível de
 *  uma linha. Assim a tela responde de relance a pergunta que ela existe para
 *  responder: o que está ligado, com que conta e desde quando. */
function LinhaIntegracao({ nome, categoria, descricao, logo, estado, aberta, onAlternar, children }: {
  nome: string;
  categoria: string;
  descricao: string;
  logo: React.ReactNode;
  estado: EstadoIntegracao;
  aberta: boolean;
  onAlternar: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr className={`integracao-linha${aberta ? ' aberta' : ''}`} onClick={onAlternar}>
        <td>
          <div className="integracao-nome">
            {logo}
            <div>
              <strong>{nome}</strong>
              <span>{descricao}</span>
            </div>
          </div>
        </td>
        <td>{categoria}</td>
        <td><PilulaIntegracao estado={estado} /></td>
        <td className="integracao-conta">{estado.detalhe ?? '-'}</td>
        <td className="integracao-quando">{fmtQuando(estado.em)}</td>
        <td className="integracao-abrir">
          <span className={`entrega-seta${aberta ? ' aberta' : ''}`}>
            <IconChevronRight size={13} />
          </span>
        </td>
      </tr>
      {aberta && (
        <tr className="integracao-corpo">
          <td colSpan={6}>{children}</td>
        </tr>
      )}
    </>
  );
}

function IntegracoesTab({ token: sessionToken }: { token: string }) {
  const api = useApi(sessionToken);
  /** Uma aberta por vez: são formulários de credencial, e duas abertas ao mesmo
   *  tempo só empurram a de baixo para fora da tela. */
  const [aberta, setAberta] = useState<string | null>(null);
  const [estados, setEstados] = useState<Record<string, EstadoIntegracao>>({});

  /** A situação de cada linha é buscada aqui, e não dentro do cartão: o cartão
   *  só existe enquanto a linha está aberta, então quem entrasse na tela veria
   *  tudo como não conectado até abrir uma por uma. */
  useEffect(() => {
    let vivo = true;
    api('?action=anthropic_config').then(d => {
      if (!vivo || !d) return;
      setEstados(m => ({ ...m, anthropic: {
        temChave: !!d.has_key,
        conectada: !!d.connected,
        detalhe: d.has_key ? (ANTHROPIC_MODELS.find(x => x.id === d.model)?.label ?? d.model ?? null) : null,
        em: d.updated_at ?? null,
        carregando: false,
      } }));
    }).catch(() => {});
    api('?action=fireflies_config').then(d => {
      if (!vivo || !d) return;
      setEstados(m => ({ ...m, fireflies: {
        temChave: !!d.has_key,
        conectada: !!d.connected,
        detalhe: d.conta?.email ?? d.conta?.nome ?? null,
        em: d.updated_at ?? null,
        carregando: false,
      } }));
    }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  const anotar = useCallback((chave: string, e: EstadoIntegracao) => {
    setEstados(m => (
      m[chave] && m[chave].temChave === e.temChave && m[chave].conectada === e.conectada
        && m[chave].detalhe === e.detalhe && m[chave].em === e.em && m[chave].carregando === e.carregando
        ? m
        : { ...m, [chave]: e }
    ));
  }, []);
  const estadoDe = (chave: string) => estados[chave] ?? ESTADO_INICIAL;

  const alternar = (chave: string) => setAberta(a => (a === chave ? null : chave));

  return (
    <div className="admin-table-wrap integracoes-tabela">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Integração</th>
            <th>Categoria</th>
            <th>Situação</th>
            <th>Conta</th>
            <th>Desde</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <LinhaIntegracao
            nome="Anthropic (Claude)"
            categoria="Inteligência artificial"
            descricao="Lê os relatórios e sugere um parecer na análise de crédito."
            logo={<span className="integracao-logo" style={{ background: `${CLAUDE_ORANGE}14`, border: `1px solid ${CLAUDE_ORANGE}30` }}><ClaudeLogo size={18} /></span>}
            estado={estadoDe('anthropic')}
            aberta={aberta === 'anthropic'}
            onAlternar={() => alternar('anthropic')}>
            <AnthropicIntegrationCard api={api} inicial={estadoDe('anthropic')}
              onEstado={e => anotar('anthropic', e)} />
          </LinhaIntegracao>

          <LinhaIntegracao
            nome="Fireflies"
            categoria="Reuniões"
            descricao="Transcrições e resumos das reuniões gravadas."
            logo={<span className="integracao-logo" style={{ background: `${FIREFLIES_COR}14`, border: `1px solid ${FIREFLIES_COR}30` }}><FirefliesLogo size={18} /></span>}
            estado={estadoDe('fireflies')}
            aberta={aberta === 'fireflies'}
            onAlternar={() => alternar('fireflies')}>
            <FirefliesIntegrationCard api={api} inicial={estadoDe('fireflies')}
              onEstado={e => anotar('fireflies', e)} />
          </LinhaIntegracao>

        </tbody>
      </table>
    </div>
  );
}

function SkBlock({ w, h, radius = 6 }: { w: string | number; h: string | number; radius?: number }) {
  return <div className="sk-block" style={{ width: w, height: h, borderRadius: radius }} />;
}

function ConfiguracoesSkeleton() {
  const widths = [110, 140, 90, 125, 100, 155, 80, 115];
  return (
    <div className="status-list sk-wrap">
        {widths.map((w, i) => (
          <div key={i} className="status-row" style={{ opacity: Math.max(0.2, 1 - i * 0.1), cursor: 'default', pointerEvents: 'none' }}>
            <div className="status-row-bar">
              <div className="status-row-left">
                <SkBlock w={14} h={14} radius={3} />
                <SkBlock w={12} h={12} radius={50} />
                <SkBlock w={w} h={13} />
              </div>
              <SkBlock w={28} h={28} radius={8} />
            </div>
          </div>
        ))}
    </div>
  );
}


// ── Etapas do quadro de tarefas ───────────────────────────────
//
//  Mesma estrutura das etapas do funil - arrastar para ordenar, clicar no nome
//  para renomear, ponto colorido para trocar a cor - sem o que é do funil e não
//  existe aqui: notificação por etapa, pendência, conversão.
//
//  As duas marcações que sobram são as que a entrega lê. A de entrada diz onde
//  a tarefa nasce e o que ainda não começou; a de conclusão diz o que conta no
//  percentual da entrega. Sem elas o quadro seria só decoração.

interface EtapaTarefa {
  id: number;
  nome: string;
  cor: string;
  ordem: number;
  is_entrada: number;
  /** A estrela de conversão: a etapa que quer dizer "feito". */
  is_conclusao: number;
  is_excluded: number;
  always_collapsed: number;
  notificacoes?: Notificacao[];
}

function EtapaTarefaRow({
  etapa, todas, token, isDragging, dropIndicator,
  onDragStart, onDragOver, onClearIndicator, onDrop, onDragEnd,
  onUpdate, onDelete, onSetEntrada, onSetConversao, onToggleDesconsiderada,
}: {
  etapa: EtapaTarefa;
  todas: EtapaTarefa[];
  token: string;
  isDragging: boolean;
  dropIndicator: 'before' | 'after' | null;
  onDragStart: () => void;
  onDragOver: (pos: 'before' | 'after') => void;
  onClearIndicator: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onUpdate: (e: EtapaTarefa) => void;
  onDelete: (id: number) => void;
  onSetEntrada: (id: number | null) => void;
  onSetConversao: (id: number | null) => void;
  onToggleDesconsiderada: (id: number) => void;
}) {
  const api = useApi(token);
  const { toast } = useToast();
  const corDotRef = useRef<HTMLButtonElement>(null);
  const paletaRef = useRef<HTMLDivElement>(null);

  const [editandoNome, setEditandoNome] = useState(false);
  const [nome, setNome] = useState(etapa.nome);
  const [cor, setCor] = useState(etapa.cor);
  const [paletaPos, setPaletaPos] = useState<{ top: number; left: number } | null>(null);

  const [inscritos, setInscritos] = useState<Notificacao[]>(etapa.notificacoes ?? []);
  const [confirmar, setConfirmar] = useState(false);
  const [mover, setMover] = useState<{ count: number } | null>(null);
  const [destino, setDestino] = useState<number | ''>('');
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => { setNome(etapa.nome); setCor(etapa.cor); }, [etapa.nome, etapa.cor]);

  async function inscrever(u: UsuarioNotificavel) {
    const r = await api('', 'POST', {
      action: 'add_tarefa_status_notif', status_id: etapa.id, usuario_id: u.id,
    });
    if (r?.notificacao) setInscritos(prev => [...prev, r.notificacao]);
  }

  async function desinscrever(id: number) {
    setInscritos(prev => prev.filter(n => n.id !== id));
    await api('', 'POST', { action: 'remove_tarefa_status_notif', id });
  }

  useEffect(() => {
    if (!paletaPos) return;
    function fora(e: MouseEvent) {
      if (corDotRef.current?.contains(e.target as Node)) return;
      if (paletaRef.current?.contains(e.target as Node)) return;
      setPaletaPos(null);
    }
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [paletaPos]);

  async function salvar(novoNome: string, novaCor: string) {
    const limpo = novoNome.trim();
    if (!limpo) { setNome(etapa.nome); return; }
    if (limpo === etapa.nome && novaCor === etapa.cor) return;
    const r = await api('', 'POST', {
      action: 'update_tarefa_status', id: etapa.id, nome: limpo, cor: novaCor,
    });
    if (r?.error) { toast('error', 'Não foi possível salvar', r.error); setNome(etapa.nome); return; }
    onUpdate({ ...etapa, nome: limpo, cor: novaCor });
  }

  async function pedirExclusao() {
    const r = await api(`?action=tarefa_status_card_count&nome=${encodeURIComponent(etapa.nome)}`);
    const count = Number(r?.count ?? 0);
    if (count > 0) { setDestino(''); setMover({ count }); }
    else setConfirmar(true);
  }

  async function excluir(paraId?: number) {
    setExcluindo(true);
    try {
      const para = paraId != null ? todas.find(e => e.id === paraId) : null;
      const r = await api('', 'POST', {
        action: 'delete_tarefa_status', id: etapa.id, destino: para?.nome,
      });
      if (r?.error) { toast('error', 'Não foi possível excluir', r.error); return; }
      setConfirmar(false); setMover(null);
      onDelete(etapa.id);
      toast('success', 'Etapa excluída', r.movidas ? `${r.movidas} tarefa(s) movida(s).` : undefined);
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div
      className={`status-row${isDragging ? ' status-row-dragging' : ''}${dropIndicator ? ' status-row-drop-target' : ''}`}
      draggable={!editandoNome}
      style={{
        cursor: editandoNome ? 'default' : 'grab',
        boxShadow: dropIndicator === 'before'
          ? 'inset 0 3px 0 0 var(--yellow)'
          : dropIndicator === 'after'
          ? 'inset 0 -3px 0 0 var(--yellow)'
          : undefined,
      }}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      onDragOver={e => {
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onDragOver(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
      }}
      onDragLeave={e => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) onClearIndicator();
      }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
    >
      <div className="status-row-bar">
        <div className="status-row-left">
          <div className="drag-handle-dots"><IconArrastar size={14} /></div>

          <button
            ref={corDotRef}
            className="status-color-dot-btn"
            title="Alterar cor"
            aria-label={`Alterar a cor de ${etapa.nome}`}
            onClick={() => {
              const r = corDotRef.current!.getBoundingClientRect();
              setPaletaPos({ top: r.bottom + 6, left: Math.max(8, r.left - 6) });
            }}
          >
            <span className="kanban-dot" style={{ background: cor, width: 12, height: 12 }} />
          </button>

          {editandoNome ? (
            <input
              className="status-name-input"
              value={nome}
              autoFocus
              onChange={e => setNome(e.target.value)}
              onClick={e => e.stopPropagation()}
              onBlur={() => { setEditandoNome(false); void salvar(nome, cor); }}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { setNome(etapa.nome); setEditandoNome(false); }
              }}
            />
          ) : (
            <span className="status-name" title="Clique para renomear"
              onClick={e => { e.stopPropagation(); setEditandoNome(true); }}>
              {nome}
            </span>
          )}
        </div>

        <div className="status-row-right" onClick={e => e.stopPropagation()}>
          {/* Quem acompanha a etapa, igual ao funil: recebe e-mail quando uma
              tarefa chega aqui. */}
          <div className="status-notif-chips-inline">
            {inscritos.map(n => (
              <div key={n.id} className="notif-chip">
                <div className="notif-avatar-sm notif-avatar-placeholder">{n.usuario_nome[0]}</div>
                <span title={n.usuario_email}>{n.usuario_nome}</span>
                <button aria-label={`Remover ${n.usuario_nome}`}
                  onClick={() => void desinscrever(n.id)}>
                  <IconX size={10} />
                </button>
              </div>
            ))}
          </div>

          <UsuarioDropdown
            token={token}
            onSelect={u => void inscrever(u)}
            exclude={inscritos.map(n => n.usuario_id)}
            compact
          />

          <button
            className="status-action-btn"
            title={etapa.is_entrada
              ? 'Etapa de entrada: é aqui que a tarefa nasce, e a entrega considera que ainda não começou'
              : 'Marcar como etapa de entrada'}
            aria-pressed={!!etapa.is_entrada}
            style={etapa.is_entrada ? { color: 'var(--green)', background: 'rgba(30,138,62,0.1)' } : {}}
            onClick={() => onSetEntrada(etapa.is_entrada ? null : etapa.id)}
          >
            <IconEntrada size={12} />
          </button>

          <button
            className="status-action-btn"
            title={etapa.is_conclusao
              ? 'Etapa de conversão: tarefa aqui conta como feita no percentual da entrega. Só uma etapa pode ter essa marcação.'
              : 'Marcar como etapa de conversão'}
            aria-pressed={!!etapa.is_conclusao}
            style={etapa.is_conclusao ? { color: 'var(--yellow)', background: 'rgba(0, 201, 167,0.1)' } : {}}
            onClick={() => onSetConversao(etapa.is_conclusao ? null : etapa.id)}
          >
            <IconEstrela size={12} preenchida={!!etapa.is_conclusao} />
          </button>

          <button
            className="status-action-btn"
            title={etapa.is_excluded
              ? 'Etapa desconsiderada: tarefa aqui fica fora da conta da entrega, nem como feita nem como pendente'
              : 'Marcar como etapa desconsiderada'}
            aria-pressed={!!etapa.is_excluded}
            style={etapa.is_excluded ? { color: 'var(--red)', background: 'rgba(217,48,37,0.1)' } : {}}
            onClick={() => onToggleDesconsiderada(etapa.id)}
          >
            <IconProibido size={12} />
          </button>

          <button
            className="status-action-btn danger"
            title={todas.length <= 1 ? 'O quadro precisa de ao menos uma etapa' : 'Excluir etapa'}
            aria-label={`Excluir ${etapa.nome}`}
            disabled={todas.length <= 1}
            style={todas.length <= 1 ? { opacity: 0.3, cursor: 'not-allowed' } : {}}
            onClick={() => { if (todas.length > 1) void pedirExclusao(); }}
          >
            <IconTrash size={12} />
          </button>
        </div>
      </div>

      {paletaPos && createPortal(
        <div ref={paletaRef} className="status-color-picker-popover"
          style={{ position: 'fixed', top: paletaPos.top, left: paletaPos.left }}>
          {COLORS.map(c => (
            <button key={c} className={`color-swatch${cor === c ? ' active' : ''}`}
              style={{ background: c }} aria-label={`Cor ${c}`}
              onClick={() => { setCor(c); setPaletaPos(null); void salvar(nome, c); }} />
          ))}
        </div>,
        document.body
      )}

      {confirmar && createPortal(
        <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setConfirmar(false)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <p className="delete-confirm-title">Excluir etapa?</p>
            <p className="delete-confirm-desc">
              <strong>{etapa.nome}</strong> sai do quadro de tarefas. Nenhuma tarefa está nela.
            </p>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setConfirmar(false)}>Cancelar</button>
              <button className="delete-confirm-ok" disabled={excluindo} onClick={() => void excluir()}>
                {excluindo ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {mover && createPortal(
        <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setMover(null)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()} style={{ width: 360 }}>
            <p className="delete-confirm-title">Excluir etapa?</p>
            <p className="delete-confirm-desc">
              <strong>{etapa.nome}</strong> tem <strong>{mover.count}</strong> tarefa(s).
              Para qual etapa deseja movê-las?
            </p>

            {/* Sem "criar nova" aqui: a tarefa aponta a etapa pelo nome, e
                inventar uma no meio da exclusão deixaria o quadro com uma coluna
                que ninguém pediu. */}
            <MoveTargetSelect
              options={todas.filter(e => e.id !== etapa.id)}
              value={destino}
              onChange={v => { if (v !== '__new__') setDestino(v); }}
              allowNew={false}
            />

            <div className="delete-confirm-actions" style={{ marginTop: 16 }}>
              <button className="delete-confirm-cancel" onClick={() => setMover(null)}>Cancelar</button>
              <button className="delete-confirm-ok" disabled={excluindo || destino === ''}
                onClick={() => void excluir(destino as number)}>
                {excluindo ? 'Movendo…' : 'Mover e excluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function EtapasTarefaTab({ token, adicionando, onFecharNova }: {
  token: string;
  adicionando: boolean;
  onFecharNova: () => void;
}) {
  const api = useApi(token);
  const { toast } = useToast();
  const [etapas, setEtapas] = useState<EtapaTarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novaCor, setNovaCor] = useState(COLORS[7]);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<{ id: number; pos: 'before' | 'after' } | null>(null);

  useEffect(() => {
    let vivo = true;
    api('?action=tarefa_status_configs').then(r => {
      if (vivo) { setEtapas(r?.statuses ?? []); setLoading(false); }
    });
    return () => { vivo = false; };
  }, [api]);

  async function criar() {
    const nome = novoNome.trim();
    if (!nome) return;
    setSalvando(true);
    try {
      const r = await api('', 'POST', { action: 'create_tarefa_status', nome, cor: novaCor });
      if (r?.error) { toast('error', 'Não foi possível criar', r.error); return; }
      setEtapas(prev => [...prev, r.status]);
      setNovoNome(''); setNovaCor(COLORS[7]);
      onFecharNova();
      toast('success', 'Etapa criada');
    } finally {
      setSalvando(false);
    }
  }

  function soltar(alvoId: number) {
    if (arrastando === null || arrastando === alvoId) { setArrastando(null); setSobre(null); return; }
    const pos = sobre?.pos ?? 'before';
    const proxima = [...etapas];
    const de = proxima.findIndex(e => e.id === arrastando);
    const [movida] = proxima.splice(de, 1);
    const para = proxima.findIndex(e => e.id === alvoId);
    proxima.splice(pos === 'before' ? para : para + 1, 0, movida);
    setEtapas(proxima);
    setArrastando(null); setSobre(null);
    void api('', 'POST', { action: 'reorder_tarefa_statuses', ids: proxima.map(e => e.id) });
    toast('success', 'Ordem atualizada');
  }

  async function definirEntrada(id: number | null) {
    setEtapas(prev => prev.map(e => ({ ...e, is_entrada: e.id === id ? 1 : 0 })));
    await api('', 'POST', { action: 'set_entrada_tarefa_status', id });
  }

  // Conversão é exclusiva, então marcar uma limpa as outras - a tela reflete
  // isso na hora para a estrela não ficar acesa em dois lugares.
  async function definirConversao(id: number | null) {
    setEtapas(prev => prev.map(e => ({
      ...e,
      is_conclusao: e.id === id ? 1 : 0,
      is_excluded: e.id === id ? 0 : e.is_excluded,
    })));
    await api('', 'POST', { action: 'set_conversao_tarefa_status', id });
  }

  async function alternarDesconsiderada(id: number) {
    setEtapas(prev => prev.map(e => {
      if (e.id !== id) return e;
      const vira = e.is_excluded ? 0 : 1;
      return { ...e, is_excluded: vira, is_conclusao: vira ? 0 : e.is_conclusao };
    }));
    await api('', 'POST', { action: 'toggle_desconsiderada_tarefa_status', id });
  }

  if (loading) return <ConfiguracoesSkeleton />;

  const semConclusao = etapas.length > 0 && !etapas.some(e => e.is_conclusao);

  return (
    <div className="status-list">
      {semConclusao && (
        <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
          color: 'var(--red)', marginBottom: 4 }}>
          <IconAlert size={14} />
          Nenhuma etapa marcada como conversão: o percentual das entregas fica em zero.
        </p>
      )}

      {adicionando && (
        <div className="status-row status-row-new animate">
          <div className="status-row-bar">
            <div className="status-row-left">
              <span className="kanban-dot" style={{ background: novaCor, width: 12, height: 12 }} />
              <input
                className="status-name-input"
                placeholder="Nome da etapa…"
                value={novoNome}
                autoFocus
                onChange={e => setNovoNome(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void criar();
                  if (e.key === 'Escape') onFecharNova();
                }}
              />
            </div>
            <div className="status-row-actions">
              <button className="status-action-btn primary" onClick={() => void criar()}
                disabled={salvando || !novoNome.trim()}>
                {salvando ? '…' : 'Criar'}
              </button>
              <button className="status-action-btn" onClick={onFecharNova}>Cancelar</button>
            </div>
          </div>
          <div className="status-color-picker">
            {COLORS.map(c => (
              <button key={c} className={`color-swatch${novaCor === c ? ' active' : ''}`}
                style={{ background: c }} aria-label={`Cor ${c}`} onClick={() => setNovaCor(c)} />
            ))}
          </div>
        </div>
      )}

      {etapas.map(e => (
        <EtapaTarefaRow
          key={e.id}
          etapa={e}
          todas={etapas}
          token={token}
          isDragging={arrastando === e.id}
          dropIndicator={sobre?.id === e.id ? sobre.pos : null}
          onDragStart={() => setArrastando(e.id)}
          onDragOver={pos => setSobre({ id: e.id, pos })}
          onClearIndicator={() => setSobre(null)}
          onDrop={() => soltar(e.id)}
          onDragEnd={() => { setArrastando(null); setSobre(null); }}
          onUpdate={nova => setEtapas(prev => prev.map(x => (x.id === nova.id ? nova : x)))}
          onDelete={id => setEtapas(prev => prev.filter(x => x.id !== id))}
          onSetEntrada={id => void definirEntrada(id)}
          onSetConversao={id => void definirConversao(id)}
          onToggleDesconsiderada={id => void alternarDesconsiderada(id)}
        />
      ))}

      {etapas.length === 0 && !adicionando && (
        <div className="admin-empty" style={{ padding: '48px 0' }}>
          <p style={{ display: 'flex', justifyContent: 'center', color: 'var(--gray2)' }}><IconClipboard size={26} /></p>
          <p>Nenhuma etapa de tarefa configurada.</p>
        </div>
      )}
    </div>
  );
}


// ── Etiquetas de tarefa ───────────────────────────────
//
//  Mesma linha das etapas, com um campo a mais: a descrição, que aparece na
//  lista do formulário de tarefa e é o que separa "análise comercial" de "fora
//  de escopo" na hora de escolher.
//
//  A marcação de bloqueio é a única que muda o comportamento do sistema:
//  enquanto uma tarefa aberta carrega uma etiqueta assim, a entrega a que ela
//  pende aparece como bloqueada.

interface EtiquetaTarefa {
  id: number;
  nome: string;
  cor: string;
  descricao: string | null;
  ordem: number;
  bloqueia: number;
  papeis: string[];
}

/** Escolha múltipla dos papéis que enxergam a etiqueta, no formato dos outros
 *  botões da linha. Nada marcado é "todo mundo": obrigar a marcar os seis para
 *  dizer "sem restrição" seria trabalho para chegar ao estado que já é o padrão.
 *
 *  Como as etapas, este dropdown não fecha ao escolher - papel quase sempre vem
 *  em conjunto - e por isso tem dispensa própria: rolagem recoloca a lista em
 *  vez de fechá-la. */
function SeletorPapeis({ valor, onChange }: {
  valor: string[];
  onChange: (v: string[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const LARGURA = 190;
  const ALTURA = 8 + PAPEIS_EQUIPE.length * 36;

  const medir = useCallback(() => {
    const r = triggerRef.current!.getBoundingClientRect();
    const paraCima = window.innerHeight - r.bottom - 8 < ALTURA && r.top > ALTURA;
    return {
      top: paraCima ? r.top - ALTURA - 4 : r.bottom + 4,
      // Ancorado pela direita: o botão fica no fim da linha, e abrir para a
      // direita jogaria a lista para fora da tela.
      left: Math.max(8, Math.min(r.right - LARGURA, window.innerWidth - LARGURA - 8)),
    };
  }, [ALTURA]);

  useEffect(() => {
    if (!aberto) return;
    const dentro = (alvo: Node | null) => !!alvo
      && (triggerRef.current?.contains(alvo) || dropRef.current?.contains(alvo));
    const aoClicar = (e: MouseEvent) => { if (!dentro(e.target as Node)) setAberto(false); };
    const recolocar = (e?: Event) => {
      if (e && dropRef.current?.contains(e.target as Node)) return;
      setPos(medir());
    };
    document.addEventListener('mousedown', aoClicar);
    window.addEventListener('scroll', recolocar, true);
    window.addEventListener('resize', recolocar);
    return () => {
      document.removeEventListener('mousedown', aoClicar);
      window.removeEventListener('scroll', recolocar, true);
      window.removeEventListener('resize', recolocar);
    };
  }, [aberto, medir]);

  // O rótulo diz o estado sem precisar abrir: quem vê, ou "todos".
  const rotulo = valor.length === 0
    ? 'Todos'
    : valor.length <= 2 ? valor.join(', ') : `${valor[0]} +${valor.length - 1}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="status-action-btn"
        aria-expanded={aberto}
        title={valor.length === 0
          ? 'Quem vê esta etiqueta: todos os papéis da equipe'
          : `Quem vê esta etiqueta: ${valor.join(', ')}`}
        onClick={() => { setPos(medir()); setAberto(a => !a); }}
        style={valor.length > 0
          ? { borderColor: 'var(--yellow)', color: 'var(--black)' }
          : undefined}
      >
        <IconUser size={12} />
        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {rotulo}
        </span>
        <span aria-hidden="true" style={{
          display: 'inline-flex', color: 'var(--gray2)',
          transform: aberto ? 'rotate(180deg)' : 'none',
          transition: 'transform var(--transition)',
        }}>
          <IconChevronDown size={11} />
        </span>
      </button>

      {aberto && createPortal(
        <div ref={dropRef} className="status-select-dropdown"
          role="listbox" aria-multiselectable="true"
          style={{ top: pos.top, left: pos.left, width: LARGURA, zIndex: 10002 }}>
          {PAPEIS_EQUIPE.map(p => {
            const ativo = valor.includes(p);
            return (
              <div key={p} role="option" aria-selected={ativo}
                className={`status-select-option${ativo ? ' active' : ''}`}
                onClick={() => onChange(ativo ? valor.filter(x => x !== p) : [...valor, p])}>
                <span style={{ flex: 1 }}>{p}</span>
                <span aria-hidden="true" style={{
                  display: 'inline-flex', color: 'var(--yellow)',
                  visibility: ativo ? 'visible' : 'hidden',
                }}>
                  <IconCheck size={13} />
                </span>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

function EtiquetaTarefaRow({
  etiqueta, token, isDragging, dropIndicator,
  onDragStart, onDragOver, onClearIndicator, onDrop, onDragEnd,
  onUpdate, onDelete, onToggleBloqueio, porPapel,
}: {
  etiqueta: EtiquetaTarefa;
  token: string;
  /** Só desenha a escolha de papéis quando a regra está ligada. */
  porPapel: boolean;
  isDragging: boolean;
  dropIndicator: 'before' | 'after' | null;
  onDragStart: () => void;
  onDragOver: (pos: 'before' | 'after') => void;
  onClearIndicator: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onUpdate: (e: EtiquetaTarefa) => void;
  onDelete: (id: number) => void;
  onToggleBloqueio: (id: number) => void;
}) {
  const api = useApi(token);
  const { toast } = useToast();
  const corDotRef = useRef<HTMLButtonElement>(null);
  const paletaRef = useRef<HTMLDivElement>(null);

  const [editandoNome, setEditandoNome] = useState(false);
  const [editandoDesc, setEditandoDesc] = useState(false);
  const [nome, setNome] = useState(etiqueta.nome);
  const [cor, setCor] = useState(etiqueta.cor);
  const [descricao, setDescricao] = useState(etiqueta.descricao ?? '');
  const [paletaPos, setPaletaPos] = useState<{ top: number; left: number } | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [emUso, setEmUso] = useState(0);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    setNome(etiqueta.nome); setCor(etiqueta.cor); setDescricao(etiqueta.descricao ?? '');
  }, [etiqueta.nome, etiqueta.cor, etiqueta.descricao]);

  useEffect(() => {
    if (!paletaPos) return;
    function fora(e: MouseEvent) {
      if (corDotRef.current?.contains(e.target as Node)) return;
      if (paletaRef.current?.contains(e.target as Node)) return;
      setPaletaPos(null);
    }
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [paletaPos]);

  async function salvar(novoNome: string, novaCor: string, novaDesc: string, papeis = etiqueta.papeis) {
    const limpo = novoNome.trim();
    if (!limpo) { setNome(etiqueta.nome); return; }
    const r = await api('', 'POST', {
      action: 'update_tarefa_etiqueta', id: etiqueta.id,
      nome: limpo, cor: novaCor, descricao: novaDesc, papeis,
    });
    if (r?.error) {
      toast('error', 'Não foi possível salvar', r.error);
      setNome(etiqueta.nome); setDescricao(etiqueta.descricao ?? '');
      return;
    }
    onUpdate({ ...etiqueta, nome: limpo, cor: novaCor, descricao: novaDesc.trim() || null, papeis });
    if (r?.tocadas) toast('success', 'Etiqueta renomeada', `${r.tocadas} tarefa(s) atualizada(s).`);
  }

  async function excluir() {
    setExcluindo(true);
    try {
      const r = await api('', 'POST', { action: 'delete_tarefa_etiqueta', id: etiqueta.id });
      if (r?.error) { toast('error', 'Não foi possível excluir', r.error); return; }
      setConfirmar(false);
      onDelete(etiqueta.id);
      toast('success', 'Etiqueta excluída',
        r.tocadas ? `Saiu de ${r.tocadas} tarefa(s).` : undefined);
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div
      className={`status-row${isDragging ? ' status-row-dragging' : ''}${dropIndicator ? ' status-row-drop-target' : ''}`}
      draggable={!editandoNome && !editandoDesc}
      style={{
        cursor: editandoNome || editandoDesc ? 'default' : 'grab',
        boxShadow: dropIndicator === 'before'
          ? 'inset 0 3px 0 0 var(--yellow)'
          : dropIndicator === 'after'
          ? 'inset 0 -3px 0 0 var(--yellow)'
          : undefined,
      }}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      onDragOver={e => {
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onDragOver(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
      }}
      onDragLeave={e => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) onClearIndicator();
      }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
    >
      <div className="status-row-bar">
        <div className="status-row-left">
          <div className="drag-handle-dots"><IconArrastar size={14} /></div>

          <button ref={corDotRef} className="status-color-dot-btn" title="Alterar cor"
            aria-label={`Alterar a cor de ${etiqueta.nome}`}
            onClick={() => {
              const r = corDotRef.current!.getBoundingClientRect();
              setPaletaPos({ top: r.bottom + 6, left: Math.max(8, r.left - 6) });
            }}>
            <span className="kanban-dot" style={{ background: cor, width: 12, height: 12 }} />
          </button>

          {editandoNome ? (
            // Enquanto edita, o campo para de crescer: com `flex: 1` ele
            // engoliria o espaço da descrição, que fica na mesma linha.
            <input className="status-name-input" value={nome} autoFocus
              style={{ flex: '0 1 320px' }}
              onChange={e => setNome(e.target.value)}
              onClick={e => e.stopPropagation()}
              onBlur={() => { setEditandoNome(false); void salvar(nome, cor, descricao); }}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { setNome(etiqueta.nome); setEditandoNome(false); }
              }} />
          ) : (
            // O nome fica do tamanho que precisa; quem estica é a descrição.
            <span className="status-name" title="Clique para renomear"
              style={{ flex: '0 1 auto' }}
              onClick={e => { e.stopPropagation(); setEditandoNome(true); }}>
              {nome}
            </span>
          )}

          {/* A descrição ao lado do nome, e não embaixo: ela é a continuação da
              frase que o nome começa, e numa linha só a lista se lê de cima a
              baixo sem o olho descer e voltar. */}
          {editandoDesc ? (
            <input className="status-name-input" value={descricao} autoFocus
              placeholder="O que esta etiqueta quer dizer"
              style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500 }}
              onChange={e => setDescricao(e.target.value)}
              onClick={e => e.stopPropagation()}
              onBlur={() => { setEditandoDesc(false); void salvar(nome, cor, descricao); }}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { setDescricao(etiqueta.descricao ?? ''); setEditandoDesc(false); }
              }} />
          ) : (
            <span title="Clique para editar a descrição"
              onClick={e => { e.stopPropagation(); setEditandoDesc(true); }}
              style={{
                flex: 1, minWidth: 0, fontSize: 12, cursor: 'text',
                color: descricao ? 'var(--gray2)' : 'var(--gray3)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
              {descricao || 'Sem descrição'}
            </span>
          )}
        </div>

        <div className="status-row-right" onClick={e => e.stopPropagation()}>
          {porPapel && (
            <SeletorPapeis valor={etiqueta.papeis}
              onChange={p => void salvar(nome, cor, descricao, p)} />
          )}

          <button className="status-action-btn"
            title={etiqueta.bloqueia
              ? 'Trava a entrega: enquanto uma tarefa aberta tiver esta etiqueta, a entrega dela aparece como bloqueada'
              : 'Marcar como etiqueta de bloqueio'}
            aria-pressed={!!etiqueta.bloqueia}
            style={etiqueta.bloqueia ? { color: 'var(--red)', background: 'rgba(217,48,37,0.1)' } : {}}
            onClick={() => onToggleBloqueio(etiqueta.id)}>
            <IconAlertOctagon size={12} />
          </button>

          <button className="status-action-btn danger" title="Excluir etiqueta"
            aria-label={`Excluir ${etiqueta.nome}`}
            onClick={async () => {
              const r = await api(`?action=tarefa_etiqueta_uso&nome=${encodeURIComponent(etiqueta.nome)}`);
              setEmUso(Number(r?.count ?? 0));
              setConfirmar(true);
            }}>
            <IconTrash size={12} />
          </button>
        </div>
      </div>



      {paletaPos && createPortal(
        <div ref={paletaRef} className="status-color-picker-popover"
          style={{ position: 'fixed', top: paletaPos.top, left: paletaPos.left }}>
          {COLORS.map(c => (
            <button key={c} className={`color-swatch${cor === c ? ' active' : ''}`}
              style={{ background: c }} aria-label={`Cor ${c}`}
              onClick={() => { setCor(c); setPaletaPos(null); void salvar(nome, c, descricao); }} />
          ))}
        </div>,
        document.body
      )}

      {confirmar && createPortal(
        <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setConfirmar(false)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <p className="delete-confirm-title">Excluir etiqueta?</p>
            <p className="delete-confirm-desc">
              <strong>{etiqueta.nome}</strong>{' '}
              {emUso > 0
                ? `sai de ${emUso} tarefa(s). Elas continuam onde estão, só perdem esta etiqueta.`
                : 'não está em nenhuma tarefa.'}
            </p>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setConfirmar(false)}>Cancelar</button>
              <button className="delete-confirm-ok" disabled={excluindo} onClick={() => void excluir()}>
                {excluindo ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function EtiquetasTarefaTab({ token, adicionando, onFecharNova }: {
  token: string;
  adicionando: boolean;
  onFecharNova: () => void;
}) {
  const api = useApi(token);
  const { toast } = useToast();
  const [etiquetas, setEtiquetas] = useState<EtiquetaTarefa[]>([]);
  const [porPapel, setPorPapel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novaCor, setNovaCor] = useState(COLORS[0]);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<{ id: number; pos: 'before' | 'after' } | null>(null);

  useEffect(() => {
    let vivo = true;
    api('?action=tarefa_etiquetas').then(r => {
      if (vivo) {
        setEtiquetas(r?.etiquetas ?? []);
        setPorPapel(!!r?.porPapel);
        setLoading(false);
      }
    });
    return () => { vivo = false; };
  }, [api]);

  async function criar() {
    const nome = novoNome.trim();
    if (!nome) return;
    setSalvando(true);
    try {
      const r = await api('', 'POST', { action: 'create_tarefa_etiqueta', nome, cor: novaCor });
      if (r?.error) { toast('error', 'Não foi possível criar', r.error); return; }
      setEtiquetas(prev => [...prev, r.etiqueta]);
      setNovoNome(''); setNovaCor(COLORS[0]);
      onFecharNova();
      toast('success', 'Etiqueta criada', 'Escreva a descrição dela na própria linha.');
    } finally {
      setSalvando(false);
    }
  }

  function soltar(alvoId: number) {
    if (arrastando === null || arrastando === alvoId) { setArrastando(null); setSobre(null); return; }
    const pos = sobre?.pos ?? 'before';
    const proxima = [...etiquetas];
    const de = proxima.findIndex(e => e.id === arrastando);
    const [movida] = proxima.splice(de, 1);
    const para = proxima.findIndex(e => e.id === alvoId);
    proxima.splice(pos === 'before' ? para : para + 1, 0, movida);
    setEtiquetas(proxima);
    setArrastando(null); setSobre(null);
    void api('', 'POST', { action: 'reorder_tarefa_etiquetas', ids: proxima.map(e => e.id) });
    toast('success', 'Ordem atualizada');
  }

  async function alternarRegra() {
    const ligado = !porPapel;
    setPorPapel(ligado);
    const r = await api('', 'POST', { action: 'set_etiquetas_por_papel', ligado });
    if (r?.error) { setPorPapel(!ligado); toast('error', 'Não foi possível salvar', r.error); return; }
    toast('success', ligado ? 'Regra ligada' : 'Regra desligada',
      ligado
        ? 'Cada etiqueta passa a aparecer só para os papéis marcados.'
        : 'Todas as etiquetas voltam a aparecer para todo mundo.');
  }

  async function alternarBloqueio(id: number) {
    setEtiquetas(prev => prev.map(e => (e.id === id ? { ...e, bloqueia: e.bloqueia ? 0 : 1 } : e)));
    await api('', 'POST', { action: 'toggle_bloqueio_tarefa_etiqueta', id });
  }

  if (loading) return <ConfiguracoesSkeleton />;

  return (
    <div className="status-list">
      {/* A regra vive aqui em cima, e não numa marcação por etiqueta: ela vale
          para a lista inteira, e cada linha só diz quem a vê. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
        border: '1px solid var(--gray3)', borderRadius: 'var(--radius-md)',
        background: porPapel ? 'var(--yd)' : 'var(--bg)',
        transition: 'background var(--transition), border-color var(--transition)',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--black)', margin: 0 }}>
            Mostrar etiquetas conforme o papel na equipe
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--gray2)', margin: '3px 0 0', lineHeight: 1.45 }}>
            Ligada, cada etiqueta só aparece para quem tem um dos papéis marcados nela, e o papel
            é o daquele projeto. Quem não está na equipe do projeto continua vendo todas.
            Etiqueta já aplicada não sai da tarefa.
          </p>
        </div>
        <button type="button" role="switch" aria-checked={porPapel}
          onClick={() => void alternarRegra()}
          aria-label="Mostrar etiquetas conforme o papel na equipe"
          style={{
            flexShrink: 0, width: 42, height: 24, padding: 3, borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--gray3)', cursor: 'pointer',
            background: porPapel ? 'var(--yellow)' : 'var(--gray3)',
            transition: 'background var(--transition-spring)',
          }}>
          <span style={{
            display: 'block', width: 16, height: 16, borderRadius: '50%',
            background: 'var(--white)', boxShadow: '0 1px 2px rgba(0,0,0,.2)',
            transform: porPapel ? 'translateX(18px)' : 'none',
            transition: 'transform var(--transition-spring)',
          }} />
        </button>
      </div>

      {adicionando && (
        <div className="status-row status-row-new animate">
          <div className="status-row-bar">
            <div className="status-row-left">
              <span className="kanban-dot" style={{ background: novaCor, width: 12, height: 12 }} />
              <input className="status-name-input" placeholder="Nome da etiqueta…"
                value={novoNome} autoFocus
                onChange={e => setNovoNome(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void criar();
                  if (e.key === 'Escape') onFecharNova();
                }} />
            </div>
            <div className="status-row-actions">
              <button className="status-action-btn primary" onClick={() => void criar()}
                disabled={salvando || !novoNome.trim()}>
                {salvando ? '…' : 'Criar'}
              </button>
              <button className="status-action-btn" onClick={onFecharNova}>Cancelar</button>
            </div>
          </div>
          <div className="status-color-picker">
            {COLORS.map(c => (
              <button key={c} className={`color-swatch${novaCor === c ? ' active' : ''}`}
                style={{ background: c }} aria-label={`Cor ${c}`} onClick={() => setNovaCor(c)} />
            ))}
          </div>
        </div>
      )}

      {etiquetas.map(e => (
        <EtiquetaTarefaRow
          key={e.id}
          etiqueta={e}
          token={token}
          isDragging={arrastando === e.id}
          dropIndicator={sobre?.id === e.id ? sobre.pos : null}
          onDragStart={() => setArrastando(e.id)}
          onDragOver={pos => setSobre({ id: e.id, pos })}
          onClearIndicator={() => setSobre(null)}
          onDrop={() => soltar(e.id)}
          onDragEnd={() => { setArrastando(null); setSobre(null); }}
          onUpdate={nova => setEtiquetas(prev => prev.map(x => (x.id === nova.id ? nova : x)))}
          onDelete={id => setEtiquetas(prev => prev.filter(x => x.id !== id))}
          onToggleBloqueio={id => void alternarBloqueio(id)}
          porPapel={porPapel}
        />
      ))}

      {etiquetas.length === 0 && !adicionando && (
        <div className="admin-empty" style={{ padding: '48px 0' }}>
          <p style={{ display: 'flex', justifyContent: 'center', color: 'var(--gray2)' }}><IconClipboard size={26} /></p>
          <p>Nenhuma etiqueta configurada.</p>
        </div>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────
type ConfigTab = 'etapas' | 'integracoes';

/** Qual quadro está sendo configurado. São duas listas de etapas independentes
 *  - o funil das leads e o quadro de tarefas - e o switcher escolhe uma. */
type EscopoEtapas = 'funil' | 'tarefas';

export default function ConfiguracoesPage({ token }: { token: string }) {
  const api = useApi(token);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ConfigTab>('etapas');
  const [escopo, setEscopo] = useState<EscopoEtapas>('funil');
  const [addingTarefa, setAddingTarefa] = useState(false);
  const [addingEtiqueta, setAddingEtiqueta] = useState(false);
  const [statuses, setStatuses] = useState<StatusConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newNome, setNewNome] = useState('');
  const [newCor, setNewCor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<{ id: number; pos: 'before' | 'after' } | null>(null);

  async function load() {
    setLoading(true);
    const data = await api('?action=status_configs');
    setStatuses(data.statuses ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSetConversion(id: number | null) {
    await api('', 'POST', { action: 'set_conversion_status', id });
    setStatuses(prev => prev.map(s => ({ ...s, is_conversion: s.id === id ? 1 : 0 })));
    toast('success', id ? 'Etapa de conversão definida' : 'Marcação de conversão removida');
  }

  async function handleSetEntrada(id: number | null) {
    await api('', 'POST', { action: 'set_entrada_status', id });
    setStatuses(prev => prev.map(s => ({ ...s, is_entrada: s.id === id ? 1 : 0 })));
    toast('success', id ? 'Etapa de entrada definida' : 'Marcação de entrada removida');
  }

  async function handleToggleExcluded(id: number) {
    const res = await api('', 'POST', { action: 'toggle_excluded_status', id });
    const nowExcluded = res?.is_excluded === 1;
    setStatuses(prev => prev.map(s => ({ ...s, is_excluded: s.id === id ? (nowExcluded ? 1 : 0) : s.is_excluded })));
    toast('success', nowExcluded ? 'Etapa marcada como desconsiderada' : 'Marcação removida');
  }

  async function handleToggleRequiresPendencia(id: number) {
    const res = await api('', 'POST', { action: 'toggle_requires_pendencia', id });
    const now = res?.requires_pendencia === 1;
    setStatuses(prev => prev.map(s => ({ ...s, requires_pendencia: s.id === id ? (now ? 1 : 0) : s.requires_pendencia })));
    toast('success', now ? 'Etapa passa a exigir pendências' : 'Exigência de pendências removida');
  }

  async function createStatus() {
    if (!newNome.trim()) return;
    setSaving(true);
    const data = await api('', 'POST', { action: 'create_status', nome: newNome.trim(), cor: newCor });
    setStatuses(prev => [...prev, data.status]);
    setNewNome('');
    setNewCor(COLORS[0]);
    setAdding(false);
    setSaving(false);
    toast('success', 'Etapa criada');
  }

  function handleDrop(targetId: number) {
    if (draggedId === null || draggedId === targetId) { setDragOver(null); return; }
    const pos = dragOver?.pos ?? 'after';
    const next = [...statuses];
    const fromIdx = next.findIndex(s => s.id === draggedId);
    let toIdx = next.findIndex(s => s.id === targetId);
    const [moved] = next.splice(fromIdx, 1);
    toIdx = next.findIndex(s => s.id === targetId);
    next.splice(pos === 'before' ? toIdx : toIdx + 1, 0, moved);
    setStatuses(next);
    setDraggedId(null);
    setDragOver(null);
    api('', 'POST', { action: 'reorder_statuses', ids: next.map(s => s.id) });
    toast('success', 'Ordem atualizada');
  }

  return (
    <div className="admin-content-wrap">
      <Abas
        valor={activeTab}
        onChange={setActiveTab}
        opcoes={[{ valor: 'etapas', label: 'Etapas' }, { valor: 'integracoes', label: 'Integrações' }]}
      />

      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">
            {activeTab === 'etapas' ? 'Etapas' : 'Integrações'}
          </h1>
          <p className="admin-page-desc">
            {activeTab === 'integracoes'
              ? 'Conecte ferramentas externas ao sistema.'
              : escopo === 'funil'
              ? 'Gerencie as etapas do funil e as notificações de cada uma.'
              : 'Gerencie as colunas e as etiquetas do quadro de tarefas.'}
          </p>
        </div>
        {activeTab === 'etapas' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <SegSwitch
              valor={escopo}
              onChange={setEscopo}
              opcoes={[{ valor: 'funil', label: 'Funil' }, { valor: 'tarefas', label: 'Tarefas' }]}
            />
            {/* A aba Tarefas tem duas listas, e cada uma ganha o próprio "+"
                no cabeçalho da sua seção. Um botão só aqui em cima teria que
                escolher a qual das duas ele serve. */}
            {escopo === 'funil' && !loading && !adding && (
              <button className="btn btn-primary" onClick={() => setAdding(true)} style={{ whiteSpace: 'nowrap' }}>
                + Nova etapa
              </button>
            )}
          </div>
        )}
      </div>

      <AbaPainel key={`${activeTab}-${escopo}`} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {activeTab === 'integracoes' ? (
        <IntegracoesTab token={token} />
      ) : escopo === 'tarefas' ? (
        <>
          {/* Cada seção vem dentro do próprio bloco. Soltas, o título e a lista
              dele eram irmãos no `.admin-content-wrap`, que é uma coluna com
              20px de vão - e esse vão entrava entre o título e a sua lista. */}
          <div>
            <div className="admin-section-head" style={{ marginBottom: 6 }}>
              <p className="admin-section-title">Etapas do quadro</p>
              <button type="button" className="secao-add" onClick={() => setAddingTarefa(true)}
                title="Nova etapa" aria-label="Nova etapa">
                <IconPlus size={14} />
              </button>
            </div>
            <EtapasTarefaTab token={token} adicionando={addingTarefa}
              onFecharNova={() => setAddingTarefa(false)} />
          </div>

          <div>
            <div className="admin-section-head" style={{ marginBottom: 6 }}>
              <p className="admin-section-title">Etiquetas</p>
              <button type="button" className="secao-add" onClick={() => setAddingEtiqueta(true)}
                title="Nova etiqueta" aria-label="Nova etiqueta">
                <IconPlus size={14} />
              </button>
            </div>
            <EtiquetasTarefaTab token={token} adicionando={addingEtiqueta}
              onFecharNova={() => setAddingEtiqueta(false)} />
          </div>
        </>
      ) : loading ? (
        <ConfiguracoesSkeleton />
      ) : (
      <>
        <NovaNotificacaoSection token={token} />

        <div className="status-list">

          {adding && (
            <div className="status-row status-row-new animate">
              <div className="status-row-bar">
                <div className="status-row-left">
                  <span className="kanban-dot" style={{ background: newCor, width: 12, height: 12 }} />
                  <input
                    className="status-name-input"
                    placeholder="Nome da etapa…"
                    value={newNome}
                    onChange={e => setNewNome(e.target.value)}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') createStatus(); if (e.key === 'Escape') setAdding(false); }}
                  />
                </div>
                <div className="status-row-actions">
                  <button className="status-action-btn primary" onClick={createStatus} disabled={saving || !newNome.trim()}>
                    {saving ? '…' : 'Criar'}
                  </button>
                  <button className="status-action-btn" onClick={() => setAdding(false)}>Cancelar</button>
                </div>
              </div>
              <div className="status-color-picker">
                {COLORS.map(c => (
                  <button key={c} className={`color-swatch${newCor === c ? ' active' : ''}`} style={{ background: c }} onClick={() => setNewCor(c)} />
                ))}
              </div>
            </div>
          )}

          {statuses.map(st => (
            <StatusRow
              key={st.id}
              status={st}
              token={token}
              allStatuses={statuses}
              isDragging={draggedId === st.id}
              dropIndicator={dragOver?.id === st.id ? dragOver.pos : null}
              onDragStart={() => setDraggedId(st.id)}
              onDragOver={pos => setDragOver({ id: st.id, pos })}
              onClearIndicator={() => setDragOver(null)}
              onDrop={() => handleDrop(st.id)}
              onDragEnd={() => { setDraggedId(null); setDragOver(null); }}
              onUpdate={updated => setStatuses(prev => prev.map(s => s.id === updated.id ? updated : s))}
              onDelete={id => setStatuses(prev => prev.filter(s => s.id !== id))}
              onAddStatus={s => setStatuses(prev => [...prev, s])}
              onSetConversion={handleSetConversion}
              onSetEntrada={handleSetEntrada}
              onToggleExcluded={handleToggleExcluded}
              onToggleRequiresPendencia={handleToggleRequiresPendencia}
            />
          ))}

          {statuses.length === 0 && !adding && (
            <div className="admin-empty" style={{ padding: '48px 0' }}>
              <p style={{ display: 'flex', justifyContent: 'center', color: 'var(--gray2)' }}><IconClipboard size={26} /></p>
              <p>Nenhuma etapa configurada ainda.</p>
              <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => setAdding(true)}>
                Criar primeira etapa
              </button>
            </div>
          )}
        </div>
      </>
      )}
      </AbaPainel>
    </div>
  );
}
