import { useNavigate } from 'react-router-dom'

const COLUMNS = [
  { key: 'cold_email_sent', label: 'Cold Email', color: '#6366f1' },
  { key: 'applied', label: 'Applied', color: '#3b82f6' },
  { key: 'confirmation_received', label: 'Confirmed', color: '#06b6d4' },
  { key: 'reply_received', label: 'Reply', color: '#8b5cf6' },
  { key: 'interviewing', label: 'Interviewing', color: '#f59e0b' },
  { key: 'offer', label: 'Offer', color: '#22c55e' },
  { key: 'rejected', label: 'Rejected', color: '#ef4444' },
  { key: 'ghosted', label: 'Ghosted', color: '#64748b' },
]

function KanbanCard({ company }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => navigate(`/applications?highlight=${company.id}`)}
      style={{
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: '8px',
        padding: '12px',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#334155'}
    >
      <div style={{ fontSize: '13px', fontWeight: '600', color: '#e2e8f0', marginBottom: '4px' }}>
        {company.name}
      </div>
      <div style={{ fontSize: '11px', color: '#64748b' }}>
        {company.days_since_update}d ago · {company.source}
      </div>
    </div>
  )
}

export default function KanbanBoard({ kanban = {} }) {
  return (
    <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
      {COLUMNS.map(col => {
        const cards = kanban[col.key] || []
        return (
          <div key={col.key} style={{
            minWidth: '180px',
            background: '#1e293b',
            borderRadius: '10px',
            border: '1px solid #334155',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 12px',
              background: col.color + '22',
              borderBottom: `2px solid ${col.color}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: col.color }}>{col.label}</span>
              <span style={{ fontSize: '12px', background: col.color + '33', color: col.color, borderRadius: '12px', padding: '1px 8px' }}>
                {cards.length}
              </span>
            </div>
            <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
              {cards.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#475569', padding: '8px', textAlign: 'center' }}>Empty</div>
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
