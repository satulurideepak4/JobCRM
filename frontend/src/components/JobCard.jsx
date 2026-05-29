import api from '../api/client'
import { useQueryClient } from '@tanstack/react-query'
import { MapPin, Building2, X, Trash2, Copy, Check, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useTheme } from '../contexts/ThemeContext'
import { cn } from '../lib/utils'
import TailorModal from './TailorModal'

const SOURCE_CONFIG = {
  remotive:        { color: '#3b82f6', label: 'Remotive',     border: '#3b82f6' },
  arbeitnow:       { color: '#22c55e', label: 'Arbeitnow',    border: '#22c55e' },
  greenhouse:      { color: '#8b5cf6', label: 'Greenhouse',   border: '#8b5cf6' },
  lever:           { color: '#f59e0b', label: 'Lever',        border: '#f59e0b' },
  ashby:           { color: '#06b6d4', label: 'Ashby',        border: '#06b6d4' },
  jsearch:         { color: '#eab308', label: 'JSearch',      border: '#eab308' },
  hn_hiring:       { color: '#f97316', label: 'HN Hiring',    border: '#f97316' },
  yc_jobs:         { color: '#f97316', label: 'YC Jobs',      border: '#f97316' },
  workable:        { color: '#14b8a6', label: 'Workable',     border: '#14b8a6' },
  workday:         { color: '#6366f1', label: 'Workday',      border: '#6366f1' },
  himalayas:       { color: '#10b981', label: 'Himalayas',    border: '#10b981' },
  weworkremotely:  { color: '#3b82f6', label: 'WWR',          border: '#3b82f6' },
  remoteok:        { color: '#22c55e', label: 'RemoteOK',     border: '#22c55e' },
  themuse:         { color: '#ec4899', label: 'The Muse',     border: '#ec4899' },
  workingnomads:   { color: '#0ea5e9', label: 'WorkNomads',   border: '#0ea5e9' },
}

// Tag colors: [lightBg, lightText, darkBg, darkText]
const TAG_PALETTES = {
  remote:  ['#dcfce7', '#15803d', 'rgba(21,128,61,0.2)',  '#4ade80'],
  backend: ['#dbeafe', '#1d4ed8', 'rgba(29,78,216,0.2)',  '#93c5fd'],
  js:      ['#fef9c3', '#92400e', 'rgba(146,64,14,0.2)',  '#fcd34d'],
  db:      ['#ccfbf1', '#0f766e', 'rgba(15,118,110,0.2)', '#5eead4'],
  ai:      ['#ffedd5', '#c2410c', 'rgba(194,65,12,0.2)',  '#fdba74'],
  infra:   ['#f3e8ff', '#7e22ce', 'rgba(126,34,206,0.2)', '#c4b5fd'],
  web:     ['#e0e7ff', '#4338ca', 'rgba(67,56,202,0.2)',  '#a5b4fc'],
  default: ['#f1f5f9', '#64748b', 'rgba(100,116,139,0.15)', '#94a3b8'],
}

function getTagPalette(tag) {
  const t = tag.toLowerCase()
  if (t.includes('remote')) return TAG_PALETTES.remote
  if (['python','ruby','go','rust','java','elixir','scala','swift','kotlin','c++','c#','php'].some(l => t === l || t.startsWith(l))) return TAG_PALETTES.backend
  if (['javascript','typescript','node','react','vue','angular','next','svelte'].some(l => t.includes(l))) return TAG_PALETTES.js
  if (['sql','postgres','mysql','mongo','redis','elastic','dynamo','cassandra'].some(l => t.includes(l))) return TAG_PALETTES.db
  if (['llm','pytorch','tensorflow','gpt','bert','langchain','openai','ml',' ai','mlops','rag'].some(l => t.includes(l))) return TAG_PALETTES.ai
  if (['docker','kubernetes','k8s','aws','gcp','azure','terraform','devops'].some(l => t.includes(l))) return TAG_PALETTES.infra
  if (['fastapi','django','flask','express','spring','rails','graphql'].some(l => t.includes(l))) return TAG_PALETTES.web
  return TAG_PALETTES.default
}

