import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Upload, Check, X, User, Wifi, Cpu } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import api from '../api/client'
import { useTheme } from '../contexts/ThemeContext'
import { cn } from '../lib/utils'

function Card({ children, className }) {
  const { isDark } = useTheme()
  return (
    <div className={cn(
      'rounded-2xl border p-6',
      isDark
        ? 'bg-dark-card border-dark-border shadow-lg shadow-black/10'
        : 'bg-white border-gray-300 shadow-sm',
      className,
    )}>
      {children}
    </div>
  )
}

function CardTitle({ children }) {
  const { isDark } = useTheme()
  return (
    <h2 className={cn('text-[15px] font-bold mb-4', isDark ? 'text-slate-100' : 'text-slate-900')}>
      {children}
    </h2>
  )
}

function FieldLabel({ children }) {
  const { isDark } = useTheme()
  return (
    <label className={cn('block text-xs font-medium mb-1.5', isDark ? 'text-slate-500' : 'text-slate-600')}>
      {children}
    </label>
  )
}

function TextInput({ value, onChange, type = 'text', min, max, placeholder }) {
  const { isDark } = useTheme()
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      placeholder={placeholder}
      className={cn(
        'w-full px-3 py-2 rounded-lg border text-sm outline-none transition-all duration-150',
        'focus:ring-2 focus:ring-brand/40 focus:border-brand',
        isDark
          ? 'bg-dark-surface border-dark-border text-slate-200 placeholder:text-slate-600'
          : 'bg-slate-50 border-gray-200 text-slate-900 placeholder:text-slate-400',
      )}
    />
  )
}

function SelectInput({ value, onChange, children }) {
  const { isDark } = useTheme()
  return (
    <select
      value={value}
      onChange={onChange}
      className={cn(
        'w-full px-3 py-2 rounded-lg border text-sm outline-none transition-all duration-150',
        'focus:ring-2 focus:ring-brand/40 focus:border-brand',
        isDark
          ? 'bg-dark-surface border-dark-border text-slate-200'
          : 'bg-slate-50 border-gray-200 text-slate-900',
      )}
    >
      {children}
    </select>
  )
}

