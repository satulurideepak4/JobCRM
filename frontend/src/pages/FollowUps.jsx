import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Check, Trash2, Mail, X } from 'lucide-react'
import api from '../api/client'

const inputStyle = { width: '100%', padding: '8px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '14px' }
const labelStyle = { fontSize: '12px', color: 'var(--text-3)', display: 'block', marginBottom: '4px' }

function AddFollowUpModal({ companies, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ company_id: '', note: '', due_date: '' })

  async function save() {
    if (!form.company_id) return
    await api.post('/api/followups', {
      company_id: Number(form.company_id),
      note: form.note,
      due_date: form.due_date || new Date().toISOString(),
    })
    qc.invalidateQueries({ queryKey: ['followups'] })
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000055', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '400px', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ color: 'var(--text)', fontWeight: '700', fontSize: '16px' }}>Add Follow-up</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)' }}><X size={16} /></button>
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Company</label>
          <select value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))} style={inputStyle}>
            <option value="">Select company</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Due Date</label>
          <input type="datetime-local" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={inputStyle} />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>Note</label>
          <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-3)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
          <button onClick={save} style={{ padding: '8px 16px', borderRadius: '6px', background: '#f97316', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Save</button>
        </div>
      </div>
    </div>
  )
}

function FollowUpEmailModal({ companyId, onClose }) {
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useState(() => {
    api.post('/api/emails/draft/followup', { company_id: companyId })
      .then(res => setDraft(res.data.data))
      .catch(() => setDraft({ subject: 'Error', body: 'Failed to generate.' }))
      .finally(() => setLoading(false))
  }, [companyId])

  function copy() {
    navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000055', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '500px', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ color: 'var(--text)', fontWeight: '700', fontSize: '16px' }}>Follow-up Email Draft</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)' }}><X size={16} /></button>
        </div>
        {loading ? (
          <div style={{ color: 'var(--text-4)', padding: '24px', textAlign: 'center' }}>Generating...</div>
        ) : draft ? (
          <>
            <div style={{ marginBottom: '12px' }}>
              <div style={labelStyle}>Subject</div>
              <div style={{ padding: '10px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px', color: 'var(--text)' }}>{draft.subject}</div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div style={labelStyle}>Body</div>
              <pre style={{ padding: '12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', color: 'var(--text-2)', whiteSpace: 'pre-wrap', lineHeight: '1.6', fontFamily: 'inherit' }}>{draft.body}</pre>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-3)', cursor: 'pointer', fontSize: '13px' }}>Close</button>
              <button onClick={copy} style={{ padding: '8px 16px', borderRadius: '6px', background: '#f97316', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>{copied ? 'Copied!' : 'Copy'}</button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

export default function FollowUps() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [draftCompanyId, setDraftCompanyId] = useState(null)

  const { data: followups } = useQuery({
    queryKey: ['followups'],
    queryFn: async () => (await api.get('/api/followups')).data.data || [],
    refetchInterval: 60000,
  })

  const { data: companies } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => (await api.get('/api/applications')).data.data || [],
  })

  const completeMutation = useMutation({
    mutationFn: (id) => api.patch(`/api/followups/${id}/complete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['followups'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/followups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['followups'] }),
  })

  const overdue = (followups || []).filter(fu => fu.is_overdue)
  const upcoming = (followups || []).filter(fu => !fu.is_overdue)

  function renderList(items, label, isOverdue) {
    if (items.length === 0) return null
    return (
      <section>
        <h2 style={{ fontSize: '13px', fontWeight: '700', color: isOverdue ? '#ef4444' : 'var(--text-3)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map(fu => (
            <div key={fu.id} style={{
              background: 'var(--card)',
              border: `1px solid ${fu.is_overdue ? '#fca5a5' : 'var(--border)'}`,
              borderLeft: `4px solid ${fu.is_overdue ? '#ef4444' : '#6366f1'}`,
              borderRadius: '10px', padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: '16px',
              boxShadow: 'var(--shadow)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: fu.is_overdue ? '#ef4444' : 'var(--text)' }}>
                  {fu.company_name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>{fu.note}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-4)', marginTop: '4px' }}>
                  Due: {fu.due_date ? new Date(fu.due_date).toLocaleDateString() : '—'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => setDraftCompanyId(fu.company_id)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                >
                  <Mail size={12} /> Draft
                </button>
                <button
                  onClick={() => completeMutation.mutate(fu.id)}
                  style={{ padding: '6px 10px', borderRadius: '6px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600' }}
                >
                  <Check size={12} /> Done
                </button>
                <button
                  onClick={() => deleteMutation.mutate(fu.id)}
                  style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-4)', cursor: 'pointer' }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {showAdd && <AddFollowUpModal companies={companies || []} onClose={() => setShowAdd(false)} />}
      {draftCompanyId && <FollowUpEmailModal companyId={draftCompanyId} onClose={() => setDraftCompanyId(null)} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text)' }}>Follow-ups</h1>
        <button
          onClick={() => setShowAdd(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: '#f97316', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
        >
          <Plus size={14} /> Add Follow-up
        </button>
      </div>

      {(followups || []).length === 0 ? (
        <div style={{ color: 'var(--text-4)', fontSize: '14px', textAlign: 'center', padding: '60px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          No pending follow-ups
        </div>
      ) : (
        <>
          {renderList(overdue, `Overdue (${overdue.length})`, true)}
          {renderList(upcoming, `Upcoming (${upcoming.length})`, false)}
        </>
      )}
    </div>
  )
}
