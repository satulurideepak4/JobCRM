import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Copy, Check, X } from 'lucide-react'
import api from '../api/client'

const inputStyle = { width: '100%', padding: '8px 12px', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '14px' }
const labelStyle = { fontSize: '12px', color: 'var(--text-3)', display: 'block', marginBottom: '4px' }

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
    navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000055', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '540px', maxHeight: '85vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ color: 'var(--text)', fontWeight: '700', fontSize: '16px' }}>Draft Cold Email</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)' }}><X size={16} /></button>
        </div>

        {!draft ? (
          <>
            {[['Company Name', 'company_name'], ['Target Role', 'role']].map(([label, key]) => (
              <div key={key} style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>{label}</label>
                <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Job Description (optional)</label>
              <textarea value={form.job_description} onChange={e => setForm(f => ({ ...f, job_description: e.target.value }))} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-3)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={generate} disabled={loading || !form.company_name || !form.role} style={{ padding: '8px 16px', borderRadius: '6px', background: '#f97316', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Generating...' : 'Generate Draft'}
              </button>
            </div>
          </>
        ) : (
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
              <button onClick={copy} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #6366f1', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy</>}
              </button>
              <button onClick={markSent} style={{ padding: '8px 16px', borderRadius: '6px', background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Mark as Sent</button>
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
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text)' }}>Cold Emails</h1>
        <button
          onClick={() => setShowModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: '#f97316', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
        >
          <Plus size={14} /> Draft New Email
        </button>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        {emails.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-4)', fontSize: '14px' }}>No cold emails yet. Draft your first one!</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-light)', background: 'var(--bg)' }}>
                {['Subject', 'Type', 'Date'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', color: 'var(--text-4)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {emails.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text)', fontWeight: '500' }}>{e.subject || '(no subject)'}</td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#6366f1', fontWeight: '600' }}>{e.type?.replace(/_/g, ' ')}</td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-4)' }}>{e.received_at ? new Date(e.received_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
