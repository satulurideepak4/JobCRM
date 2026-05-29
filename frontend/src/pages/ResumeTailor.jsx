import { useState, useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Sparkles, Bot, Check, Download, ChevronDown, ChevronUp,
  Loader2, FileText, AlertCircle, Info, Upload, Trash2, ShieldCheck,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { cn } from '../lib/utils'
import api from '../api/client'

const METHODS = [
  {
    key:   'llm',
    icon:  Sparkles,
    label: 'GPT-4o',
    sub:   'LLM API · ~3s · ~$0.04',
    color: 'emerald',
  },
  {
    key:   'agent',
    icon:  Bot,
    label: 'Claude Agent',
    sub:   'Subscription · ~15s · $0 extra',
    color: 'violet',
  },
  {
    key:   'both',
    icon:  Check,
    label: 'Both',
    sub:   'Compare side by side',
    color: 'blue',
  },
]

const ACTIVE_BORDER = {
  emerald: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30',
  violet:  'border-violet-500 bg-violet-50 dark:bg-violet-950/30',
  blue:    'border-blue-500 bg-blue-50 dark:bg-blue-950/30',
}

const RESULT_STYLE = {
  llm:   { border: 'border-emerald-400', badge: 'bg-emerald-100 text-emerald-700', label: 'GPT-4o' },
  agent: { border: 'border-violet-400',  badge: 'bg-violet-100 text-violet-700',   label: 'Claude Agent' },
}

function ResultPanel({ method, result, cachedKey, isDark, hasCoverLetter }) {
  const [showCover, setShowCover] = useState(false)
  const [downloading, setDownloading] = useState(null)
  const style = RESULT_STYLE[method]

  const download = async (type) => {
    setDownloading(type)
    try {
      const res = await api.get(`/api/tailor/custom/${cachedKey}/${type}?method=${method}`, {
        responseType: 'blob',
      })
      const url  = URL.createObjectURL(res.data)
      const a    = document.createElement('a')
      a.href     = url
      const cd   = res.headers['content-disposition'] || ''
      a.download = cd.split('filename=')[1]?.replace(/"/g, '') || `resume_${method}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Download failed', e)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className={cn('rounded-xl border-2 p-5 space-y-4', style.border, isDark ? 'bg-slate-800/40' : 'bg-white')}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full', style.badge)}>
          {style.label}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => download('resume')}
            disabled={!!downloading}
            className={cn(
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors',
              isDark ? 'border-slate-600 hover:border-slate-400 text-slate-300' : 'border-slate-300 hover:border-slate-400 text-slate-700',
              'disabled:opacity-50'
            )}
          >
            {downloading === 'resume' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            Resume .docx
          </button>
          {hasCoverLetter && (
            <button
              onClick={() => download('cover')}
              disabled={!!downloading}
              className={cn(
                'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors',
                isDark ? 'border-slate-600 hover:border-slate-400 text-slate-300' : 'border-slate-300 hover:border-slate-400 text-slate-700',
                'disabled:opacity-50'
              )}
            >
              {downloading === 'cover' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              Cover Letter .docx
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div>
        <p className={cn('text-[11px] font-semibold uppercase tracking-wider mb-1.5', isDark ? 'text-slate-500' : 'text-slate-400')}>
          Tailored Summary
        </p>
        <p className={cn('text-sm leading-relaxed', isDark ? 'text-slate-300' : 'text-slate-700')}>
          {result.tailored_summary}
        </p>
      </div>

      {/* Keywords */}
      {result.keywords_matched?.length > 0 && (
        <div>
          <p className={cn('text-[11px] font-semibold uppercase tracking-wider mb-1.5', isDark ? 'text-slate-500' : 'text-slate-400')}>
            Keywords Matched
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.keywords_matched.map(k => (
              <span key={k} className={cn(
                'text-xs px-2.5 py-0.5 rounded-full',
                isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600 border border-slate-200'
              )}>
                {k}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Cover letter preview toggle */}
      {hasCoverLetter && result.cover_letter && (
        <>
          <button
            onClick={() => setShowCover(v => !v)}
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium transition-colors',
              isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'
            )}
          >
            {showCover ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showCover ? 'Hide' : 'Preview'} cover letter
          </button>

          {showCover && (
            <div className={cn(
              'p-4 rounded-xl text-sm whitespace-pre-wrap leading-relaxed',
              isDark ? 'bg-slate-900/60 text-slate-300 border border-slate-700' : 'bg-slate-50 text-slate-700 border border-slate-200'
            )}>
              {result.cover_letter}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ResumeTemplateUpload({ isDark }) {
  const [hasTemplate, setHasTemplate] = useState(null) // null = loading
  const [uploading, setUploading]     = useState(false)
  const [removing, setRemoving]       = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    api.get('/api/profile/resume-template/status')
      .then(r => setHasTemplate(r.data.data.has_template))
      .catch(() => setHasTemplate(false))
  }, [])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.docx')) {
      alert('Please upload a .docx file')
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      await api.post('/api/profile/resume-template', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setHasTemplate(true)
    } catch (e) {
      alert(e.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    try {
      await api.delete('/api/profile/resume-template')
      setHasTemplate(false)
    } finally {
      setRemoving(false)
    }
  }

  if (hasTemplate === null) return null

  return (
    <div className={cn(
      'rounded-xl border px-4 py-3 mb-6 flex items-center justify-between gap-4',
      hasTemplate
        ? isDark ? 'border-emerald-700 bg-emerald-950/30' : 'border-emerald-300 bg-emerald-50'
        : isDark ? 'border-amber-700 bg-amber-950/20' : 'border-amber-300 bg-amber-50'
    )}>
      <div className="flex items-center gap-3 min-w-0">
        {hasTemplate
          ? <ShieldCheck size={16} className="text-emerald-500 flex-shrink-0" />
          : <AlertCircle size={16} className="text-amber-500 flex-shrink-0" />
        }
        <div className="min-w-0">
          <p className={cn('text-sm font-medium', isDark ? 'text-slate-200' : 'text-slate-800')}>
            {hasTemplate ? 'Your resume template is active' : 'No resume template uploaded'}
          </p>
          <p className={cn('text-xs', isDark ? 'text-slate-500' : 'text-slate-500')}>
            {hasTemplate
              ? 'Tailored resume will preserve your original layout, fonts, and links'
              : 'Upload your original resume .docx so only content changes — structure stays identical'
            }
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {hasTemplate && (
          <button
            onClick={handleRemove}
            disabled={removing}
            className={cn(
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors',
              isDark ? 'border-slate-600 text-slate-400 hover:border-red-500 hover:text-red-400' : 'border-slate-300 text-slate-500 hover:border-red-400 hover:text-red-500'
            )}
          >
            {removing ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
            Remove
          </button>
        )}
        <input ref={inputRef} type="file" accept=".docx" className="hidden" onChange={handleUpload} />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors',
            hasTemplate
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
              : 'bg-violet-600 hover:bg-violet-700 text-white',
            'disabled:opacity-50'
          )}
        >
          {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
          {hasTemplate ? 'Replace template' : 'Upload .docx template'}
        </button>
      </div>
    </div>
  )
}

export default function ResumeTailor() {
  const { isDark } = useTheme()

  const [companyName, setCompanyName]             = useState('')
  const [jobDescription, setJobDescription]       = useState('')
  const [method, setMethod]                       = useState('agent')
  const [extraInstructions, setExtraInstructions] = useState('')
  const [generateCoverLetter, setGenerateCoverLetter] = useState(false)
  const [results, setResults]                     = useState({})
  const [cacheKey, setCacheKey]                   = useState(null)
  const [errors, setErrors]                       = useState({})

  const card  = isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
  const label = isDark ? 'text-slate-400' : 'text-slate-500'
  const input = isDark
    ? 'bg-slate-900 border-slate-700 text-slate-200 placeholder-slate-600 focus:border-violet-500'
    : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:border-violet-500'

  const generateMutation = useMutation({
    mutationFn: async (m) => {
      const res = await api.post('/api/tailor/custom', {
        method: m,
        company_name: companyName.trim() || 'Company',
        job_description: jobDescription.trim(),
        extra_instructions: extraInstructions.trim(),
        generate_cover_letter: generateCoverLetter,
      })
      return { method: m, data: res.data.data, key: res.data.cache_key }
    },
    onSuccess: ({ method: m, data, key }) => {
      setResults(prev => ({ ...prev, [m]: data }))
      setCacheKey(key)
    },
    onError: (err, m) => {
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map(e => e.msg || JSON.stringify(e)).join(', ')
        : (detail || err.message)
      setErrors(prev => ({ ...prev, [m]: msg }))
    },
  })

  const handleGenerate = async () => {
    if (!jobDescription.trim()) return
    setErrors({})
    setResults({})

    const methods = method === 'both' ? ['llm', 'agent'] : [method]
    await Promise.allSettled(methods.map(m => generateMutation.mutateAsync(m)))
  }

  const isLoading    = generateMutation.isPending
  const hasResults   = Object.keys(results).length > 0
  const canGenerate  = jobDescription.trim().length > 50

  return (
    <div className="max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className={cn('text-2xl font-bold', isDark ? 'text-white' : 'text-slate-900')}>
          Resume Tailor
        </h1>
        <p className={cn('text-sm mt-1', label)}>
          Paste any job description · generate a tailored resume + cover letter · download as .docx
        </p>
      </div>

      <ResumeTemplateUpload isDark={isDark} />

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 items-start">

        {/* ── Left panel: inputs ─────────────────────────────────────────── */}
        <div className={cn('rounded-2xl border p-6 space-y-5 sticky top-6', card)}>

          {/* Company name */}
          <div>
            <label className={cn('block text-xs font-semibold uppercase tracking-wider mb-2', label)}>
              Company Name
            </label>
            <input
              type="text"
              placeholder="e.g. Stripe, Vercel, Notion…"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              className={cn('w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-colors', input)}
            />
          </div>

          {/* Job description */}
          <div>
            <label className={cn('block text-xs font-semibold uppercase tracking-wider mb-2', label)}>
              Job Description <span className="normal-case font-normal">(paste full JD)</span>
            </label>
            <textarea
              rows={12}
              placeholder="Paste the full job description here — role requirements, responsibilities, tech stack, company info…"
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
              className={cn('w-full rounded-xl border px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-colors', input)}
            />
            {jobDescription.length > 0 && jobDescription.length < 50 && (
              <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
                <AlertCircle size={11} /> Paste more of the JD for better results
              </p>
            )}
          </div>

          {/* Method */}
          <div>
            <label className={cn('block text-xs font-semibold uppercase tracking-wider mb-2', label)}>
              Generation Method
            </label>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map(({ key, icon: Icon, label: ml, sub, color }) => {
                const active = method === key
                return (
                  <button
                    key={key}
                    onClick={() => setMethod(key)}
                    className={cn(
                      'text-left p-3 rounded-xl border-2 transition-all',
                      active ? ACTIVE_BORDER[color] : isDark ? 'border-slate-700 hover:border-slate-500' : 'border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <Icon size={14} className={cn('mb-1.5', active ? `text-${color}-500` : isDark ? 'text-slate-500' : 'text-slate-400')} />
                    <p className={cn('text-xs font-bold', isDark ? 'text-slate-200' : 'text-slate-800')}>{ml}</p>
                    <p className={cn('text-[10px] mt-0.5 leading-tight', isDark ? 'text-slate-500' : 'text-slate-400')}>{sub}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Extra instructions */}
          <div>
            <label className={cn('block text-xs font-semibold uppercase tracking-wider mb-2', label)}>
              Extra Instructions <span className="normal-case font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Focus on Kafka experience, highlight Go over Java, emphasize the fintech domain…"
              value={extraInstructions}
              onChange={e => setExtraInstructions(e.target.value)}
              className={cn('w-full rounded-xl border px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-colors', input)}
            />
            <p className={cn('text-[11px] mt-1.5 flex items-center gap-1', label)}>
              <Info size={11} /> Leave blank to use the standard tailoring template
            </p>
          </div>

          {/* Cover letter checkbox */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className="relative flex-shrink-0">
              <input
                type="checkbox"
                className="sr-only"
                checked={generateCoverLetter}
                onChange={e => setGenerateCoverLetter(e.target.checked)}
              />
              <div className={cn(
                'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                generateCoverLetter
                  ? 'bg-violet-600 border-violet-600'
                  : isDark ? 'border-slate-600 bg-slate-800' : 'border-slate-300 bg-white'
              )}>
                {generateCoverLetter && <Check size={12} className="text-white" strokeWidth={3} />}
              </div>
            </div>
            <div>
              <p className={cn('text-sm font-medium', isDark ? 'text-slate-200' : 'text-slate-800')}>
                Also generate cover letter
              </p>
              <p className={cn('text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>
                Adds ~5 seconds · specific to this role and company
              </p>
            </div>
          </label>

          {/* Generate */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || isLoading}
            className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                {method === 'agent' ? 'Claude is writing… (up to 15s)' : 'Generating…'}
              </>
            ) : (
              <>
                <Sparkles size={15} />
                {hasResults ? 'Regenerate' : 'Generate'}
              </>
            )}
          </button>

          {/* Errors */}
          {Object.entries(errors).map(([m, msg]) => (
            <div key={m} className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
              <strong>{m === 'agent' ? 'Claude Agent' : 'GPT-4o'}:</strong> {msg}
            </div>
          ))}
        </div>

        {/* ── Right panel: results ───────────────────────────────────────── */}
        <div className="space-y-5">
          {!hasResults && !isLoading && (
            <div className={cn(
              'rounded-2xl border-2 border-dashed flex flex-col items-center justify-center py-24 text-center',
              isDark ? 'border-slate-700' : 'border-slate-200'
            )}>
              <FileText size={40} className={cn('mb-4', isDark ? 'text-slate-700' : 'text-slate-300')} />
              <p className={cn('text-sm font-medium', isDark ? 'text-slate-500' : 'text-slate-400')}>
                Paste a job description and click Generate
              </p>
              <p className={cn('text-xs mt-1', isDark ? 'text-slate-600' : 'text-slate-400')}>
                Your tailored resume and cover letter will appear here
              </p>
            </div>
          )}

          {isLoading && (
            <div className={cn(
              'rounded-2xl border flex flex-col items-center justify-center py-24',
              isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'
            )}>
              <Loader2 size={32} className="animate-spin text-violet-500 mb-4" />
              <p className={cn('text-sm font-medium', isDark ? 'text-slate-300' : 'text-slate-700')}>
                {method === 'agent' ? 'Claude is tailoring your resume…' : 'GPT-4o is tailoring your resume…'}
              </p>
              <p className={cn('text-xs mt-1', label)}>
                {method === 'agent' ? 'Usually 10–15 seconds' : 'Usually 2–4 seconds'}
              </p>
            </div>
          )}

          {hasResults && Object.entries(results).map(([m, result]) => (
            <ResultPanel
              key={m}
              method={m}
              result={result}
              cachedKey={cacheKey}
              isDark={isDark}
              hasCoverLetter={generateCoverLetter}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
