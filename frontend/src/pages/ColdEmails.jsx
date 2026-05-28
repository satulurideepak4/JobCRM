import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Copy, Check, X, Mail } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import api from '../api/client'
import { useTheme } from '../contexts/ThemeContext'
import { cn } from '../lib/utils'

function FieldInput({ label, value, onChange, type = 'text', as = 'input', rows = 3, placeholder, isDark }) {
  const base = cn(
    'w-full px-3 py-2 rounded-lg border text-sm outline-none transition-all duration-150',
    'focus:ring-2 focus:ring-brand/40 focus:border-brand',
    isDark
      ? 'bg-dark-surface border-dark-border text-slate-200 placeholder:text-slate-600'
      : 'bg-slate-50 border-gray-200 text-slate-900 placeholder:text-slate-400',
  )
  return (
    <div>
      <label className={cn('block text-xs font-medium mb-1.5', isDark ? 'text-slate-500' : 'text-slate-500')}>
        {label}
      </label>
      {as === 'textarea'
        ? <textarea rows={rows} value={value} onChange={onChange} placeholder={placeholder} className={cn(base, 'resize-y')} />
        : <input type={type} value={value} onChange={onChange} placeholder={placeholder} className={base} />
      }
    </div>
  )
}

function DraftModal({ onClose }) {
  const { isDark } = useTheme()
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
    } catch {
      toast.error('Failed to generate draft')
    } finally {
      setLoading(false)
    }
  }

  async function markSent() {
    await api.post('/api/applications', { name: form.company_name, source: 'cold_email', status: 'cold_email_sent' })
    qc.invalidateQueries({ queryKey: ['applications'] })
    toast.success(`Cold email marked as sent for ${form.company_name}`)
    onClose()
  }

  function copy() {
    navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
    setCopied(true)
    toast.success('Copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  }

  const overlay = cn('fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4')
  const panel = cn(
    'w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden',
    isDark ? 'bg-dark-card border-dark-border' : 'bg-white border-gray-200',
  )

  return (
    <AnimatePresence>
      <motion.div
        className={overlay}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        <motion.div
          className={panel}
          initial={{ scale: 0.95, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 12 }}
          transition={{ duration: 0.2 }}
        >
          {/* Modal header */}
          <div className={cn(
            'flex items-center justify-between px-6 py-4 border-b',
            isDark ? 'border-dark-border' : 'border-gray-100',
          )}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Mail size={16} className="text-orange-400" />
              </div>
              <h3 className={cn('text-[15px] font-bold', isDark ? 'text-slate-100' : 'text-slate-900')}>
                Draft Cold Email
              </h3>
            </div>
            <button
              onClick={onClose}
              className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
                isDark ? 'hover:bg-dark-surface text-slate-500' : 'hover:bg-slate-100 text-slate-400',
              )}
            >
              <X size={15} />
            </button>
          </div>

          {/* Modal body */}
          <div className="p-6 max-h-[70vh] overflow-y-auto">
            {!draft ? (
              <div className="flex flex-col gap-4">
                <FieldInput
                  label="Company Name"
                  value={form.company_name}
                  onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                  isDark={isDark}
                />
                <FieldInput
                  label="Target Role"
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  isDark={isDark}
                />
                <FieldInput
                  label="Job Description (optional)"
                  value={form.job_description}
                  onChange={e => setForm(f => ({ ...f, job_description: e.target.value }))}
                  as="textarea"
                  rows={4}
                  isDark={isDark}
                />
                <div className="flex gap-2.5 justify-end pt-1">
                  <button
                    onClick={onClose}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm border transition-colors',
                      isDark
                        ? 'border-dark-border text-slate-400 hover:text-slate-200 hover:border-slate-600'
                        : 'border-gray-200 text-slate-500 hover:text-slate-700',
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={generate}
                    disabled={loading || !form.company_name || !form.role}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Generating...' : 'Generate Draft'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <div className={cn('text-xs font-medium mb-1.5', isDark ? 'text-slate-500' : 'text-slate-500')}>Subject</div>
                  <div className={cn(
                    'px-3 py-2.5 rounded-lg border text-sm',
                    isDark ? 'bg-dark-surface border-dark-border text-slate-200' : 'bg-slate-50 border-gray-200 text-slate-800',
                  )}>
                    {draft.subject}
                  </div>
                </div>
                <div>
                  <div className={cn('text-xs font-medium mb-1.5', isDark ? 'text-slate-500' : 'text-slate-500')}>Body</div>
                  <pre className={cn(
                    'px-3 py-3 rounded-lg border text-sm whitespace-pre-wrap leading-relaxed font-[inherit]',
                    isDark ? 'bg-dark-surface border-dark-border text-slate-300' : 'bg-slate-50 border-gray-200 text-slate-700',
                  )}>
                    {draft.body}
                  </pre>
                </div>
                <div className="flex gap-2.5 justify-end pt-1">
                  <button
                    onClick={onClose}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm border transition-colors',
                      isDark
                        ? 'border-dark-border text-slate-400 hover:text-slate-200'
                        : 'border-gray-200 text-slate-500 hover:text-slate-700',
                    )}
                  >
                    Close
                  </button>
                  <button
                    onClick={copy}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-brand text-brand hover:bg-brand hover:text-white transition-colors flex items-center gap-1.5"
                  >
                    {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy</>}
                  </button>
                  <button
                    onClick={markSent}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                  >
                    Mark as Sent
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default function ColdEmails() {
  const { isDark } = useTheme()
  const [showModal, setShowModal] = useState(false)

  const { data } = useQuery({
    queryKey: ['emails'],
    queryFn: async () => (await api.get('/api/emails')).data.data || [],
  })

  const emails = (data || []).filter(e => ['cold_sent', 'follow_up_sent'].includes(e.type))

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-6"
    >
      {showModal && <DraftModal onClose={() => setShowModal(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className={cn('text-2xl font-bold', isDark ? 'text-slate-100' : 'text-slate-900')}>
          Cold Emails
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors"
        >
          <Plus size={15} /> Draft New Email
        </button>
      </div>

      {/* Table card */}
      <div className={cn(
        'rounded-2xl border overflow-hidden',
        isDark ? 'bg-dark-card border-dark-border' : 'bg-white border-gray-200',
      )}>
        {emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center',
              isDark ? 'bg-dark-surface' : 'bg-slate-100',
            )}>
              <Mail size={22} className={isDark ? 'text-slate-600' : 'text-slate-600'} />
            </div>
            <p className={cn('text-sm', isDark ? 'text-slate-500' : 'text-slate-600')}>
              No cold emails yet. Draft your first one!
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className={cn(
                'border-b',
                isDark ? 'bg-dark-surface border-dark-border' : 'bg-slate-50 border-gray-100',
              )}>
                {['Subject', 'Type', 'Date'].map(h => (
                  <th key={h} className={cn(
                    'px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider',
                    isDark ? 'text-slate-500' : 'text-slate-600',
                  )}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {emails.map((e, i) => (
                <tr
                  key={e.id}
                  className={cn(
                    'transition-colors',
                    i < emails.length - 1
                      ? isDark ? 'border-b border-dark-border' : 'border-b border-gray-50'
                      : '',
                    isDark ? 'hover:bg-dark-surface/50' : 'hover:bg-slate-50/50',
                  )}
                >
                  <td className={cn('px-4 py-3 text-sm font-medium', isDark ? 'text-slate-200' : 'text-slate-800')}>
                    {e.subject || '(no subject)'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold text-brand bg-brand/10 px-2.5 py-1 rounded-full">
                      {e.type?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className={cn('px-4 py-3 text-xs', isDark ? 'text-slate-500' : 'text-slate-600')}>
                    {e.received_at ? new Date(e.received_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  )
}
