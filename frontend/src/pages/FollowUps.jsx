import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Check, Trash2, Mail, X, Bell } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import api from '../api/client'
import { useTheme } from '../contexts/ThemeContext'
import { cn } from '../lib/utils'

function FieldLabel({ children, isDark }) {
  return (
    <label className={cn('block text-xs font-medium mb-1.5', isDark ? 'text-slate-500' : 'text-slate-500')}>
      {children}
    </label>
  )
}

function BaseInput({ as = 'input', isDark, ...props }) {
  const cls = cn(
    'w-full px-3 py-2 rounded-lg border text-sm outline-none transition-all duration-150',
    'focus:ring-2 focus:ring-brand/40 focus:border-brand',
    isDark
      ? 'bg-dark-surface border-dark-border text-slate-200 placeholder:text-slate-600'
      : 'bg-slate-50 border-gray-200 text-slate-900',
  )
  if (as === 'select') return <select className={cls} {...props}>{props.children}</select>
  return <input className={cls} {...props} />
}

function ModalWrapper({ children, onClose, title, icon: Icon, isDark }) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          className={cn(
            'w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden',
            isDark ? 'bg-dark-card border-dark-border' : 'bg-white border-gray-200',
          )}
          initial={{ scale: 0.95, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 12 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div className={cn(
            'flex items-center justify-between px-6 py-4 border-b',
            isDark ? 'border-dark-border' : 'border-gray-100',
          )}>
            <div className="flex items-center gap-2.5">
              {Icon && (
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <Icon size={16} className="text-orange-400" />
                </div>
              )}
              <h3 className={cn('text-[15px] font-bold', isDark ? 'text-slate-100' : 'text-slate-900')}>{title}</h3>
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

          {/* Body */}
          <div className="p-6">{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function AddFollowUpModal({ companies, onClose }) {
  const { isDark } = useTheme()
  const qc = useQueryClient()
  const [form, setForm] = useState({ company_id: '', note: '', due_date: '' })

  async function save() {
    if (!form.company_id) return
    try {
      await api.post('/api/followups', {
        company_id: Number(form.company_id),
        note: form.note,
        due_date: form.due_date || new Date().toISOString(),
      })
      qc.invalidateQueries({ queryKey: ['followups'] })
      toast.success('Follow-up added')
      onClose()
    } catch {
      toast.error('Failed to add follow-up')
    }
  }

  return (
    <ModalWrapper title="Add Follow-up" icon={Bell} onClose={onClose} isDark={isDark}>
      <div className="flex flex-col gap-4">
        <div>
          <FieldLabel isDark={isDark}>Company</FieldLabel>
          <BaseInput
            as="select"
            isDark={isDark}
            value={form.company_id}
            onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}
          >
            <option value="">Select company</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </BaseInput>
        </div>
        <div>
          <FieldLabel isDark={isDark}>Due Date</FieldLabel>
          <BaseInput
            type="datetime-local"
            isDark={isDark}
            value={form.due_date}
            onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
          />
        </div>
        <div>
          <FieldLabel isDark={isDark}>Note</FieldLabel>
          <BaseInput
            isDark={isDark}
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            placeholder="e.g. Following up on application"
          />
        </div>
        <div className="flex gap-2.5 justify-end pt-1">
          <button
            onClick={onClose}
            className={cn(
              'px-4 py-2 rounded-lg text-sm border transition-colors',
              isDark ? 'border-dark-border text-slate-400 hover:text-slate-200' : 'border-gray-200 text-slate-500 hover:text-slate-700',
            )}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!form.company_id}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </ModalWrapper>
  )
}

function FollowUpEmailModal({ companyId, onClose }) {
  const { isDark } = useTheme()
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
    toast.success('Copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <ModalWrapper title="Follow-up Email Draft" icon={Mail} onClose={onClose} isDark={isDark}>
      {loading ? (
        <div className={cn('flex items-center justify-center py-8 gap-2.5 text-sm', isDark ? 'text-slate-500' : 'text-slate-600')}>
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          Generating...
        </div>
      ) : draft ? (
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
              'px-3 py-3 rounded-lg border text-sm whitespace-pre-wrap leading-relaxed font-[inherit] max-h-[280px] overflow-y-auto',
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
                isDark ? 'border-dark-border text-slate-400 hover:text-slate-200' : 'border-gray-200 text-slate-500 hover:text-slate-700',
              )}
            >
              Close
            </button>
            <button
              onClick={copy}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-colors flex items-center gap-1.5"
            >
              {copied ? <><Check size={13} /> Copied!</> : 'Copy'}
            </button>
          </div>
        </div>
      ) : null}
    </ModalWrapper>
  )
}

