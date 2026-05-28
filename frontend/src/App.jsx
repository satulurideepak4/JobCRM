import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useTheme } from './contexts/ThemeContext'
import { cn } from './lib/utils'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Applications from './pages/Applications'
import JobSearch from './pages/JobSearch'
import ColdEmails from './pages/ColdEmails'
import FollowUps from './pages/FollowUps'
import Profile from './pages/Profile'
import Interview from './pages/Interview'
import InterviewRoom from './pages/InterviewRoom'

function AppLayout() {
  const { isDark } = useTheme()
  const location = useLocation()
  const isInterviewRoom = /^\/interview\/\d+/.test(location.pathname)

  return (
    <div className={cn(
      'flex min-h-screen transition-colors duration-200',
      isDark ? 'bg-dark-bg text-slate-100' : 'bg-light-bg text-slate-900'
    )}>
      <Sidebar />
      <main className={cn(
        'flex-1 overflow-auto',
        isInterviewRoom ? 'p-0 bg-[#0f1117]' : 'p-6'
      )}>
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
  return <AppLayout />
}
