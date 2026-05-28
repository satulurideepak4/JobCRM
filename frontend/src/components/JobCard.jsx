import api from '../api/client'
import { useQueryClient } from '@tanstack/react-query'
import { MapPin, Building2, X } from 'lucide-react'
import { useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { cn } from '../lib/utils'

const SOURCE_CONFIG = {
  remotive:   { color: '#3b82f6', label: 'Remotive',   border: '#3b82f6' },
  arbeitnow:  { color: '#22c55e', label: 'Arbeitnow',  border: '#22c55e' },
  greenhouse: { color: '#8b5cf6', label: 'Greenhouse', border: '#8b5cf6' },
  lever:      { color: '#f59e0b', label: 'Lever',      border: '#f59e0b' },
  ashby:      { color: '#06b6d4', label: 'Ashby',      border: '#06b6d4' },
  jsearch:    { color: '#eab308', label: 'JSearch',    border: '#eab308' },
  hn_hiring:  { color: '#f97316', label: 'HN Hiring',  border: '#f97316' },
  workday:    { color: '#6366f1', label: 'Workday',    border: '#6366f1' },
}

const LOCAL_PREFIXES = ['title_match', 'skills:', 'secondary:', 'remote', 'has_salary', 'tag_match']

function isAiScored(job) {
  if (!job.match_reasons || job.match_reasons.length === 0) return false
  return !LOCAL_PREFIXES.some(p => job.match_reasons[0]?.startsWith(p))
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

function ScoreCircle({ score }) {
  const bg = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#94a3b8'
  return (
    <div
      className="w-11 h-11 rounded-full flex items-center justify-center text-[15px] font-bold text-white flex-shrink-0"
      style={{ background: bg }}
    >
      {score}
    </div>
  )
}

function KeywordCircle({ isDark }) {
  return (
    <div className={cn(
      'w-11 h-11 rounded-full border flex flex-col items-center justify-center gap-0.5 flex-shrink-0',
      isDark ? 'bg-dark-surface border-dark-border' : 'bg-slate-100 border-slate-200',
    )}>
      <div className={cn('text-[8px] font-bold leading-none', isDark ? 'text-slate-600' : 'text-slate-500')}>KEY</div>
      <div className={cn('text-[8px] leading-none',            isDark ? 'text-slate-600' : 'text-slate-500')}>WORD</div>
    </div>
  )
}

export default function JobCard({ job, onDraftEmail }) {
  const { isDark } = useTheme()
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
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

  const baseTags = job.tags || []
  const locationLower = (job.location || '').toLowerCase()
  const allTags = locationLower.includes('remote') && !baseTags.some(t => t.toLowerCase().includes('remote'))
    ? [...baseTags, job.location]
    : baseTags

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
      {/* Header: source + title + score */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Source badge */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: src.color }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: src.color }}>
              {src.label}
            </span>
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
        {aiScored ? <ScoreCircle score={job.match_score} /> : <KeywordCircle isDark={isDark} />}
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

      {/* AI match reasons */}
      {aiScored && job.match_reasons?.length > 0 && (
        <ul className="text-xs text-brand pl-4 leading-relaxed m-0 space-y-0.5">
          {job.match_reasons.slice(0, 2).map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}

      {/* Salary */}
      {job.salary_range && (
        <div className="text-[13px] text-emerald-500 font-semibold">{job.salary_range}</div>
      )}

      {/* Description (keyword-only) */}
      {!aiScored && job.description && (
        <p className={cn(
          'text-xs leading-relaxed m-0 line-clamp-2',
          isDark ? 'text-slate-500' : 'text-slate-600',
        )}>
          {job.description.replace(/<[^>]*>/g, '')}
        </p>
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
    </div>
  )
}