function FollowUpCard({ fu, onDraft, onComplete, onDelete }) {
  const { isDark } = useTheme()
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className={cn(
        'rounded-xl border-l-[4px] border p-4 flex items-center gap-4 transition-all duration-150',
        fu.is_overdue
          ? isDark
            ? 'bg-red-500/5 border-red-500 border border-l-red-500'
            : 'bg-red-50 border-red-400 border border-l-red-400'
          : isDark
            ? 'bg-dark-card border-brand border border-l-brand'
            : 'bg-white border-brand/60 border border-l-brand',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className={cn(
          'text-[14px] font-semibold',
          fu.is_overdue ? 'text-red-400' : isDark ? 'text-slate-200' : 'text-slate-800',
        )}>
          {fu.company_name}
        </div>
        {fu.note && (
          <div className={cn('text-xs mt-0.5', isDark ? 'text-slate-500' : 'text-slate-500')}>
            {fu.note}
          </div>
        )}
        <div className={cn('text-[11px] mt-1', isDark ? 'text-slate-600' : 'text-slate-600')}>
          Due: {fu.due_date ? new Date(fu.due_date).toLocaleDateString() : '—'}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => onDraft(fu.company_id)}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border transition-colors',
            isDark
              ? 'border-dark-border text-slate-400 hover:text-slate-200 hover:border-slate-500'
              : 'border-gray-200 text-slate-500 hover:text-slate-700',
          )}
        >
          <Mail size={11} /> Draft
        </button>
        <button
          onClick={() => onComplete(fu.id)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors"
        >
          <Check size={11} /> Done
        </button>
        <button
          onClick={() => onDelete(fu.id)}
          className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center text-xs border transition-colors',
            isDark
              ? 'border-dark-border text-slate-600 hover:text-red-400 hover:border-red-500/40'
              : 'border-gray-300 text-slate-500 hover:text-red-400 hover:border-red-200',
          )}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </motion.div>
  )
}

export default function FollowUps() {
  const { isDark } = useTheme()
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['followups'] })
      toast.success('Follow-up marked as done')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/followups/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['followups'] })
      toast.success('Follow-up deleted')
    },
  })

  const overdue = (followups || []).filter(fu => fu.is_overdue)
  const upcoming = (followups || []).filter(fu => !fu.is_overdue)

  function renderGroup(items, label, isOverdue) {
    if (items.length === 0) return null
    return (
      <section>
        <h2 className={cn(
          'text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5',
          isOverdue ? 'text-red-400' : isDark ? 'text-slate-500' : 'text-slate-600',
        )}>
          {label}
        </h2>
        <AnimatePresence mode="popLayout">
          <div className="flex flex-col gap-2.5">
            {items.map(fu => (
              <FollowUpCard
                key={fu.id}
                fu={fu}
                onDraft={setDraftCompanyId}
                onComplete={id => completeMutation.mutate(id)}
                onDelete={id => deleteMutation.mutate(id)}
              />
            ))}
          </div>
        </AnimatePresence>
      </section>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-6"
    >
      {showAdd && <AddFollowUpModal companies={companies || []} onClose={() => setShowAdd(false)} />}
      {draftCompanyId && <FollowUpEmailModal companyId={draftCompanyId} onClose={() => setDraftCompanyId(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className={cn('text-2xl font-bold', isDark ? 'text-slate-100' : 'text-slate-900')}>
          Follow-ups
        </h1>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors"
        >
          <Plus size={15} /> Add Follow-up
        </button>
      </div>

      {(followups || []).length === 0 ? (
        <div className={cn(
          'flex flex-col items-center justify-center py-20 gap-3 rounded-2xl border',
          isDark ? 'bg-dark-card border-dark-border' : 'bg-white border-gray-200',
        )}>
          <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', isDark ? 'bg-dark-surface' : 'bg-slate-100')}>
            <Bell size={22} className={isDark ? 'text-slate-600' : 'text-slate-600'} />
          </div>
          <p className={cn('text-sm', isDark ? 'text-slate-500' : 'text-slate-600')}>No pending follow-ups</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {renderGroup(overdue, `Overdue (${overdue.length})`, true)}
          {renderGroup(upcoming, `Upcoming (${upcoming.length})`, false)}
        </div>
      )}
    </motion.div>
  )
}
