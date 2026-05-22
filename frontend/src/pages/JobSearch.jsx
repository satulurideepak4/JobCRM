import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Loader, Sparkles, CheckCircle, X } from 'lucide-react'
import api from '../api/client'
import JobCard from '../components/JobCard'

function DraftEmailModal({ job, onClose }) {
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState(null)
  const [copied, setCopied] = useState(false)

  useState(() => {
    async function generate() {
      setLoading(true)
      try {
        const res = await api.post('/api/emails/draft', {
          company_name: job.company_name,
          role: job.title,
          job_description: job.description,
        })
        setDraft(res.data.data)
      } catch {
        setDraft({ subject: 'Error', body: 'Failed to generate draft.' })
      } finally {
        setLoading(false)
      }
    }
    generate()
  }, [job])

  function copy() {
    navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000055', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '540px', maxHeight: '80vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ color: 'var(--text)', fontWeight: '700', fontSize: '16px' }}>Cold Email — {job.company_name}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)', padding: '4px' }}><X size={16} /></button>
        </div>
        {loading ? (
          <div style={{ color: 'var(--text-4)', textAlign: 'center', padding: '32px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
            <Loader size={16} /> Generating draft...
          </div>
        ) : draft ? (
          <>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-4)', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Subject</div>
              <div style={{ padding: '10px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px', color: 'var(--text)' }}>{draft.subject}</div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-4)', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Body</div>
              <pre style={{ padding: '12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', color: 'var(--text-2)', whiteSpace: 'pre-wrap', lineHeight: '1.6', fontFamily: 'inherit' }}>{draft.body}</pre>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-3)', cursor: 'pointer', fontSize: '13px' }}>Close</button>
              <button onClick={copy} style={{ padding: '8px 16px', borderRadius: '6px', background: '#f97316', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>{copied ? 'Copied!' : 'Copy to Clipboard'}</button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

const SOURCES = [
  { key: 'all',        label: 'All',        color: null },
  { key: 'remotive',   label: 'Remotive',   color: '#3b82f6' },
  { key: 'arbeitnow',  label: 'Arbeitnow',  color: '#22c55e' },
  { key: 'greenhouse', label: 'Greenhouse', color: '#8b5cf6' },
  { key: 'lever',      label: 'Lever',      color: '#f59e0b' },
  { key: 'ashby',      label: 'Ashby',      color: '#06b6d4' },
  { key: 'jsearch',    label: 'JSearch',    color: '#eab308' },
  { key: 'hn_hiring',  label: 'HN Hiring',  color: '#f97316' },
  { key: 'workday',    label: 'Workday',    color: '#6366f1' },
]

export default function JobSearch() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('new')
  const [minScore, setMinScore] = useState(0)
  const [aiOnly, setAiOnly] = useState(false)
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [draftJob, setDraftJob] = useState(null)

  const { data: searchStatus } = useQuery({
    queryKey: ['searchStatus'],
    queryFn: async () => (await api.get('/api/search/status')).data.data,
    refetchInterval: (data) => data?.running ? 2000 : false,
    onSuccess: (data) => {
      if (!data?.running) qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const { data: scoreStatus } = useQuery({
    queryKey: ['scoreStatus'],
    queryFn: async () => (await api.get('/api/jobs/score/status')).data.data,
    refetchInterval: (data) => data?.running ? 2000 : false,
    onSuccess: (data) => {
      if (!data?.running && data?.done > 0) qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const { data: jobsData, isLoading } = useQuery({
    queryKey: ['jobs', activeTab, minScore],
    queryFn: async () => {
      const res = await api.get('/api/jobs', { params: { status: activeTab, min_score: minScore, limit: 100 } })
      return res.data.data
    },
    refetchInterval: (searchStatus?.running || scoreStatus?.running) ? 3000 : false,
  })

  const searchMutation = useMutation({
    mutationFn: () => api.post('/api/search/trigger'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['searchStatus'] }),
  })

  const scoreMutation = useMutation({
    mutationFn: () => api.post('/api/jobs/score'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scoreStatus'] }),
  })

  const cleanMutation = useMutation({
    mutationFn: () => api.post('/api/jobs/clean'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
      alert(res.data.data?.message || 'Done')
    },
  })

  const allJobs = jobsData?.jobs || []

  const LOCAL_PREFIXES = ['title_match', 'skills:', 'secondary:', 'remote', 'has_salary', 'tag_match']

  let jobs = allJobs
  if (sourceFilter !== 'all') jobs = jobs.filter(j => j.source === sourceFilter)
  if (remoteOnly) jobs = jobs.filter(j => (j.location || '').toLowerCase().includes('remote'))
  if (aiOnly) {
    jobs = jobs.filter(j =>
      j.match_reasons?.length > 0 &&
      !LOCAL_PREFIXES.some(p => j.match_reasons[0]?.startsWith(p))
    )
  }

  const sourceCounts = SOURCES.reduce((acc, s) => {
    acc[s.key] = s.key === 'all' ? allJobs.length : allJobs.filter(j => j.source === s.key).length
    return acc
  }, {})

  const isSearching = searchMutation.isPending || searchStatus?.running
  const isScoring = scoreStatus?.running
  const showBanner = jobsData?.total > 0 && !searchStatus?.running

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {draftJob && <DraftEmailModal job={draftJob} onClose={() => setDraftJob(null)} />}

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text)' }}>Job Search</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {searchStatus?.running && (
            <span style={{ fontSize: '12px', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Loader size={12} /> {searchStatus.progress || 'Searching...'}
            </span>
          )}
          <button
            onClick={() => { if (window.confirm('Remove all unscored irrelevant jobs and start fresh?')) cleanMutation.mutate() }}
            disabled={cleanMutation.isPending}
            title="Re-runs relevance filter and deletes unscored jobs that no longer match your profile"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '8px',
              background: 'var(--card)', color: 'var(--text-3)',
              border: '1px solid var(--border)', cursor: 'pointer', fontSize: '13px',
              opacity: cleanMutation.isPending ? 0.6 : 1,
            }}
          >
            🧹 Clean
          </button>
          <button
            onClick={() => searchMutation.mutate()}
            disabled={isSearching}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '8px',
              background: 'var(--card)', color: 'var(--text-2)',
              border: '1px solid var(--border)', cursor: 'pointer', fontSize: '13px',
              fontWeight: '500', opacity: isSearching ? 0.6 : 1,
              boxShadow: 'var(--shadow)',
            }}
          >
            <Search size={13} /> Search Now
          </button>
          {showBanner && (
            <button
              onClick={() => scoreMutation.mutate()}
              disabled={isScoring}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '8px',
                background: '#f97316', color: '#fff',
                border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                opacity: isScoring ? 0.7 : 1,
              }}
            >
              <Sparkles size={13} />
              {isScoring
                ? `Scoring ${scoreStatus.done}/${scoreStatus.total}…`
                : scoreStatus?.progress?.startsWith('completed')
                  ? '✓ Scored'
                  : '+ Score with AI'}
            </button>
          )}
        </div>
      </div>

      {/* Source filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', padding: '12px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: 'var(--shadow)' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-4)', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', marginRight: '4px' }}>Source</span>
        {SOURCES.map(s => {
          const count = sourceCounts[s.key] || 0
          if (s.key !== 'all' && count === 0) return null
          const active = sourceFilter === s.key
          const isAll = s.key === 'all'
          return (
            <button
              key={s.key}
              onClick={() => setSourceFilter(s.key)}
              style={{
                padding: '4px 11px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                cursor: 'pointer', border: '1.5px solid',
                borderColor: active ? (isAll ? 'var(--text)' : s.color) : 'var(--border)',
                background: active ? (isAll ? 'var(--text)' : s.color + '18') : 'var(--card)',
                color: active ? (isAll ? 'var(--bg)' : s.color) : 'var(--text-3)',
                display: 'flex', alignItems: 'center', gap: '5px',
                transition: 'all 0.15s',
              }}
            >
              {!isAll && (
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.color, display: 'inline-block', flexShrink: 0 }} />
              )}
              {s.label} · {count}
              {s.key === 'hn_hiring' && count > 0 && (
                <span style={{ fontSize: '9px', background: '#f97316', color: '#fff', borderRadius: '4px', padding: '1px 4px', fontWeight: '700', letterSpacing: '0.3px' }}>NEW</span>
              )}
            </button>
          )
        })}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-4)', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Score</span>
          <button
            onClick={() => setAiOnly(!aiOnly)}
            style={{
              padding: '4px 11px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
              cursor: 'pointer', border: '1.5px solid',
              borderColor: aiOnly ? '#22c55e' : 'var(--border)',
              background: aiOnly ? '#dcfce7' : 'var(--card)',
              color: aiOnly ? '#16a34a' : 'var(--text-3)',
              display: 'flex', alignItems: 'center', gap: '5px',
            }}
          >
            <Sparkles size={11} color={aiOnly ? '#16a34a' : 'var(--text-4)'} />
            AI scored only
          </button>
        </div>
      </div>

      {/* Secondary filters */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Status tabs */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--border-light)', padding: '3px', borderRadius: '8px' }}>
          {['new', 'saved', 'dismissed'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '5px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                background: activeTab === tab ? 'var(--card)' : 'transparent',
                color: activeTab === tab ? 'var(--text)' : 'var(--text-4)',
                border: 'none',
                boxShadow: activeTab === tab ? 'var(--shadow)' : 'none',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Remote only */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: remoteOnly ? '#16a34a' : 'var(--text-3)', fontWeight: remoteOnly ? '600' : '400', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={e => setRemoteOnly(e.target.checked)}
            style={{ accentColor: '#22c55e', width: '14px', height: '14px' }}
          />
          Remote only
        </label>

        {/* Min score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-4)' }}>Min score: <b style={{ color: 'var(--text)' }}>{minScore}</b></span>
          <input
            type="range" min={0} max={100} value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
            style={{ width: '100px', accentColor: '#f97316' }}
          />
        </div>

        {/* Count */}
        {jobsData?.total > 0 && (
          <span style={{ fontSize: '12px', color: 'var(--text-4)' }}>
            {jobs.length} of {jobsData.total}
          </span>
        )}
      </div>

      {/* Scoring progress banner */}
      {isScoring && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Loader size={15} color="#3b82f6" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', color: '#1e40af', marginBottom: '6px', fontWeight: '500' }}>
              AI scoring in progress — {scoreStatus.done} of {scoreStatus.total} jobs
            </div>
            <div style={{ height: '4px', background: '#bfdbfe', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((scoreStatus.done / scoreStatus.total) * 100)}%`, background: '#3b82f6', borderRadius: '2px', transition: 'width 0.5s' }} />
            </div>
          </div>
        </div>
      )}

      {scoreStatus?.progress?.startsWith('completed') && !isScoring && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CheckCircle size={15} color="#22c55e" />
          <span style={{ fontSize: '13px', color: '#15803d', fontWeight: '500' }}>AI scoring complete — jobs ranked by match score.</span>
        </div>
      )}

      {/* Job grid */}
      {isLoading ? (
        <div style={{ color: 'var(--text-4)', textAlign: 'center', padding: '60px', fontSize: '14px' }}>Loading jobs...</div>
      ) : jobs.length === 0 ? (
        <div style={{ color: 'var(--text-4)', fontSize: '14px', textAlign: 'center', padding: '60px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          {jobsData?.total > 0 && aiOnly
            ? 'No AI-scored jobs yet. Click "+ Score with AI" above.'
            : activeTab !== 'new'
              ? `No ${activeTab} jobs.`
              : 'No jobs found. Click "Search Now" to fetch jobs.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
          {jobs.map(job => (
            <JobCard key={job.id} job={job} onDraftEmail={setDraftJob} />
          ))}
        </div>
      )}
    </div>
  )
}
