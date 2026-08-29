import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

import type { StatusConfig, SlackUser, Notificacao, NovaNotificacao, CadastroEtapaConfig } from './types';
import { useToast, useAuth } from './AdminApp';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { DepsMark } from '../components/DepsMark';
import { descreveProdutoDeps, PRODUTO_PJ_DEFAULT } from '../lib/depsProdutos';
import { IconClipboard, IconAlert, IconCheck } from '../components/icons';
import { SegSwitch } from '../components/SegSwitch';

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
    setOpen(true);
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

// ── Slack users dropdown ─────────────────────────────
function SlackUserDropdown({
  token, onSelect, exclude, compact,
}: {
  token: string;
  onSelect: (user: SlackUser) => void;
  exclude: string[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<SlackUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  async function fetchUsers() {
    if (users.length) return;
    setLoading(true);
    try {
      const r = await fetch('/api/slack-users', { headers: { 'x-admin-session': token } });
      const data = await r.json();
      setUsers(data.users ?? []);
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

  const filtered = users
    .filter(u => !exclude.includes(u.id))
    .filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <button ref={btnRef} className={`slack-add-btn${compact ? ' compact' : ''}`} onClick={toggle} title={compact ? 'Adicionar usuário' : undefined}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        {!compact && 'Adicionar usuário'}
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          className="slack-dropdown"
          style={{ position: 'fixed', top: pos.top, left: pos.left, right: pos.right }}
        >
          <input
            className="slack-search"
            placeholder="Buscar…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div className="slack-list">
            {loading && <div className="dux-spinner-row" style={{ padding: '12px 0' }}><span className="dux-spinner sm" /></div>}
            {!loading && filtered.length === 0 && <p className="slack-list-empty">Nenhum usuário</p>}
            {filtered.map(u => (
              <div key={u.id} className="slack-list-item" onClick={() => { onSelect(u); setOpen(false); setSearch(''); }}>
                {u.avatar
                  ? <img src={u.avatar} alt="" className="slack-avatar" />
                  : <div className="slack-avatar-placeholder">{u.name[0]}</div>
                }
                <div>
                  <p className="slack-user-name">{u.name}</p>
                  <p className="slack-user-handle">@{u.username}</p>
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

// ── Nova solicitação notification section ────────────
function NovaNotificacaoSection({ token }: { token: string }) {
  const api = useApi(token);
  const [notifs, setNotifs] = useState<NovaNotificacao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('?action=nova_solicitacao_notifs').then(d => {
      setNotifs(d.notificacoes ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function addNotif(user: SlackUser) {
    const data = await api('', 'POST', {
      action: 'add_nova_solicitacao_notif',
      slack_user_id: user.id,
      slack_user_name: user.name,
      slack_user_avatar: user.avatar,
    });
    if (data.notificacao) setNotifs(prev => [...prev, data.notificacao]);
  }

  async function removeNotif(id: number) {
    await api('', 'POST', { action: 'remove_nova_solicitacao_notif', id });
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
          <p className="nova-notif-title">Nova solicitação recebida</p>
          <p className="nova-notif-desc">Notificar no Slack quando um formulário for submetido</p>
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
                {n.slack_user_avatar
                  ? <img src={n.slack_user_avatar} alt="" className="slack-avatar-sm" />
                  : <div className="slack-avatar-sm slack-avatar-placeholder" style={{ fontSize: 10 }}>{n.slack_user_name[0]}</div>
                }
                <span>{n.slack_user_name}</span>
                <button onClick={() => removeNotif(n.id)}>×</button>
              </div>
            ))}
          </div>
          <SlackUserDropdown
            token={token}
            onSelect={addNotif}
            exclude={notifs.map(n => n.slack_user_id)}
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
      toast('success', `${res.moved ?? 0} solicitação(ões) movida(s) e etapa excluída`);
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

  async function addNotif(user: SlackUser) {
    const data = await api('', 'POST', {
      action: 'add_notificacao',
      status_id: status.id,
      slack_user_id: user.id,
      slack_user_name: user.name,
      slack_user_avatar: user.avatar,
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
                {n.slack_user_avatar
                  ? <img src={n.slack_user_avatar} alt="" className="slack-avatar-sm" />
                  : <div className="slack-avatar-sm slack-avatar-placeholder" style={{ fontSize: 10 }}>{n.slack_user_name[0]}</div>
                }
                <span>{n.slack_user_name}</span>
                <button onClick={() => removeNotif(n.id)}>×</button>
              </div>
            ))}
          </div>

          <SlackUserDropdown
            token={token}
            onSelect={addNotif}
            exclude={notifs.map(n => n.slack_user_id)}
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
                <li>Solicitações enviadas pelo <em>formulário</em> caem nesta etapa. Só uma etapa pode ter essa marcação.</li>
                <li>Também é a etapa sugerida ao criar uma solicitação pelo painel.</li>
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
                <li>Define qual etapa representa uma operação <em>realizada</em> na Liquidez. Só uma etapa pode ter essa marcação.</li>
                <li>Solicitações nesta etapa são <em>ocultadas</em> no seletor de aceite do sacado.</li>
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
                <li>Solicitações nesta etapa <em>não são contabilizadas</em> na Liquidez - nem em previsão nem em realização.</li>
                <li>Também são <em>ocultadas</em> no seletor de aceite do sacado.</li>
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
              <strong>{status.nome}</strong> tem <strong>{moveModal.count}</strong> solicitação(ões). Para qual etapa deseja movê-las?
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
const SLACK_COLOR = '#4A154B';
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

// Logomarca da Claude (spark/sunburst) - recriada em SVG, na laranja da marca.
// 12 raios com comprimentos alternados (aspecto orgânico do símbolo da Claude).
function ClaudeLogo({ size = 20, color = CLAUDE_ORANGE }: { size?: number; color?: string }) {
  const cx = 12, cy = 12, inner = 1.8;
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 - 90) * Math.PI / 180;
    const outer = i % 2 === 0 ? 10 : 7.6;
    return {
      x1: cx + inner * Math.cos(a), y1: cy + inner * Math.sin(a),
      x2: cx + outer * Math.cos(a), y2: cy + outer * Math.sin(a),
    };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      {rays.map((r, i) => (
        <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={color} strokeWidth="1.9" strokeLinecap="round" />
      ))}
    </svg>
  );
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
function AnthropicIntegrationCard({ api }: { api: ReturnType<typeof useApi> }) {
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

  return (
    <div className={`integration-card${expanded ? ' expanded' : ''}`}>
      <div className="integration-card-row" onClick={() => setExpanded(v => !v)}>
        <div className="integration-logo" style={{ background: `${CLAUDE_ORANGE}14`, border: `1px solid ${CLAUDE_ORANGE}30` }}>
          <ClaudeLogo size={24} />
        </div>

        <div className="integration-info">
          <div className="integration-title">
            Anthropic (Claude)
            {loading ? null : connected ? (
              <span className="integration-badge connected">
                <span className="live-dot" />
                Conectado
              </span>
            ) : hasKey ? (
              <span className="integration-badge disconnected" title={connError ?? undefined}>
                Chave inválida
              </span>
            ) : (
              <span className="integration-badge disconnected">Não conectado</span>
            )}
          </div>
          <div className="integration-desc">
            IA que orquestra a análise de crédito - lê os relatórios e sugere um parecer na etapa Decisão.
          </div>
        </div>

        <svg
          className={`integration-chevron${expanded ? ' open' : ''}`}
          width="14" height="14" viewBox="0 0 24 24" fill="none"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {expanded && (
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
      )}
    </div>
  );
}

// ── DEPS (bureau de crédito) ─────────────────────────
// Card informativo. As credenciais da DEPS ficam em variáveis de ambiente (como
// as do Slack), então aqui não há formulário: só o estado da conexão, a conta em
// uso e os produtos configurados. Nada é editável nem enviado ao servidor.
const DEPS_NAVY = '#1B2A4E';

interface DepsConfig {
  has_credentials: boolean;
  email: string;
  produto_pj: string;
  produto_pf: string;
}

function DepsIntegrationCard({ api }: { api: ReturnType<typeof useApi> }) {
  const [cfg, setCfg] = useState<DepsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    api('?action=deps_config')
      .then(d => { setCfg(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const connected = !!cfg?.has_credentials;

  // Sem DEPS_PRODUTO_PJ no ambiente, a consulta cai no default do backend.
  const produtoPj = cfg?.produto_pj
    ? descreveProdutoDeps(cfg.produto_pj)
    : `${descreveProdutoDeps(PRODUTO_PJ_DEFAULT)} (padrão)`;

  const rows: { label: string; value: string }[] = [
    { label: 'Conta (e-mail)', value: cfg?.email || '-' },
    { label: 'Senha', value: connected ? '••••••••••••' : '-' },
    { label: 'Produto PJ (CNPJ)', value: produtoPj },
    { label: 'Produto PF (CPF)', value: cfg?.produto_pf ? descreveProdutoDeps(cfg.produto_pf) : 'Não configurado' },
  ];

  return (
    <div className={`integration-card${expanded ? ' expanded' : ''}`}>
      <div className="integration-card-row" onClick={() => setExpanded(v => !v)}>
        <div className="integration-logo" style={{ background: `${DEPS_NAVY}0F`, border: `1px solid ${DEPS_NAVY}26` }}>
          <DepsMark size={22} />
        </div>

        <div className="integration-info">
          <div className="integration-title">
            DEPS
            {loading ? null : connected ? (
              <span className="integration-badge connected">
                <span className="live-dot" />
                Conectado
              </span>
            ) : (
              <span className="integration-badge disconnected">Não conectado</span>
            )}
          </div>
          <div className="integration-desc">
            Bureau de crédito - score, restritivos e protestos consultados na análise de crédito.
          </div>
        </div>

        <svg
          className={`integration-chevron${expanded ? ' open' : ''}`}
          width="14" height="14" viewBox="0 0 24 24" fill="none"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {expanded && (
        <div className="integration-form">
          {rows.map(r => (
            <div className="integration-form-group" key={r.label}>
              <label className="integration-label">{r.label}</label>
              <div className="integration-input-wrap">
                <input className="integration-input readonly" value={r.value} readOnly tabIndex={-1} />
              </div>
            </div>
          ))}

          <p className="integration-hint">
            Credenciais gerenciadas por variáveis de ambiente - <strong>DEPS_EMAIL</strong>, <strong>DEPS_SENHA</strong>,
            {' '}<strong>DEPS_PRODUTO_PJ</strong> e <strong>DEPS_PRODUTO_PF</strong>. Para trocá-las, edite o ambiente
            do projeto e faça um novo deploy.
          </p>
          <p className="integration-hint">
            Cada consulta nova tem custo. O sistema tenta reaproveitar a última análise válida do histórico da DEPS
            antes de gerar uma nova, e pede confirmação quando não há o que reaproveitar.
          </p>
        </div>
      )}
    </div>
  );
}

function IntegracoesTab({ token: sessionToken }: { token: string }) {
  const api = useApi(sessionToken);
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api('?action=slack_config').then(d => {
      setHasToken(!!d.has_token);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function save() {
    if (!token.trim()) return;
    setSaving(true);
    await api('', 'POST', { action: 'save_slack_token', token: token.trim() });
    setHasToken(true);
    setToken('');
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function remove() {
    if (!confirm('Remover integração com o Slack?')) return;
    setRemoving(true);
    await api('', 'POST', { action: 'remove_slack_token' });
    setHasToken(false);
    setExpanded(false);
    setRemoving(false);
  }

  return (
    <div className="integrations-list">
      {/* Comunicação */}
      <div className="integration-section-label">Comunicação</div>

      <div className={`integration-card${expanded ? ' expanded' : ''}`}>
        <div className="integration-card-row" onClick={() => setExpanded(v => !v)}>
          {/* Logo */}
          <div className="integration-logo" style={{ background: `${SLACK_COLOR}12`, border: `1px solid ${SLACK_COLOR}25` }}>
            <svg width="22" height="22" viewBox="0 0 54 54" fill="none">
              <path d="M19.712 33.6c0 2.496-2.016 4.512-4.512 4.512S10.688 36.096 10.688 33.6s2.016-4.512 4.512-4.512H19.712V33.6z" fill="#E01E5A"/>
              <path d="M21.984 33.6c0-2.496 2.016-4.512 4.512-4.512s4.512 2.016 4.512 4.512v11.288c0 2.496-2.016 4.512-4.512 4.512s-4.512-2.016-4.512-4.512V33.6z" fill="#E01E5A"/>
              <path d="M26.496 19.712c-2.496 0-4.512-2.016-4.512-4.512S24 10.688 26.496 10.688s4.512 2.016 4.512 4.512V19.712H26.496z" fill="#36C5F0"/>
              <path d="M26.496 21.984c2.496 0 4.512 2.016 4.512 4.512s-2.016 4.512-4.512 4.512H15.208c-2.496 0-4.512-2.016-4.512-4.512s2.016-4.512 4.512-4.512H26.496z" fill="#36C5F0"/>
              <path d="M40.288 26.496c0-2.496 2.016-4.512 4.512-4.512S49.312 24 49.312 26.496s-2.016 4.512-4.512 4.512H40.288V26.496z" fill="#2EB67D"/>
              <path d="M38.016 26.496c0 2.496-2.016 4.512-4.512 4.512s-4.512-2.016-4.512-4.512V15.208c0-2.496 2.016-4.512 4.512-4.512s4.512 2.016 4.512 4.512V26.496z" fill="#2EB67D"/>
              <path d="M33.504 40.288c2.496 0 4.512 2.016 4.512 4.512s-2.016 4.512-4.512 4.512-4.512-2.016-4.512-4.512V40.288H33.504z" fill="#ECB22E"/>
              <path d="M33.504 38.016c-2.496 0-4.512-2.016-4.512-4.512s2.016-4.512 4.512-4.512h11.288c2.496 0 4.512 2.016 4.512 4.512s-2.016 4.512-4.512 4.512H33.504z" fill="#ECB22E"/>
            </svg>
          </div>

          {/* Info */}
          <div className="integration-info">
            <div className="integration-title">
              Slack
              {loading ? null : hasToken ? (
                <span className="integration-badge connected">
                  <span className="live-dot" />
                  Conectado
                </span>
              ) : (
                <span className="integration-badge disconnected">Não conectado</span>
              )}
            </div>
            <div className="integration-desc">
              Envio de notificações e alertas para canais e usuários do Slack.
            </div>
          </div>

          {/* Chevron */}
          <svg
            className={`integration-chevron${expanded ? ' open' : ''}`}
            width="14" height="14" viewBox="0 0 24 24" fill="none"
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* Expanded form */}
        {expanded && (
          <div className="integration-form">
            <div className="integration-form-group">
              <label className="integration-label">Bot Token</label>
              <div className="integration-input-wrap">
                <input
                  className="integration-input"
                  type={showToken ? 'text' : 'password'}
                  placeholder={hasToken ? '••••••••••••••••' : 'xoxb-...'}
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && save()}
                  style={{ '--focus-color': SLACK_COLOR } as any}
                />
                <button className="integration-eye" onClick={() => setShowToken(v => !v)} type="button">
                  {showToken ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/></svg>
                  )}
                </button>
              </div>
              <p className="integration-hint">
                Crie um Slack App e copie o Bot Token em <strong>OAuth &amp; Permissions</strong>.
              </p>
            </div>

            <div className="integration-form-actions">
              <button
                className="integration-save-btn"
                style={{ background: SLACK_COLOR }}
                onClick={save}
                disabled={saving || !token.trim()}
              >
                {saving ? 'Salvando…' : saved ? <><IconCheck size={12} /> Salvo!</> : 'Salvar token'}
              </button>
              {hasToken && (
                <button className="integration-remove-btn" onClick={remove} disabled={removing}>
                  {removing ? 'Removendo…' : 'Remover integração'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Inteligência artificial */}
      <div className="integration-section-label" style={{ marginTop: 24 }}>Inteligência artificial</div>
      <AnthropicIntegrationCard api={api} />

      {/* Bureaus de crédito */}
      <div className="integration-section-label" style={{ marginTop: 24 }}>Bureaus de crédito</div>
      <DepsIntegrationCard api={api} />
    </div>
  );
}

// ── Onboarding: linha de etapa editável ──────────────
function CadastroEtapaRow({
  etapa, allEtapas, token, onUpdate, onDelete, onAddNotif, onRemoveNotif,
  isDragging, dropIndicator, onDragStart, onDragOver, onClearIndicator, onDrop, onDragEnd,
}: {
  etapa: CadastroEtapaConfig;
  allEtapas: CadastroEtapaConfig[];
  token: string;
  onUpdate: (e: CadastroEtapaConfig) => void;
  onDelete: (id: number) => void;
  onAddNotif: (chave: string, user: SlackUser) => void;
  onRemoveNotif: (id: number) => void;
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

  const [editingName, setEditingName] = useState(false);
  const [nome, setNome] = useState(etapa.nome);
  const [cor, setCor] = useState(etapa.cor);
  const [colorPickerPos, setColorPickerPos] = useState<{ top: number; left: number } | null>(null);
  const notifs = etapa.notificacoes ?? [];

  // Delete flow
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveModal, setMoveModal] = useState<{ count: number } | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<number | ''>('');
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
    if (etapa.locked) return;
    try {
      const res = await api(`?action=cadastro_status_card_count&chave=${encodeURIComponent(etapa.chave)}`);
      const count = Number(res.count ?? 0);
      if (count === 0) setConfirmDelete(true);
      else { setMoveTargetId(''); setMoveModal({ count }); }
    } catch {
      setConfirmDelete(true);
    }
  }

  async function handleDeleteConfirm() {
    setDeleting(true);
    try {
      const res = await api('', 'POST', { action: 'delete_cadastro_status', id: etapa.id });
      if (res.error) throw new Error(res.error);
      onDelete(etapa.id);
      toast('success', `Etapa "${etapa.nome}" excluída`);
      setConfirmDelete(false);
    } catch {
      toast('error', 'Erro ao excluir etapa. Tente novamente.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleMoveAndDelete() {
    if (!moveTargetId) return;
    setDeleting(true);
    try {
      const target = allEtapas.find(e => e.id === moveTargetId);
      const res = await api('', 'POST', { action: 'delete_cadastro_status', id: etapa.id, move_to_chave: target?.chave });
      if (res.error) throw new Error(res.error);
      onDelete(etapa.id);
      toast('success', `${moveModal?.count ?? 0} cadastro(s) movido(s) e etapa excluída`);
      setMoveModal(null);
    } catch {
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
    await api('', 'POST', { action: 'update_cadastro_status', id: etapa.id, nome, cor: c });
    onUpdate({ ...etapa, nome, cor: c });
    toast('success', 'Cor atualizada');
  }

  function handleNameBlur(e: React.FocusEvent) {
    if (rowRef.current?.contains(e.relatedTarget as Node)) return;
    saveName();
  }

  async function saveName() {
    setEditingName(false);
    if (nome === etapa.nome) return;
    await api('', 'POST', { action: 'update_cadastro_status', id: etapa.id, nome, cor });
    onUpdate({ ...etapa, nome, cor });
    toast('success', 'Etapa atualizada');
  }

  return (
    <div
      ref={rowRef}
      className={`status-row${isDragging ? ' status-row-dragging' : ''}${dropIndicator ? ' status-row-drop-target' : ''}`}
      draggable={!editingName}
      style={{
        cursor: editingName ? 'default' : 'grab',
        boxShadow: dropIndicator === 'before' ? 'inset 0 3px 0 0 var(--yellow)'
          : dropIndicator === 'after' ? 'inset 0 -3px 0 0 var(--yellow)' : undefined,
      }}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      onDragOver={e => {
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onDragOver(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
      }}
      onDragLeave={e => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) onClearIndicator(); }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
    >
      <div className="status-row-bar">
        <div className="status-row-left">
          <div className="drag-handle-dots">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="4" cy="3" r="1.2" fill="currentColor"/><circle cx="4" cy="7" r="1.2" fill="currentColor"/><circle cx="4" cy="11" r="1.2" fill="currentColor"/>
              <circle cx="10" cy="3" r="1.2" fill="currentColor"/><circle cx="10" cy="7" r="1.2" fill="currentColor"/><circle cx="10" cy="11" r="1.2" fill="currentColor"/>
            </svg>
          </div>

          <button ref={colorDotRef} className="status-color-dot-btn" onClick={openColorPicker} title="Alterar cor">
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
                if (e.key === 'Escape') { setNome(etapa.nome); setEditingName(false); }
              }}
            />
          ) : (
            <span className="status-name" onClick={e => { e.stopPropagation(); setNome(etapa.nome); setEditingName(true); }} title="Clique para renomear">
              {nome}
            </span>
          )}

          {etapa.locked === 1 && (
            <span
              title="Etapa de sistema - controla o acesso ao formulário público. Pode renomear/recolorir, mas não excluir."
              style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--gray2)', background: 'var(--gray3)', padding: '2px 7px', borderRadius: 99 }}
            >
              {etapa.chave === 'aprovado' ? 'Libera CNPJ' : 'Sistema'}
            </span>
          )}
        </div>

        <div className="status-row-right" onClick={e => e.stopPropagation()}>
          <div className="status-notif-chips-inline">
            {notifs.map(n => (
              <div key={n.id} className="notif-chip">
                {n.slack_user_avatar
                  ? <img src={n.slack_user_avatar} alt="" className="slack-avatar-sm" />
                  : <div className="slack-avatar-sm slack-avatar-placeholder" style={{ fontSize: 10 }}>{n.slack_user_name[0]}</div>
                }
                <span>{n.slack_user_name}</span>
                <button onClick={() => onRemoveNotif(n.id)}>×</button>
              </div>
            ))}
          </div>

          <SlackUserDropdown token={token} onSelect={user => onAddNotif(etapa.chave, user)} exclude={notifs.map(n => n.slack_user_id)} compact />

          <button
            className="status-action-btn danger"
            onClick={etapa.locked ? undefined : handleDeleteClick}
            title={etapa.locked ? 'Etapa de sistema não pode ser excluída' : 'Excluir etapa'}
            style={etapa.locked ? { opacity: 0.3, cursor: 'not-allowed' } : {}}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><polyline points="3,6 5,6 21,6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>

      {colorPickerPos && createPortal(
        <div ref={colorPickerRef} className="status-color-picker-popover" style={{ position: 'fixed', top: colorPickerPos.top, left: colorPickerPos.left }}>
          {COLORS.map(c => (
            <button key={c} className={`color-swatch${cor === c ? ' active' : ''}`} style={{ background: c }} onClick={() => handleColorClick(c)} />
          ))}
        </div>,
        document.body
      )}

      {confirmDelete && createPortal(
        <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }} onClick={() => setConfirmDelete(false)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <p className="delete-confirm-title">Excluir etapa?</p>
            <p className="delete-confirm-desc"><strong>{etapa.nome}</strong> será excluída permanentemente e não poderá ser recuperada.</p>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setConfirmDelete(false)}>Cancelar</button>
              <button className="delete-confirm-ok" onClick={handleDeleteConfirm} disabled={deleting}>{deleting ? 'Excluindo…' : 'Excluir'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {moveModal && createPortal(
        <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }} onClick={() => setMoveModal(null)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()} style={{ width: 360 }}>
            <p className="delete-confirm-title">Excluir etapa?</p>
            <p className="delete-confirm-desc"><strong>{etapa.nome}</strong> tem <strong>{moveModal.count}</strong> cadastro(s). Para qual etapa deseja movê-los?</p>
            <MoveTargetSelect
              options={allEtapas.filter(e => e.id !== etapa.id).map(e => ({ id: e.id, nome: e.nome, cor: e.cor }))}
              value={moveTargetId}
              onChange={v => { if (v !== '__new__') setMoveTargetId(v); }}
              allowNew={false}
            />
            <div className="delete-confirm-actions" style={{ marginTop: 20 }}>
              <button className="delete-confirm-cancel" onClick={() => setMoveModal(null)}>Cancelar</button>
              <button className="delete-confirm-ok" onClick={handleMoveAndDelete} disabled={deleting || !moveTargetId}>
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

// ── Onboarding Tab (etapas configuráveis + notificações) ────────
function CadastroNotifTab({ token, adding, setAdding }: { token: string; adding: boolean; setAdding: (v: boolean) => void }) {
  const api = useApi(token);
  const { toast } = useToast();
  const [submissao, setSubmissao] = useState<NovaNotificacao[]>([]);
  const [etapas, setEtapas] = useState<CadastroEtapaConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNome, setNewNome] = useState('');
  const [newCor, setNewCor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<{ id: number; pos: 'before' | 'after' } | null>(null);

  useEffect(() => {
    api('?action=cadastro_notif_config').then(d => {
      setSubmissao(d.submissao_notificacoes ?? []);
      setEtapas(d.etapas ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function addSubmissao(user: SlackUser) {
    const data = await api('', 'POST', {
      action: 'add_cadastro_submissao_notif',
      slack_user_id: user.id, slack_user_name: user.name, slack_user_avatar: user.avatar,
    });
    if (data.notificacao) setSubmissao(prev => [...prev, data.notificacao]);
  }
  async function removeSubmissao(id: number) {
    await api('', 'POST', { action: 'remove_cadastro_submissao_notif', id });
    setSubmissao(prev => prev.filter(n => n.id !== id));
  }

  async function addEtapaNotif(chave: string, user: SlackUser) {
    const data = await api('', 'POST', {
      action: 'add_cadastro_etapa_notif', etapa: chave,
      slack_user_id: user.id, slack_user_name: user.name, slack_user_avatar: user.avatar,
    });
    if (data.notificacao) {
      setEtapas(prev => prev.map(e => e.chave === chave ? { ...e, notificacoes: [...(e.notificacoes ?? []), data.notificacao] } : e));
    }
  }
  async function removeEtapaNotif(id: number) {
    await api('', 'POST', { action: 'remove_cadastro_etapa_notif', id });
    setEtapas(prev => prev.map(e => ({ ...e, notificacoes: (e.notificacoes ?? []).filter(n => n.id !== id) })));
  }

  async function createEtapa() {
    if (!newNome.trim()) return;
    setSaving(true);
    const data = await api('', 'POST', { action: 'create_cadastro_status', nome: newNome.trim(), cor: newCor });
    if (data.etapa) setEtapas(prev => [...prev, data.etapa]);
    setNewNome(''); setNewCor(COLORS[0]); setAdding(false); setSaving(false);
    toast('success', 'Etapa criada');
  }

  function handleDrop(targetId: number) {
    if (draggedId === null || draggedId === targetId) { setDragOver(null); return; }
    const pos = dragOver?.pos ?? 'after';
    const next = [...etapas];
    const fromIdx = next.findIndex(e => e.id === draggedId);
    const [moved] = next.splice(fromIdx, 1);
    const toIdx = next.findIndex(e => e.id === targetId);
    next.splice(pos === 'before' ? toIdx : toIdx + 1, 0, moved);
    setEtapas(next);
    setDraggedId(null);
    setDragOver(null);
    api('', 'POST', { action: 'reorder_cadastro_status', ids: next.map(e => e.id) });
    toast('success', 'Ordem atualizada');
  }

  if (loading) return <ConfiguracoesSkeleton />;

  return (
    <>
      {/* Submissão do formulário de cadastro */}
      <div className="nova-notif-section">
        <div className="nova-notif-header">
          <div className="nova-notif-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p className="nova-notif-title">Novo cadastro de cedente recebido</p>
            <p className="nova-notif-desc">Notificar no Slack quando alguém enviar o formulário de cadastro</p>
          </div>
        </div>
        <div className="nova-notif-body">
          <div className="notif-chips">
            {submissao.map(n => (
              <div key={n.id} className="notif-chip">
                {n.slack_user_avatar
                  ? <img src={n.slack_user_avatar} alt="" className="slack-avatar-sm" />
                  : <div className="slack-avatar-sm slack-avatar-placeholder" style={{ fontSize: 10 }}>{n.slack_user_name[0]}</div>
                }
                <span>{n.slack_user_name}</span>
                <button onClick={() => removeSubmissao(n.id)}>×</button>
              </div>
            ))}
          </div>
          <SlackUserDropdown token={token} onSelect={addSubmissao} exclude={submissao.map(n => n.slack_user_id)} />
        </div>
      </div>

      {/* Etapas configuráveis da pipeline de onboarding */}
      <div className="status-list" style={{ marginTop: 16 }}>
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
                  onKeyDown={e => { if (e.key === 'Enter') createEtapa(); if (e.key === 'Escape') setAdding(false); }}
                />
              </div>
              <div className="status-row-actions">
                <button className="status-action-btn primary" onClick={createEtapa} disabled={saving || !newNome.trim()}>
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

        {etapas.map(et => (
          <CadastroEtapaRow
            key={et.id}
            etapa={et}
            allEtapas={etapas}
            token={token}
            isDragging={draggedId === et.id}
            dropIndicator={dragOver?.id === et.id ? dragOver.pos : null}
            onDragStart={() => setDraggedId(et.id)}
            onDragOver={pos => setDragOver({ id: et.id, pos })}
            onClearIndicator={() => setDragOver(null)}
            onDrop={() => handleDrop(et.id)}
            onDragEnd={() => { setDraggedId(null); setDragOver(null); }}
            onUpdate={updated => setEtapas(prev => prev.map(e => e.id === updated.id ? { ...e, ...updated } : e))}
            onDelete={id => setEtapas(prev => prev.filter(e => e.id !== id))}
            onAddNotif={addEtapaNotif}
            onRemoveNotif={removeEtapaNotif}
          />
        ))}
      </div>
    </>
  );
}

// ── Skeleton ─────────────────────────────────────────
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

// ── Main ─────────────────────────────────────────────
type ConfigTab = 'etapas' | 'integracoes';
type EtapaScope = 'solicitacoes' | 'onboarding';

export default function ConfiguracoesPage({ token }: { token: string }) {
  const api = useApi(token);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ConfigTab>('etapas');
  const [etapaScope, setEtapaScope] = useState<EtapaScope>('solicitacoes');
  const [obAdding, setObAdding] = useState(false);
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
      <div className="config-tabs">
        <button className={`config-tab${activeTab === 'etapas' ? ' active' : ''}`} onClick={() => setActiveTab('etapas')}>Etapas</button>
        <button className={`config-tab${activeTab === 'integracoes' ? ' active' : ''}`} onClick={() => setActiveTab('integracoes')}>Integrações</button>
      </div>

      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">
            {activeTab === 'etapas' ? 'Etapas' : 'Integrações'}
          </h1>
          <p className="admin-page-desc">
            {activeTab === 'integracoes'
              ? 'Conecte ferramentas externas ao sistema.'
              : etapaScope === 'solicitacoes'
              ? 'Gerencie as etapas do pipeline de solicitações e notificações.'
              : 'Etapas e notificações do pipeline de on-boarding de cedentes.'}
          </p>
        </div>
        {activeTab === 'etapas' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <SegSwitch
              valor={etapaScope}
              onChange={setEtapaScope}
              opcoes={[
                { valor: 'solicitacoes', label: 'Solicitações' },
                { valor: 'onboarding', label: 'Onboarding' },
              ]}
            />
            {etapaScope === 'solicitacoes' && !loading && !adding && (
              <button className="btn btn-primary" onClick={() => setAdding(true)} style={{ whiteSpace: 'nowrap' }}>
                + Nova etapa
              </button>
            )}
            {etapaScope === 'onboarding' && !obAdding && (
              <button className="btn btn-primary" onClick={() => setObAdding(true)} style={{ whiteSpace: 'nowrap' }}>
                + Nova etapa
              </button>
            )}
          </div>
        )}
      </div>

      {activeTab === 'integracoes' ? (
        <IntegracoesTab token={token} />
      ) : etapaScope === 'onboarding' ? (
        <CadastroNotifTab token={token} adding={obAdding} setAdding={setObAdding} />
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
    </div>
  );
}
