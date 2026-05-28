import { useTheme } from '../contexts/ThemeContext'
import { cn } from '../lib/utils'

export default function StatCard({ label, value, sub, highlight }) {
  const { isDark } = useTheme()
  return (
    <div className={cn(
      'flex-1 min-w-[160px] rounded-xl p-5 transition-all duration-200',
      highlight
        ? [
            'border border-t-[3px] border-t-amber-500',
            isDark
              ? 'bg-dark-card border-amber-500/30 shadow-lg shadow-black/20'
              : 'bg-white border-amber-200 shadow-md',
          ]
        : [
            'border border-t-[3px] border-t-brand',
            isDark
              ? 'bg-dark-card border-dark-border shadow-lg shadow-black/20'
              : 'bg-white border-gray-300 shadow-sm',
          ],
    )}>
      <div className={cn(
        'text-[11px] font-semibold uppercase tracking-wider mb-2.5',
        isDark ? 'text-slate-500' : 'text-slate-600',
      )}>{label}</div>

      <div className={cn(
        'text-[32px] font-bold leading-none',
        highlight
          ? 'text-amber-500'
          : isDark ? 'text-slate-100' : 'text-slate-900',
      )}>{value}</div>

      {sub && (
        <div className={cn(
          'text-xs mt-1.5',
          highlight
            ? 'text-amber-500/80'
            : isDark ? 'text-slate-500' : 'text-slate-600',
        )}>{sub}</div>
      )}
    </div>
  )
}
