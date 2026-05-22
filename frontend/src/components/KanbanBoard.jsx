import { useNavigate } from 'react-router-dom'

const COLUMNS = [
  { key: 'cold_email_sent',        label: 'Cold Email',   color: '#6366f1' },
  { key: 'applied',                label: 'Applied',      color: '#3b82f6' },
  { key: 'confirmation_received',  label: 'Confirmed',    color: '#06b6d4' },
  { key: 'reply_received',         label: 'Reply',        color: '#8b5cf6' },
  { key: 'interviewing',           label: 'Interviewing', color: '#f59e0b' },
  { key: 'offer',                  label: 'Offer',        color: '#22c55e' },
  { key: 'rejected',               label: 'Rejected',     color: '#ef4444' },
  { key: 'ghosted',                label: 'Ghosted',      color: '#94a3b8' },
]

function KanbanCard({ company }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => navigate(`/applications?highlight=${company.id}`)}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '10px 12px',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = '#6366f1'
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.12)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '3px' }}>
        {company.name}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-4)' }}>
        {company.days_since_update}d ago · {company.source}
      </div>
    </div>
  )
}

export default function KanbanBoard({ kanban = {} }) {
  return (
    <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '8px' }}>
      {COLUMNS.map(col => {
        const cards = kanban[col.key] || []
        return (
          <div key={col.key} style={{
            minWidth: '170px',
            background: 'var(--bg)',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 12px',
              background: col.color + '12',
              borderBottom: `2px solid ${col.color}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: col.color, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{col.label}</span>
              <span style={{ fontSize: '11px', background: col.color + '20', color: col.color, borderRadius: '12px', padding: '1px 7px', fontWeight: '600' }}>
                {cards.length}
              </span>
            </div>
            <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
              {cards.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-4)', padding: '8px', textAlign: 'center' }}>Empty</div>
              ) : (
                cards.map(c => <KanbanCard key={c.id} company={c} />)
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
