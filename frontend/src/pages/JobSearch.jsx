import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Loader, Sparkles, CheckCircle } from 'lucide-react'
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
    <div style={{ position: 'fixed', inset: 0, background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '24px', width: '540px', maxHeight: '80vh', overflow: 'auto' }}>
        <h3 style={{ color: '#e2e8f0', marginBottom: '16px' }}>Cold Email Draft — {job.company_name}</h3>
        {loading ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '24px' }}>Generating draft...</div>
        ) : draft ? (
          <>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Subject</div>
              <div style={{ padding: '10px 12px', background: '#0f172a', borderRadius: '6px', fontSize: '14px', color: '#e2e8f0' }}>{draft.subject}</div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Body</div>
              <pre style={{ padding: '12px', background: '#0f172a', borderRadius: '6px', fontSize: '13px', color: '#94a3b8', whiteSpace: 'pre-wrap', lineHeight: '1.6', fontFamily: 'inherit' }}>{draft.body}</pre>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '13px' }}>Close</button>
              <button onClick={copy} style={{ padding: '8px 16px', borderRadius: '6px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px' }}>{copied ? 'Copied!' : 'Copy to Clipboard'}</button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

function ScoringBanner({ status, onScore }) {
  if (!status) return null

  if (status.running) {
    const pct = status.total > 0 ? Math.round((status.done / status.total) * 100) : 0
    return (
      <div style={{ background: '#1e293b', border: '1px solid #6366f1', borderRadius: '10px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Loader size={16} color="#6366f1" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', color: '#e2e8f0', marginBottom: '6px' }}>
            AI scoring in progress... {status.done} of {status.total} jobs
          </div>
          <div style={{ height: '4px', background: '#334155', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#6366f1', borderRadius: '2px', transition: 'width 0.5s' }} />
          </div>
        </div>
        <span style={{ fontSize: '13px', color: '#6366f1', fontWeight: '600' }}>{pct}%</span>
      </div>
    )
  }

  if (status.progress?.startsWith('completed')) {
    return (
      <div style={{ background: '#22c55e11', border: '1px solid #22c55e33', borderRadius: '10px', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <CheckCircle size={16} color="#22c55e" />
        <span style={{ fontSize: '13px', color: '#22c55e' }}>AI scoring complete. Jobs are now ranked by match score.</span>
      </div>
    )
  }

  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: '14px', color: '#e2e8f0', fontWeight: '500', marginBottom: '2px' }}>
          Jobs loaded. Want AI-ranked results?
        </div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          Score with AI to get 0-100 match scores, reasons, and better ranking.
        </div>
      </div>
      <button
        onClick={onScore}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', borderRadius: '8px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap' }}
      >
        <Sparkles size={14} /> Score with AI
      </button>
    </div>
  )
}

export default function JobSearch() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('new')
  const [minScore, setMinScore] = useState(0)
  const [aiOnly, setAiOnly] = useState(false)
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

  let jobs = jobsData?.jobs || []

  // If AI only filter is on, show only jobs with AI scores (non-local reasons)
  const localPrefixes = ['title_match', 'skills:', 'secondary:', 'remote', 'has_salary', 'tag_match']
  if (aiOnly) {
    jobs = jobs.filter(j =>
      j.match_reasons?.length > 0 &&
      !localPrefixes.some(p => j.match_reasons[0]?.startsWith(p))
    )
  }

  const showScoringBanner = jobsData?.total > 0 && !searchStatus?.running

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {draftJob && <DraftEmailModal job={draftJob} onClose={() => setDraftJob(null)} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#e2e8f0' }}>Job Search</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {searchStatus?.running && (
            <span style={{ fontSize: '13px', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Loader size={13} /> {searchStatus.progress || 'Searching...'}
            </span>
          )}
          <button
            onClick={() => searchMutation.mutate()}
            disabled={searchMutation.isPending || searchStatus?.running}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '8px', background: '#6366f1', color: '#fff',
              border: 'none', cursor: 'pointer', fontSize: '13px',
              opacity: (searchMutation.isPending || searchStatus?.running) ? 0.7 : 1,
            }}
          >
            <Search size={14} /> Search Now
          </button>
        </div>
      </div>

      {/* Scoring banner */}
      {showScoringBanner && (
        <ScoringBanner
          status={scoreStatus}
          onScore={() => scoreMutation.mutate()}
        />
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '14px 20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['new', 'saved', 'dismissed'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '6px 14px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer',
                background: activeTab === tab ? '#6366f1' : 'transparent',
                color: activeTab === tab ? '#fff' : '#94a3b8',
                border: activeTab === tab ? 'none' : '1px solid #334155',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            id="aiOnly"
            checked={aiOnly}
            onChange={e => setAiOnly(e.target.checked)}
            style={{ accentColor: '#6366f1' }}
          />
          <label htmlFor="aiOnly" style={{ fontSize: '13px', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Sparkles size={12} color="#6366f1" /> AI scored only
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
          <label style={{ fontSize: '13px', color: '#94a3b8' }}>Min score: {minScore}</label>
          <input
            type="range" min={0} max={100} value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
            style={{ width: '120px', accentColor: '#6366f1' }}
          />
        </div>

        {jobsData?.total > 0 && (
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            {jobs.length} of {jobsData.total} jobs
          </span>
        )}
      </div>

      {isLoading ? (
        <div style={{ color: '#64748b' }}>Loading jobs...</div>
      ) : jobs.length === 0 ? (
        <div style={{ color: '#475569', fontSize: '14px', textAlign: 'center', padding: '40px' }}>
          {jobsData?.total > 0 && aiOnly
            ? 'No AI-scored jobs yet. Click "Score with AI" above.'
            : 'No jobs found. Click "Search Now" to fetch jobs.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {jobs.map(job => (
            <JobCard key={job.id} job={job} onDraftEmail={setDraftJob} />
          ))}
        </div>
      )}
    </div>
  )
}
