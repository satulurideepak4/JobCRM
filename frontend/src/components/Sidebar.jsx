import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Briefcase, Search, Mail, Bell, User, Mic, Sun, Moon } from 'lucide-react'

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/applications', icon: Briefcase, label: 'Applications' },
  { to: '/jobs', icon: Search, label: 'Job Search' },
  { to: '/emails', icon: Mail, label: 'Emails' },
  { to: '/followups', icon: Bell, label: 'Follow-ups' },
  { to: '/interview', icon: Mic, label: 'Interview' },
  { to: '/profile', icon: User, label: 'Profile' },
]

const styles = {
  sidebar: {
    width: '220px',
    minHeight: '100vh',
    background: '#0f172a',
    borderRight: '1px solid #1e293b',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 0',
    flexShrink: 0,
  },
  logo: {
    padding: '0 20px 24px',
    borderBottom: '1px solid #1e293b',
    marginBottom: '16px',
  },
  nav: { display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 10px' },
  link: (isActive) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 12px',
    borderRadius: '8px',
    color: isActive ? '#f1f5f9' : '#64748b',
    background: isActive ? '#1e293b' : 'transparent',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: isActive ? '500' : '400',
    transition: 'all 0.15s',
  }),
}

export default function Sidebar({ isDark, toggleTheme }) {
  return (
    <aside style={styles.sidebar}>
      <div style={styles.logo}>
        <div style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '-0.5px' }}>
          <span style={{ color: '#ffffff' }}>Job</span>
          <span style={{ color: '#f97316' }}>CRM</span>
        </div>
        <div style={{ fontSize: '11px', color: '#334155', marginTop: '3px' }}>Local · Private · Open Source</div>
      </div>
      <nav style={styles.nav}>
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => styles.link(isActive)}
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div style={{ marginTop: 'auto', padding: '16px 10px', borderTop: '1px solid #1e293b' }}>
        <button
          onClick={toggleTheme}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
            padding: '9px 12px', borderRadius: '8px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#64748b', fontSize: '14px', transition: 'color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#f1f5f9'}
          onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
    </aside>
  )
}
