import api from '../api/client'
import { useQueryClient } from '@tanstack/react-query'
import { MapPin, Building2, X } from 'lucide-react'
import { useState } from 'react'

const SOURCE_CONFIG = {
  remotive:   { color: '#2563eb', label: 'Remotive',   border: '#3b82f6' },
  arbeitnow:  { color: '#16a34a', label: 'Arbeitnow',  border: '#22c55e' },
  greenhouse: { color: '#7c3aed', label: 'Greenhouse', border: '#8b5cf6' },
  lever:      { color: '#d97706', label: 'Lever',      border: '#f59e0b' },
  ashby:      { color: '#0891b2', label: 'Ashby',      border: '#06b6d4' },
  jsearch:    { color: '#ca8a04', label: 'JSearch',    border: '#eab308' },
  hn_hiring:  { color: '#ea580c', label: 'HN Hiring',  border: '#f97316' },
  workday:    { color: '#4f46e5', label: 'Workday',    border: '#6366f1' },
}

const LOCAL_PREFIXES = ['title_match', 'skills:', 'secondary:', 'remote', 'has_salary', 'tag_match']

function isAiScored(job) {
  if (!job.match_reasons || job.match_reasons.length === 0) return false
  return !LOCAL_PREFIXES.some(p => job.match_reasons[0]?.startsWith(p))
}

function getTagStyle(tag) {
  const t = tag.toLowerCase()
  if (t.includes('remote')) return { bg: '#dcfce7', color: '#15803d' }
  if (['python', 'ruby', 'go', 'rust', 'java', 'elixir', 'scala', 'swift', 'kotlin', 'c++', 'c#', 'php', 'perl'].some(l => t === l || t.startsWith(l)))
    return { bg: '#dbeafe', color: '#1d4ed8' }
  if (['javascript', 'typescript', 'node', 'react', 'vue', 'angular', 'next', 'svelte', 'jquery'].some(l => t.includes(l)))
    return { bg: '#fef9c3', color: '#92400e' }
  if (['sql', 'postgres', 'mysql', 'mongo', 'redis', 'elastic', 'dynamo', 'cassandra', 'sqlite'].some(l => t.includes(l)))
    return { bg: '#ccfbf1', color: '#0f766e' }
  if (['llm', 'pytorch', 'tensorflow', 'cuda', 'gpt', 'bert', 'langchain', 'openai', 'ml', 'ai', 'mlops', 'rag'].some(l => t.includes(l)))
    return { bg: '#ffedd5', color: '#c2410c' }
  if (['docker', 'kubernetes', 'k8s', 'aws', 'gcp', 'azure', 'terraform', 'devops', 'jenkins', 'ci/cd'].some(l => t.includes(l)))
    return { bg: '#f3e8ff', color: '#7e22ce' }
  if (['fastapi', 'django', 'flask', 'express', 'spring', 'rails', 'laravel', 'graphql'].some(l => t.includes(l)))
    return { bg: '#e0e7ff', color: '#4338ca' }
  return { bg: 'var(--border-light)', color: 'var(--text-2)' }
}

function ScoreCircle({ score }) {
  const bg = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#94a3b8'
  return (
    <div style={{
      width: '44px', height: '44px', borderRadius: '50%',
      background: bg, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: '15px', fontWeight: '700',
      color: '#fff', flexShrink: 0,
    }}>
      {score}
    </div>
  )
}

function KeywordCircle() {
  return (
    <div style={{
      width: '44px', height: '44px', borderRadius: '50%',
      background: 'var(--border-light)', border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, flexDirection: 'column', gap: '1px',
    }}>
      <div style={{ fontSize: '8px', color: 'var(--text-4)', fontWeight: '700', textAlign: 'center', lineHeight: 1.2 }}>KEY</div>
      <div style={{ fontSize: '8px', color: 'var(--text-4)', lineHeight: 1 }}>WORD</div>
    </div>
  )
}

export default function JobCard({ job, onDraftEmail }) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  const aiScored = isAiScored(job)
  const src = SOURCE_CONFIG[job.source] || { color: '#64748b', label: job.source || 'Unknown', border: 'var(--border)' }

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
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderLeft: `4px solid ${src.border}`,
      borderRadius: '10px',
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      boxShadow: 'var(--shadow)',
      transition: 'box-shadow 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--shadow)'}
    >
      {/* Header row: source + title + score */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Source badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '7px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: src.color, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: '10px', fontWeight: '700', color: src.color, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
              {src.label}
            </span>
          </div>
          {/* Title */}
          <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text)', lineHeight: '1.3', marginBottom: '5px' }}>
            {job.title}
          </div>
          {/* Company */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Building2 size={12} color="var(--text-4)" />
            <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>{job.company_name}</span>
          </div>
        </div>
        {/* Score */}
        {aiScored ? <ScoreCircle score={job.match_score} /> : <KeywordCircle />}
      </div>

      {/* Tags */}
      {allTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {allTags.slice(0, 6).map((tag, i) => {
            const ts = getTagStyle(tag)
            return (
              <span key={i} style={{
                fontSize: '11px', padding: '3px 9px', borderRadius: '20px',
                background: ts.bg, color: ts.color, fontWeight: '500',
              }}>{tag}</span>
            )
          })}
        </div>
      )}

      {/* AI match reasons */}
      {aiScored && job.match_reasons?.length > 0 && (
        <ul style={{ fontSize: '12px', color: '#6366f1', paddingLeft: '16px', lineHeight: '1.6', margin: 0 }}>
          {job.match_reasons.slice(0, 2).map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}

      {/* Salary */}
      {job.salary_range && (
        <div style={{ fontSize: '13px', color: '#16a34a', fontWeight: '600' }}>{job.salary_range}</div>
      )}

      {/* Description (keyword-only jobs) */}
      {!aiScored && job.description && (
        <p style={{
          fontSize: '12px', color: 'var(--text-3)', lineHeight: '1.5', margin: 0,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {job.description.replace(/<[^>]*>/g, '')}
        </p>
      )}

      {/* Bottom: location + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingTop: '4px', borderTop: '1px solid var(--border-light)', marginTop: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <MapPin size={12} color="var(--text-4)" />
          <span style={{ fontSize: '12px', color: 'var(--text-4)' }}>{job.location || 'Remote'}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
          {job.status === 'new' && (
            <>
              <button
                onClick={() => updateStatus('saved')}
                disabled={loading}
                style={{
                  fontSize: '12px', padding: '5px 12px', borderRadius: '6px',
                  border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-2)',
                  cursor: 'pointer', fontWeight: '500',
                }}
              >Save</button>
              <button
                onClick={() => updateStatus('dismissed')}
                disabled={loading}
                style={{
                  fontSize: '12px', padding: '5px 8px', borderRadius: '6px',
                  border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-4)',
                  cursor: 'pointer',
                }}
              ><X size={12} /></button>
            </>
          )}
          <a
            href={job.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '12px', padding: '5px 14px', borderRadius: '6px',
              background: '#f97316', color: '#fff', textDecoration: 'none',
              fontWeight: '600', whiteSpace: 'nowrap',
            }}
          >Apply →</a>
        </div>
      </div>
    </div>
  )
}