// Score badge
function ScoreBadge({ score, isDark }) {
  if (!score || score === 0) return null

  const isStrong = score >= 80
  const isGood   = score >= 60 && score < 80

  if (isStrong) {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-bold text-white bg-emerald-500 flex-shrink-0">
          {Math.round(score / 10)}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 leading-tight">
          Strong<br />Match
        </span>
      </div>
    )
  }
  if (isGood) {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-bold text-white bg-amber-500 flex-shrink-0">
          {Math.round(score / 10)}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 leading-tight">
          Good<br />Match
        </span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <div className={cn(
        'w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-bold flex-shrink-0',
        isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-500'
      )}>
        {Math.round(score / 10)}
      </div>
      <span className={cn('text-[10px] font-bold uppercase tracking-wider leading-tight', isDark ? 'text-slate-600' : 'text-slate-400')}>
        Weak<br />Match
      </span>
    </div>
  )
}

function KeywordBadge({ isDark }) {
  return (
    <div className={cn(
      'w-10 h-10 rounded-full border flex flex-col items-center justify-center gap-0.5 flex-shrink-0',
      isDark ? 'bg-dark-surface border-dark-border' : 'bg-slate-100 border-slate-200',
    )}>
      <div className={cn('text-[7px] font-bold leading-none', isDark ? 'text-slate-600' : 'text-slate-400')}>KEY</div>
      <div className={cn('text-[7px] leading-none', isDark ? 'text-slate-600' : 'text-slate-400')}>WORD</div>
    </div>
  )
}

function daysAgo(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return '1d ago'
  return `${diff}d ago`
}

const LOCAL_PREFIXES = ['title_match', 'skills:', 'secondary:', 'remote', 'has_salary', 'tag_match', 'kafka', 'java_go', 'api_platform', 'distributed', 'data_infra', 'cloud', 'postgres_redis', 'fintech', 'remote_signal', 'spring_boot']

function isAiScored(job) {
  if (!job.match_reasons || job.match_reasons.length === 0) return false
  const first = job.match_reasons[0] || ''
  return !LOCAL_PREFIXES.some(p => first.startsWith(p))
}

