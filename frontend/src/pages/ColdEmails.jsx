import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Copy, Check } from 'lucide-react'
import api from '../api/client'

function DraftModal({ onClose }) {
  const [form, setForm] = useState({ company_name: '', role: '', job_description: '' })
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const qc = useQueryClient()

  async function generate() {
    setLoading(true)
    try {
      const res = await api.post('/api/emails/draft', form)
      setDraft(res.data.data)
    } finally {
      setLoading(false)
    }
  }

  async function markSent() {
    await api.post('/api/applications', { name: form.company_name, source: 'cold_email', status: 'cold_email_sent' })
    qc.invalidateQueries({ queryKey: ['applications'] })
    onClose()
  }

  function copy() {
    const text = `Subject: ${draft.subject}\n\n${draft.body}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '24px', width: '540px', maxHeight: '85vh', overflow: 'auto' }}>
        <h3 style={{ color: '#e2e8f0', marginBottom: '20px' }}>Draft Cold Email</h3>

        {!draft ? (
          <>
            {[['Company Name', 'company_name'], ['Target Role', 'role']].map(([label, key]) => (
              <div key={key} style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>{label}</label>
                <input
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '14px' }}
                />
              </div>
            ))}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Job Description (optional)</label>
              <textarea
                value={form.job_description}
                onChange={e => setForm(f => ({ ...f, job_description: e.target.value }))}
                rows={4}
                style={{ width: '100%', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '14px', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button
                onClick={generate}
                disabled={loading || !form.company_name || !form.role}
                style={{ padding: '8px 16px', borderRadius: '6px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Generating...' : 'Generate Draft'}
              </button>
            </div>
          </>
        ) : (
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
              <button onClick={copy} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #6366f1', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy</>}
              </button>
              <button onClick={markSent} style={{ padding: '8px 16px', borderRadius: '6px', background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px' }}>Mark as Sent</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function ColdEmails() {
  const [showModal, setShowModal] = useState(false)
  const { data } = useQuery({
    queryKey: ['emails'],
    queryFn: async () => (await api.get('/api/emails')).data.data || [],
  })

  const emails = (data || []).filter(e => ['cold_sent', 'follow_up_sent'].includes(e.type))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {showModal && <DraftModal onClose={() => setShowModal(false)} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#e2e8f0' }}>Cold Emails</h1>
        <button
          onClick={() => setShowModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px' }}
        >
          <Plus size={14} /> Draft New Email
        </button>
      </div>

      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden' }}>
        {emails.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#475569', fontSize: '14px' }}>No cold emails yet. Draft your first one!</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #334155' }}>
                {['Subject', 'Type', 'Date'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', color: '#64748b', fontWeight: '500' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {emails.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid #0f172a' }}>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#e2e8f0' }}>{e.subject || '(no subject)'}</td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#6366f1' }}>{e.type?.replace(/_/g, ' ')}</td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748b' }}>{e.received_at ? new Date(e.received_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
