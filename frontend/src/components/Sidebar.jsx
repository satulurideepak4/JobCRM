import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTheme } from '../contexts/ThemeContext'
import { cn } from '../lib/utils'
import {
  LayoutDashboard, Briefcase, Search, Mail, Bell, Mic, User, Sun, Moon,
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/applications', icon: Briefcase,     label: 'Applications' },
  { to: '/jobs',       icon: Search,          label: 'Job Search' },
  { to: '/emails',     icon: Mail,            label: 'Emails' },
  { to: '/followups',  icon: Bell,            label: 'Follow-ups' },
  { to: '/interview',  icon: Mic,             label: 'Interview' },
  { to: '/profile',    icon: User,            label: 'Profile' },
]

export default function Sidebar() {
  const { toggle, isDark } = useTheme()
  const location = useLocation()

  return (
    <aside className={cn(
      'flex flex-col w-[220px] flex-shrink-0 h-screen sticky top-0',
      'border-r transition-colors duration-200',
      isDark
        ? 'bg-dark-surface border-dark-border'
        : 'bg-white border-light-border shadow-sm'
    )}>
      {/* Logo */}
      <div className="px-5 py-6 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center flex-shrink-0">
          <Briefcase size={14} className="text-white" />
        </div>
        <span className={cn(
          'text-[15px] font-bold tracking-tight',
          isDark ? 'text-white' : 'text-gray-900'
        )}>
          Job<span className="text-brand">CRM</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
          const isActive = to === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(to)
          return (
            <NavLink key={to} to={to}>
              <motion.div
                whileHover={{ x: 2 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all duration-150 cursor-pointer',
                  isActive
                    ? 'bg-brand text-white shadow-sm shadow-brand/20'
                    : isDark
                      ? 'text-slate-400 hover:text-white hover:bg-dark-hover'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                )}
              >
                <Icon size={15} className="flex-shrink-0" />
                {label}
              </motion.div>
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom: theme toggle */}
      <div className={cn(
        'px-3 py-4 border-t',
        isDark ? 'border-dark-border' : 'border-light-border'
      )}>
        <button
          onClick={toggle}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium w-full transition-all duration-150',
            isDark
              ? 'text-slate-400 hover:text-white hover:bg-dark-hover'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          )}
        >
          {isDark
            ? <><Sun size={14} /> <span>Light mode</span></>
            : <><Moon size={14} /> <span>Dark mode</span></>
          }
        </button>
      </div>
    </aside>
  )
}
