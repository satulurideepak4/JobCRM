import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic, Brain, Star, ChevronDown, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import api from '../api/client'

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

export default function Interview() {
  const navigate = useNavigate()
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
    // Fetch saved jobs for dropdown
    api.get('/api/jobs?limit=50&page=1')
      .then(res => {
        const data = res.data?.data?.jobs || res.data?.jobs || []
        setJobs(data)
      })
      .catch(() => setJobs([]))

    // Fetch past sessions
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
      const body = {
        mode,
        total_questions: totalQuestions,
      }

      if (mode === 'job' || mode === 'both') {
        if (useCustomJd) {
          body.jd_text = customJd.trim()
        } else if (selectedJobId) {
          body.job_id = parseInt(selectedJobId)
        }
      }

      if (mode === 'concept' || mode === 'both') {
        body.concept = concept.trim()
      }

      const res = await api.post('/api/interview/start', body)
      const data = res.data
      if (data?.session_id) {
        navigate(`/interview/${data.session_id}`)
      } else {
        setStartError('Failed to start interview. Please try again.')
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to start interview.'
      setStartError(msg)
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

  const formatDate = (iso) => {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getModeLabel = (m) => {
    if (m === 'job') return 'Job'
    if (m === 'concept') return 'Concept'
    return 'Both'
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 0 60px' }}>
      {/* Chrome banner */}
      {!isChrome() && (
        <div style={{
          background: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '24px',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
        }}>
          <AlertCircle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div style={{ color: '#92400e', fontSize: '14px' }}>
            <strong>Chrome recommended.</strong> Speech recognition works best in Google Chrome. Other browsers may have limited or no support.
          </div>
        </div>
      )}

      <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#e2e8f0', marginBottom: '8px' }}>
        Mock Interview
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: '32px', fontSize: '15px' }}>
        Fully voice-driven. AI asks questions, you speak your answers.
      </p>

      {/* Setup card */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '28px',
        marginBottom: '40px',
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#e2e8f0', marginBottom: '20px' }}>
          New Interview
        </h2>

        {/* Mode selection */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '10px' }}>
            Interview Type
          </label>
          <div style={{ display: 'flex', gap: '12px' }}>
            {modeOptions.map(opt => {
              const Icon = opt.icon
              const selected = mode === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => setMode(opt.id)}
                  style={{
                    flex: 1,
                    padding: '14px',
                    borderRadius: '10px',
                    border: selected ? `2px solid ${opt.color}` : '2px solid #334155',
                    background: selected ? `${opt.color}15` : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                >
                  <Icon size={20} color={selected ? opt.color : '#64748b'} />
                  <div style={{
                    color: selected ? '#e2e8f0' : '#94a3b8',
                    fontWeight: selected ? '600' : '400',
                    fontSize: '13px',
                    marginTop: '8px',
                  }}>
                    {opt.label}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '11px', marginTop: '3px' }}>
                    {opt.description}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Job selection */}
        {(mode === 'job' || mode === 'both') && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '10px' }}>
              Job / JD
            </label>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <button
                onClick={() => setUseCustomJd(false)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: !useCustomJd ? '1px solid #6366f1' : '1px solid #334155',
                  background: !useCustomJd ? '#6366f120' : 'transparent',
                  color: !useCustomJd ? '#a5b4fc' : '#64748b',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Pick saved job
              </button>
              <button
                onClick={() => setUseCustomJd(true)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: useCustomJd ? '1px solid #6366f1' : '1px solid #334155',
                  background: useCustomJd ? '#6366f120' : 'transparent',
                  color: useCustomJd ? '#a5b4fc' : '#64748b',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Paste custom JD
              </button>
            </div>

            {!useCustomJd ? (
              <div style={{ position: 'relative' }}>
                <select
                  value={selectedJobId}
                  onChange={e => setSelectedJobId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 36px 10px 12px',
                    background: '#0f1117',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: selectedJobId ? '#e2e8f0' : '#64748b',
                    fontSize: '14px',
                    appearance: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">— Select a saved job —</option>
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.title} @ {j.company_name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} color="#64748b" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              </div>
            ) : (
              <textarea
                value={customJd}
                onChange={e => setCustomJd(e.target.value)}
                placeholder="Paste the job description here..."
                rows={5}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#0f1117',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                  fontSize: '13px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            )}
          </div>
        )}

        {/* Concept input */}
        {(mode === 'concept' || mode === 'both') && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>
              Topic / Concept to Practice
            </label>
            <input
              type="text"
              value={concept}
              onChange={e => setConcept(e.target.value)}
              placeholder="e.g. System Design, React hooks, SQL optimization, Behavioral..."
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#0f1117',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#e2e8f0',
                fontSize: '14px',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Question count */}
        <div style={{ marginBottom: '28px' }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '10px' }}>
            Number of Questions
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {questionCounts.map(n => (
              <button
                key={n}
                onClick={() => setTotalQuestions(n)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: totalQuestions === n ? '1px solid #6366f1' : '1px solid #334155',
                  background: totalQuestions === n ? '#6366f120' : 'transparent',
                  color: totalQuestions === n ? '#a5b4fc' : '#64748b',
                  fontSize: '14px',
                  fontWeight: totalQuestions === n ? '600' : '400',
                  cursor: 'pointer',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {startError && (
          <div style={{
            background: '#fee2e210',
            border: '1px solid #ef4444',
            borderRadius: '8px',
            padding: '10px 14px',
            color: '#fca5a5',
            fontSize: '13px',
            marginBottom: '16px',
          }}>
            {startError}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={!canStart() || starting}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '10px',
            border: 'none',
            background: canStart() && !starting ? '#6366f1' : '#334155',
            color: canStart() && !starting ? '#fff' : '#64748b',
            fontSize: '15px',
            fontWeight: '600',
            cursor: canStart() && !starting ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <Mic size={18} />
          {starting ? 'Starting interview...' : 'Start Interview'}
        </button>
      </div>

      {/* Past sessions */}
      <div>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#e2e8f0', marginBottom: '16px' }}>
          Past Sessions
        </h2>
        {loadingSessions ? (
          <div style={{ color: '#64748b', fontSize: '14px' }}>Loading sessions...</div>
        ) : pastSessions.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '14px' }}>No past sessions yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pastSessions.slice(0, 10).map(s => (
              <button
                key={s.id}
                onClick={() => navigate(`/interview/${s.id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#334155'}
              >
                <div style={{
                  padding: '3px 8px',
                  borderRadius: '5px',
                  background: s.mode === 'job' ? '#6366f120' : s.mode === 'concept' ? '#10b98120' : '#f59e0b20',
                  color: s.mode === 'job' ? '#a5b4fc' : s.mode === 'concept' ? '#6ee7b7' : '#fcd34d',
                  fontSize: '11px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  flexShrink: 0,
                }}>
                  {getModeLabel(s.mode)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.concept || `Job Interview #${s.id}`}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>
                    {formatDate(s.created_at)} · {s.question_count}/{s.total_questions} questions
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                  {s.status === 'completed' ? (
                    <CheckCircle size={14} color="#10b981" />
                  ) : (
                    <Clock size={14} color="#f59e0b" />
                  )}
                  <span style={{
                    fontSize: '12px',
                    color: s.status === 'completed' ? '#10b981' : '#f59e0b',
                  }}>
                    {s.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
