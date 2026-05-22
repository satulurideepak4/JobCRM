export default function StatCard({ label, value, sub, highlight }) {
  return (
    <div style={{
      background: 'var(--card)',
      border: `1px solid ${highlight ? '#f59e0b55' : 'var(--border)'}`,
      borderTop: `3px solid ${highlight ? '#f59e0b' : 'var(--border)'}`,
      borderRadius: '10px',
      padding: '20px',
      flex: 1,
      minWidth: '160px',
      boxShadow: 'var(--shadow)',
    }}>
      <div style={{ fontSize: '12px', color: 'var(--text-4)', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>{label}</div>
      <div style={{
        fontSize: '32px',
        fontWeight: '700',
        color: highlight ? '#f59e0b' : 'var(--text)',
        lineHeight: 1,
      }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: 'var(--text-4)', marginTop: '6px' }}>{sub}</div>}
    </div>
  )
}
