import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Applications from './pages/Applications'
import JobSearch from './pages/JobSearch'
import ColdEmails from './pages/ColdEmails'
import FollowUps from './pages/FollowUps'
import Profile from './pages/Profile'
import Interview from './pages/Interview'
import InterviewRoom from './pages/InterviewRoom'

function AppLayout({ isDark, toggleTheme }) {
  const location = useLocation()
  const isInterviewRoom = /^\/interview\/\d+/.test(location.pathname)

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar isDark={isDark} toggleTheme={toggleTheme} />
      <main style={{
        flex: 1,
        padding: isInterviewRoom ? '0' : '24px',
        overflowY: 'auto',
        maxHeight: '100vh',
        background: isInterviewRoom ? '#0f1117' : 'var(--bg)',
      }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/applications" element={<Applications />} />
          <Route path="/jobs" element={<JobSearch />} />
          <Route path="/emails" element={<ColdEmails />} />
          <Route path="/followups" element={<FollowUps />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/interview" element={<Interview />} />
          <Route path="/interview/:sessionId" element={<InterviewRoom />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <BrowserRouter>
      <AppLayout isDark={isDark} toggleTheme={() => setIsDark(d => !d)} />
    </BrowserRouter>
  )
}
