import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Clock, Briefcase, Bell, Activity } from 'lucide-react'
import { motion } from 'framer-motion'
import api from '../api/client'
import StatCard from '../components/StatCard'
import KanbanBoard from '../components/KanbanBoard'
import { useTheme } from '../contexts/ThemeContext'
import { cn } from '../lib/utils'

function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await api.get('/api/dashboard')
      return res.data.data
    },
    refetchInterval: 60000,
  })
}

function SectionHeader({ children }) {
  const { isDark } = useTheme()
  return (
    <h2 className={cn(
      'text-xs font-bold uppercase tracking-wider mb-3',
      isDark ? 'text-slate-500' : 'text-slate-600',
    )}>{children}</h2>
  )
}

function EmptyCard({ children }) {
  const { isDark } = useTheme()
  return (
    <div className={cn(
      'text-sm rounded-xl border p-4',
      isDark
        ? 'text-slate-600 bg-dark-card border-dark-border'
        : 'text-slate-500 bg-white border-gray-300 shadow-sm',
    )}>
      {children}
    </div>
  )
}

export default function Dashboard() {
  const { data, isLoading, error } = useDashboard()
  const { isDark } = useTheme()
  const qc = useQueryClient()

  const syncMutation = useMutation({
    mutationFn: () => api.post('/api/gmail/sync'),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['dashboard'] }), 2000),
  })

  if (isLoading) return (
    <div className={cn('flex items-center gap-3 p-10 text-sm', isDark ? 'text-slate-500' : 'text-slate-500')}>
      <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      Loading dashboard...
    </div>
  )

  if (error) return (
    <div className="p-10 text-red-500 text-sm font-medium">
      Failed to load dashboard. Is the backend running?
    </div>
  )

  const stats = data?.stats || {}
  const kanban = data?.kanban || {}
  const todaysJobs = data?.todays_jobs || []
  const pendingFollowups = data?.pending_followups || []
  const recentActivity = data?.recent_activity || []

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-7"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className={cn('text-2xl font-bold', isDark ? 'text-slate-100' : 'text-slate-900')}>
          Dashboard
        </h1>
        <div className="flex items-center gap-3">
          {data?.last_synced_at && (
            <span className={cn('flex items-center gap-1.5 text-xs', isDark ? 'text-slate-500' : 'text-slate-500')}>
              <Clock size={12} />
              Synced {new Date(data.last_synced_at).toLocaleString()}
            </span>
          )}
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium',
              'bg-brand hover:bg-brand-hover text-white transition-all duration-150',
              'disabled:opacity-60 disabled:cursor-not-allowed shadow-sm shadow-brand/20',
            )}
          >
            <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync Gmail'}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-4 flex-wrap">
        <StatCard label="Total Applied" value={stats.total_applied ?? 0} />
        <StatCard label="Response Rate" value={`${stats.response_rate ?? 0}%`} sub="companies that replied" />
        <StatCard label="Interviewing" value={stats.interviewing ?? 0} />
        <StatCard
          label="Follow-ups Due"
          value={stats.followups_due ?? 0}
          sub={stats.followups_overdue > 0 ? `${stats.followups_overdue} overdue` : undefined}
          highlight={stats.followups_overdue > 0}
        />
      </div>

      {/* Kanban pipeline */}
      <section>
        <SectionHeader>Pipeline</SectionHeader>
        <KanbanBoard kanban={kanban} />
      </section>

      {/* Bottom row: 3 columns */}
      <div className="grid grid-cols-3 gap-5">

        {/* Today's Matches */}
        <section>
          <SectionHeader>
            <span className="flex items-center gap-1.5"><Briefcase size={11} /> Today's Matches</span>
          </SectionHeader>
          <div className="flex flex-col gap-2">
            {todaysJobs.length === 0 ? (
              <EmptyCard>No jobs yet — trigger a search</EmptyCard>
            ) : todaysJobs.map(job => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={cn(
                  'rounded-xl border p-3 transition-all duration-150',
                  isDark
                    ? 'bg-dark-card border-dark-border hover:border-brand/40'
                    : 'bg-white border-gray-300 shadow-sm hover:border-brand/60',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className={cn('text-[13px] font-semibold truncate', isDark ? 'text-slate-200' : 'text-slate-800')}>
                      {job.title}
                    </div>
                    <div className={cn('text-xs truncate', isDark ? 'text-slate-500' : 'text-slate-500')}>
                      {job.company_name}
                    </div>
                  </div>
                  <div className={cn(
                    'text-sm font-bold flex-shrink-0',
                    job.match_score >= 80 ? 'text-emerald-500' :
                    job.match_score >= 60 ? 'text-amber-500' :
                    isDark ? 'text-slate-500' : 'text-slate-400',
                  )}>
                    {job.match_score}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Pending Follow-ups */}
        <section>
          <SectionHeader>
            <span className="flex items-center gap-1.5"><Bell size={11} /> Pending Follow-ups</span>
          </SectionHeader>
          <div className="flex flex-col gap-2">
            {pendingFollowups.length === 0 ? (
              <EmptyCard>No follow-ups pending</EmptyCard>
            ) : pendingFollowups.map(fu => (
              <div
                key={fu.id}
                className={cn(
                  'rounded-xl border p-3 transition-all duration-150',
                  fu.is_overdue
                    ? isDark
                      ? 'bg-amber-400/5 border-amber-400/30'
                      : 'bg-amber-50 border-amber-300 shadow-sm'
                    : isDark
                      ? 'bg-dark-card border-dark-border'
                      : 'bg-white border-gray-300 shadow-sm',
                )}
              >
                <div className={cn(
                  'text-[13px] font-semibold',
                  fu.is_overdue ? 'text-amber-500' : isDark ? 'text-slate-200' : 'text-slate-800',
                )}>
                  {fu.company_name}
                </div>
                <div className={cn('text-xs mt-0.5', isDark ? 'text-slate-500' : 'text-slate-500')}>
                  {fu.note}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent Activity */}
        <section>
          <SectionHeader>
            <span className="flex items-center gap-1.5"><Activity size={11} /> Recent Activity</span>
          </SectionHeader>
          <div className={cn(
            'rounded-xl border overflow-hidden',
            isDark ? 'bg-dark-card border-dark-border' : 'bg-white border-gray-300 shadow-sm',
          )}>
            {recentActivity.length === 0 ? (
              <div className={cn('text-sm p-4', isDark ? 'text-slate-600' : 'text-slate-500')}>
                No activity yet
              </div>
            ) : recentActivity.map((a, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center justify-between px-3 py-2.5',
                  i < recentActivity.length - 1
                    ? isDark ? 'border-b border-dark-border' : 'border-b border-gray-100'
                    : '',
                )}
              >
                <div>
                  <span className={cn('text-[13px] font-semibold', isDark ? 'text-slate-200' : 'text-slate-800')}>
                    {a.company}
                  </span>
                  <span className={cn(
                    'text-xs ml-2 px-1.5 py-0.5 rounded font-medium',
                    isDark ? 'text-slate-500 bg-dark-surface' : 'text-slate-600 bg-slate-100',
                  )}>
                    {a.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className={cn('text-[11px]', isDark ? 'text-slate-600' : 'text-slate-400')}>
                  {a.updated_at ? new Date(a.updated_at).toLocaleDateString() : ''}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </motion.div>
  )
}
