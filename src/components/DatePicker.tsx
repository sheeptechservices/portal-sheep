import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

// Meeus/Jones/Butcher algorithm
function easterDate(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const mm = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * mm + 114) / 31) - 1
  const day = ((h + l - 7 * mm + 114) % 31) + 1
  return new Date(year, month, day)
}

function shift(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildHolidays(year: number): Set<string> {
  const s = new Set<string>()

  // Feriados fixos nacionais
  const fixed: [number, number][] = [
    [1, 1],   // Confraternização Universal
    [4, 21],  // Tiradentes
    [5, 1],   // Dia do Trabalho
    [9, 7],   // Independência do Brasil
    [10, 12], // Nossa Senhora Aparecida
    [11, 2],  // Finados
    [11, 15], // Proclamação da República
    [11, 20], // Consciência Negra
    [12, 25], // Natal
  ]
  for (const [m, d] of fixed) {
    s.add(`${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }

  // Feriados móveis (baseados na Páscoa)
  const easter = easterDate(year)
  s.add(toKey(shift(easter, -48))) // Segunda de Carnaval
  s.add(toKey(shift(easter, -47))) // Terça de Carnaval
  s.add(toKey(shift(easter, -2)))  // Sexta-feira Santa
  s.add(toKey(easter))             // Páscoa
  s.add(toKey(shift(easter, 60)))  // Corpus Christi

  return s
}

const holidayCache = new Map<number, Set<string>>()

function checkHoliday(y: number, m: number, d: number): boolean {
  if (!holidayCache.has(y)) holidayCache.set(y, buildHolidays(y))
  return holidayCache.get(y)!.has(
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  )
}

interface DatePickerProps {
  value: string        // YYYY-MM-DD or ''
  onChange: (value: string) => void
  label?: string
  required?: boolean
  error?: string
  disabled?: boolean
  compact?: boolean    // non-floating label style, matches form-input
  allowPast?: boolean  // permite datas passadas (ex.: registrar data de execução já ocorrida)
}

type DropPos = { top?: number; bottom?: number; left: number; width: number }

export function DatePicker({ value, onChange, label, required, error, disabled, compact, allowPast }: DatePickerProps) {
  const now = new Date()
  const todayY = now.getFullYear()
  const todayM = now.getMonth()
  const todayD = now.getDate()
  const todayStr = `${todayY}-${String(todayM + 1).padStart(2, '0')}-${String(todayD).padStart(2, '0')}`

  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState<DropPos>({ top: 0, left: 0, width: 280 })
  const [viewYear, setViewYear] = useState(todayY)
  const [viewMonth, setViewMonth] = useState(todayM)
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = () => {
    if (disabled) return
    if (!open) {
      if (value) {
        setViewYear(parseInt(value.slice(0, 4)))
        setViewMonth(parseInt(value.slice(5, 7)) - 1)
      } else {
        setViewYear(todayY)
        setViewMonth(todayM)
      }
      const rect = triggerRef.current?.getBoundingClientRect()
      if (rect) {
        const dropW = Math.max(rect.width, 280)
        const dropH = 400 // altura aproximada do calendário
        const margin = 8
        const rawLeft = rect.left
        const clampedLeft = Math.min(rawLeft, window.innerWidth - dropW - margin)
        const left = Math.max(margin, clampedLeft)

        // Abre abaixo por padrão; se não couber, tenta acima; senão, clampa na viewport
        let top = rect.bottom + 6
        if (top + dropH > window.innerHeight - margin) {
          const above = rect.top - dropH - 6
          top = above >= margin
            ? above
            : Math.max(margin, window.innerHeight - dropH - margin)
        }
        setDropPos({ top, left, width: dropW })
      }
    }
    setOpen(o => !o)
  }

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
  }

  const handleDay = (y: number, m: number, d: number) => {
    const mm = String(m + 1).padStart(2, '0')
    const dd = String(d).padStart(2, '0')
    onChange(`${y}-${mm}-${dd}`)
    setOpen(false)
  }

  const prevMonth = (e: React.MouseEvent) => {
    e.stopPropagation()
    setViewMonth(m => { if (m === 0) { setViewYear(y => y - 1); return 11 } return m - 1 })
  }

  const nextMonth = (e: React.MouseEvent) => {
    e.stopPropagation()
    setViewMonth(m => { if (m === 11) { setViewYear(y => y + 1); return 0 } return m + 1 })
  }

  const selY = value ? parseInt(value.slice(0, 4)) : null
  const selM = value ? parseInt(value.slice(5, 7)) - 1 : null
  const selD = value ? parseInt(value.slice(8, 10)) : null
  const display = value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : ''

  const firstDow = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const prevDaysInMonth = new Date(viewYear, viewMonth, 0).getDate()
  const prevM = viewMonth === 0 ? 11 : viewMonth - 1
  const prevY = viewMonth === 0 ? viewYear - 1 : viewYear
  const nextM = viewMonth === 11 ? 0 : viewMonth + 1
  const nextY = viewMonth === 11 ? viewYear + 1 : viewYear

  type Cell = { d: number; m: number; y: number; cur: boolean }
  const cells: Cell[] = []
  for (let i = 0; i < firstDow; i++) cells.push({ d: prevDaysInMonth - firstDow + 1 + i, m: prevM, y: prevY, cur: false })
  for (let i = 1; i <= daysInMonth; i++) cells.push({ d: i, m: viewMonth, y: viewYear, cur: true })
  const trailing = 42 - cells.length
  for (let i = 1; i <= trailing; i++) cells.push({ d: i, m: nextM, y: nextY, cur: false })

  const isSelected = (c: Cell) => c.y === selY && c.m === selM && c.d === selD
  const isToday = (c: Cell) => c.cur && c.y === todayY && c.m === todayM && c.d === todayD

  const todayDow = new Date(todayY, todayM, todayD).getDay()
  const todayIsHoliday = checkHoliday(todayY, todayM, todayD)
  const todayBlocked = todayDow === 0 || todayDow === 6 || todayIsHoliday

  const hasError = !!error
  const borderColor = hasError ? 'var(--red)' : open ? 'var(--yellow)' : 'var(--gray3)'
  const boxShadow = open
    ? (hasError ? '0 0 0 4px rgba(217,48,37,0.10)' : '0 0 0 4px var(--yd), 0 2px 8px rgba(0, 201, 167,0.12)')
    : 'none'

  const dropdown = open && createPortal(
    <div
      ref={dropRef}
      role="dialog"
      onMouseLeave={() => setTooltip(null)}
      style={{
        position: 'fixed',
        top: dropPos.top,
        bottom: dropPos.bottom,
        left: dropPos.left,
        zIndex: 99999,
        background: 'var(--white)',
        border: '1.5px solid var(--gray3)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.06)',
        padding: '16px 14px 14px',
        width: dropPos.width,
        maxHeight: 'calc(100vh - 16px)',
        overflowY: 'auto',
        userSelect: 'none',
        fontFamily: "'Manrope', sans-serif",
        boxSizing: 'border-box',
        animation: 'scaleIn .15s ease both',
      }}
    >
      {/* Navegação mês/ano */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        <NavBtn onClick={prevMonth} label="Mês anterior">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </NavBtn>
        <span style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: 13, color: 'var(--black)', letterSpacing: '-0.01em' }}>
          {MONTHS_PT[viewMonth].toLowerCase()} de {viewYear}
        </span>
        <NavBtn onClick={nextMonth} label="Próximo mês">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </NavBtn>
      </div>

      {/* Cabeçalho dias da semana */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {DAY_LABELS.map((l, i) => (
          <div key={i} style={{
            textAlign: 'center', fontSize: 10, fontWeight: 700,
            color: i === 0 || i === 6 ? 'var(--gray3)' : 'var(--gray2)',
            padding: '2px 0', letterSpacing: '0.06em',
          }}>
            {l}
          </div>
        ))}
      </div>

      {/* Grade de dias */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((cell, i) => {
          const sel = isSelected(cell)
          const tod = isToday(cell)
          const dow = new Date(cell.y, cell.m, cell.d).getDay()
          const isWeekend = dow === 0 || dow === 6
          const holiday = cell.cur && checkHoliday(cell.y, cell.m, cell.d)
          const cellKey = `${cell.y}-${String(cell.m + 1).padStart(2, '0')}-${String(cell.d).padStart(2, '0')}`
          const isPast = cell.cur && cellKey < todayStr && !allowPast
          const blocked = isWeekend || holiday || isPast

          return (
            <DayCell
              key={i}
              cell={cell}
              sel={sel}
              tod={tod}
              blocked={blocked}
              holiday={holiday}
              isPast={isPast}
              onClick={() => !blocked && handleDay(cell.y, cell.m, cell.d)}
              onHolidayHover={(x, y) => holiday && setTooltip({ text: 'Feriado nacional', x, y })}
              onHoverEnd={() => holiday && setTooltip(null)}
            />
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1.5px solid var(--gray3)', marginTop: 12, paddingTop: 12, display: 'flex', gap: 8 }}>
        {value && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false) }}
            className="btn btn-secondary btn-sm"
            style={{ flex: 1, justifyContent: 'center', borderRadius: 100 }}
          >
            Limpar
          </button>
        )}
        <button
          onClick={todayBlocked ? undefined : (e) => { e.stopPropagation(); handleDay(todayY, todayM, todayD) }}
          className={`btn btn-sm${todayBlocked ? '' : ' btn-primary'}`}
          style={{
            flex: 1, justifyContent: 'center', borderRadius: 100,
            opacity: todayBlocked ? 0.4 : 1,
            cursor: todayBlocked ? 'default' : 'pointer',
            pointerEvents: todayBlocked ? 'none' : undefined,
          }}
        >
          Hoje
        </button>
      </div>

      {/* Legenda */}
      <div style={{ display: 'flex', gap: 14, marginTop: 10, justifyContent: 'center' }}>
        <LegendItem color="var(--red)" label="Feriado" />
        <LegendItem color="var(--gray2)" label="Fim de semana" />
      </div>

      {/* Tooltip feriado */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x + 8,
          top: tooltip.y - 28,
          background: 'var(--black)',
          color: 'var(--white)',
          fontSize: 11,
          fontWeight: 600,
          padding: '4px 8px',
          borderRadius: 6,
          pointerEvents: 'none',
          zIndex: 100000,
          whiteSpace: 'nowrap',
        }}>
          Feriado nacional
        </div>
      )}
    </div>,
    document.body
  )

  if (compact) {
    return (
      <div ref={triggerRef} style={{ position: 'relative', width: '100%' }}>
        {label && <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>{label}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}</label>}
        <div
          tabIndex={disabled ? -1 : 0}
          role="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() }
            if (e.key === 'Escape') setOpen(false)
          }}
          onClick={toggle}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            height: 38, padding: '0 11px', borderRadius: 'var(--radius-sm)',
            border: `1.5px solid ${borderColor}`, background: 'var(--white)',
            fontSize: 13.5, color: display ? 'var(--black)' : 'var(--gray2)',
            cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none',
            opacity: disabled ? 0.6 : 1, width: '100%', boxSizing: 'border-box',
            boxShadow, outline: 'none', transition: 'border-color 0.15s',
            fontFamily: 'inherit',
          }}
        >
          <span style={{ flex: 1 }}>{display || 'DD/MM/AAAA'}</span>
          {value && !disabled
            ? <span onClick={clear} style={{ color: 'var(--gray2)', fontSize: 18, lineHeight: 1, cursor: 'pointer', marginLeft: 6 }}>×</span>
            : <CalendarIcon active={open} />
          }
        </div>
        {error && <p className="form-error" style={{ marginTop: 6 }}>{error}</p>}
        {dropdown}
      </div>
    )
  }

  return (
    <div ref={triggerRef} style={{ position: 'relative', width: '100%' }}>
      <div
        tabIndex={disabled ? -1 : 0}
        role="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() }
          if (e.key === 'Escape') setOpen(false)
        }}
        onClick={toggle}
        style={{
          fontFamily: "'Manrope', sans-serif",
          fontSize: 15,
          fontWeight: display ? 500 : 400,
          padding: '22px 14px 8px',
          width: '100%',
          color: display ? 'var(--black)' : 'var(--gray2)',
          background: disabled ? 'var(--bg)' : 'var(--white)',
          cursor: disabled ? 'default' : 'pointer',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'flex-end',
          boxSizing: 'border-box',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor,
          borderRadius: 'var(--radius-sm)',
          outline: 'none',
          transition: 'border-color .2s ease, box-shadow .2s ease, transform .2s ease',
          boxShadow,
          opacity: disabled ? 0.6 : 1,
          minHeight: 56,
          position: 'relative',
          transform: open ? 'translateY(-1px)' : 'none',
        }}
      >
        {/* Label flutuante */}
        {label && (
          <span style={{
            position: 'absolute',
            top: 10,
            left: 14,
            fontSize: 10,
            fontWeight: 700,
            color: hasError ? 'var(--red)' : open ? '#7A5600' : 'var(--gray)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            lineHeight: 1,
            pointerEvents: 'none',
          }}>
            {label}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
          </span>
        )}

        <span style={{ flex: 1, lineHeight: 1 }}>
          {display || 'DD/MM/AAAA'}
        </span>

        {value && !disabled ? (
          <span
            onClick={clear}
            style={{ color: 'var(--gray2)', fontSize: 18, lineHeight: 1, cursor: 'pointer', marginLeft: 6 }}
          >
            ×
          </span>
        ) : (
          <CalendarIcon active={open} />
        )}
      </div>

      {error && (
        <p style={{
          fontSize: 12, color: 'var(--red)', fontWeight: 500,
          marginTop: 6, animation: 'up .2s ease both',
        }}>
          {error}
        </p>
      )}

      {dropdown}
    </div>
  )
}

function NavBtn({ onClick, children, label }: { onClick: (e: React.MouseEvent) => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        background: 'none', border: '1.5px solid var(--gray3)', cursor: 'pointer',
        width: 30, height: 30, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--gray)', fontFamily: 'inherit', flexShrink: 0,
        transition: 'border-color 0.15s, color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'var(--gray2)'; e.currentTarget.style.color = 'var(--black)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'var(--gray3)'; e.currentTarget.style.color = 'var(--gray)' }}
    >
      {children}
    </button>
  )
}

type Cell = { d: number; m: number; y: number; cur: boolean }

interface DayCellProps {
  cell: Cell
  sel: boolean
  tod: boolean
  blocked: boolean
  holiday: boolean
  isPast: boolean
  onClick: () => void
  onHolidayHover: (x: number, y: number) => void
  onHoverEnd: () => void
}

function DayCell({ cell, sel, tod, blocked, holiday, isPast, onClick, onHolidayHover, onHoverEnd }: DayCellProps) {
  const highlighted = sel || tod
  const textColor = () => {
    // Dia destacado tem fundo amarelo nos dois temas → texto sempre escuro (fixo),
    // senão no modo dark var(--black) vira claro e some sobre o amarelo.
    if (highlighted) return '#121316'
    if (!cell.cur) return 'var(--gray2)'
    if (holiday) return 'var(--red)'
    if (isPast || blocked) return 'var(--gray2)'
    return 'var(--black)'
  }

  const bg = highlighted ? 'var(--yellow)' : 'transparent'

  return (
    <button
      onClick={blocked ? undefined : onClick}
      onMouseEnter={e => {
        if (holiday) onHolidayHover(e.clientX, e.clientY)
        if (!highlighted && !blocked) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'
      }}
      onMouseLeave={e => {
        onHoverEnd()
        if (!highlighted && !blocked) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
      }}
      style={{
        border: 'none',
        borderRadius: 100,
        height: 34,
        width: '100%',
        cursor: blocked ? 'default' : 'pointer',
        fontSize: 12.5,
        fontWeight: highlighted ? 800 : 500,
        background: bg,
        color: textColor(),
        opacity: isPast || (!cell.cur && !sel) ? 0.28 : (blocked && !holiday && !tod ? 0.38 : 1),
        fontFamily: 'inherit',
        transition: 'background .12s',
        position: 'relative',
      }}
    >
      {cell.d}
      {holiday && cell.cur && (
        <span style={{
          position: 'absolute',
          bottom: 3,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 3,
          height: 3,
          borderRadius: '50%',
          background: highlighted ? '#121316' : 'var(--red)',
          display: 'block',
        }} />
      )}
    </button>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'block', flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: 'var(--gray)', fontWeight: 600, letterSpacing: 0.3 }}>{label}</span>
    </div>
  )
}

function CalendarIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
      style={{ flexShrink: 0, color: active ? 'var(--yellow)' : 'var(--gray2)', marginLeft: 6, transition: 'color .2s' }}>
      <rect x="1" y="2" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1 6h14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 1v2M11 1v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
