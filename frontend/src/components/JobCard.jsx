import api from '../api/client'
import { useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Bookmark, X, Send, Sparkles } from 'lucide-react'
import { useState } from 'react'

const LOCAL_PREFIXES = ['title_match', 'skills:', 'secondary:', 'remote', 'has_salary', 'tag_match']

function isAiScored(job) {
  if (!job.match_reasons || job.match_reasons.length === 0) return false
  return !LOCAL_PREFIXES.some(p => job.match_reasons[0]?.startsWith(p))
}

function ScoreCircle({ score }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#64748b'
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '50%',
        border: `3px solid ${color}`, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '14px', fontWeight: '700', color,
      }}>
        {score}
      </div>
      <div style={{
        position: 'absolute', bottom: '-4px', right: '-4px',
        background: '#6366f1', borderRadius: '8px', padding: '1px 5px',
        fontSize: '9px', color: '#fff', fontWeight: '700', letterSpacing: '0.3px',
      }}>
        AI
      </div>
    </div>
  )
}

function KeywordBadge({ reasons }) {
  const skills = reasons
    .filter(r => r.startsWith('skills:') || r.startsWith('secondary:'))
    .map(r => r.split(':')[1])
    .join(', ')

  return (
    <div style={{
      width: '48px', height: '48px', borderRadius: '50%',
      border: '3px solid #334155', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0, flexDirection: 'column', gap: '1px',
    }}>
      <div style={{ fontSize: '9px', color: '#64748b', fontWeight: '600', textAlign: 'center', lineHeight: 1.2 }}>KEY</div>
      <div style={{ fontSize: '9px', color: '#64748b', lineHeight: 1 }}>WORD</div>
    </div>
  )
}

export default function JobCard({ job, onDraftEmail }) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  const aiScored = isAiScored(job)

  async function updateStatus(status) {
    setLoading(true)
    try {
      await api.patch(`/api/jobs/${job.id}`, { status })
      qc.invalidateQueries({ queryKey: ['jobs'] })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: '#1e293b',
      border: `1px solid ${aiScored ? '#334155' : '#1e293b'}`,
      borderRadius: '12px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      outline: aiScored ? 'none' : '1px solid #334155',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        {aiScored
          ? <ScoreCircle score={job.match_score} />
          : <KeywordBadge reasons={job.match_reasons || []} />
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#e2e8f0' }}>
              {job.title}
            </div>
            {!aiScored && (
              <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: '#334155', color: '#64748b', whiteSpace: 'nowrap' }}>
                keyword match
              </span>
            )}
          </div>
          <div style={{ fontSize: '13px', color: '#94a3b8' }}>{job.company_name}</div>
          {job.location && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{job.location}</div>}
        </div>
      </div>

      {job.salary_range && (
        <div style={{ fontSize: '13px', color: '#22c55e', fontWeight: '500' }}>{job.salary_range}</div>
      )}

      {job.description && (
        <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {job.description.replace(/<[^>]*>/g, '')}
        </p>
      )}

      {aiScored && job.match_reasons && job.match_reasons.length > 0 && (
        <ul style={{ fontSize: '12px', color: '#6366f1', paddingLeft: '16px', lineHeight: '1.6' }}>
          {job.match_reasons.slice(0, 2).map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}

      {job.tags && job.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {job.tags.slice(0, 5).map((tag, i) => (
            <span key={i} style={{
              fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
              background: '#0f172a', color: '#94a3b8', border: '1px solid #334155',
            }}>{tag}</span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
        <button
          onClick={() => onDraftEmail(job)}
          style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #6366f1', background: 'transparent', color: '#6366f1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <Send size={12} /> Draft Email
        </button>
        <a
          href={job.source_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '6px', background: '#6366f1', color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <ExternalLink size={12} /> Apply
        </a>
        {job.status === 'new' && (
          <>
            <button
              onClick={() => updateStatus('saved')}
              disabled={loading}
              style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Bookmark size={12} /> Save
            </button>
            <button
              onClick={() => updateStatus('dismissed')}
              disabled={loading}
              style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #334155', background: 'transparent', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <X size={12} /> Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  )
}
