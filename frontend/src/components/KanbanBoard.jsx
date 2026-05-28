import { useNavigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { cn } from '../lib/utils'

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
  const { isDark } = useTheme()
  return (
    <div
      onClick={() => navigate(`/applications?highlight=${company.id}`)}
      className={cn(
        'group rounded-lg px-3 py-2.5 cursor-pointer transition-all duration-150 border',
        isDark
          ? 'bg-dark-card border-dark-border hover:border-brand hover:shadow-md hover:shadow-brand/10'
          : 'bg-white border-gray-300 hover:border-brand hover:shadow-sm shadow-sm',
      )}
    >
      <div className={cn(
        'text-[13px] font-semibold mb-0.5 truncate',
        isDark ? 'text-slate-200' : 'text-slate-800',
      )}>
        {company.name}
      </div>
      <div className={cn(
        'text-[11px]',
        isDark ? 'text-slate-500' : 'text-slate-500',
      )}>
        {company.days_since_update}d ago · {company.source}
      </div>
    </div>
  )
}

export default function KanbanBoard({ kanban = {} }) {
  const { isDark } = useTheme()
  return (
    <div className="flex gap-2.5 overflow-x-auto pb-2">
      {COLUMNS.map(col => {
        const cards = kanban[col.key] || []
        return (
          <div key={col.key} className={cn(
            'min-w-[170px] rounded-xl border overflow-hidden flex-shrink-0',
            isDark ? 'bg-dark-surface border-dark-border' : 'bg-slate-50 border-gray-300',
          )}>
            {/* Column header */}
            <div
              className="px-3 py-2.5 flex items-center justify-between border-b-2"
              style={{ background: col.color + '18', borderBottomColor: col.color }}
            >
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: col.color }}
              >
                {col.label}
              </span>
              <span
                className="text-[11px] font-bold rounded-full px-2 py-0.5"
                style={{ background: col.color + '25', color: col.color }}
              >
                {cards.length}
              </span>
            </div>

            {/* Cards */}
            <div className="p-2 flex flex-col gap-1.5 max-h-[280px] overflow-y-auto">
              {cards.length === 0 ? (
                <div className={cn(
                  'text-xs text-center py-3',
                  isDark ? 'text-slate-600' : 'text-slate-500',
                )}>
                  Empty
                </div>
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
