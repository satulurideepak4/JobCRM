import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Plus, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import api from '../api/client'

const STATUS_COLORS = {
  cold_email_sent: '#6366f1',
  applied: '#3b82f6',
  confirmation_received: '#06b6d4',
  reply_received: '#8b5cf6',
  interviewing: '#f59e0b',
  offer: '#22c55e',
  rejected: '#ef4444',
  ghosted: '#64748b',
}

const ALL_STATUSES = Object.keys(STATUS_COLORS)

function StatusBadge({ status }) {
  return (
    <span style={{
      fontSize: '11px', padding: '2px 10px', borderRadius: '20px',
      background: (STATUS_COLORS[status] || '#64748b') + '22',
      color: STATUS_COLORS[status] || '#64748b',
      border: `1px solid ${(STATUS_COLORS[status] || '#64748b')}44`,
      fontWeight: '500',
    }}>
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

function AddModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', website: '', status: 'cold_email_sent', source: 'manual', notes: '' })
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '400px', boxShadow: 'var(--shadow-lg)' }}>
        <h3 style={{ color: 'var(--text)', marginBottom: '20px' }}>Add Application</h3>
        {[['Company Name', 'name'], ['Website', 'website']].map(([label, key]) => (
          <div key={key} style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-4)', display: 'block', marginBottom: '4px' }}>{label}</label>
            <input
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '14px' }}
            />
          </div>
        ))}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-4)', display: 'block', marginBottom: '4px' }}>Status</label>
          <select
            value={form.status}
            onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
            style={{ width: '100%', padding: '8px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '14px' }}
          >
            {ALL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-4)', display: 'block', marginBottom: '4px' }}>Notes</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={3}
            style={{ width: '100%', padding: '8px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '14px', resize: 'vertical' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-3)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
          <button onClick={() => { if (form.name) { onSave(form); onClose() } }} style={{ padding: '8px 16px', borderRadius: '6px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px' }}>Save</button>
        </div>
      </div>
    </div>
  )
}

function TimelineRow({ companyId }) {
  const { data } = useQuery({
    queryKey: ['timeline', companyId],
    queryFn: async () => {
      const res = await api.get(`/api/applications/${companyId}/timeline`)
      return res.data.data
    },
  })
  if (!data) return <div style={{ padding: '12px 24px', color: 'var(--text-3)', fontSize: '13px' }}>Loading...</div>
  return (
    <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border-light)', background: 'var(--bg)' }}>
      {data.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>No timeline events</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {data.map((event, i) => (
            <div key={i} style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
              <span style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{event.at ? new Date(event.at).toLocaleDateString() : '—'}</span>
              <span style={{ color: 'var(--text-4)' }}>{event.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Applications() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight') ? Number(searchParams.get('highlight')) : null
  const [showModal, setShowModal] = useState(false)
  const [expanded, setExpanded] = useState(highlightId)
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const highlightRef = useRef(null)

  const { data, isLoading } = useQuery({
    queryKey: ['applications', filterStatus],
    queryFn: async () => {
      const res = await api.get('/api/applications', { params: filterStatus ? { status: filterStatus } : {} })
      return res.data.data || []
    },
  })

  const createMutation = useMutation({
    mutationFn: (body) => api.post('/api/applications', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/applications/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications'] }),
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/api/applications/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications'] }),
  })

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightId, data])

  const filtered = (data || []).filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))
  const daysSince = (dateStr) => dateStr ? Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {showModal && <AddModal onClose={() => setShowModal(false)} onSave={createMutation.mutate} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text)' }}>Applications</h1>
        <button
          onClick={() => setShowModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px' }}
        >
          <Plus size={14} /> Add Manually
        </button>
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <input
          placeholder="Search companies..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '14px' }}
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '8px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '14px' }}
        >
          <option value="">All statuses</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text-3)' }}>Loading...</div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-light)', background: 'var(--bg)' }}>
                {['', 'Company', 'Status', 'Source', 'Added', 'Days Since Update', ''].map((h, i) => (
                  <th key={i} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-3)', fontWeight: '500' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-2)', fontSize: '14px' }}>No applications yet</td></tr>
              )}
              {filtered.map(c => (
                <>
                  <tr
                    key={c.id}
                    ref={c.id === highlightId ? highlightRef : null}
                    style={{
                      borderBottom: '1px solid var(--border-light)',
                      cursor: 'pointer',
                      background: c.id === highlightId ? '#6366f115' : 'transparent',
                      outline: c.id === highlightId ? '1px solid #6366f166' : 'none',
                      transition: 'background 0.3s',
                    }}
                    onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  >
                    <td style={{ padding: '12px 16px', width: '24px' }}>
                      {expanded === c.id ? <ChevronDown size={14} color="var(--text-4)" /> : <ChevronRight size={14} color="var(--text-3)" />}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: '500' }}>{c.name}</div>
                      {c.website && <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>{c.website}</div>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <select
                        value={c.status}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateStatusMutation.mutate({ id: c.id, status: e.target.value })}
                        style={{ background: 'transparent', border: 'none', color: STATUS_COLORS[c.status] || 'var(--text-3)', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}
                      >
                        {ALL_STATUSES.map(s => <option key={s} value={s} style={{ background: 'var(--card)', color: 'var(--text)' }}>{s.replace(/_/g, ' ')}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-3)' }}>{c.source?.replace(/_/g, ' ')}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-3)' }}>{c.added_at ? new Date(c.added_at).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-3)' }}>{daysSince(c.updated_at)}d</td>
                    <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => deleteMutation.mutate(c.id)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr key={`${c.id}-timeline`}>
                      <td colSpan={7} style={{ padding: 0 }}>
                        <TimelineRow companyId={c.id} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
