import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Loader, Sparkles, CheckCircle, X, Briefcase, Copy, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import api from '../api/client'
import JobCard from '../components/JobCard'
import { useTheme } from '../contexts/ThemeContext'
import { cn } from '../lib/utils'

function DraftEmailModal({ job, onClose }) {
  const { isDark } = useTheme()
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState(null)
  const [copied, setCopied] = useState(false)

  useState(() => {
    api.post('/api/emails/draft', {
      company_name: job.company_name,
      role: job.title,
      job_description: job.description,
    })
      .then(res => setDraft(res.data.data))
      .catch(() => setDraft({ subject: 'Error', body: 'Failed to generate draft.' }))
      .finally(() => setLoading(false))
  }, [job])

  function copy() {
    navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
    setCopied(true)
    toast.success('Copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          className={cn(
            'w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden',
            isDark ? 'bg-dark-card border-dark-border' : 'bg-white border-gray-200',
          )}
          initial={{ scale: 0.95, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 12 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div className={cn('flex items-center justify-between px-6 py-4 border-b', isDark ? 'border-dark-border' : 'border-gray-100')}>
            <h3 className={cn('text-[15px] font-bold', isDark ? 'text-slate-100' : 'text-slate-900')}>
              Cold Email — {job.company_name}
            </h3>
            <button
              onClick={onClose}
              className={cn('w-7 h-7 rounded-lg flex items-center justify-center transition-colors', isDark ? 'hover:bg-dark-surface text-slate-500' : 'hover:bg-slate-100 text-slate-400')}
            >
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 max-h-[65vh] overflow-y-auto">
            {loading ? (
              <div className={cn('flex items-center justify-center gap-2.5 py-10 text-sm', isDark ? 'text-slate-500' : 'text-slate-400')}>
                <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                Generating draft...
              </div>
            ) : draft ? (
              <div className="flex flex-col gap-4">
                <div>
                  <div className={cn('text-xs font-bold uppercase tracking-wider mb-1.5', isDark ? 'text-slate-500' : 'text-slate-400')}>Subject</div>
                  <div className={cn('px-3 py-2.5 rounded-lg border text-sm', isDark ? 'bg-dark-surface border-dark-border text-slate-200' : 'bg-slate-50 border-gray-200 text-slate-800')}>
                    {draft.subject}
                  </div>
                </div>
                <div>
                  <div className={cn('text-xs font-bold uppercase tracking-wider mb-1.5', isDark ? 'text-slate-500' : 'text-slate-400')}>Body</div>
                  <pre className={cn('px-3 py-3 rounded-lg border text-sm whitespace-pre-wrap leading-relaxed font-[inherit]', isDark ? 'bg-dark-surface border-dark-border text-slate-300' : 'bg-slate-50 border-gray-200 text-slate-700')}>
                    {draft.body}
                  </pre>
                </div>
                <div className="flex gap-2.5 justify-end pt-1">
                  <button onClick={onClose} className={cn('px-4 py-2 rounded-lg text-sm border transition-colors', isDark ? 'border-dark-border text-slate-400 hover:text-slate-200' : 'border-gray-200 text-slate-500 hover:text-slate-700')}>
                    Close
                  </button>
                  <button onClick={copy} className="px-4 py-2 rounded-lg text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-colors flex items-center gap-1.5">
                    {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy</>}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

const SOURCES = [
  { key: 'all',        label: 'All',        color: null },
  { key: 'greenhouse', label: 'Greenhouse', color: '#8b5cf6' },
  { key: 'lever',      label: 'Lever',      color: '#f59e0b' },
  { key: 'ashby',      label: 'Ashby',      color: '#06b6d4' },
  { key: 'remotive',   label: 'Remotive',   color: '#3b82f6' },
  { key: 'remoteok',   label: 'RemoteOK',   color: '#22c55e' },
  { key: 'arbeitnow',  label: 'Arbeitnow',  color: '#84cc16' },
  { key: 'jsearch',    label: 'JSearch',    color: '#eab308' },
  { key: 'hn_hiring',  label: 'HN Hiring',  color: '#f97316' },
  { key: 'workday',    label: 'Workday',    color: '#6366f1' },
]

const STATUS_TABS = ['new', 'saved', 'dismissed']
const LOCAL_PREFIXES = ['title_match', 'skills:', 'secondary:', 'remote', 'has_salary', 'tag_match']

export default function JobSearch() {
  const { isDark } = useTheme()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('new')
  const [minScore, setMinScore] = useState(0)
  const [aiOnly, setAiOnly] = useState(false)
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [draftJob, setDraftJob] = useState(null)

  // Unified status — search/status now includes scoring_running + scoring_progress
  const { data: searchStatus } = useQuery({
    queryKey: ['searchStatus'],
    queryFn: async () => (await api.get('/api/search/status')).data.data,
    refetchInterval: (data) => (data?.running || data?.scoring_running) ? 2000 : 10000,
    onSuccess: (data) => {
      if (!data?.running && !data?.scoring_running) {
        qc.invalidateQueries({ queryKey: ['jobs'] })
      }
    },
  })

  // Keep for manual re-score button
  const { data: scoreStatus } = useQuery({
    queryKey: ['scoreStatus'],
    queryFn: async () => (await api.get('/api/jobs/score/status')).data.data,
    refetchInterval: (data) => data?.running ? 2000 : false,
    onSuccess: (data) => { if (!data?.running && data?.done > 0) qc.invalidateQueries({ queryKey: ['jobs'] }) },
  })

  // Merge scoring state from both sources
  const activeScoringStatus = (searchStatus?.scoring_running || scoreStatus?.running)
    ? {
        running: true,
        done: searchStatus?.scoring_done ?? scoreStatus?.done ?? 0,
        total: searchStatus?.scoring_total ?? scoreStatus?.total ?? 0,
        progress: searchStatus?.scoring_progress || scoreStatus?.progress || '',
      }
    : scoreStatus

  const { data: jobsData, isLoading } = useQuery({
    queryKey: ['jobs', activeTab, minScore],
    queryFn: async () => {
      const res = await api.get('/api/jobs', { params: { status: activeTab, min_score: minScore, limit: 100 } })
      return res.data.data
    },
    refetchInterval: (searchStatus?.running || searchStatus?.scoring_running || scoreStatus?.running) ? 3000 : false,
  })

  const searchMutation = useMutation({
    mutationFn: () => api.post('/api/search/trigger'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['searchStatus'] })
      toast.success('Job search triggered!')
    },
  })

  const scoreMutation = useMutation({
    mutationFn: () => api.post('/api/jobs/score'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scoreStatus'] })
      toast.success('AI scoring started')
    },
  })

  const cleanMutation = useMutation({
    mutationFn: () => api.post('/api/jobs/clean'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
      toast.success(res.data.data?.message || 'Jobs cleaned')
    },
  })

  const allJobs = jobsData?.jobs || []
  let jobs = allJobs
  if (sourceFilter !== 'all') jobs = jobs.filter(j => j.source === sourceFilter)
  if (remoteOnly) jobs = jobs.filter(j => (j.location || '').toLowerCase().includes('remote'))
  if (aiOnly) jobs = jobs.filter(j => j.match_reasons?.length > 0 && !LOCAL_PREFIXES.some(p => j.match_reasons[0]?.startsWith(p)))

  const sourceCounts = SOURCES.reduce((acc, s) => {
    acc[s.key] = s.key === 'all' ? allJobs.length : allJobs.filter(j => j.source === s.key).length
    return acc
  }, {})

  const isSearching = searchMutation.isPending || searchStatus?.running
  const isScoring = activeScoringStatus?.running
  // Show manual score button only if search+auto-scoring are done and jobs exist
  const showScoreBtn = jobsData?.total > 0 && !searchStatus?.running && !isScoring

  const cardBase = cn('rounded-2xl border', isDark ? 'bg-dark-card border-dark-border' : 'bg-white border-gray-200')
  const btnBase = 'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border transition-all duration-150'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-4"
    >
      {draftJob && <DraftEmailModal job={draftJob} onClose={() => setDraftJob(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className={cn('text-2xl font-bold', isDark ? 'text-slate-100' : 'text-slate-900')}>Job Search</h1>

        <div className="flex items-center gap-2 flex-wrap">
          {searchStatus?.running && (
            <span className="flex items-center gap-1.5 text-xs text-brand font-medium">
              <Loader size={12} className="animate-spin" />
              {searchStatus.progress || 'Searching...'}
            </span>
          )}

          <button
            onClick={() => { if (window.confirm('Remove all unscored irrelevant jobs and start fresh?')) cleanMutation.mutate() }}
            disabled={cleanMutation.isPending}
            className={cn(btnBase, isDark ? 'bg-dark-surface border-dark-border text-slate-400 hover:text-slate-200' : 'bg-slate-50 border-gray-200 text-slate-500 hover:text-slate-700')}
            title="Re-runs relevance filter and deletes unscored jobs that no longer match your profile"
          >
            🧹 Clean
          </button>

          <button
            onClick={() => searchMutation.mutate()}
            disabled={isSearching}
            className={cn(btnBase, isDark ? 'bg-dark-surface border-dark-border text-slate-300 hover:border-brand/50' : 'bg-white border-gray-200 text-slate-700 hover:border-brand/50', 'disabled:opacity-60')}
          >
            <Search size={14} /> {isSearching ? 'Searching...' : 'Search Now'}
          </button>

          {showScoreBtn && (
            <button
              onClick={() => scoreMutation.mutate()}
              disabled={isScoring}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-70"
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
      <div className={cn('flex items-center gap-2 flex-wrap px-4 py-3 rounded-2xl border', isDark ? 'bg-dark-card border-dark-border' : 'bg-white border-gray-300 shadow-sm')}>
        <span className={cn('text-[10px] font-bold uppercase tracking-widest mr-1', isDark ? 'text-slate-600' : 'text-slate-600')}>
          Source
        </span>
        {SOURCES.map(s => {
          const count = sourceCounts[s.key] || 0
          if (s.key !== 'all' && count === 0) return null
          const active = sourceFilter === s.key
          const isAll = s.key === 'all'
          return (
            <button
              key={s.key}
              onClick={() => setSourceFilter(s.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border-[1.5px] transition-all duration-150',
                active
                  ? isAll
                    ? isDark ? 'border-slate-300 bg-slate-300 text-slate-900' : 'border-slate-800 bg-slate-800 text-white'
                    : 'border-current'
                  : isDark ? 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-400' : 'border-gray-200 text-slate-400 hover:border-gray-300',
              )}
              style={active && !isAll ? { borderColor: s.color, color: s.color, background: s.color + '18' } : {}}
            >
              {!isAll && (
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
              )}
              {s.label} · {count}
              {s.key === 'hn_hiring' && count > 0 && (
                <span className="text-[9px] bg-orange-500 text-white rounded px-1 py-0.5 font-bold">NEW</span>
              )}
            </button>
          )
        })}

        <div className="ml-auto flex items-center gap-2">
          <span className={cn('text-[10px] font-bold uppercase tracking-widest', isDark ? 'text-slate-600' : 'text-slate-600')}>Score</span>
          <button
            onClick={() => setAiOnly(!aiOnly)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border-[1.5px] transition-all duration-150',
              aiOnly
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                : isDark ? 'border-slate-700 text-slate-500 hover:border-slate-600' : 'border-gray-200 text-slate-400 hover:border-gray-300',
            )}
          >
            <Sparkles size={11} />
            AI scored
          </button>
        </div>
      </div>

      {/* Secondary filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Status tabs */}
        <div className={cn('flex gap-1 p-1 rounded-lg', isDark ? 'bg-dark-surface' : 'bg-slate-100')}>
          {STATUS_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all duration-150',
                activeTab === tab
                  ? isDark ? 'bg-dark-card text-slate-200 shadow-sm' : 'bg-white text-slate-800 shadow-sm'
                  : isDark ? 'text-slate-500 hover:text-slate-400' : 'text-slate-400 hover:text-slate-600',
              )}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Remote only */}
        <label className={cn('flex items-center gap-1.5 cursor-pointer text-sm select-none font-medium', remoteOnly ? 'text-emerald-400' : isDark ? 'text-slate-500' : 'text-slate-400')}>
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={e => setRemoteOnly(e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-emerald-500 cursor-pointer"
          />
          Remote only
        </label>

        {/* Min score slider */}
        <div className="flex items-center gap-2 ml-auto">
          <span className={cn('text-xs', isDark ? 'text-slate-500' : 'text-slate-600')}>
            Min score: <span className={cn('font-bold', isDark ? 'text-slate-200' : 'text-slate-800')}>{minScore}</span>
          </span>
          <input
            type="range" min={0} max={100} value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
            className="w-24 accent-orange-500"
          />
        </div>

        {jobsData?.total > 0 && (
          <span className={cn('text-xs font-medium', isDark ? 'text-slate-600' : 'text-slate-500')}>
            {jobs.length} of {jobsData.total}
          </span>
        )}
      </div>

      {/* Search + Auto-scoring progress banners */}
      <AnimatePresence>
        {searchStatus?.running && (
          <motion.div
            key="search-progress"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="px-5 py-3 rounded-xl bg-brand/10 border border-brand/25 flex items-center gap-2.5"
          >
            <Loader size={14} className="text-brand animate-spin flex-shrink-0" />
            <span className="text-sm text-brand font-medium">{searchStatus.progress || 'Searching job boards...'}</span>
          </motion.div>
        )}

        {isScoring && activeScoringStatus?.total > 0 && (
          <motion.div
            key="scoring-progress"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="px-5 py-3.5 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center gap-3"
          >
            <Sparkles size={15} className="text-blue-400 animate-pulse flex-shrink-0" />
            <div className="flex-1">
              <div className="text-sm text-blue-300 font-medium mb-1.5">
                AI scoring your resume against {activeScoringStatus.total} jobs — {activeScoringStatus.done} done
              </div>
              <div className="h-1.5 bg-blue-500/20 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-blue-400 rounded-full"
                  animate={{ width: `${Math.round((activeScoringStatus.done / activeScoringStatus.total) * 100)}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {!isScoring && (activeScoringStatus?.progress?.includes('done') || activeScoringStatus?.progress?.includes('complete')) && (
          <motion.div
            key="scoring-done"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="px-5 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2.5"
          >
            <CheckCircle size={15} className="text-emerald-400" />
            <span className="text-sm text-emerald-300 font-medium">
              Jobs scored by resume match — best matches shown first. Use min score slider to filter.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Job grid */}
      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3.5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className={cn('h-44 rounded-2xl animate-pulse', isDark ? 'bg-dark-card' : 'bg-slate-100')} />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className={cn('flex flex-col items-center justify-center py-20 gap-3 rounded-2xl border', isDark ? 'bg-dark-card border-dark-border' : 'bg-white border-gray-200')}>
          <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', isDark ? 'bg-dark-surface' : 'bg-slate-100')}>
            <Briefcase size={22} className={isDark ? 'text-slate-600' : 'text-slate-400'} />
          </div>
          <p className={cn('text-sm text-center max-w-[260px]', isDark ? 'text-slate-500' : 'text-slate-500')}>
            {activeTab !== 'new'
              ? `No ${activeTab} jobs.`
              : aiOnly
                ? 'No AI-scored jobs yet. Run a search — scoring happens automatically.'
                : minScore > 0
                  ? `No jobs above score ${minScore}. Lower the min score slider.`
                  : 'No jobs yet. Click "Search Now" — AI scoring runs automatically after.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3.5">
          {jobs.map(job => (
            <JobCard key={job.id} job={job} onDraftEmail={setDraftJob} />
          ))}
        </div>
      )}
    </motion.div>
  )
}
