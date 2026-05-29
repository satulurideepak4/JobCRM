import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Loader, Trash2, Briefcase, Copy, Check, X, RefreshCw, Eye, EyeOff } from 'lucide-react'
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
  { key: 'all',            label: 'All',           color: null },
  { key: 'greenhouse',     label: 'Greenhouse',    color: '#8b5cf6' },
  { key: 'lever',          label: 'Lever',         color: '#f59e0b' },
  { key: 'ashby',          label: 'Ashby',         color: '#06b6d4' },
  { key: 'himalayas',      label: 'Himalayas',     color: '#10b981' },
  { key: 'weworkremotely', label: 'WWR',           color: '#3b82f6' },
  { key: 'themuse',        label: 'The Muse',      color: '#ec4899' },
  { key: 'workingnomads',  label: 'WorkNomads',    color: '#0ea5e9' },
  { key: 'remoteco',       label: 'Remote.co',     color: '#a855f7' },
  { key: 'workable',       label: 'Workable',      color: '#14b8a6' },
  { key: 'remotive',       label: 'Remotive',      color: '#6366f1' },
  { key: 'remoteok',       label: 'RemoteOK',      color: '#22c55e' },
  { key: 'yc_jobs',        label: 'YC Jobs',       color: '#f97316' },
  { key: 'hn_hiring',      label: 'HN Hiring',     color: '#f97316' },
  { key: 'jsearch',        label: 'JSearch',       color: '#eab308' },
  { key: 'arbeitnow',      label: 'Arbeitnow',     color: '#84cc16' },
]

// Keyword filter chips — checked client-side against title + description
const KEYWORD_CHIPS = [
  { key: 'java_go',     label: 'Java/Go',       terms: ['java', 'golang', 'go backend', 'jvm', 'kotlin'] },
  { key: 'kafka',       label: 'Kafka',         terms: ['kafka', 'event streaming', 'event-driven', 'rabbitmq', 'confluent', 'kinesis'] },
  { key: 'api',         label: 'API Platform',  terms: ['api gateway', 'api platform', 'api management', 'openapi', 'grpc', 'api tooling'] },
  { key: 'fintech',     label: 'Fintech',       terms: ['fintech', 'payments', 'banking', 'financial', 'transactions'] },
  { key: 'remote_only', label: 'Remote Only',   terms: ['remote'] },
]

const STATUS_TABS = ['new', 'saved', 'dismissed']

function daysAgo(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return '1 day ago'
  return `${diff} days ago`
}

