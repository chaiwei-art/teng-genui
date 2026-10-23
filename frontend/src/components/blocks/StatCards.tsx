export default function StatCards({
  cards,
}: {
  cards: { label: string; value: string; delta?: string }[]
}) {
  return (
    <div className="block">
      <div className="stat-grid">
        {cards.map((c, i) => (
          <div key={i} className="stat-card">
            <div className="stat-label">{c.label}</div>
            <div className="stat-value">{c.value}</div>
            {c.delta && <div className="stat-delta">{c.delta}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
