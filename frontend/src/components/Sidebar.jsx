import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Briefcase, Search, Mail, Bell, User, Mic } from 'lucide-react'

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/applications', icon: Briefcase, label: 'Applications' },
  { to: '/jobs', icon: Search, label: 'Job Search' },
  { to: '/emails', icon: Mail, label: 'Cold Emails' },
  { to: '/followups', icon: Bell, label: 'Follow-ups' },
  { to: '/interview', icon: Mic, label: 'Interview' },
  { to: '/profile', icon: User, label: 'Profile' },
]

const styles = {
  sidebar: {
    width: '220px',
    minHeight: '100vh',
    background: '#1e293b',
    borderRight: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 0',
    flexShrink: 0,
  },
  logo: {
    padding: '0 20px 24px',
    borderBottom: '1px solid #334155',
    marginBottom: '16px',
  },
  logoText: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#6366f1',
    letterSpacing: '-0.5px',
  },
  logoSub: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '2px',
  },
  nav: { display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 12px' },
  link: (isActive) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '8px',
    color: isActive ? '#e2e8f0' : '#94a3b8',
    background: isActive ? '#334155' : 'transparent',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: isActive ? '500' : '400',
    transition: 'all 0.15s',
  }),
}

export default function Sidebar() {
  return (
    <aside style={styles.sidebar}>
      <div style={styles.logo}>
        <div style={styles.logoText}>JobCRM</div>
        <div style={styles.logoSub}>Local • Private • Open Source</div>
      </div>
      <nav style={styles.nav}>
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => styles.link(isActive)}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
