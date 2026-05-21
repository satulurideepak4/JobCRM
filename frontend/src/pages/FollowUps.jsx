import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Check, Trash2, Mail } from 'lucide-react'
import api from '../api/client'

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
    <div style={{ position: 'fixed', inset: 0, background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '24px', width: '400px' }}>
        <h3 style={{ color: '#e2e8f0', marginBottom: '20px' }}>Add Follow-up</h3>
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Company</label>
          <select
            value={form.company_id}
            onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}
            style={{ width: '100%', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '14px' }}
          >
            <option value="">Select company</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Due Date</label>
          <input
            type="datetime-local"
            value={form.due_date}
            onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
            style={{ width: '100%', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '14px' }}
          />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Note</label>
          <input
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            style={{ width: '100%', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '14px' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
          <button onClick={save} style={{ padding: '8px 16px', borderRadius: '6px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px' }}>Save</button>
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
    <div style={{ position: 'fixed', inset: 0, background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '24px', width: '500px' }}>
        <h3 style={{ color: '#e2e8f0', marginBottom: '16px' }}>Follow-up Email Draft</h3>
        {loading ? <div style={{ color: '#64748b', padding: '24px', textAlign: 'center' }}>Generating...</div> : draft ? (
          <>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Subject</div>
              <div style={{ padding: '10px 12px', background: '#0f172a', borderRadius: '6px', fontSize: '14px', color: '#e2e8f0' }}>{draft.subject}</div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Body</div>
              <pre style={{ padding: '12px', background: '#0f172a', borderRadius: '6px', fontSize: '13px', color: '#94a3b8', whiteSpace: 'pre-wrap', lineHeight: '1.6', fontFamily: 'inherit' }}>{draft.body}</pre>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '13px' }}>Close</button>
              <button onClick={copy} style={{ padding: '8px 16px', borderRadius: '6px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px' }}>{copied ? 'Copied!' : 'Copy'}</button>
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

  function renderList(items, label) {
    if (items.length === 0) return null
    return (
      <section>
        <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#94a3b8', marginBottom: '10px' }}>{label}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map(fu => (
            <div key={fu.id} style={{
              background: '#1e293b',
              border: `1px solid ${fu.is_overdue ? '#f59e0b' : '#334155'}`,
              borderRadius: '10px', padding: '16px',
              display: 'flex', alignItems: 'center', gap: '16px',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: fu.is_overdue ? '#f59e0b' : '#e2e8f0' }}>
                  {fu.company_name}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{fu.note}</div>
                <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
                  Due: {fu.due_date ? new Date(fu.due_date).toLocaleDateString() : '—'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => setDraftCompanyId(fu.company_id)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                >
                  <Mail size={12} /> Draft
                </button>
                <button
                  onClick={() => completeMutation.mutate(fu.id)}
                  style={{ padding: '6px 10px', borderRadius: '6px', background: '#22c55e22', border: '1px solid #22c55e44', color: '#22c55e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                >
                  <Check size={12} /> Done
                </button>
                <button
                  onClick={() => deleteMutation.mutate(fu.id)}
                  style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #334155', background: 'transparent', color: '#64748b', cursor: 'pointer' }}
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
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#e2e8f0' }}>Follow-ups</h1>
        <button
          onClick={() => setShowAdd(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px' }}
        >
          <Plus size={14} /> Add Follow-up
        </button>
      </div>

      {(followups || []).length === 0 ? (
        <div style={{ color: '#475569', fontSize: '14px', textAlign: 'center', padding: '40px' }}>
          No pending follow-ups
        </div>
      ) : (
        <>
          {renderList(overdue, `Overdue (${overdue.length})`)}
          {renderList(upcoming, `Upcoming (${upcoming.length})`)}
        </>
      )}
    </div>
  )
}