export default function JobSearch() {
  const { isDark } = useTheme()
  const qc = useQueryClient()
  const [activeTab, setActiveTab]           = useState('new')
  const [minScore, setMinScore]             = useState(70)
  const [sourceFilter, setSourceFilter]     = useState('all')
  const [draftJob, setDraftJob]             = useState(null)
  const [showWeak, setShowWeak]             = useState(false)
  const [activeChips, setActiveChips]       = useState(new Set())

  const toggleChip = key =>
    setActiveChips(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  // Poll search status
  const { data: searchStatus } = useQuery({
    queryKey: ['searchStatus'],
    queryFn: async () => (await api.get('/api/search/status')).data.data,
    refetchInterval: (data) => data?.running ? 2000 : 10000,
    onSuccess: (data) => {
      if (!data?.running) qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  // Fetch jobs — always fetch score >= 0 so we can do client-side badge filtering
  const { data: jobsData, isLoading } = useQuery({
    queryKey: ['jobs', activeTab, minScore],
    queryFn: async () => {
      const res = await api.get('/api/jobs', { params: { status: activeTab, min_score: minScore, limit: 200 } })
      return res.data.data
    },
    refetchInterval: searchStatus?.running ? 3000 : false,
  })

  const searchMutation = useMutation({
    mutationFn: () => api.post('/api/search/trigger'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['searchStatus'] })
      toast.success('Job search started — results ranked automatically')
    },
  })

  const rescoreMutation = useMutation({
    mutationFn: () => api.post('/api/jobs/score'),
    onSuccess: () => {
      toast.success('Re-scoring jobs against updated profile…')
      setTimeout(() => qc.invalidateQueries({ queryKey: ['jobs'] }), 3000)
    },
  })

  const clearMutation = useMutation({
    mutationFn: () => api.delete('/api/jobs/all'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
      toast.success(res.data.data?.message || 'All jobs cleared')
    },
  })

  const allJobs = jobsData?.jobs || []

  // Client-side filtering + sorting
  const jobs = useMemo(() => {
    let list = allJobs

    // Source filter
    if (sourceFilter !== 'all') list = list.filter(j => j.source === sourceFilter)

    // Keyword chip filters (AND across chips)
    if (activeChips.size > 0) {
      list = list.filter(job => {
        const haystack = `${job.title} ${job.description || ''} ${(job.tags || []).join(' ')}`.toLowerCase()
        return [...activeChips].every(chipKey => {
          const chip = KEYWORD_CHIPS.find(c => c.key === chipKey)
          return chip && chip.terms.some(t => haystack.includes(t))
        })
      })
    }

    // "Remote Only" chip (also checks location)
    if (activeChips.has('remote_only')) {
      list = list.filter(j => (j.location || '').toLowerCase().includes('remote'))
    }

    // Score buckets
    const strong = list.filter(j => j.match_score >= 80)
    const good   = list.filter(j => j.match_score >= 60 && j.match_score < 80)
    const weak   = list.filter(j => j.match_score < 60)

    // Sort each bucket by score desc
    const sortByScore = arr => [...arr].sort((a, b) => (b.match_score || 0) - (a.match_score || 0))

    const visible = [...sortByScore(strong), ...sortByScore(good)]
    if (showWeak) visible.push(...sortByScore(weak))

    return visible
  }, [allJobs, sourceFilter, activeChips, showWeak])

  const sourceCounts = SOURCES.reduce((acc, s) => {
    acc[s.key] = s.key === 'all' ? allJobs.length : allJobs.filter(j => j.source === s.key).length
    return acc
  }, {})

  const strongCount = allJobs.filter(j => j.match_score >= 80).length
  const goodCount   = allJobs.filter(j => j.match_score >= 60 && j.match_score < 80).length
  const weakCount   = allJobs.filter(j => j.match_score < 60).length

  const isSearching = searchMutation.isPending || searchStatus?.running
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
        <div>
          <h1 className={cn('text-2xl font-bold', isDark ? 'text-slate-100' : 'text-slate-900')}>Job Search</h1>
          <p className={cn('text-xs mt-0.5', isDark ? 'text-slate-500' : 'text-slate-400')}>
            Auto-scored by LLM after each search · sorted by match quality
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              if (window.confirm('Delete ALL jobs from the database and start fresh?')) {
                clearMutation.mutate()
              }
            }}
            disabled={clearMutation.isPending || isSearching}
            className={cn(btnBase, 'text-red-400 border-red-500/30 hover:bg-red-500/10 disabled:opacity-40',
              isDark ? 'bg-dark-surface' : 'bg-white')}
          >
            <Trash2 size={13} />
            {clearMutation.isPending ? 'Clearing…' : 'Clear all'}
          </button>

          <button
            onClick={() => rescoreMutation.mutate()}
            disabled={rescoreMutation.isPending || isSearching || allJobs.length === 0}
            className={cn(btnBase, isDark
              ? 'bg-dark-surface border-dark-border text-slate-400 hover:text-slate-200 disabled:opacity-40'
              : 'bg-white border-gray-200 text-slate-500 hover:text-slate-700 disabled:opacity-40')}
          >
            <RefreshCw size={13} className={rescoreMutation.isPending ? 'animate-spin' : ''} />
            Re-score
          </button>

          <button
            onClick={() => searchMutation.mutate()}
            disabled={isSearching}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-brand hover:bg-brand/90 text-white transition-colors disabled:opacity-60"
          >
            {isSearching
              ? <><Loader size={13} className="animate-spin" /> Searching…</>
              : <><Search size={13} /> Search Jobs</>}
          </button>
        </div>
      </div>

      {/* Score summary bar */}
      {allJobs.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-xs font-semibold text-emerald-400">{strongCount} Strong Match</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30">
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="text-xs font-semibold text-amber-400">{goodCount} Good Match</span>
          </div>
          {weakCount > 0 && (
            <button
              onClick={() => setShowWeak(v => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors',
                showWeak
                  ? isDark ? 'bg-slate-700 border-slate-600 text-slate-300' : 'bg-slate-200 border-slate-300 text-slate-600'
                  : isDark ? 'border-slate-700 text-slate-600 hover:text-slate-400' : 'border-gray-300 text-slate-400 hover:text-slate-600'
              )}
            >
              {showWeak ? <EyeOff size={11} /> : <Eye size={11} />}
              {showWeak ? 'Hide' : 'Show'} weak ({weakCount})
            </button>
          )}
        </div>
      )}

      {/* Search progress banner */}
      <AnimatePresence>
        {isSearching && (
          <motion.div
            key="search-progress"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="px-5 py-3.5 rounded-xl bg-brand/10 border border-brand/25 flex items-center gap-2.5"
          >
            <Loader size={14} className="text-brand animate-spin flex-shrink-0" />
            <span className="text-sm text-brand font-medium">
              {searchStatus?.progress || 'Fetching from all job boards…'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Source filter bar */}
      <div className={cn('flex items-center gap-2 flex-wrap px-4 py-3 rounded-2xl border', isDark ? 'bg-dark-card border-dark-border' : 'bg-white border-gray-300 shadow-sm')}>
        <span className={cn('text-[10px] font-bold uppercase tracking-widest mr-1', isDark ? 'text-slate-600' : 'text-slate-500')}>
          Source
        </span>
        {SOURCES.map(s => {
          const count  = sourceCounts[s.key] || 0
          if (s.key !== 'all' && count === 0) return null
          const active = sourceFilter === s.key
          const isAll  = s.key === 'all'
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
              {!isAll && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />}
              {s.label} · {count}
            </button>
          )
        })}
      </div>

      {/* Keyword filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn('text-[10px] font-bold uppercase tracking-widest', isDark ? 'text-slate-600' : 'text-slate-500')}>
          Filter
        </span>
        {KEYWORD_CHIPS.map(chip => {
          const active = activeChips.has(chip.key)
          return (
            <button
              key={chip.key}
              onClick={() => toggleChip(chip.key)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-semibold border-[1.5px] transition-all duration-150',
                active
                  ? 'border-brand bg-brand/15 text-brand'
                  : isDark
                    ? 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-400'
                    : 'border-gray-200 text-slate-400 hover:border-gray-300 hover:text-slate-600',
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* Filters row */}
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

        {/* Min score slider */}
        <div className="flex items-center gap-2 ml-auto">
          <span className={cn('text-xs', isDark ? 'text-slate-500' : 'text-slate-600')}>
            Min score: <span className={cn('font-bold', isDark ? 'text-slate-200' : 'text-slate-800')}>{minScore}</span>
          </span>
          <input
            type="range" min={0} max={100} step={5} value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
            className="w-28 accent-brand"
          />
        </div>

        {jobsData?.total > 0 && (
          <span className={cn('text-xs font-medium', isDark ? 'text-slate-600' : 'text-slate-500')}>
            {jobs.length} of {jobsData.total} jobs
          </span>
        )}
      </div>

      {/* Job grid */}
      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3.5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className={cn('h-44 rounded-2xl animate-pulse', isDark ? 'bg-dark-card' : 'bg-slate-100')} />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className={cn('flex flex-col items-center justify-center py-20 gap-4 rounded-2xl border', isDark ? 'bg-dark-card border-dark-border' : 'bg-white border-gray-200')}>
          <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', isDark ? 'bg-dark-surface' : 'bg-slate-100')}>
            <Briefcase size={22} className={isDark ? 'text-slate-600' : 'text-slate-400'} />
          </div>
          <div className="text-center max-w-[280px]">
            <p className={cn('text-sm font-medium mb-1', isDark ? 'text-slate-400' : 'text-slate-600')}>
              {activeTab !== 'new'
                ? `No ${activeTab} jobs yet.`
                : allJobs.length > 0
                  ? 'No jobs match the active filters.'
                  : 'No jobs yet.'}
            </p>
            <p className={cn('text-xs', isDark ? 'text-slate-600' : 'text-slate-400')}>
              {activeTab === 'new' && allJobs.length === 0
                ? 'Click "Search Jobs" — results are auto-scored by LLM and sorted by match quality.'
                : ''}
            </p>
          </div>
          {activeTab === 'new' && allJobs.length === 0 && (
            <button
              onClick={() => searchMutation.mutate()}
              disabled={isSearching}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-brand hover:bg-brand/90 text-white transition-colors disabled:opacity-60"
            >
              <Search size={13} /> Search Jobs
            </button>
          )}
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
