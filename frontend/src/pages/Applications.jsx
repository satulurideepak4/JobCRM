import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ChevronDown, ChevronRight, Trash2, Building2, Globe, Clock, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import api from '../api/client'
import { useTheme } from '../contexts/ThemeContext'
import { cn } from '../lib/utils'

const STATUS_CONFIG = {
  cold_email_sent:      { color: '#6366f1', bg: '#6366f115', label: 'Cold Email Sent' },
  applied:              { color: '#3b82f6', bg: '#3b82f615', label: 'Applied' },
  confirmation_received:{ color: '#06b6d4', bg: '#06b6d415', label: 'Confirmation Received' },
  reply_received:       { color: '#8b5cf6', bg: '#8b5cf615', label: 'Reply Received' },
  interviewing:         { color: '#f59e0b', bg: '#f59e0b15', label: 'Interviewing' },
  offer:                { color: '#22c55e', bg: '#22c55e15', label: 'Offer' },
  rejected:             { color: '#ef4444', bg: '#ef444415', label: 'Rejected' },
  ghosted:              { color: '#64748b', bg: '#64748b15', label: 'Ghosted' },
}

const ALL_STATUSES = Object.keys(STATUS_CONFIG)

function AddModal({ onClose, onSave, isDark }) {
  const [form, setForm] = useState({
    name: '', website: '', status: 'cold_email_sent', source: 'manual', notes: ''
  })

  const inputCls = cn(
    'w-full px-3 py-2 rounded-lg text-sm border outline-none transition-colors',
    isDark
      ? 'bg-dark-bg border-dark-border text-slate-100 placeholder-slate-500 focus:border-brand'
      : 'bg-white border-light-border text-slate-800 placeholder-slate-400 focus:border-brand'
  )

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className={cn(
          'w-[420px] rounded-2xl p-6 shadow-2xl border',
          isDark ? 'bg-dark-surface border-dark-border' : 'bg-white border-light-border'
        )}
      >
        <h3 className={cn('text-base font-semibold mb-5', isDark ? 'text-white' : 'text-slate-900')}>
          Add Application
        </h3>

        {[['Company Name', 'name', 'text', 'e.g. Stripe, Linear...'],
          ['Website', 'website', 'url', 'https://company.com']].map(([label, key, type, placeholder]) => (
          <div key={key} className="mb-4">
            <label className={cn('block text-xs font-medium mb-1.5', isDark ? 'text-slate-400' : 'text-slate-500')}>
              {label}
            </label>
            <input
              type={type}
              value={form[key]}
              placeholder={placeholder}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              className={inputCls}
            />
          </div>
        ))}

        <div className="mb-4">
          <label className={cn('block text-xs font-medium mb-1.5', isDark ? 'text-slate-400' : 'text-slate-500')}>
            Status
          </label>
          <select
            value={form.status}
            onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
            className={inputCls}
          >
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
            ))}
          </select>
        </div>

        <div className="mb-6">
          <label className={cn('block text-xs font-medium mb-1.5', isDark ? 'text-slate-400' : 'text-slate-500')}>
            Notes
          </label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={3}
            placeholder="Any notes about this application..."
            className={cn(inputCls, 'resize-none')}
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
              isDark
                ? 'border-dark-border text-slate-400 hover:text-white hover:bg-dark-hover'
                : 'border-light-border text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            )}
          >
            Cancel
          </button>
          <button
            onClick={() => { if (form.name) { onSave(form); onClose() } }}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand hover:bg-brand-hover text-white transition-colors"
          >
            Save
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function TimelineRow({ companyId, isDark }) {
  const { data } = useQuery({
    queryKey: ['timeline', companyId],
    queryFn: async () => (await api.get(`/api/applications/${companyId}/timeline`)).data.data,
  })

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'overflow-hidden border-t',
        isDark ? 'border-dark-border bg-dark-bg/50' : 'border-light-border bg-slate-50'
      )}
    >
      <div className="px-6 py-4">
        {!data ? (
          <div className={cn('text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>Loading timeline...</div>
        ) : data.length === 0 ? (
          <div className={cn('text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>No timeline events yet</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {data.map((event, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 flex-shrink-0" />
                <div className="flex gap-3 items-baseline">
                  <span className={cn('text-xs font-medium whitespace-nowrap', isDark ? 'text-slate-400' : 'text-slate-500')}>
                    {event.at ? new Date(event.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </span>
                  <span className={cn('text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>{event.label}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default function Applications() {
  const { isDark } = useTheme()
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications'] })
      toast.success('Application added')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/applications/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications'] })
      toast.success('Application removed')
    },
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

  const filtered = (data || []).filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  )
  const daysSince = (dateStr) =>
    dateStr ? Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000) : 0

  const inputCls = cn(
    'px-3 py-2 rounded-lg text-sm border outline-none transition-colors',
    isDark
      ? 'bg-dark-surface border-dark-border text-slate-100 placeholder-slate-500 focus:border-brand'
      : 'bg-white border-light-border text-slate-700 placeholder-slate-400 focus:border-brand'
  )

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <AnimatePresence>
        {showModal && (
          <AddModal
            isDark={isDark}
            onClose={() => setShowModal(false)}
            onSave={createMutation.mutate}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={cn('text-2xl font-bold', isDark ? 'text-white' : 'text-slate-900')}>
            Applications
          </h1>
          <p className={cn('text-sm mt-0.5', isDark ? 'text-slate-500' : 'text-slate-400')}>
            {filtered.length} {filtered.length === 1 ? 'company' : 'companies'} tracked
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition-all shadow-lg shadow-brand/20 hover:shadow-brand/30"
        >
          <Plus size={15} />
          Add Manually
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          placeholder="Search companies..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={cn(inputCls, 'flex-1')}
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className={inputCls}
        >
          <option value="">All statuses</option>
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className={cn('h-14 rounded-xl animate-pulse', isDark ? 'bg-dark-surface' : 'bg-slate-100')}
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className={cn(
          'flex flex-col items-center justify-center py-20 rounded-2xl border',
          isDark ? 'border-dark-border bg-dark-surface' : 'border-light-border bg-white'
        )}>
          <Building2 size={36} className={isDark ? 'text-slate-600' : 'text-slate-300'} />
          <p className={cn('mt-3 text-sm font-medium', isDark ? 'text-slate-400' : 'text-slate-500')}>
            No applications yet
          </p>
          <p className={cn('text-xs mt-1', isDark ? 'text-slate-600' : 'text-slate-400')}>
            Add your first application manually or sync Gmail
          </p>
        </div>
      ) : (
        <div className={cn(
          'rounded-2xl border overflow-hidden',
          isDark ? 'border-dark-border bg-dark-surface' : 'border-light-border bg-white shadow-sm'
        )}>
          {/* Table header */}
          <div className={cn(
            'grid grid-cols-[32px_1fr_180px_110px_110px_100px_44px] px-4 py-3 border-b text-xs font-semibold uppercase tracking-wide',
            isDark
              ? 'border-dark-border text-slate-500 bg-dark-bg/40'
              : 'border-light-border text-slate-400 bg-slate-50'
          )}>
            <div />
            <div>Company</div>
            <div>Status</div>
            <div>Source</div>
            <div className="flex items-center gap-1"><Calendar size={10} /> Added</div>
            <div className="flex items-center gap-1"><Clock size={10} /> Updated</div>
            <div />
          </div>

          {/* Rows */}
          <div className="divide-y divide-dark-border/50">
            {filtered.map((c, idx) => {
              const cfg = STATUS_CONFIG[c.status] || { color: '#64748b', bg: '#64748b15', label: c.status }
              const isExpanded = expanded === c.id
              const isHighlighted = c.id === highlightId

              return (
                <div key={c.id} ref={c.id === highlightId ? highlightRef : null}>
                  <motion.div
                    initial={false}
                    animate={{ backgroundColor: isHighlighted ? '#6366f110' : 'transparent' }}
                    whileHover={{ backgroundColor: isDark ? '#ffffff05' : '#f8fafc' }}
                    className={cn(
                      'grid grid-cols-[32px_1fr_180px_110px_110px_100px_44px] px-4 py-3.5 cursor-pointer items-center transition-colors',
                      isHighlighted && 'ring-1 ring-inset ring-brand/30'
                    )}
                    onClick={() => setExpanded(isExpanded ? null : c.id)}
                  >
                    {/* Expand */}
                    <div>
                      <motion.div
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        <ChevronRight size={14} className={isDark ? 'text-slate-600' : 'text-slate-300'} />
                      </motion.div>
                    </div>

                    {/* Company */}
                    <div>
                      <div className={cn('text-sm font-semibold', isDark ? 'text-slate-100' : 'text-slate-800')}>
                        {c.name}
                      </div>
                      {c.website && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Globe size={10} className={isDark ? 'text-slate-600' : 'text-slate-400'} />
                          <span className={cn('text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>
                            {c.website.replace(/^https?:\/\//, '')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Status dropdown */}
                    <div onClick={e => e.stopPropagation()}>
                      <select
                        value={c.status}
                        onChange={e => updateStatusMutation.mutate({ id: c.id, status: e.target.value })}
                        className="text-xs font-semibold px-2.5 py-1 rounded-full border-0 outline-none cursor-pointer transition-colors"
                        style={{
                          background: cfg.bg,
                          color: cfg.color,
                        }}
                      >
                        {ALL_STATUSES.map(s => (
                          <option key={s} value={s}
                            style={{ background: isDark ? '#1a1d23' : '#fff', color: isDark ? '#e2e8f0' : '#1e293b' }}>
                            {STATUS_CONFIG[s]?.label || s}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Source */}
                    <div className={cn('text-xs capitalize', isDark ? 'text-slate-500' : 'text-slate-400')}>
                      {c.source?.replace(/_/g, ' ') || '—'}
                    </div>

                    {/* Added */}
                    <div className={cn('text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>
                      {c.added_at ? new Date(c.added_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </div>

                    {/* Days since update */}
                    <div>
                      <span className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        daysSince(c.updated_at) > 14
                          ? 'bg-red-500/10 text-red-400'
                          : daysSince(c.updated_at) > 7
                            ? 'bg-amber-500/10 text-amber-400'
                            : isDark ? 'text-slate-500' : 'text-slate-400'
                      )}>
                        {daysSince(c.updated_at)}d ago
                      </span>
                    </div>

                    {/* Delete */}
                    <div onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => deleteMutation.mutate(c.id)}
                        className={cn(
                          'p-1.5 rounded-lg transition-colors',
                          isDark
                            ? 'text-slate-600 hover:text-red-400 hover:bg-red-400/10'
                            : 'text-slate-300 hover:text-red-500 hover:bg-red-50'
                        )}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </motion.div>

                  {/* Timeline */}
                  <AnimatePresence>
                    {isExpanded && (
                      <TimelineRow companyId={c.id} isDark={isDark} />
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
