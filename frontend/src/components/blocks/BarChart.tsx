export default function BarChart({
  title,
  unit,
  data,
}: {
  title?: string
  unit?: string
  data: { label: string; value: number }[]
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="block">
      {title && <div className="block-title">{title}</div>}
      <div className="bar-chart">
        {data.map((d, i) => (
          <div key={i} className="bar-row">
            <span className="bar-label">{d.label}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(d.value / max) * 100}%` }} />
            </div>
            <span className="bar-value">
              {d.value}
              {unit && <em className="bar-unit">{unit}</em>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
