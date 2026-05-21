export default function StatCard({ label, value, sub, highlight }) {
  return (
    <div style={{
      background: '#1e293b',
      border: `1px solid ${highlight ? '#f59e0b' : '#334155'}`,
      borderRadius: '12px',
      padding: '20px',
      flex: 1,
      minWidth: '160px',
    }}>
      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>{label}</div>
      <div style={{
        fontSize: '32px',
        fontWeight: '700',
        color: highlight ? '#f59e0b' : '#e2e8f0',
        lineHeight: 1,
      }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>{sub}</div>}
    </div>
  )
}
