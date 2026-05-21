import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Clock } from 'lucide-react'
import api from '../api/client'
import StatCard from '../components/StatCard'
import KanbanBoard from '../components/KanbanBoard'

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

export default function Dashboard() {
  const { data, isLoading, error } = useDashboard()
  const qc = useQueryClient()

  const syncMutation = useMutation({
    mutationFn: () => api.post('/api/gmail/sync'),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['dashboard'] }), 2000),
  })

  if (isLoading) return <div style={{ color: '#64748b', padding: '40px' }}>Loading dashboard...</div>
  if (error) return <div style={{ color: '#ef4444', padding: '40px' }}>Failed to load dashboard. Is the backend running?</div>

  const stats = data?.stats || {}
  const kanban = data?.kanban || {}
  const todaysJobs = data?.todays_jobs || []
  const pendingFollowups = data?.pending_followups || []
  const recentActivity = data?.recent_activity || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#e2e8f0' }}>Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {data?.last_synced_at && (
            <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} /> Synced {new Date(data.last_synced_at).toLocaleString()}
            </span>
          )}
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '8px', fontSize: '13px',
              background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer',
              opacity: syncMutation.isPending ? 0.7 : 1,
            }}
          >
            <RefreshCw size={14} className={syncMutation.isPending ? 'spin' : ''} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
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

      {/* Kanban */}
      <section>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#94a3b8', marginBottom: '14px' }}>Pipeline</h2>
        <KanbanBoard kanban={kanban} />
      </section>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
        {/* Today's jobs */}
        <section style={{ gridColumn: 'span 1' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#94a3b8', marginBottom: '12px' }}>Today's Matches</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {todaysJobs.length === 0 ? (
              <div style={{ color: '#475569', fontSize: '13px' }}>No jobs yet — trigger a search</div>
            ) : todaysJobs.map(job => (
              <div key={job.id} style={{
                background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '12px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#e2e8f0' }}>{job.title}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{job.company_name}</div>
                  </div>
                  <div style={{
                    fontSize: '14px', fontWeight: '700',
                    color: job.match_score >= 80 ? '#22c55e' : job.match_score >= 60 ? '#f59e0b' : '#64748b',
                  }}>{job.match_score}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pending follow-ups */}
        <section>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#94a3b8', marginBottom: '12px' }}>Pending Follow-ups</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pendingFollowups.length === 0 ? (
              <div style={{ color: '#475569', fontSize: '13px' }}>No follow-ups pending</div>
            ) : pendingFollowups.map(fu => (
              <div key={fu.id} style={{
                background: '#1e293b',
                border: `1px solid ${fu.is_overdue ? '#f59e0b' : '#334155'}`,
                borderRadius: '8px', padding: '12px',
              }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: fu.is_overdue ? '#f59e0b' : '#e2e8f0' }}>
                  {fu.company_name}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{fu.note}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent activity */}
        <section>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#94a3b8', marginBottom: '12px' }}>Recent Activity</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recentActivity.length === 0 ? (
              <div style={{ color: '#475569', fontSize: '13px' }}>No activity yet</div>
            ) : recentActivity.map((a, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1e293b' }}>
                <div>
                  <span style={{ fontSize: '13px', color: '#e2e8f0' }}>{a.company}</span>
                  <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>{a.status.replace(/_/g, ' ')}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#475569' }}>
                  {a.updated_at ? new Date(a.updated_at).toLocaleDateString() : ''}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
