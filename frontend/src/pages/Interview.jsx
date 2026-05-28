import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic, Brain, Star, ChevronDown, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import api from '../api/client'
import { useTheme } from '../contexts/ThemeContext'
import { cn } from '../lib/utils'

const isChrome = () => {
  const ua = navigator.userAgent
  return /Chrome/.test(ua) && /Google Inc/.test(navigator.vendor)
}

const modeOptions = [
  {
    id: 'job',
    label: 'Interview for a Job',
    description: 'Practice for a specific job posting',
    icon: Mic,
    color: '#6366f1',
  },
  {
    id: 'concept',
    label: 'Practice a Concept',
    description: 'Deep dive into a topic or skill area',
    icon: Brain,
    color: '#10b981',
  },
  {
    id: 'both',
    label: 'Both',
    description: 'Job-specific + concept questions',
    icon: Star,
    color: '#f59e0b',
  },
]

const questionCounts = [5, 8, 10, 15]

const SESSION_MODE_STYLE = {
  job:     { bg: 'bg-brand/10',    text: 'text-brand',      label: 'Job' },
  concept: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Concept' },
  both:    { bg: 'bg-amber-500/10', text: 'text-amber-400',  label: 'Both' },
}

export default function Interview() {
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const [mode, setMode] = useState('job')
  const [jobs, setJobs] = useState([])
  const [selectedJobId, setSelectedJobId] = useState('')
  const [customJd, setCustomJd] = useState('')
  const [useCustomJd, setUseCustomJd] = useState(false)
  const [concept, setConcept] = useState('')
  const [totalQuestions, setTotalQuestions] = useState(10)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState(null)
  const [pastSessions, setPastSessions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(true)

  useEffect(() => {
    api.get('/api/jobs?limit=50&page=1')
      .then(res => {
        const data = res.data?.data?.jobs || res.data?.jobs || []
        setJobs(data)
      })
      .catch(() => setJobs([]))

    api.get('/api/interview/sessions')
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : []
        setPastSessions(data)
      })
      .catch(() => setPastSessions([]))
      .finally(() => setLoadingSessions(false))
  }, [])

  const handleStart = async () => {
    setStartError(null)
    setStarting(true)
    try {
      const body = { mode, total_questions: totalQuestions }

      if (mode === 'job' || mode === 'both') {
        if (useCustomJd) body.jd_text = customJd.trim()
        else if (selectedJobId) body.job_id = parseInt(selectedJobId)
      }

      if (mode === 'concept' || mode === 'both') {
        body.concept = concept.trim()
      }

      const res = await api.post('/api/interview/start', body)
      if (res.data?.session_id) {
        navigate(`/interview/${res.data.session_id}`)
      } else {
        setStartError('Failed to start interview. Please try again.')
      }
    } catch (err) {
      setStartError(err.response?.data?.detail || err.message || 'Failed to start interview.')
    } finally {
      setStarting(false)
    }
  }

  const canStart = () => {
    if (mode === 'job' || mode === 'both') {
      const hasJob = useCustomJd ? customJd.trim().length > 10 : !!selectedJobId
      if (mode === 'job') return hasJob
      return hasJob && concept.trim().length > 1
    }
    if (mode === 'concept') return concept.trim().length > 1
    return false
  }

  const inputCls = cn(
    'w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-all duration-150',
    'focus:ring-2 focus:ring-brand/40 focus:border-brand',
    isDark
      ? 'bg-[#0f1117] border-slate-700 text-slate-200 placeholder:text-slate-600'
      : 'bg-slate-50 border-gray-200 text-slate-900 placeholder:text-slate-400',
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-2xl mx-auto pb-16"
    >
      {/* Chrome warning */}
      {!isChrome() && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-300 text-sm mb-6">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            <strong>Chrome recommended.</strong> Speech recognition works best in Google Chrome. Other browsers may have limited support.
          </span>
        </div>
      )}

      <h1 className={cn('text-[28px] font-bold mb-2', isDark ? 'text-slate-100' : 'text-slate-900')}>
        Mock Interview
      </h1>
      <p className={cn('text-[15px] mb-8', isDark ? 'text-slate-400' : 'text-slate-500')}>
        Fully voice-driven. AI asks questions, you speak your answers.
      </p>

      {/* Setup card */}
      <div className={cn(
        'rounded-2xl border p-7 mb-10',
        isDark
          ? 'bg-dark-card border-dark-border'
          : 'bg-white border-gray-300 shadow-sm',
      )}>
        <h2 className={cn('text-base font-bold mb-6', isDark ? 'text-slate-200' : 'text-slate-800')}>
          New Interview
        </h2>

        {/* Mode selection */}
        <div className="mb-6">
          <label className={cn('block text-xs font-medium mb-3', isDark ? 'text-slate-500' : 'text-slate-500')}>
            Interview Type
          </label>
          <div className="flex gap-3">
            {modeOptions.map(opt => {
              const Icon = opt.icon
              const selected = mode === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => setMode(opt.id)}
                  className={cn(
                    'flex-1 p-3.5 rounded-xl border-2 text-left transition-all duration-150',
                    selected
                      ? 'border-current'
                      : isDark ? 'border-slate-700 hover:border-slate-600' : 'border-gray-300 hover:border-gray-400',
                  )}
                  style={selected ? { borderColor: opt.color, background: opt.color + '12' } : {}}
                >
                  <Icon size={20} color={selected ? opt.color : isDark ? '#475569' : '#64748b'} />
                  <div className={cn(
                    'text-[13px] mt-2 font-medium',
                    selected
                      ? isDark ? 'text-slate-200' : 'text-slate-800'
                      : isDark ? 'text-slate-400' : 'text-slate-500',
                  )}>
                    {opt.label}
                  </div>
                  <div className={cn('text-[11px] mt-0.5', isDark ? 'text-slate-600' : 'text-slate-500')}>
                    {opt.description}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Job / JD input */}
        {(mode === 'job' || mode === 'both') && (
          <div className="mb-5">
            <label className={cn('block text-xs font-medium mb-2.5', isDark ? 'text-slate-500' : 'text-slate-500')}>
              Job / JD
            </label>
            <div className="flex gap-2 mb-3">
              {['Pick saved job', 'Paste custom JD'].map((lbl, i) => {
                const active = i === 0 ? !useCustomJd : useCustomJd
                return (
                  <button
                    key={lbl}
                    onClick={() => setUseCustomJd(i === 1)}
                    className={cn(
                      'px-3.5 py-1.5 rounded-lg text-xs border transition-colors',
                      active
                        ? 'border-brand bg-brand/10 text-brand'
                        : isDark ? 'border-slate-700 text-slate-500 hover:border-slate-600' : 'border-gray-300 text-slate-500 hover:border-gray-400',
                    )}
                  >
                    {lbl}
                  </button>
                )
              })}
            </div>

            {!useCustomJd ? (
              <div className="relative">
                <select
                  value={selectedJobId}
                  onChange={e => setSelectedJobId(e.target.value)}
                  className={inputCls}
                  style={{ appearance: 'none', paddingRight: '36px' }}
                >
                  <option value="">— Select a saved job —</option>
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.title} @ {j.company_name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} className={cn('absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none', isDark ? 'text-slate-600' : 'text-slate-600')} />
              </div>
            ) : (
              <textarea
                value={customJd}
                onChange={e => setCustomJd(e.target.value)}
                placeholder="Paste the job description here..."
                rows={5}
                className={cn(inputCls, 'resize-y font-[inherit]')}
              />
            )}
          </div>
        )}

        {/* Concept input */}
        {(mode === 'concept' || mode === 'both') && (
          <div className="mb-5">
            <label className={cn('block text-xs font-medium mb-2', isDark ? 'text-slate-500' : 'text-slate-500')}>
              Topic / Concept to Practice
            </label>
            <input
              type="text"
              value={concept}
              onChange={e => setConcept(e.target.value)}
              placeholder="e.g. System Design, React hooks, SQL optimization, Behavioral..."
              className={inputCls}
            />
          </div>
        )}

        {/* Question count */}
        <div className="mb-7">
          <label className={cn('block text-xs font-medium mb-2.5', isDark ? 'text-slate-500' : 'text-slate-500')}>
            Number of Questions
          </label>
          <div className="flex gap-2">
            {questionCounts.map(n => (
              <button
                key={n}
                onClick={() => setTotalQuestions(n)}
                className={cn(
                  'px-5 py-2 rounded-lg border text-sm font-medium transition-colors',
                  totalQuestions === n
                    ? 'border-brand bg-brand/10 text-brand'
                    : isDark
                      ? 'border-slate-700 text-slate-500 hover:border-slate-600'
                      : 'border-gray-300 text-slate-500 hover:border-gray-400',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {startError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {startError}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={!canStart() || starting}
          className={cn(
            'w-full py-3.5 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2 transition-all duration-150',
            canStart() && !starting
              ? 'bg-brand hover:bg-brand-hover text-white cursor-pointer'
              : isDark
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed',
          )}
        >
          <Mic size={18} />
          {starting ? 'Starting interview...' : 'Start Interview'}
        </button>
      </div>

      {/* Past sessions */}
      <div>
        <h2 className={cn('text-base font-bold mb-4', isDark ? 'text-slate-200' : 'text-slate-800')}>
          Past Sessions
        </h2>

        {loadingSessions ? (
          <div className={cn('text-sm', isDark ? 'text-slate-600' : 'text-slate-600')}>Loading sessions...</div>
        ) : pastSessions.length === 0 ? (
          <div className={cn('text-sm', isDark ? 'text-slate-600' : 'text-slate-600')}>No past sessions yet.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {pastSessions.slice(0, 10).map(s => {
              const ms = SESSION_MODE_STYLE[s.mode] || SESSION_MODE_STYLE.job
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/interview/${s.id}`)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left w-full transition-all duration-150',
                    isDark
                      ? 'bg-dark-card border-dark-border hover:border-brand/50'
                      : 'bg-white border-gray-300 shadow-sm hover:border-brand/50',
                  )}
                >
                  <span className={cn('text-[11px] font-bold uppercase px-2 py-1 rounded-md', ms.bg, ms.text)}>
                    {ms.label}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className={cn('text-sm font-medium truncate', isDark ? 'text-slate-200' : 'text-slate-800')}>
                      {s.concept || `Job Interview #${s.id}`}
                    </div>
                    <div className={cn('text-xs mt-0.5', isDark ? 'text-slate-600' : 'text-slate-600')}>
                      {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' · '}{s.question_count}/{s.total_questions} questions
                    </div>
                  </div>

                  <div className={cn('flex items-center gap-1.5 text-xs flex-shrink-0', s.status === 'completed' ? 'text-emerald-400' : 'text-amber-400')}>
                    {s.status === 'completed'
                      ? <CheckCircle size={14} />
                      : <Clock size={14} />
                    }
                    {s.status}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}