export default function JobCard({ job, onDraftEmail }) {
  const { isDark } = useTheme()
  const qc         = useQueryClient()
  const [loading, setLoading]           = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const [copied, setCopied]             = useState(false)
  const [showTailor, setShowTailor]     = useState(false)

  const aiScored = isAiScored(job)
  const src = SOURCE_CONFIG[job.source] || { color: '#64748b', label: job.source || 'Unknown', border: '#64748b' }

  async function updateStatus(status) {
    setLoading(true)
    try {
      await api.patch(`/api/jobs/${job.id}`, { status })
      qc.invalidateQueries({ queryKey: ['jobs'] })
    } finally {
      setLoading(false)
    }
  }

  async function deleteJob() {
    setLoading(true)
    try {
      await api.delete(`/api/jobs/${job.id}`)
      qc.invalidateQueries({ queryKey: ['jobs'] })
    } finally {
      setLoading(false)
    }
  }

  function copyColdEmailTarget() {
    const text = `${job.company_name} — ${job.title}\n${job.source_url}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      toast.success('Cold email target copied!')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const baseTags  = job.tags || []
  const locationLower = (job.location || '').toLowerCase()
  const allTags = locationLower.includes('remote') && !baseTags.some(t => t.toLowerCase().includes('remote'))
    ? [...baseTags, job.location]
    : baseTags

  const descText = (() => {
    const raw    = job.description || ''
    const noTags = raw.replace(/<[^>]*>/g, ' ')
    const txt    = document.createElement('textarea')
    txt.innerHTML = noTags
    return txt.value.replace(/\s+/g, ' ').trim()
  })()

  const fetchedAgo = daysAgo(job.fetched_at)

  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 rounded-xl px-5 py-4 border-l-[4px] border transition-all duration-150',
        isDark
          ? 'bg-dark-card border-dark-border hover:shadow-lg hover:shadow-black/20'
          : 'bg-white border-gray-300 shadow-sm hover:shadow-md hover:shadow-slate-200',
      )}
      style={{ borderLeftColor: src.border }}
    >
      {/* Header: source badge + title + score */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Source + age */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: src.color }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: src.color }}>
              {src.label}
            </span>
            {fetchedAgo && (
              <span className={cn('text-[10px]', isDark ? 'text-slate-600' : 'text-slate-400')}>
                · {fetchedAgo}
              </span>
            )}
          </div>
          {/* Title */}
          <div className={cn('text-[15px] font-bold leading-snug mb-1', isDark ? 'text-slate-100' : 'text-slate-900')}>
            {job.title}
          </div>
          {/* Company */}
          <div className="flex items-center gap-1.5">
            <Building2 size={12} className={isDark ? 'text-slate-600' : 'text-slate-500'} />
            <span className={cn('text-[13px]', isDark ? 'text-slate-400' : 'text-slate-600')}>{job.company_name}</span>
          </div>
        </div>
        {aiScored
          ? <ScoreBadge score={job.match_score} isDark={isDark} />
          : <KeywordBadge isDark={isDark} />
        }
      </div>

      {/* Tags */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.slice(0, 6).map((tag, i) => {
            const [lightBg, lightText, darkBg, darkText] = getTagPalette(tag)
            return (
              <span
                key={i}
                className="text-[11px] px-2.5 py-0.5 rounded-full font-medium"
                style={{
                  background: isDark ? darkBg : lightBg,
                  color:      isDark ? darkText : lightText,
                }}
              >
                {tag}
              </span>
            )
          })}
        </div>
      )}

      {/* AI match reason */}
      {aiScored && job.match_reasons?.length > 0 && (
        <ul className="text-xs text-brand pl-4 leading-relaxed m-0 space-y-0.5">
          {job.match_reasons.slice(0, 2).map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}

      {/* Salary */}
      {job.salary_range && (
        <div className="text-[13px] text-emerald-500 font-semibold">{job.salary_range}</div>
      )}

      {/* Description — clamped with Read more toggle */}
      {descText && (
        <div className="relative">
          <p className={cn(
            'text-xs leading-relaxed m-0 transition-all duration-200',
            descExpanded ? '' : 'line-clamp-3',
            isDark ? 'text-slate-500' : 'text-slate-500',
          )}>
            {descText}
          </p>
          {descText.length > 180 && (
            <button
              onClick={() => setDescExpanded(v => !v)}
              className={cn(
                'text-[11px] font-semibold mt-1 transition-colors',
                isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600',
              )}
            >
              {descExpanded ? 'Show less ↑' : 'Read more ↓'}
            </button>
          )}
        </div>
      )}

      {/* Footer: location + actions */}
      <div className={cn(
        'flex items-center justify-between gap-2 pt-2.5 mt-0.5 border-t',
        isDark ? 'border-dark-border' : 'border-slate-100',
      )}>
        <div className="flex items-center gap-1.5">
          <MapPin size={12} className={isDark ? 'text-slate-600' : 'text-slate-500'} />
          <span className={cn('text-xs', isDark ? 'text-slate-500' : 'text-slate-600')}>
            {job.location || 'Remote'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Copy cold email target */}
          <button
            onClick={copyColdEmailTarget}
            title="Copy cold email target (company + role + URL)"
            className={cn(
              'p-1.5 rounded-lg border transition-colors',
              isDark
                ? 'border-dark-border text-slate-600 hover:text-slate-300 hover:border-slate-500'
                : 'border-gray-300 text-slate-400 hover:text-slate-600 hover:border-gray-400',
            )}
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          </button>

          {job.status === 'new' && (
            <>
              <button
                onClick={() => updateStatus('saved')}
                disabled={loading}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors',
                  isDark
                    ? 'border-dark-border text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    : 'border-gray-200 text-slate-500 hover:text-slate-700 hover:border-gray-300',
                )}
              >
                Save
              </button>
              <button
                onClick={() => updateStatus('dismissed')}
                disabled={loading}
                className={cn(
                  'p-1.5 rounded-lg border transition-colors',
                  isDark
                    ? 'border-dark-border text-slate-600 hover:text-slate-400 hover:border-slate-600'
                    : 'border-gray-300 text-slate-500 hover:text-slate-700',
                )}
              >
                <X size={12} />
              </button>
            </>
          )}
          <button
            onClick={deleteJob}
            disabled={loading}
            title="Delete this job"
            className={cn(
              'p-1.5 rounded-lg border transition-colors',
              isDark
                ? 'border-dark-border text-slate-700 hover:text-red-400 hover:border-red-500/40'
                : 'border-gray-300 text-slate-400 hover:text-red-500 hover:border-red-300',
            )}
          >
            <Trash2 size={12} />
          </button>
          <button
            onClick={() => setShowTailor(true)}
            title="Tailor resume + generate cover letter"
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-semibold transition-colors whitespace-nowrap"
          >
            <Sparkles size={11} />
            Tailor
          </button>
          <a
            href={job.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold transition-colors whitespace-nowrap"
          >
            Apply →
          </a>
        </div>
      </div>

      {showTailor && (
        <TailorModal
          job={job}
          onClose={() => setShowTailor(false)}
          isDark={isDark}
        />
      )}
    </div>
  )
}
