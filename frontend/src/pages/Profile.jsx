import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Upload, Check, X } from 'lucide-react'
import api from '../api/client'

export default function Profile() {
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
      setTimeout(() => setSaved(false), 2000)
    },
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
    } catch (err) {
      setUploadResult({ success: false, error: err.response?.data?.detail || 'Upload failed' })
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

  const inputStyle = {
    width: '100%', padding: '8px 12px', background: '#0f172a',
    border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '14px',
  }
  const labelStyle = { fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }
  const sectionStyle = { marginBottom: '20px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '640px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#e2e8f0' }}>Profile</h1>

      {gmailStatus === 'connected' && (
        <div style={{ padding: '12px 16px', background: '#22c55e22', border: '1px solid #22c55e44', borderRadius: '8px', color: '#22c55e', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Check size={14} /> Gmail connected successfully!
        </div>
      )}
      {gmailStatus === 'error' && (
        <div style={{ padding: '12px 16px', background: '#ef444422', border: '1px solid #ef444444', borderRadius: '8px', color: '#ef4444', fontSize: '13px' }}>
          Gmail connection failed: {searchParams.get('msg') || 'Please try again.'}
        </div>
      )}

      {/* Gmail connection */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#e2e8f0', marginBottom: '12px' }}>Gmail Connection</h2>
        {gmailData?.connected ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ fontSize: '14px', color: '#94a3b8' }}>Connected as {gmailData.email}</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#64748b' }} />
            <span style={{ fontSize: '14px', color: '#64748b' }}>Not connected</span>
            <a
              href="http://localhost:4445/auth/gmail"
              style={{ padding: '7px 14px', borderRadius: '6px', background: '#6366f1', color: '#fff', textDecoration: 'none', fontSize: '13px' }}
            >
              Connect Gmail
            </a>
          </div>
        )}
      </div>

      {/* LLM Provider */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#e2e8f0', marginBottom: '8px' }}>LLM Provider</h2>
        <div style={{ fontSize: '14px', color: '#94a3b8' }}>
          Active provider: <span style={{ color: '#6366f1', fontWeight: '600' }}>{data?.llm_provider || 'gemini'}</span>
          <span style={{ fontSize: '12px', color: '#475569', marginLeft: '8px' }}>(set via LLM_PROVIDER env var)</span>
        </div>
      </div>

      {/* Profile form */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#e2e8f0', marginBottom: '20px' }}>Personal Info</h2>

        <div style={sectionStyle}>
          <label style={labelStyle}>Full Name</label>
          <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle}>Target Role</label>
          <input style={inputStyle} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle}>Years of Experience</label>
          <input type="number" min={0} max={50} style={inputStyle} value={form.experience_years} onChange={e => setForm(f => ({ ...f, experience_years: Number(e.target.value) }))} />
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle}>Skills</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
            {form.skills.map(skill => (
              <span key={skill} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 10px', borderRadius: '20px', background: '#6366f122', color: '#6366f1', border: '1px solid #6366f144' }}>
                {skill}
                <button onClick={() => removeSkill(skill)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', padding: 0, lineHeight: 1 }}><X size={10} /></button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={skillInput}
              onChange={e => setSkillInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSkill()}
              placeholder="Add skill (press Enter)"
            />
            <button onClick={addSkill} style={{ padding: '8px 14px', borderRadius: '6px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px' }}>Add</button>
          </div>
        </div>

        <div style={{ ...sectionStyle, background: '#0f172a', borderRadius: '8px', padding: '16px' }}>
          <label style={{ ...labelStyle, marginBottom: '12px', fontSize: '13px', color: '#64748b' }}>Preferences</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <input
              type="checkbox"
              id="remote"
              checked={form.preferences?.remote_only || false}
              onChange={e => setForm(f => ({ ...f, preferences: { ...f.preferences, remote_only: e.target.checked } }))}
              style={{ accentColor: '#6366f1' }}
            />
            <label htmlFor="remote" style={{ fontSize: '14px', color: '#94a3b8', cursor: 'pointer' }}>Remote only</label>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>Preferred Salary</label>
            <input
              style={inputStyle}
              value={form.preferences?.preferred_salary || ''}
              onChange={e => setForm(f => ({ ...f, preferences: { ...f.preferences, preferred_salary: e.target.value } }))}
              placeholder="e.g. $100k+"
            />
          </div>
          <div>
            <label style={labelStyle}>Preferred Company Size</label>
            <select
              style={inputStyle}
              value={form.preferences?.preferred_company_size || ''}
              onChange={e => setForm(f => ({ ...f, preferences: { ...f.preferences, preferred_company_size: e.target.value } }))}
            >
              <option value="">Any</option>
              <option value="startup">Startup (1-50)</option>
              <option value="small">Small (51-200)</option>
              <option value="medium">Medium (201-1000)</option>
              <option value="large">Large (1000+)</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          style={{ padding: '10px 24px', borderRadius: '8px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          {saved ? <><Check size={14} /> Saved!</> : saveMutation.isPending ? 'Saving...' : 'Save Profile'}
        </button>
      </div>

      {/* Resume upload */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#e2e8f0', marginBottom: '16px' }}>Resume</h2>
        <label style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '32px', border: '2px dashed #334155', borderRadius: '8px',
          cursor: 'pointer', color: '#64748b', gap: '8px',
          background: uploading ? '#0f172a' : 'transparent',
        }}>
          <Upload size={24} color="#6366f1" />
          <span style={{ fontSize: '14px', color: '#94a3b8' }}>
            {uploading ? 'Parsing resume...' : 'Drop PDF or click to upload'}
          </span>
          <span style={{ fontSize: '12px' }}>Skills and experience will be auto-extracted</span>
          <input type="file" accept=".pdf" onChange={handleResumeUpload} style={{ display: 'none' }} disabled={uploading} />
        </label>
        {uploadResult && (
          <div style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', background: uploadResult.success ? '#22c55e22' : '#ef444422', border: `1px solid ${uploadResult.success ? '#22c55e44' : '#ef444444'}` }}>
            {uploadResult.success ? (
              <div style={{ color: '#22c55e', fontSize: '13px' }}>
                Resume parsed! Extracted {uploadResult.parsed?.skills?.length || 0} skills.
                {data?.has_resume && ' Profile updated.'}
              </div>
            ) : (
              <div style={{ color: '#ef4444', fontSize: '13px' }}>{uploadResult.error}</div>
            )}
          </div>
        )}
        {data?.has_resume && !uploadResult && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Check size={12} color="#22c55e" /> Resume on file
          </div>
        )}
      </div>
    </div>
  )
}
