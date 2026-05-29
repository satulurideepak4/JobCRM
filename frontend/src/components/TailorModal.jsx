import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X, Sparkles, Bot, Download, ChevronDown, ChevronUp, Loader2, Check, FileText } from 'lucide-react'
import api from '../api/client'

const METHOD_INFO = {
  llm: {
    label: 'GPT-4o  (LLM API)',
    desc: 'Fast • ~3 seconds • ~$0.04/generation',
    color: 'emerald',
  },
  agent: {
    label: 'Claude Agent  (Subscription)',
    desc: 'Best quality • ~15 seconds • $0 extra cost',
    color: 'violet',
  },
}

function ResultCard({ method, result, jobId, hasCoverLetter, isDark }) {
  const [showCover, setShowCover] = useState(false)
  const [downloading, setDownloading] = useState(null)

  const info     = METHOD_INFO[method]
  const colorCls = method === 'agent'
    ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30'
    : 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
  const badgeCls = method === 'agent'
    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300'
    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'

  const download = async (type) => {
    setDownloading(type)
    try {
      const res = await api.get(`/api/tailor/${jobId}/${type}?method=${method}`, { responseType: 'blob' })
      const url  = URL.createObjectURL(res.data)
      const a    = document.createElement('a')
      a.href     = url
      a.download = res.headers['content-disposition']?.split('filename=')[1]?.replace(/"/g, '') || `resume_${method}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className={`rounded-xl border-2 p-4 ${colorCls}`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${badgeCls}`}>{info.label}</span>
        <div className="flex gap-2">
          <button
            onClick={() => download('resume')}
            disabled={!!downloading}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium transition-colors disabled:opacity-50"
          >
            {downloading === 'resume' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            Resume .docx
          </button>
          {hasCoverLetter && (
            <button
              onClick={() => download('cover')}
              disabled={!!downloading}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium transition-colors disabled:opacity-50"
            >
              {downloading === 'cover' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              Cover Letter .docx
            </button>
          )}
        </div>
      </div>

      <p className={`text-sm leading-relaxed mb-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
        {result.tailored_summary}
      </p>

      {result.keywords_matched?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {result.keywords_matched.map(k => (
            <span key={k} className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-white text-slate-600 border border-slate-200'}`}>
              {k}
            </span>
          ))}
        </div>
      )}

      {hasCoverLetter && result.cover_letter && (
        <>
          <button
            onClick={() => setShowCover(v => !v)}
            className={`flex items-center gap-1 text-xs font-medium ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'} transition-colors`}
          >
            {showCover ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showCover ? 'Hide' : 'Preview'} cover letter
          </button>
          {showCover && (
            <div className={`mt-3 p-3 rounded-lg text-sm whitespace-pre-wrap leading-relaxed ${isDark ? 'bg-slate-800/60 text-slate-300' : 'bg-white text-slate-700 border border-slate-200'}`}>
              {result.cover_letter}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function TailorModal({ job, onClose, isDark }) {
  const [selectedMethod, setSelectedMethod]         = useState(null)
  const [extraInstructions, setExtraInstructions]   = useState('')
  const [generateCoverLetter, setGenerateCoverLetter] = useState(false)
  const [results, setResults]                       = useState({})
  const [errors, setErrors]                         = useState({})

  const bg    = isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'
  const sub   = isDark ? 'text-slate-400' : 'text-slate-500'
  const input = isDark
    ? 'bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-500'
    : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'

  const generateMutation = useMutation({
    mutationFn: async (method) => {
      const res = await api.post(`/api/tailor/${job.id}`, {
        method,
        extra_instructions: extraInstructions,
        generate_cover_letter: generateCoverLetter,
      })
      return { method, data: res.data.data }
    },
    onSuccess: ({ method, data }) => {
      setResults(prev => ({ ...prev, [method]: data }))
    },
    onError: (err, method) => {
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map(e => e.msg || JSON.stringify(e)).join(', ')
        : (detail || err.message)
      setErrors(prev => ({ ...prev, [method]: msg }))
    },
  })

  const handleGenerate = async () => {
    if (!selectedMethod) return
    setErrors({})

    const methods = selectedMethod === 'both' ? ['llm', 'agent'] : [selectedMethod]

    if (selectedMethod === 'both') {
      // Run both in parallel
      await Promise.allSettled(methods.map(m => generateMutation.mutateAsync(m)))
    } else {
      await generateMutation.mutateAsync(selectedMethod)
    }
  }

  const isLoading = generateMutation.isPending
  const hasAnyResult = Object.keys(results).length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className={`relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl ${bg}`}>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between p-6 pb-4 border-b border-slate-200 dark:border-slate-700 bg-inherit rounded-t-2xl">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles size={18} className="text-violet-500" />
              Tailor Resume
            </h2>
            <p className={`text-sm mt-0.5 ${sub}`}>
              {job.company_name} — {job.title}
            </p>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 ${sub}`}>
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* Method selector */}
          {!hasAnyResult && (
            <div>
              <p className={`text-sm font-medium mb-3 ${sub}`}>Choose generation method</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { key: 'llm',   icon: Sparkles, ...METHOD_INFO.llm },
                  { key: 'agent', icon: Bot,       ...METHOD_INFO.agent },
                  { key: 'both',  icon: Check,     label: 'Both  (compare)', desc: 'Run both and compare results side by side', color: 'blue' },
                ].map(({ key, icon: Icon, label, desc, color }) => {
                  const active = selectedMethod === key
                  const borderCls = active
                    ? color === 'violet' ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30'
                      : color === 'emerald' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                      : 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                    : isDark ? 'border-slate-700 hover:border-slate-500' : 'border-slate-200 hover:border-slate-400'
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedMethod(key)}
                      className={`text-left p-4 rounded-xl border-2 transition-all ${borderCls}`}
                    >
                      <Icon size={16} className={`mb-2 ${active ? `text-${color}-500` : sub}`} />
                      <p className="text-sm font-semibold">{label}</p>
                      <p className={`text-xs mt-1 ${sub}`}>{desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Extra instructions */}
          {!hasAnyResult && (
            <div>
              <label className={`block text-sm font-medium mb-2 ${sub}`}>
                Extra instructions  <span className="font-normal">(optional)</span>
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Focus heavily on Kafka experience, mention fintech background, highlight Go expertise over Java…"
                value={extraInstructions}
                onChange={e => setExtraInstructions(e.target.value)}
                className={`w-full rounded-xl border px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 ${input}`}
              />
              <p className={`text-xs mt-1.5 ${sub}`}>
                Leave blank to use the standard tailoring template based on your resume.
              </p>
            </div>
          )}

          {/* Cover letter checkbox */}
          {!hasAnyResult && (
            <label className="flex items-center gap-3 cursor-pointer select-none group">
              <div className="relative flex-shrink-0">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={generateCoverLetter}
                  onChange={e => setGenerateCoverLetter(e.target.checked)}
                />
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${generateCoverLetter ? 'bg-violet-600 border-violet-600' : isDark ? 'border-slate-600 bg-slate-800' : 'border-slate-300 bg-white'}`}>
                  {generateCoverLetter && <Check size={12} className="text-white" strokeWidth={3} />}
                </div>
              </div>
              <div>
                <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  Also generate cover letter
                </p>
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  Adds ~5 seconds · specific to this role and company
                </p>
              </div>
            </label>
          )}

          {/* Errors */}
          {Object.entries(errors).map(([method, msg]) => (
            <div key={method} className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
              <strong>{METHOD_INFO[method]?.label || method}:</strong> {msg}
            </div>
          ))}

          {/* Generate button */}
          {!hasAnyResult && (
            <button
              onClick={handleGenerate}
              disabled={!selectedMethod || isLoading}
              className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating{selectedMethod === 'agent' ? ' via Claude… (up to 15s)' : '…'}
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Generate
                </>
              )}
            </button>
          )}

          {/* Results */}
          {hasAnyResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Results</p>
                <button
                  onClick={() => { setResults({}); setErrors({}) }}
                  className={`text-xs ${sub} hover:underline`}
                >
                  Generate again
                </button>
              </div>
              {Object.entries(results).map(([method, result]) => (
                <ResultCard
                  key={method}
                  method={method}
                  result={result}
                  jobId={job.id}
                  hasCoverLetter={generateCoverLetter}
                  isDark={isDark}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