export default function Profile() {
  const { isDark } = useTheme()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const gmailStatus = searchParams.get('gmail')

  const { data } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await api.get('/api/profile')
      return res.data.data
    },
  })

  const { data: gmailData } = useQuery({
    queryKey: ['gmailStatus'],
    queryFn: async () => (await api.get('/api/gmail/auth/status')).data.data,
  })

  const [form, setForm] = useState({
    name: '',
    role: '',
    skills: [],
    experience_years: 0,
    preferences: { remote_only: false, preferred_salary: '', preferred_company_size: '' },
  })
  const [skillInput, setSkillInput] = useState('')
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name || '',
        role: data.role || '',
        skills: data.skills || [],
        experience_years: data.experience_years || 0,
        preferences: data.preferences || { remote_only: false, preferred_salary: '', preferred_company_size: '' },
      })
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () => api.post('/api/profile', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] })
      setSaved(true)
      toast.success('Profile saved!')
      setTimeout(() => setSaved(false), 2000)
    },
    onError: () => toast.error('Failed to save profile'),
  })

  async function handleResumeUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setUploadResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post('/api/profile/resume', fd)
      setUploadResult({ success: true, parsed: res.data.data?.parsed })
      qc.invalidateQueries({ queryKey: ['profile'] })
      toast.success('Resume parsed successfully!')
    } catch (err) {
      setUploadResult({ success: false, error: err.response?.data?.detail || 'Upload failed' })
      toast.error('Resume upload failed')
    } finally {
      setUploading(false)
    }
  }

  function addSkill() {
    const s = skillInput.trim()
    if (s && !form.skills.includes(s)) {
      setForm(f => ({ ...f, skills: [...f.skills, s] }))
    }
    setSkillInput('')
  }

  function removeSkill(skill) {
    setForm(f => ({ ...f, skills: f.skills.filter(s => s !== skill) }))
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-6 max-w-2xl"
    >
      <h1 className={cn('text-2xl font-bold', isDark ? 'text-slate-100' : 'text-slate-900')}>Profile</h1>

      {/* Gmail status banners */}
      {gmailStatus === 'connected' && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm">
          <Check size={15} /> Gmail connected successfully!
        </div>
      )}
      {gmailStatus === 'error' && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
          Gmail connection failed: {searchParams.get('msg') || 'Please try again.'}
        </div>
      )}

      {/* Gmail card */}
      <Card>
        <div className="flex items-center gap-2.5 mb-4">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', isDark ? 'bg-dark-surface' : 'bg-slate-100')}>
            <Wifi size={15} className="text-brand" />
          </div>
          <CardTitle>Gmail Connection</CardTitle>
        </div>
        {gmailData?.connected ? (
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/40" />
            <span className={cn('text-sm', isDark ? 'text-slate-400' : 'text-slate-600')}>
              Connected as <span className="font-medium text-emerald-400">{gmailData.email}</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className={cn('w-2 h-2 rounded-full', isDark ? 'bg-slate-600' : 'bg-slate-300')} />
            <span className={cn('text-sm', isDark ? 'text-slate-500' : 'text-slate-600')}>Not connected</span>
            <a
              href="http://localhost:4445/auth/gmail"
              className="px-3.5 py-1.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-sm font-medium transition-colors"
            >
              Connect Gmail
            </a>
          </div>
        )}
      </Card>

      {/* LLM Provider */}
      <Card>
        <div className="flex items-center gap-2.5 mb-3">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', isDark ? 'bg-dark-surface' : 'bg-slate-100')}>
            <Cpu size={15} className="text-brand" />
          </div>
          <CardTitle>LLM Provider</CardTitle>
        </div>
        <div className={cn('text-sm', isDark ? 'text-slate-400' : 'text-slate-600')}>
          Active provider:{' '}
          <span className="font-bold text-brand">{data?.llm_provider || 'gemini'}</span>
          <span className={cn('text-xs ml-2', isDark ? 'text-slate-600' : 'text-slate-600')}>
            (set via LLM_PROVIDER env var)
          </span>
        </div>
      </Card>

      {/* Personal Info */}
      <Card>
        <div className="flex items-center gap-2.5 mb-5">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', isDark ? 'bg-dark-surface' : 'bg-slate-100')}>
            <User size={15} className="text-brand" />
          </div>
          <CardTitle>Personal Info</CardTitle>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <FieldLabel>Full Name</FieldLabel>
            <TextInput value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div>
            <FieldLabel>Target Role</FieldLabel>
            <TextInput value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
          </div>

          <div>
            <FieldLabel>Years of Experience</FieldLabel>
            <TextInput type="number" min={0} max={50} value={form.experience_years} onChange={e => setForm(f => ({ ...f, experience_years: Number(e.target.value) }))} />
          </div>

          {/* Skills */}
          <div>
            <FieldLabel>Skills</FieldLabel>
            <div className="flex flex-wrap gap-1.5 mb-2.5 min-h-[28px]">
              {form.skills.map(skill => (
                <span
                  key={skill}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-brand/10 text-brand border border-brand/20"
                >
                  {skill}
                  <button
                    onClick={() => removeSkill(skill)}
                    className="hover:text-red-400 transition-colors ml-0.5"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <TextInput
                value={skillInput}
                onChange={e => setSkillInput(e.target.value)}
                placeholder="Add skill (press Enter)"
                onKeyDown={e => e.key === 'Enter' && addSkill()}
              />
              <button
                onClick={addSkill}
                className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-hover text-white text-sm font-medium transition-colors flex-shrink-0"
              >
                Add
              </button>
            </div>
          </div>

          {/* Preferences */}
          <div className={cn(
            'rounded-xl p-4 border',
            isDark ? 'bg-dark-surface border-dark-border' : 'bg-slate-50 border-gray-300',
          )}>
            <div className={cn('text-xs font-bold uppercase tracking-wider mb-3', isDark ? 'text-slate-500' : 'text-slate-600')}>
              Preferences
            </div>

            <div className="flex items-center gap-2.5 mb-3">
              <input
                type="checkbox"
                id="remote"
                checked={form.preferences?.remote_only || false}
                onChange={e => setForm(f => ({ ...f, preferences: { ...f.preferences, remote_only: e.target.checked } }))}
                className="w-4 h-4 rounded accent-brand cursor-pointer"
              />
              <label htmlFor="remote" className={cn('text-sm cursor-pointer', isDark ? 'text-slate-300' : 'text-slate-700')}>
                Remote only
              </label>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <FieldLabel>Preferred Salary</FieldLabel>
                <TextInput
                  value={form.preferences?.preferred_salary || ''}
                  onChange={e => setForm(f => ({ ...f, preferences: { ...f.preferences, preferred_salary: e.target.value } }))}
                  placeholder="e.g. $100k+"
                />
              </div>
              <div>
                <FieldLabel>Preferred Company Size</FieldLabel>
                <SelectInput
                  value={form.preferences?.preferred_company_size || ''}
                  onChange={e => setForm(f => ({ ...f, preferences: { ...f.preferences, preferred_company_size: e.target.value } }))}
                >
                  <option value="">Any</option>
                  <option value="startup">Startup (1-50)</option>
                  <option value="small">Small (51-200)</option>
                  <option value="medium">Medium (201-1000)</option>
                  <option value="large">Large (1000+)</option>
                </SelectInput>
              </div>
            </div>
          </div>

          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150',
              'bg-brand hover:bg-brand-hover text-white disabled:opacity-60 disabled:cursor-not-allowed',
              saved ? 'bg-emerald-500 hover:bg-emerald-600' : '',
            )}
          >
            {saved ? <><Check size={15} /> Saved!</> : saveMutation.isPending ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </Card>

      {/* Resume upload */}
      <Card>
        <div className="flex items-center gap-2.5 mb-5">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', isDark ? 'bg-dark-surface' : 'bg-slate-100')}>
            <Upload size={15} className="text-brand" />
          </div>
          <CardTitle>Resume</CardTitle>
        </div>

        <label className={cn(
          'flex flex-col items-center justify-center py-10 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-150 gap-2',
          uploading
            ? isDark ? 'border-brand/40 bg-brand/5' : 'border-brand/40 bg-brand/5'
            : isDark
              ? 'border-dark-border hover:border-brand/40 hover:bg-brand/5'
              : 'border-gray-200 hover:border-brand/40 hover:bg-brand/5',
        )}>
          <Upload size={26} className={uploading ? 'text-brand animate-bounce' : 'text-brand'} />
          <span className={cn('text-sm font-medium', isDark ? 'text-slate-400' : 'text-slate-600')}>
            {uploading ? 'Parsing resume...' : 'Drop PDF or click to upload'}
          </span>
          <span className={cn('text-xs', isDark ? 'text-slate-600' : 'text-slate-600')}>
            Skills and experience will be auto-extracted
          </span>
          <input type="file" accept=".pdf" onChange={handleResumeUpload} className="hidden" disabled={uploading} />
        </label>

        {uploadResult && (
          <div className={cn(
            'mt-3 px-4 py-3 rounded-xl border text-sm',
            uploadResult.success
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
              : 'bg-red-500/10 border-red-500/25 text-red-400',
          )}>
            {uploadResult.success
              ? `Resume parsed! Extracted ${uploadResult.parsed?.skills?.length || 0} skills.${data?.has_resume ? ' Profile updated.' : ''}`
              : uploadResult.error
            }
          </div>
        )}

        {data?.has_resume && !uploadResult && (
          <div className={cn('mt-2 flex items-center gap-1.5 text-xs', isDark ? 'text-slate-600' : 'text-slate-600')}>
            <Check size={12} className="text-emerald-400" /> Resume on file
          </div>
        )}
      </Card>
    </motion.div>
  )
}
