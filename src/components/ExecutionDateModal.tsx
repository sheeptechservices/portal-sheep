import { useState } from 'react'
import { createPortal } from 'react-dom'
import { DatePicker } from './DatePicker'

/**
 * Modal obrigatório exibido ao mover uma solicitação para a etapa de conversão.
 * Força o usuário a registrar a data em que a operação foi de fato executada
 * antes de concluir a mudança de etapa. A data pode ser no passado.
 */
export function ExecutionDateModal({
  statusName,
  initialDate = '',
  onConfirm,
  onCancel,
}: {
  statusName?: string
  initialDate?: string
  onConfirm: (date: string) => void | Promise<void>
  onCancel: () => void
}) {
  const [date, setDate] = useState(initialDate)
  const [saving, setSaving] = useState(false)

  async function confirm() {
    if (!date || saving) return
    setSaving(true)
    try {
      await onConfirm(date)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="admin-modal-overlay"
      style={{ zIndex: 1200, alignItems: 'center', justifyContent: 'center' }}
      onClick={() => !saving && onCancel()}
    >
      <div
        className="delete-confirm-modal"
        onClick={e => e.stopPropagation()}
        style={{ overflow: 'visible' }}
      >
        <p className="delete-confirm-title">Registrar execução</p>
        <p className="delete-confirm-desc">
          {statusName ? (
            <>
              Para mover para <strong>{statusName}</strong>, informe a data em que a
              operação foi executada.
            </>
          ) : (
            'Informe a data em que a operação foi executada.'
          )}
        </p>
        <div className="form-group" style={{ margin: '16px 0 20px' }}>
          <label className="form-label">Data da execução</label>
          <DatePicker value={date} onChange={setDate} compact allowPast />
        </div>
        <div className="delete-confirm-actions">
          <button className="delete-confirm-cancel" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button
            className="delete-confirm-ok"
            onClick={confirm}
            disabled={!date || saving}
            style={!date || saving ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            {saving ? 'Salvando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
